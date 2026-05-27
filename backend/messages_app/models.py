from django.db import models
from django.conf import settings  # <-- for custom User
from services.models import ServiceTicket  # <-- import ServiceTicket from services app

class Message(models.Model):
    ROOM_TYPE_CHOICES = [
        ('direct', 'Direct'),
        ('group', 'Group'),
    ]

    ticket = models.ForeignKey(
        ServiceTicket,
        on_delete=models.CASCADE,
        related_name='messages',
        null=True,
        blank=True,
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,  # use custom user model
        on_delete=models.SET_NULL,
        null=True,
        related_name='sent_messages'
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,  # use custom user model
        on_delete=models.SET_NULL,
        null=True,
        related_name='received_messages'
    )
    room_type = models.CharField(max_length=20, choices=ROOM_TYPE_CHOICES, default='direct')
    group_key = models.CharField(max_length=50, blank=True, null=True)
    message_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        room = self.group_key or 'direct'
        ticket_label = f"Ticket {self.ticket_id}" if self.ticket_id else room
        return f"Message from {self.sender} to {self.receiver or room} for {ticket_label}"
