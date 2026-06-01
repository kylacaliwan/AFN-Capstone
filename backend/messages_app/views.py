from django.db.models import Q
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from .models import Message
from .serializers import MessageSerializer
from notifications.models import Notification
from users.models import User


STAFF_MESSAGE_ROLES = {'superadmin', 'admin', 'technician'}
ADMIN_MESSAGE_ROLES = {'superadmin', 'admin'}


def notify_admins_of_client_ticket_message(message):
    ticket = message.ticket
    sender = message.sender
    if not ticket or not sender or getattr(sender, 'role', None) != 'client':
        return

    client_name = sender.get_full_name().strip() or sender.username
    recipients = User.objects.filter(role__in=ADMIN_MESSAGE_ROLES, is_active=True).exclude(id=sender.id)
    for recipient in recipients:
        Notification.objects.create(
            user=recipient,
            ticket=ticket,
            request=ticket.request,
            title='New after-sales message',
            message=f'{client_name} sent an after-sales message for ticket #{ticket.id}.',
            type='customer_inquiry',
        )

class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) not in STAFF_MESSAGE_ROLES | {'client'}:
            raise PermissionDenied('Only service participants can send messages.')
        if getattr(request.user, 'role', None) == 'client' and not request.data.get('ticket'):
            raise PermissionDenied('Clients can only send ticket messages.')
        return super().create(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        role = getattr(user, 'role', None)

        if role == 'client':
            base_q = Q(ticket__request__client=user)
        elif role in ADMIN_MESSAGE_ROLES:
            base_q = (
                Q(room_type='group', group_key='staff') |
                Q(room_type='direct', sender=user) |
                Q(room_type='direct', receiver=user) |
                Q(ticket__isnull=False)
            )
        elif role == 'technician':
            base_q = (
                Q(room_type='group', group_key='staff') |
                Q(room_type='direct', sender=user) |
                Q(room_type='direct', receiver=user) |
                Q(ticket__technician=user) |
                Q(ticket__supervisor=user) |
                Q(ticket__crew_assignments__technician=user)
            )
        else:
            return Message.objects.none()

        return Message.objects.filter(
            base_q
        ).select_related(
            'sender',
            'receiver',
            'ticket',
            'ticket__request',
            'ticket__request__location',
        ).distinct().order_by('-created_at')

    def perform_create(self, serializer):
        message = serializer.save(sender=self.request.user)
        notify_admins_of_client_ticket_message(message)

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
