from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from messages_app.models import Message
from users.models import User


class MessageApiTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='message-admin',
            password='Password123!',
            role='admin',
            first_name='Admin',
            last_name='One',
        )
        self.superadmin_user = User.objects.create_user(
            username='message-superadmin',
            password='Password123!',
            role='superadmin',
            first_name='Super',
            last_name='Admin',
        )
        self.technician_user = User.objects.create_user(
            username='message-tech',
            password='Password123!',
            role='technician',
            first_name='Tech',
            last_name='One',
        )
        self.client_user = User.objects.create_user(
            username='message-client',
            password='Password123!',
            role='client',
        )
        self.token = Token.objects.create(user=self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def test_participants_are_staff_only(self):
        response = self.client.get('/api/messages/participants/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        participant_ids = {item['id'] for item in response.data}
        self.assertIn(self.superadmin_user.id, participant_ids)
        self.assertIn(self.technician_user.id, participant_ids)
        self.assertNotIn(self.client_user.id, participant_ids)
        self.assertNotIn(self.admin_user.id, participant_ids)

    def test_create_direct_message_between_admin_and_technician(self):
        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'direct',
                'receiver': self.technician_user.id,
                'text': 'Please update your current job status.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = Message.objects.get(id=response.data['id'])
        self.assertEqual(message.sender, self.admin_user)
        self.assertEqual(message.receiver, self.technician_user)
        self.assertEqual(message.room_type, 'direct')
        self.assertEqual(message.message_text, 'Please update your current job status.')

    def test_create_group_message_for_staff_room(self):
        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': 'staff',
                'text': 'Team reminder for today.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = Message.objects.get(id=response.data['id'])
        self.assertEqual(message.room_type, 'group')
        self.assertEqual(message.group_key, 'staff')
        self.assertIsNone(message.receiver)
        self.assertIn('staff', str(message))

    def test_client_cannot_use_staff_messages(self):
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')

        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': 'staff',
                'text': 'Client should not send this.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_direct_message_rejects_client_receiver(self):
        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'direct',
                'receiver': self.client_user.id,
                'text': 'This should not be allowed.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('receiver', response.data)
