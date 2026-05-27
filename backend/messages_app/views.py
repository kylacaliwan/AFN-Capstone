from django.db.models import Q
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from .models import Message
from .serializers import MessageSerializer
from users.models import User


STAFF_MESSAGE_ROLES = {'superadmin', 'admin', 'technician'}

class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) not in STAFF_MESSAGE_ROLES:
            raise PermissionDenied('Only admins, superadmins, and technicians can send staff messages.')
        return super().create(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        if getattr(user, 'role', None) not in STAFF_MESSAGE_ROLES:
            return Message.objects.none()

        return Message.objects.filter(
            Q(room_type='group', group_key='staff') |
            Q(room_type='direct', sender=user) |
            Q(room_type='direct', receiver=user)
        ).select_related(
            'sender',
            'receiver',
            'ticket',
            'ticket__request',
            'ticket__request__location',
        ).order_by('-created_at')

    def perform_create(self, serializer):
        if getattr(self.request.user, 'role', None) not in STAFF_MESSAGE_ROLES:
            raise PermissionDenied('Only admins, superadmins, and technicians can send staff messages.')
        serializer.save(sender=self.request.user)

    @action(detail=False, methods=['get'])
    def participants(self, request):
        if getattr(request.user, 'role', None) not in STAFF_MESSAGE_ROLES:
            raise PermissionDenied('Only admins, superadmins, and technicians can view staff message participants.')

        users = User.objects.filter(
            role__in=STAFF_MESSAGE_ROLES,
            status='active',
        ).exclude(id=request.user.id).order_by('role', 'first_name', 'username')

        return Response([
            {
                'id': user.id,
                'name': user.get_full_name().strip() or user.username,
                'username': user.username,
                'role': user.role,
                'phone': user.phone or '',
            }
            for user in users
        ])
