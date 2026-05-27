from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import permissions, viewsets

from users.models import ChangeLog
from users.permissions import IsAdmin
from users.serializers import ChangeLogSerializer


class AdminActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ChangeLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_queryset(self):
        queryset = ChangeLog.objects.select_related('content_type', 'changed_by').order_by('-changed_at', '-id')
        query_params = self.request.query_params

        action = query_params.get('action')
        if action:
            queryset = queryset.filter(action=action)

        model = query_params.get('model')
        if model:
            queryset = queryset.filter(content_type__model=model.lower())

        app_label = query_params.get('app_label')
        if app_label:
            queryset = queryset.filter(content_type__app_label=app_label.lower())

        changed_by = query_params.get('changed_by')
        if changed_by:
            queryset = queryset.filter(changed_by_id=changed_by)

        object_id = query_params.get('object_id')
        if object_id:
            queryset = queryset.filter(object_id=object_id)

        date_from = parse_date(query_params.get('date_from') or '')
        if date_from:
            queryset = queryset.filter(changed_at__date__gte=date_from)

        date_to = parse_date(query_params.get('date_to') or '')
        if date_to:
            queryset = queryset.filter(changed_at__date__lte=date_to)

        search = query_params.get('search')
        if search:
            matching_content_types = ContentType.objects.filter(
                Q(model__icontains=search) | Q(app_label__icontains=search)
            ).values_list('id', flat=True)
            queryset = queryset.filter(
                Q(summary__icontains=search) |
                Q(field_name__icontains=search) |
                Q(old_value__icontains=search) |
                Q(new_value__icontains=search) |
                Q(changed_by__username__icontains=search) |
                Q(changed_by__first_name__icontains=search) |
                Q(changed_by__last_name__icontains=search) |
                Q(content_type_id__in=matching_content_types)
            )

        return queryset
