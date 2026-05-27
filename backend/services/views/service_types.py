# Auto-split from services/views.py
from services.views.helpers import *  # noqa: F401,F403

class ServiceTypeViewSet(viewsets.ModelViewSet):
    queryset = ServiceType.objects.all()
    serializer_class = ServiceTypeSerializer

    def get_permissions(self):
        """Allow anyone to read service types (no auth required), but only admins/supervisors can create/update/delete"""
        if self.action in ['list', 'retrieve']:
            return []  # No permission required to view service types
        return [IsAdminOrSupervisor()]  # Only admin/supervisor can create/update/delete


class SLARuleViewSet(viewsets.ModelViewSet):
    queryset = SLARule.objects.all()
    serializer_class = SLARuleSerializer
    permission_classes = [IsAdminOrSupervisor]
    http_method_names = ['get', 'patch', 'head', 'options']
