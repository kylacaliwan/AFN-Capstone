# Auto-split from services/views.py
from services.views.helpers import *  # noqa: F401,F403
from services.user_display import client_technician_label

class TechnicianClientsView(viewsets.ViewSet):
    """View for technicians to see their assigned clients with location data"""
    permission_classes = [IsTechnician]

    def list(self, request):
        """Return list of clients assigned to the current technician"""
        technician = request.user

        # Get all tickets assigned to this technician
        tickets = get_technician_ticket_queryset(
            technician,
            base_queryset=ServiceTicket.objects.select_related('request__client', 'request__location')
        )

        # Extract unique clients with their location data
        clients_data = []
        seen_clients = set()

        for ticket in tickets:
            client = ticket.request.client
            if client.id not in seen_clients:
                seen_clients.add(client.id)

                # Get location data (ServiceLocation may not exist for every request)
                try:
                    location = ticket.request.location
                except ServiceLocation.DoesNotExist:
                    location = None

                client_data = {
                    'id': client.id,
                    'name': f"{client.first_name} {client.last_name}".strip() or client.username,
                    'username': client.username,
                    'email': client.email,
                    'phone': getattr(client, 'phone', ''),
                    'address': location.address if location else getattr(client, 'address', ''),
                    'latitude': float(location.latitude) if location and location.latitude else None,
                    'longitude': float(location.longitude) if location and location.longitude else None,
                    'status': ticket.status.lower().replace(' ', '_'),
                    'ticket_id': ticket.id,
                    'scheduled_date': ticket.scheduled_date,
                    'service_type': ticket.request.service_type.name
                }
                clients_data.append(client_data)

        return Response(clients_data)


class TechnicianDashboardView(viewsets.ViewSet):
    """Technician dashboard with real data from database"""
    permission_classes = [CanViewTechnicianDashboard]

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Get technician dashboard data - consistent field naming"""
        technician = request.user

        # Get technician's assigned tickets
        assigned_tickets = get_technician_ticket_queryset(
            technician,
            base_queryset=ServiceTicket.objects.select_related(
                'request__service_type', 'request__client', 'request__location', 'technician'
            ).prefetch_related('crew_assignments__technician')
        )

        # Today's schedule
        today = timezone.now().date()
        todays_tickets = assigned_tickets.filter(scheduled_date=today)

        # Active tickets (not completed)
        active_tickets = assigned_tickets.filter(
            status__in=['Not Started', 'In Progress', 'On Hold']
        )

        # Recent activity (last 7 days)
        week_ago = timezone.now().date() - timezone.timedelta(days=7)
        recent_tickets = assigned_tickets.filter(
            Q(request__request_date__gte=week_ago) | Q(assigned_at__gte=week_ago)
        ).order_by('-assigned_at')[:10]

        # Calculate stats
        total_assigned = assigned_tickets.count()
        completed_today = assigned_tickets.filter(
            status='Completed',
            completed_date__date=today
        ).count()
        pending_count = active_tickets.count()

        # Current location and availability are stored on the technician profile
        technician_profile = None
        if hasattr(technician, 'technician_profile'):
            technician_profile = technician.technician_profile

        current_location = None
        if (
            technician_profile is not None
            and technician_profile.current_latitude is not None
            and technician_profile.current_longitude is not None
        ):
            current_location = {
                'latitude': technician_profile.current_latitude,
                'longitude': technician_profile.current_longitude,
                'last_update': technician_profile.last_location_update
            }

        return Response({
            'technician': {
                'id': technician.id,
                'username': technician.username,
                'full_name': f"{technician.first_name} {technician.last_name}".strip() or technician.username,
                'is_available': bool(getattr(technician_profile, 'is_available', False)),
                'current_location': current_location
            },
            'stats': {
                'total_assigned': total_assigned,
                'completed_today': completed_today,
                'pending_jobs': pending_count,
                'active_jobs': active_tickets.count()
            },
            'todays_schedule': [self._serialize_ticket_for_dashboard(ticket, technician) for ticket in todays_tickets],
            'active_jobs': [self._serialize_ticket_for_dashboard(ticket, technician) for ticket in active_tickets],
            'recent_activity': [self._serialize_recent_ticket(ticket, technician) for ticket in recent_tickets]
        })

    def _serialize_ticket_for_dashboard(self, ticket, technician):
        """Serialize ticket for dashboard with client id and full name"""
        client = ticket.request.client
        try:
            location = ticket.request.location
            latitude = float(location.latitude) if location and location.latitude is not None else None
            longitude = float(location.longitude) if location and location.longitude is not None else None
        except ServiceLocation.DoesNotExist:
            latitude = None
            longitude = None

        try:
            checklist = ticket.inspection
            checklist_completed = bool(checklist.is_completed)
        except InspectionChecklist.DoesNotExist:
            checklist_completed = False

        return {
            'id': ticket.id,
            'ticket_id': f'TKT-{ticket.id}',
            'service_type': ticket.request.service_type.name,
            'client': {
                'id': client.id,
                'full_name': f"{client.first_name} {client.last_name}".strip() or client.username
            },
            'location': _get_request_address(ticket.request),
            'latitude': latitude,
            'longitude': longitude,
            'scheduled_date': ticket.scheduled_date,
            'scheduled_time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
            'scheduled_time_slot': ticket.scheduled_time_slot,
            'status': ticket.status,
            'priority': ticket.request.priority,
            'notes': ticket.notes,
            'assigned_at': ticket.assigned_at,
            'assignment_role': 'lead' if ticket.technician_id == technician.id else 'crew',
            'crew_members': serialize_ticket_crew_members(ticket),
            'checklist_completed': checklist_completed,
        }

    def _serialize_recent_ticket(self, ticket, technician):
        """Serialize recent ticket with client id and full name"""
        client = ticket.request.client
        return {
            'id': ticket.id,
            'ticket_id': f'TKT-{ticket.id}',
            'service_type': ticket.request.service_type.name,
            'client': {
                'id': client.id,
                'full_name': f"{client.first_name} {client.last_name}".strip() or client.username
            },
            'status': ticket.status,
            'assigned_at': ticket.assigned_at,
            'created_at': ticket.request.request_date,
            'assignment_role': 'lead' if ticket.technician_id == technician.id else 'crew',
        }


class TechnicianJobsView(viewsets.ViewSet):
    """View for technician jobs and schedule - uses consistent field naming with ServiceTicketViewSet"""
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action == 'list':
            return [CanViewTechnicianJobs()]
        if self.action == 'retrieve':
            return [CanViewTechnicianJobDetails()]
        if self.action == 'update_status':
            return [CanViewTechnicianJobs()]
        return [permissions.IsAuthenticated()]

    def _serialize_job(self, ticket, technician=None):
        try:
            location = ticket.request.location
            location_address = location.address if location else None
            latitude = float(location.latitude) if location and location.latitude is not None else None
            longitude = float(location.longitude) if location and location.longitude is not None else None
        except ServiceLocation.DoesNotExist:
            location_address = None
            latitude = None
            longitude = None

        service_name = ticket.request.service_type.name if ticket.request.service_type else 'Service'
        assignment_role = None
        if technician is not None:
            assignment_role = 'lead' if ticket.technician_id == technician.id else 'crew'

        try:
            checklist = ticket.inspection
            checklist_completed = bool(checklist.is_completed)
            checklist_completed_at = checklist.completed_at
        except InspectionChecklist.DoesNotExist:
            checklist_completed = False
            checklist_completed_at = None

        return {
            'id': ticket.id,
            'ticket_id': f'TKT-{ticket.id}',
            'service': service_name,
            'service_type': service_name,
            'client': {
                'id': ticket.request.client.id,
                'full_name': f"{ticket.request.client.first_name} {ticket.request.client.last_name}".strip() or ticket.request.client.username
            },
            'address': location_address or '',
            'location': location_address or '',
            'latitude': latitude,
            'longitude': longitude,
            'status': ticket.status,
            'priority': ticket.request.priority,
            'request_source': ticket.request.request_source,
            'request_source_label': ticket.request.get_request_source_display(),
            'scheduled_date': ticket.scheduled_date,
            'scheduled_time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
            'scheduled_time_slot': ticket.scheduled_time_slot,
            'notes': ticket.notes or '',
            'technician': ticket.technician.username if ticket.technician else None,
            'lead_technician': ticket.technician.username if ticket.technician else None,
            'crew_members': serialize_ticket_crew_members(ticket),
            'inventory_reservations': serialize_ticket_inventory(ticket),
            'assignment_role': assignment_role,
            'checklist_completed': checklist_completed,
            'checklist_completed_at': checklist_completed_at,
            'created_at': ticket.request.request_date
        }

    def list(self, request):
        """Get technician's assigned jobs"""
        technician = request.user

        tickets = get_technician_ticket_queryset(
            technician,
            base_queryset=ServiceTicket.objects.select_related(
                'request__service_type', 'request__client', 'request__location', 'technician'
            ).prefetch_related('crew_assignments__technician', 'inventory_reservations__item', 'inventory_reservations__technician')
        ).order_by('-scheduled_date')

        jobs = [self._serialize_job(ticket, technician=technician) for ticket in tickets]
        return Response(jobs)

    def retrieve(self, request, pk=None):
        """Get a single assigned job with coordinates for map/checklist flows."""
        try:
            ticket = get_technician_ticket_queryset(
                request.user,
                base_queryset=ServiceTicket.objects.select_related(
                    'request__service_type', 'request__client', 'request__location', 'technician'
                ).prefetch_related('crew_assignments__technician', 'inventory_reservations__item', 'inventory_reservations__technician')
            ).get(pk=pk)
        except ServiceTicket.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(self._serialize_job(ticket, technician=request.user))

    def update_status(self, request, pk=None):
        """Update a technician job status using the ticket workflow"""
        try:
            ticket = get_technician_ticket_queryset(request.user).get(pk=pk)
        except ServiceTicket.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        requested_status = str(request.data.get('status', '')).strip().lower()
        status_map = {
            'accepted': 'Not Started',
            'in_progress': 'In Progress',
            'completed': 'Completed'
        }
        new_status = status_map.get(requested_status)
        if not new_status:
            return Response({'error': 'Unsupported status'}, status=status.HTTP_400_BAD_REQUEST)
        if new_status == 'Completed' and ticket.status == 'In Progress':
            try:
                ensure_ticket_checklist_completed(ticket)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if requested_status == 'accepted' and ticket.status == 'Not Started':
            ServiceStatusHistory.objects.create(
                ticket=ticket,
                status='Not Started',
                changed_by=request.user,
                notes='Technician acknowledged assignment'
            )
            return Response({'status': 'Not Started', 'ticket_id': ticket.id})

        try:
            resolved_status = apply_ticket_status_change(
                ticket,
                new_status,
                changed_by=request.user,
                notes=f'Technician updated job status to {new_status}',
                inventory_usage=request.data.get('inventory_usage') if new_status == 'Completed' else None,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if resolved_status == 'Completed':
            create_notification(
                ticket.request.client,
                f"Your service ticket #{ticket.id} has been completed!",
                'success'
            )
        elif resolved_status == 'In Progress':
            create_notification(
                ticket.request.client,
                f"Work has started for ticket #{ticket.id}.",
                'info'
            )

        return Response({'status': resolved_status, 'ticket_id': ticket.id})


class TechnicianScheduleView(viewsets.ViewSet):
    """View for technician schedule - uses consistent field naming"""
    permission_classes = [CanViewTechnicianSchedule]

    def list(self, request):
        """Get technician's schedule"""
        technician = request.user

        # Get today's and upcoming tickets
        today = timezone.now().date()
        tickets = get_technician_ticket_queryset(
            technician,
            base_queryset=ServiceTicket.objects.select_related(
                'request__service_type', 'request__client', 'request__location', 'technician'
            ).prefetch_related('crew_assignments__technician')
        ).filter(
            scheduled_date__gte=today
        ).order_by('scheduled_date')

        schedule = []
        for ticket in tickets:
            try:
                location = ticket.request.location
                location_address = location.address if location else None
            except ServiceLocation.DoesNotExist:
                location_address = None

            schedule.append({
                'id': ticket.id,
                'ticket_id': f'TKT-{ticket.id}',
                'service_type': ticket.request.service_type.name,
                'client': ticket.request.client.username,
                'location': location_address,
                'status': ticket.status,  # Keep original status
                'priority': ticket.request.priority,
                'scheduled_date': ticket.scheduled_date,
                'scheduled_time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
                'scheduled_time_slot': ticket.scheduled_time_slot,
                'notes': ticket.notes or '',
                'assignment_role': 'lead' if ticket.technician_id == technician.id else 'crew',
                'crew_members': serialize_ticket_crew_members(ticket),
            })

        return Response(schedule)


class TechnicianProfileView(viewsets.ViewSet):
    permission_classes = [CanViewTechnicianProfile]

    def list(self, request):
        technician = request.user
        completed_tickets = get_technician_ticket_queryset(technician).filter(status='Completed')
        avg_rating = completed_tickets.exclude(client_rating__isnull=True).aggregate(avg=Avg('client_rating')).get('avg')
        skills = TechnicianSkill.objects.filter(technician=technician).select_related('service_type')

        # Serialize skills with all details
        skills_data = [
            {
                'id': skill.id,
                'service_type': skill.service_type.id,
                'service_type_name': skill.service_type.name,
                'skill_level': skill.skill_level,
                'technician_name': client_technician_label(technician) or technician.username
            }
            for skill in skills
        ]

        return Response({
            'phone': technician.phone or '',
            'email': technician.email or '',
            'skills': skills_data,
            'totalCompleted': completed_tickets.count(),
            'avgCompletionTime': '',
            'rating': float(avg_rating) if avg_rating is not None else 0,
            'status': 'Available' if technician.is_available and technician.status == 'active' else technician.status.title()
        })

    def update(self, request, pk=None):
        serializer = SelfUserUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return self.list(request)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TechnicianHistoryView(viewsets.ViewSet):
    permission_classes = [CanViewTechnicianHistory]

    def _inspection_summary(self, ticket):
        try:
            inspection = ticket.inspection
        except InspectionChecklist.DoesNotExist:
            return None

        return {
            'is_completed': inspection.is_completed,
            'completed_at': inspection.completed_at,
            'completed_by': (
                client_technician_label(inspection.completed_by)
                if inspection.completed_by_id
                else None
            ),
            'maintenance_required': inspection.maintenance_required,
            'maintenance_profile': inspection.maintenance_profile,
            'maintenance_interval_days': inspection.maintenance_interval_days,
            'maintenance_notes': inspection.maintenance_notes,
            'warranty_provided': inspection.warranty_provided,
            'warranty_period_days': inspection.warranty_period_days,
            'warranty_notes': inspection.warranty_notes,
            'follow_up_required': inspection.follow_up_required,
            'follow_up_case_type': inspection.follow_up_case_type,
            'follow_up_due_date': inspection.follow_up_due_date,
            'follow_up_summary': inspection.follow_up_summary,
            'proof_media': inspection.proof_media or [],
            'additional_notes': inspection.additional_notes,
        }

    def _maintenance_summary(self, ticket):
        try:
            schedule = ticket.maintenance_schedule
        except Exception:
            return None

        return {
            'id': schedule.id,
            'maintenance_profile': schedule.maintenance_profile,
            'interval_days': schedule.interval_days,
            'next_due_date': schedule.next_due_date,
            'notify_on_date': schedule.notify_on_date,
            'status': schedule.status,
            'maintenance_notes': schedule.maintenance_notes,
            'risk_level': schedule.risk_level,
        }

    def list(self, request):
        tickets = get_technician_ticket_queryset(
            request.user,
            base_queryset=ServiceTicket.objects.select_related(
                'request__service_type', 'request__client', 'request__location',
                'technician', 'inspection', 'maintenance_schedule'
            ).prefetch_related('crew_assignments__technician', 'after_sales_cases')
        ).filter(
            status='Completed'
        ).order_by('-completed_date', '-updated_at')

        history = []
        for ticket in tickets:
            try:
                location = ticket.request.location
                address = location.address if location else ''
            except ServiceLocation.DoesNotExist:
                address = ''

            history.append({
                'id': ticket.id,
                'service': ticket.request.service_type.name if ticket.request.service_type else 'Service',
                'client': {
                    'id': ticket.request.client_id,
                    'full_name': (
                        ticket.request.client.get_full_name().strip()
                        or ticket.request.client.username
                    ) if ticket.request.client else 'Unknown',
                },
                'ticketId': ticket.id,
                'scheduledDate': ticket.completed_date or ticket.scheduled_date,
                'completed_date': ticket.completed_date,
                'priority': ticket.request.priority if ticket.request else '',
                'notes': ticket.notes or '',
                'completion_notes': ticket.completion_notes or '',
                'completion_proof_images': ticket.completion_proof_images or [],
                'address': address,
                'assignmentRole': 'lead' if ticket.technician_id == request.user.id else 'crew',
                'client_rating': ticket.client_rating,
                'client_feedback': ticket.client_feedback,
                'warranty_status': ticket.warranty_status,
                'warranty_start_date': ticket.warranty_start_date,
                'warranty_end_date': ticket.warranty_end_date,
                'warranty_notes': ticket.warranty_notes,
                'inspection': self._inspection_summary(ticket),
                'maintenance_schedule': self._maintenance_summary(ticket),
                'after_sales_cases': [
                    {
                        'id': case.id,
                        'case_type': case.case_type,
                        'status': case.status,
                        'priority': case.priority,
                        'summary': case.summary,
                        'due_date': case.due_date,
                    }
                    for case in ticket.after_sales_cases.all()[:5]
                ],
            })
        return Response(history)
