# Auto-split from users/views.py
from users.views.helpers import *  # noqa: F401,F403

class AdminSettingsViewSet(viewsets.ViewSet):
    """ViewSet for admin settings"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _get_settings(self):
        settings_obj = AdminSettings.objects.order_by('id').first()
        if settings_obj:
            return settings_obj

        return AdminSettings.objects.create(
            system_name='AFN Service Management',
            support_email='support@afnservice.com',
            enable_notifications=True,
            auto_dispatch_enabled=False,
            sms_notifications_enabled=False,
            default_time_zone=django_settings.TIME_ZONE,
            max_technician_assignments=5,
        )

    def list(self, request):
        """Get admin settings"""
        serializer = AdminSettingsSerializer(self._get_settings())
        return Response(serializer.data)

    def update(self, request, pk=None):
        """Update admin settings via the router's standard PUT endpoint"""
        settings_obj = self._get_settings()
        serializer = AdminSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response({
            'success': True,
            'message': 'Settings updated successfully',
            'settings': serializer.data
        })

    @action(detail=False, methods=['put'])
    def update_settings(self, request):
        """Update admin settings"""
        return self.update(request)
