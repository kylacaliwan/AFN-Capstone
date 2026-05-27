from rest_framework import serializers
from .models import Message


STAFF_MESSAGE_ROLES = {'superadmin', 'admin', 'technician'}


class MessageSerializer(serializers.ModelSerializer):
    ticket = serializers.PrimaryKeyRelatedField(
        queryset=Message._meta.get_field('ticket').remote_field.model.objects.all(),
        required=False,
        allow_null=True,
    )
    receiver = serializers.PrimaryKeyRelatedField(
        queryset=Message._meta.get_field('receiver').remote_field.model.objects.all(),
        required=False,
        allow_null=True,
    )
    text = serializers.CharField(source='message_text')
    timestamp = serializers.DateTimeField(source='created_at', read_only=True)
    ticket_id = serializers.IntegerField(source='ticket.id', read_only=True)
    sender_name = serializers.SerializerMethodField()
    receiver_name = serializers.SerializerMethodField()
    sender_phone = serializers.CharField(source='sender.phone', read_only=True)
    receiver_phone = serializers.CharField(source='receiver.phone', read_only=True)
    ticket_address = serializers.SerializerMethodField()
    ticket_latitude = serializers.SerializerMethodField()
    ticket_longitude = serializers.SerializerMethodField()

    def get_sender_name(self, obj):
        if not obj.sender:
            return ''
        full_name = obj.sender.get_full_name().strip()
        return full_name or obj.sender.username

    def get_receiver_name(self, obj):
        if not obj.receiver:
            return ''
        full_name = obj.receiver.get_full_name().strip()
        return full_name or obj.receiver.username

    def get_ticket_address(self, obj):
        try:
            return obj.ticket.request.location.address
        except Exception:
            return ''

    def get_ticket_latitude(self, obj):
        try:
            latitude = obj.ticket.request.location.latitude
            return float(latitude) if latitude is not None else None
        except Exception:
            return None

    def get_ticket_longitude(self, obj):
        try:
            longitude = obj.ticket.request.location.longitude
            return float(longitude) if longitude is not None else None
        except Exception:
            return None

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context.get('request')
        sender = getattr(request, 'user', None)
        room_type = attrs.get('room_type') or getattr(self.instance, 'room_type', 'direct') or 'direct'
        receiver = attrs.get('receiver') or getattr(self.instance, 'receiver', None)

        if room_type not in {'direct', 'group'}:
            raise serializers.ValidationError({'room_type': 'Unsupported message room type.'})
        if not sender or not sender.is_authenticated:
            raise serializers.ValidationError('Authentication is required to send a message.')
        if sender.role not in STAFF_MESSAGE_ROLES:
            raise serializers.ValidationError('Only admins, superadmins, and technicians can use staff messages.')

        if room_type == 'direct' and receiver is None:
            raise serializers.ValidationError({'receiver': 'A message receiver is required.'})
        if room_type == 'direct' and receiver.role not in STAFF_MESSAGE_ROLES:
            raise serializers.ValidationError({'receiver': 'Choose an admin, superadmin, or technician.'})
        if room_type == 'direct' and receiver.id == sender.id:
            raise serializers.ValidationError({'receiver': 'Choose another participant for this message.'})
        if room_type == 'group':
            attrs['receiver'] = None
            attrs['group_key'] = attrs.get('group_key') or 'staff'
        else:
            attrs['group_key'] = None

        return attrs

    class Meta:
        model = Message
        fields = [
            'id',
            'ticket',
            'ticket_id',
            'ticket_address',
            'ticket_latitude',
            'ticket_longitude',
            'room_type',
            'group_key',
            'sender',
            'sender_name',
            'sender_phone',
            'receiver',
            'receiver_name',
            'receiver_phone',
            'text',
            'timestamp',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'ticket_id',
            'ticket_address',
            'ticket_latitude',
            'ticket_longitude',
            'sender',
            'sender_name',
            'sender_phone',
            'receiver_name',
            'receiver_phone',
            'timestamp',
            'created_at',
        ]
