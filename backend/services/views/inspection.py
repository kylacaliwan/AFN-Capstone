# Auto-split from services/views.py
from rest_framework import serializers
from users.permissions import IsAdmin

from services.views.helpers import *  # noqa: F401,F403

class TechnicianSkillViewSet(viewsets.ModelViewSet):
    queryset = TechnicianSkill.objects.select_related('technician', 'service_type')
    serializer_class = TechnicianSkillSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if is_admin_workspace_role(user.role):
            return self.queryset
        if user.role == 'technician':
            return self.queryset.filter(technician=user)
        return self.queryset.none()

    def perform_create(self, serializer):
        technician_id = self.request.data.get('technician')
        if not technician_id:
            raise serializers.ValidationError({'technician': 'A technician is required.'})

        try:
            technician = User.objects.get(id=technician_id, role='technician')
        except (TypeError, ValueError, User.DoesNotExist):
            raise serializers.ValidationError({'technician': 'Select a valid technician.'})

        if TechnicianSkill.objects.filter(
            technician=technician,
            service_type=serializer.validated_data['service_type'],
        ).exists():
            raise serializers.ValidationError({
                'service_type': 'This technician already has a skill entry for that service type.',
            })

        serializer.save(technician=technician)

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.delete()


class ServiceStatusHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ServiceStatusHistory.objects.select_related(
        'ticket__request__client',
        'ticket__request__service_type',
        'changed_by',
    )
    serializer_class = ServiceStatusHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        visible_tickets = get_visible_service_tickets_queryset(self.request.user)
        queryset = self.queryset.filter(ticket__in=visible_tickets)
        ticket_id = self.request.query_params.get('ticket')
        if ticket_id:
            queryset = queryset.filter(ticket_id=ticket_id)
        return queryset.order_by('-timestamp', '-id')


class InspectionChecklistViewSet(viewsets.ModelViewSet):
    queryset = InspectionChecklist.objects.select_related(
        'ticket__request__client',
        'ticket__request__service_type',
        'ticket__technician',
        'completed_by',
    )
    serializer_class = InspectionChecklistSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.request.user.role == 'technician' and self.action in ['list', 'retrieve', 'create', 'update', 'partial_update', 'complete']:
            return [CanViewTechnicianChecklist()]
        if self.action in ['create', 'update', 'partial_update', 'complete']:
            return [IsAdminOrSupervisorOrTechnician()]
        if self.action == 'destroy':
            return [IsAdminOrSupervisor()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        visible_tickets = get_visible_service_tickets_queryset(self.request.user)
        return self.queryset.filter(ticket__in=visible_tickets)

    def perform_create(self, serializer):
        ticket = serializer.validated_data['ticket']
        if self.request.user.role == 'technician' and not ticket_has_technician_access(ticket, self.request.user):
            raise PermissionDenied('You can only create inspection checklists for tickets assigned to you or your crew.')
        checklist = serializer.save(submitted_by=self.request.user, submitted_at=timezone.now())
        sync_ticket_maintenance_schedule(checklist.ticket)
        # Create notification for technician
        for assigned_technician in get_ticket_team_members(checklist.ticket):
            create_notification(
                assigned_technician,
                f"New inspection checklist created for ticket #{checklist.ticket.id}",
                'info'
            )

    def perform_update(self, serializer):
        checklist = serializer.save(submitted_by=self.request.user, submitted_at=timezone.now())
        sync_ticket_maintenance_schedule(checklist.ticket)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark inspection as completed"""
        checklist = self.get_object()
        checklist.is_completed = True
        checklist.completed_at = timezone.now()
        checklist.completed_by = request.user
        checklist.save()
        sync_ticket_maintenance_schedule(checklist.ticket)

        create_notification(
            checklist.ticket.request.client,
            f"Inspection completed for ticket #{checklist.ticket.id}",
            'info'
        )

        return Response({'status': 'Inspection completed'})

    @action(detail=True, methods=['get'])
    def proof_media(self, request, pk=None):
        """
        Secure inspection proof media access with role-based permissions.

        Accessible by:
        - Client: Only their own inspection checklists
        - Admin/Superadmin: All inspection checklists
        - Supervisor: All inspection checklists
        - Technician: Their assigned inspections
        """
        checklist = self.get_object()
        user = request.user
        user_role = str(user.role).strip().lower()

        # Check access permissions
        can_access = False

        # Admins and Superadmins can see all
        if user_role in ['admin', 'superadmin']:
            can_access = True
        # Technicians can see their assigned tickets' inspections
        elif user_role == 'technician':
            ticket = checklist.ticket
            if ticket.technician == user or ticket.crew_assignments.filter(technician=user).exists():
                can_access = True
        # Clients can only see their own inspections
        elif user_role == 'client':
            if checklist.ticket.request and checklist.ticket.request.client == user:
                can_access = True

        if not can_access:
            raise PermissionDenied('You do not have permission to view media for this inspection.')

        # Return proof media
        proof_media = checklist.proof_media or []

        return Response({
            'checklist_id': checklist.id,
            'ticket_id': checklist.ticket.id,
            'client': str(checklist.ticket.request.client) if checklist.ticket.request else None,
            'service_type': str(checklist.ticket.request.service_type.name) if checklist.ticket.request else None,
            'proof_media': proof_media,
            'has_proof_media': len(proof_media) > 0,
            'media_count': len(proof_media),
        })


class TechnicianLocationHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TechnicianLocationHistory.objects.select_related('technician').order_by('-timestamp', '-id')
    serializer_class = TechnicianLocationHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action == 'update_location':
            return [IsTechnician()]
        if self.action in ['list', 'retrieve']:
            if self.request.user.role == 'technician':
                return [IsTechnician()]
            return [CanViewSupervisorTracking()]
        if self.action in ['nearby_technicians', 'all_technicians_locations']:
            return [CanViewSupervisorTracking()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if is_admin_workspace_role(user.role):
            return self.queryset
        if user.role == 'technician':
            return self.queryset.filter(technician=user)
        return self.queryset.none()

    @action(detail=False, methods=['post'])
    def update_location(self, request):
        """Update technician's current location"""
        technician = request.user

        if technician.role != 'technician':
            return Response({'error': 'Only technicians can update location'}, status=status.HTTP_403_FORBIDDEN)

        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        accuracy = request.data.get('accuracy', 0)

        if not latitude or not longitude:
            return Response({'error': 'Latitude and longitude required'}, status=status.HTTP_400_BAD_REQUEST)

        # Update technician's current location
        technician.current_latitude = latitude
        technician.current_longitude = longitude
        technician.last_location_update = timezone.now()
        technician.save()

        # Save to history
        TechnicianLocationHistory.objects.create(
            technician=technician,
            latitude=latitude,
            longitude=longitude,
            accuracy=accuracy
        )

        return Response({'status': 'Location updated'})

    @action(detail=False, methods=['get'])
    def nearby_technicians(self, request):
        """Get all technicians near a location"""
        latitude = request.query_params.get('latitude')
        longitude = request.query_params.get('longitude')
        radius_km = float(request.query_params.get('radius', 10))

        if not latitude or not longitude:
            return Response({'error': 'Latitude and longitude required'}, status=status.HTTP_400_BAD_REQUEST)

        technicians = User.objects.filter(
            role='technician',
            is_available=True,
            status='active'
        )

        nearby = []
        for tech in technicians:
            if tech.current_latitude and tech.current_longitude:
                distance = calculate_distance(
                    float(latitude), float(longitude),
                    tech.current_latitude, tech.current_longitude
                )
                if distance <= radius_km:
                    nearby.append({
                        'id': tech.id,
                        'username': tech.username,
                        'latitude': tech.current_latitude,
                        'longitude': tech.current_longitude,
                        'distance_km': round(distance, 2)
                    })

        return Response(nearby)

    @action(detail=False, methods=['get'])
    def all_technicians_locations(self, request):
        """Get all technicians current locations (for admin map)"""
        technicians = User.objects.filter(
            role='technician',
            status='active',
            technician_profile__is_available=True
        ).select_related('technician_profile').values(
            'id', 'username',
            'technician_profile__current_latitude',
            'technician_profile__current_longitude',
            'technician_profile__is_available'
        )

        # Transform the data to match expected format
        result = []
        for tech in technicians:
            result.append({
                'id': tech['id'],
                'username': tech['username'],
                'current_latitude': tech['technician_profile__current_latitude'],
                'current_longitude': tech['technician_profile__current_longitude'],
                'is_available': tech['technician_profile__is_available']
            })

        return Response(result)


# GIS Dashboard View
