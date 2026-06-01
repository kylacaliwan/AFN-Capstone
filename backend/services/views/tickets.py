# Auto-split from services/views.py
from services.views.helpers import (
    AFTER_SALES_VIEW_CAPABILITIES,
    ASSIGNABLE_TICKET_STATUSES,
    CLIENT_RESCHEDULABLE_TICKET_STATUSES,
    CONTACTABLE_TICKET_STATUSES,
    CanViewSupervisorDispatch,
    CanViewSupervisorTickets,
    CanViewTechnicianJobs,
    InspectionChecklist,
    IsAdmin,
    IsAdminOrSupervisor,
    PARTS_REQUEST_TICKET_STATUSES,
    PermissionDenied,
    Q,
    Response,
    ServiceLocation,
    ServiceLocationSerializer,
    ServiceStatusHistory,
    ServiceTicket,
    ServiceTicketSerializer,
    Thread,
    User,
    _calculate_route_async,
    _default_ticket_supervisor_for_actor,
    _notify_ticket_assignment_recipients,
    action,
    apply_schedule_fields,
    apply_ticket_status_change,
    create_notification,
    ensure_ticket_checklist_completed,
    get_eligible_technician_ids_for_service,
    get_technician_service_skill,
    get_technician_ticket_queryset,
    get_ticket_team_member_ids,
    get_visible_service_requests_queryset,
    get_visible_service_tickets_queryset,
    is_admin_workspace_role,
    logger,
    normalize_proof_media_payload,
    normalize_time_slot,
    parse_date,
    parse_technician_id_list,
    parse_time,
    permissions,
    save_uploaded_proof_media,
    score_technician_fit,
    send_notification_email,
    serialize_ticket_crew_members,
    serialize_ticket_inventory,
    status,
    sync_ticket_crew_assignments,
    sync_ticket_reservations,
    sync_ticket_team_availability,
    ticket_has_technician_access,
    timezone,
    transaction,
    user_has_any_capability,
    validate_technician_daily_capacity,
    viewsets,
)
from services.serializers import ServiceTicketReportSerializer
from inventory.automation import create_pending_reservation
from inventory.models import InventoryItem
from services.user_display import client_technician_label

class ServiceLocationViewSet(viewsets.ModelViewSet):
    queryset = ServiceLocation.objects.select_related('request__client', 'request__service_type')
    serializer_class = ServiceLocationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminOrSupervisor()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        visible_requests = get_visible_service_requests_queryset(
            self.request.user,
            include_follow_up=True,
        )
        return self.queryset.filter(request__in=visible_requests)


class ServiceTicketViewSet(viewsets.ModelViewSet):
    queryset = ServiceTicket.objects.all()
    serializer_class = ServiceTicketSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['assign', 'auto_assign']:
            return [CanViewSupervisorDispatch()]
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'update_status', 'reschedule']:
            return [CanViewSupervisorTickets()]
        elif self.action in ['start_work', 'complete_work', 'add_progress', 'add_notes', 'upload_photos', 'request_parts', 'contact_client']:
            return [CanViewTechnicianJobs()]
        elif self.action in ['request_reschedule', 'submit_feedback']:
            return [permissions.IsAuthenticated()]
        elif self.action == 'report':
            return [IsAdmin()]  # Only superadmin and admin can access reports
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        """Filter queryset based on user role with optimized queries"""
        # Optimize by selecting all related objects at once to avoid N+1 queries
        base_queryset = ServiceTicket.objects.select_related(
            'technician',
            'supervisor',  # Added: was missing in previous query
            'request',
            'request__service_type',
            'request__client',
            'request__location'
        ).prefetch_related(
            'crew_assignments__technician'
        )

        workspace = str(self.request.query_params.get('workspace') or '').strip()
        if (
            workspace == 'after_sales' and
            (
                is_admin_workspace_role(self.request.user.role) or
                user_has_any_capability(self.request.user, AFTER_SALES_VIEW_CAPABILITIES)
            )
        ):
            return base_queryset.filter(status='Completed').order_by('-completed_date', '-id')

        return get_visible_service_tickets_queryset(self.request.user, base_queryset=base_queryset)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Return stable ticket counts for cards that must not depend on paginated rows."""
        queryset = self.get_queryset()
        tickets = list(queryset)
        active_tickets = [
            ticket for ticket in tickets
            if ticket.status not in ['Completed', 'Cancelled']
        ]
        dispatchable_tickets = [
            ticket for ticket in active_tickets
            if ticket.technician_id is None and ticket.status in ['Not Started', 'On Hold']
        ]
        assigned_active_tickets = [
            ticket for ticket in active_tickets
            if ticket.technician_id is not None
        ]

        missed_dispatch_count = 0
        warning_count = 0
        overdue_count = 0

        now = timezone.now()
        for ticket in active_tickets:
            try:
                if get_ticket_dispatch_state(ticket).get('is_missed_dispatch'):
                    missed_dispatch_count += 1
            except Exception:
                logger.exception('Failed to evaluate dispatch state for ticket %s', ticket.id)

            try:
                sla_state = evaluate_service_ticket_sla(ticket, now=now).get('state')
                if sla_state == 'warning':
                    warning_count += 1
                elif sla_state == 'overdue':
                    overdue_count += 1
            except Exception:
                logger.exception('Failed to evaluate SLA state for ticket %s', ticket.id)

        return Response({
            'total_tickets': len(tickets),
            'active_queue': len(active_tickets),
            'completed': sum(1 for ticket in tickets if ticket.status == 'Completed'),
            'cancelled': sum(1 for ticket in tickets if ticket.status == 'Cancelled'),
            'unassigned_active': sum(1 for ticket in active_tickets if ticket.technician_id is None),
            'dispatchable': len(dispatchable_tickets),
            'assigned_active': len(assigned_active_tickets),
            'missed_dispatch': missed_dispatch_count,
            'sla_warning': warning_count,
            'sla_overdue': overdue_count,
            'sla_risk': warning_count + overdue_count,
        })

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        """
        Unified assignment endpoint - replaces assign_technician and old assign.
        Accepts: technician_id (required), auto_assign (bool), calculate_route (bool)
        """
        ticket = self.get_object()
        technician_id = request.data.get('technician_id')
        crew_ids_value = (
            request.data.getlist('crew_ids')
            if hasattr(request.data, 'getlist') and request.data.getlist('crew_ids')
            else request.data.get('crew_ids')
        )

        if ticket.status not in ASSIGNABLE_TICKET_STATUSES:
            return Response(
                {'error': f'Only tickets in {" or ".join(sorted(ASSIGNABLE_TICKET_STATUSES))} can be assigned.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not technician_id:
            return Response({'error': 'technician_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            crew_ids = parse_technician_id_list(crew_ids_value)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            technician = User.objects.get(id=technician_id, role='technician')
            if technician.status != 'active':
                return Response({'error': 'Technician must be active before assignment.'}, status=status.HTTP_400_BAD_REQUEST)

            scheduled_date = None
            if request.data.get('scheduled_date'):
                scheduled_date = parse_date(str(request.data.get('scheduled_date')))
                if scheduled_date is None:
                    return Response({'error': 'scheduled_date must be a valid date'}, status=status.HTTP_400_BAD_REQUEST)

            scheduled_time = None
            if request.data.get('scheduled_time'):
                scheduled_time = parse_time(str(request.data.get('scheduled_time')))
                if scheduled_time is None:
                    return Response({'error': 'scheduled_time must be a valid time'}, status=status.HTTP_400_BAD_REQUEST)

            requested_time_slot = request.data.get('scheduled_time_slot')
            if requested_time_slot not in [None, ''] and normalize_time_slot(requested_time_slot) is None:
                return Response({'error': 'scheduled_time_slot must be a supported time slot'}, status=status.HTTP_400_BAD_REQUEST)

            effective_scheduled_date = scheduled_date or ticket.scheduled_date

            # Enforce daily assignment limit per service type
            service_type = ticket.request.service_type
            if not get_technician_service_skill(technician, service_type):
                return Response(
                    {
                        'error': (
                            f'{technician.username} is not assigned to "{service_type.name}". '
                            'Add this service skill or General Services to the technician before dispatching the ticket.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            daily_count = get_technician_ticket_queryset(technician).filter(
                scheduled_date=effective_scheduled_date,
                request__service_type=service_type,
            ).exclude(pk=ticket.pk).exclude(status='Cancelled').count()
            if daily_count >= service_type.max_daily_assignments:
                return Response(
                    {'error': f'{technician.username} already has {daily_count} "{service_type.name}" job(s) on {effective_scheduled_date}. '
                              f'Limit is {service_type.max_daily_assignments}/day.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                validate_technician_daily_capacity(technician, effective_scheduled_date, ticket)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            crew_ids = [crew_id for crew_id in crew_ids if crew_id != technician.id]
            crew_lookup = {
                crew_member.id: crew_member
                for crew_member in User.objects.filter(id__in=crew_ids, role='technician')
            }
            missing_crew_ids = [crew_id for crew_id in crew_ids if crew_id not in crew_lookup]
            if missing_crew_ids:
                return Response(
                    {'error': 'One or more crew members were not found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            inactive_crew_members = [
                crew_member.username
                for crew_member in crew_lookup.values()
                if crew_member.status != 'active'
            ]
            if inactive_crew_members:
                return Response(
                    {
                        'error': (
                            'Crew members must be active before assignment: '
                            + ', '.join(inactive_crew_members)
                            + '.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            crew_members = [crew_lookup[crew_id] for crew_id in crew_ids]
            for crew_member in crew_members:
                try:
                    validate_technician_daily_capacity(crew_member, effective_scheduled_date, ticket)
                except ValueError as exc:
                    return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            previous_team_ids = get_ticket_team_member_ids(ticket)
            if ticket.supervisor_id is None:
                ticket.supervisor = _default_ticket_supervisor_for_actor(request.user)
            ticket.technician = technician
            ticket.assigned_at = timezone.now()
            apply_schedule_fields(
                ticket,
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
                scheduled_time_slot=requested_time_slot,
            )
            ticket.smart_assignment_score = None
            ticket.smart_assignment_summary = None
            ticket.save()
            sync_ticket_crew_assignments(ticket, crew_members)
            sync_ticket_team_availability(ticket, extra_technicians=previous_team_ids)
            inventory_summary = sync_ticket_reservations(ticket, performed_by=request.user)

            # Calculate routing information if coordinates available
            try:
                loc = ticket.request.location
                if loc.latitude and loc.longitude and technician.current_latitude and technician.current_longitude:
                    from services.ors_utils import get_route
                    route = get_route(
                        (float(loc.longitude), float(loc.latitude)),
                        (float(technician.current_longitude), float(technician.current_latitude))
                    )
                    if route and 'features' in route and route['features']:
                        geom = route['features'][0].get('geometry')
                        props = route['features'][0].get('properties', {}).get('segments', [{}])[0]
                        ticket.route_geometry = geom
                        ticket.route_distance = props.get('distance')
                        ticket.route_duration = props.get('duration')
                        ticket.save()
            except Exception as e:
                logger.warning(f"Route calculation failed for ticket {ticket.id}: {e}")

            crew_note = f" with crew: {', '.join(member.username for member in crew_members)}" if crew_members else ''

            # Create status history
            ServiceStatusHistory.objects.create(
                ticket=ticket,
                status=ticket.status,
                changed_by=request.user,
                notes=f"Technician {technician.username} assigned{crew_note}"
            )

            _notify_ticket_assignment_recipients(
                ticket=ticket,
                technician=technician,
                acting_user=request.user,
                crew_members=crew_members,
                auto_assigned=False,
            )
            create_notification(
                ticket.request.client,
                (
                    f"Your service ticket #{ticket.id} is now assigned to {technician.username}"
                    f"{f' with {len(crew_members)} additional technician(s)' if crew_members else ''}"
                    f"{f' for {ticket.scheduled_date}' if ticket.scheduled_date else ''}."
                ),
                'info'
            )

            return Response({
                'success': True,
                'message': 'Technician assigned' if not crew_members else 'Technician and crew assigned',
                'ticket_id': ticket.id,
                'technician': {
                    'id': technician.id,
                    'username': technician.username
                },
                'crew_members': serialize_ticket_crew_members(ticket),
                'route_distance': ticket.route_distance,
                'route_duration': ticket.route_duration,
                'inventory_summary': inventory_summary,
            })
        except User.DoesNotExist:
            return Response(
                {'error': 'Technician not found', 'success': False},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def auto_assign(self, request, pk=None):
        """Auto-assign the best available technician using skill, distance, and workload."""
        ticket = self.get_object()
        service_type = ticket.request.service_type
        current_tech_id = ticket.technician_id  # Remember current technician for comparison

        if ticket.status not in ASSIGNABLE_TICKET_STATUSES:
            return Response(
                {'error': f'Only tickets in {" or ".join(sorted(ASSIGNABLE_TICKET_STATUSES))} can be auto-assigned.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get location of the service request
        try:
            location = ticket.request.location
            request_lat = location.latitude
            request_lon = location.longitude
        except ServiceLocation.DoesNotExist:
            return Response({'error': 'Service location not found'}, status=status.HTTP_400_BAD_REQUEST)

        # Find technicians with the exact service skill, or General Services as fallback.
        skilled_technicians = get_eligible_technician_ids_for_service(service_type)

        # Get available technicians with required skills
        # Exclude the CURRENT technician from this query to allow reassignment
        available_technicians = User.objects.filter(
            id__in=skilled_technicians,
            role='technician',
            status='active',
            technician_profile__is_available=True
        ).exclude(
            id=current_tech_id  # Exclude ONLY the current technician
        ).exclude(
            # Exclude technicians already deeply overloaded (3+ active tickets)
            assigned_tickets__status__in=['Not Started', 'In Progress']
        ).distinct()

        # If no one else available, allow current technician to stay
        if not available_technicians:
            if current_tech_id:
                available_technicians = User.objects.filter(id=current_tech_id)
            else:
                return Response(
                    {'error': 'No available technicians with required skills', 'success': False},
                    status=status.HTTP_409_CONFLICT
                )

        ranked_candidates = []
        for tech in available_technicians:
            # Set default location if missing
            if not tech.current_latitude or not tech.current_longitude:
                tech.current_latitude = 14.5995
                tech.current_longitude = 120.9842
                tech.save()

            candidate = score_technician_fit(ticket, tech, request_lat, request_lon)
            if candidate is not None:
                candidate['technician'] = tech
                ranked_candidates.append(candidate)

        if not ranked_candidates:
            return Response(
                {'error': 'No technicians have enough routing and skill data for smart assignment', 'success': False},
                status=status.HTTP_409_CONFLICT
            )

        ranked_candidates.sort(
            key=lambda item: (
                item.get('daily_assigned_minutes', 0),
                -item['score'],
            )
        )
        best_candidate = ranked_candidates[0]
        selected_technician = best_candidate['technician']

        if selected_technician:
            previous_team_ids = get_ticket_team_member_ids(ticket)
            if ticket.supervisor_id is None:
                ticket.supervisor = _default_ticket_supervisor_for_actor(request.user)
            ticket.technician = selected_technician
            ticket.auto_assigned = True
            ticket.assigned_at = timezone.now()
            ticket.smart_assignment_score = best_candidate['score']
            ticket.smart_assignment_summary = best_candidate['summary']
            ticket.save()
            sync_ticket_crew_assignments(ticket, [])
            sync_ticket_team_availability(ticket, extra_technicians=previous_team_ids)
            inventory_summary = sync_ticket_reservations(ticket, performed_by=request.user)

            # compute route details asynchronously to avoid blocking response
            loc = ticket.request.location
            if loc.latitude and loc.longitude and selected_technician.current_latitude and selected_technician.current_longitude:
                start_coords = (float(loc.longitude), float(loc.latitude))
                end_coords = (float(selected_technician.current_longitude), float(selected_technician.current_latitude))
                # Start route calculation in background thread
                route_thread = Thread(
                    target=_calculate_route_async,
                    args=(ticket.id, start_coords, end_coords),
                    daemon=True
                )
                route_thread.start()

            # Create status history
            action = "re-assigned" if current_tech_id and current_tech_id != selected_technician.id else "auto-assigned"
            ServiceStatusHistory.objects.create(
                ticket=ticket,
                status=ticket.status,
                changed_by=request.user,
                notes=(
                    f"Smart-{action} to {selected_technician.username} "
                    f"(score {best_candidate['score']}, distance {best_candidate['distance_km']:.2f} km, "
                    f"{best_candidate['summary']})"
                )
            )

            _notify_ticket_assignment_recipients(
                ticket=ticket,
                technician=selected_technician,
                acting_user=request.user,
                crew_members=[],
                auto_assigned=True,
            )
            create_notification(
                ticket.request.client,
                f"Your service ticket #{ticket.id} was auto-assigned to "
                f"{client_technician_label(selected_technician) or selected_technician.username}.",
                'info'
            )

            return Response({
                'success': True,
                'message': f'Technician auto-{action}',
                'ticket_id': ticket.id,
                'technician': {
                    'id': selected_technician.id,
                    'username': selected_technician.username
                },
                'crew_members': [],
                'distance_km': best_candidate['distance_km'],
                'assignment_score': best_candidate['score'],
                'assignment_summary': best_candidate['summary'],
                'candidate_ranking': [
                    {
                        'technician_id': item['technician'].id,
                        'technician_name': (
                            client_technician_label(item['technician']) or item['technician'].username
                        ),
                        'score': item['score'],
                        'distance_km': item['distance_km'],
                        'skill_level': item['skill_level'],
                    }
                    for item in ranked_candidates[:3]
                ],
                'route_distance': ticket.route_distance,
                'route_duration': ticket.route_duration,
                'inventory_summary': inventory_summary,
            })

        return Response(
            {'error': 'Could not find suitable technician', 'success': False},
            status=status.HTTP_409_CONFLICT
        )

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update ticket status with history tracking"""
        ticket = self.get_object()
        new_status = request.data.get('status')
        notes = request.data.get('notes', '')

        if not new_status:
            return Response({'error': 'status is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            resolved_status = apply_ticket_status_change(
                ticket,
                new_status,
                changed_by=request.user,
                notes=notes or f'Status updated to {new_status}',
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        create_notification(
            ticket.request.client,
            f"Service status updated to {resolved_status} for ticket #{ticket.id}",
            'info'
        )
        if ticket.technician and ticket.technician != request.user:
            create_notification(
                ticket.technician,
                f"Ticket #{ticket.id} status was updated to {resolved_status}.",
                'info'
            )

        return Response({
            'success': True,
            'message': 'Status updated',
            'ticket_id': ticket.id,
            'status': resolved_status
        })

    def get_technician_active_job(self, technician):
        """Get the active job for a technician (if they have one)"""
        return ServiceTicket.objects.filter(
            Q(technician=technician) | Q(crew_assignments__technician=technician),
            status__in=['In Progress', 'On Hold']
        ).select_related('technician', 'request__client', 'request__service_type').first()

    @action(detail=True, methods=['post'])
    def start_work(self, request, pk=None):
        """Mark ticket as started - only if technician has no other active jobs"""
        ticket = self.get_object()
        if not ticket_has_technician_access(ticket, request.user):
            raise PermissionDenied('You can only start tickets assigned to you or your crew.')

        # Check if technician already has an active job
        active_job = self.get_technician_active_job(request.user)
        if active_job and active_job.id != ticket.id:
            return Response({
                'error': f'You already have an active job (Ticket #{active_job.id}). '
                         f'Please complete or hold it before starting a new one.',
                'active_job': {
                    'id': active_job.id,
                    'client': active_job.request.client.username,
                    'service': active_job.request.service_type.name,
                    'status': active_job.status,
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            resolved_status = apply_ticket_status_change(
                ticket,
                'In Progress',
                changed_by=request.user,
                notes='Work started',
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        create_notification(
            ticket.request.client,
            f"Work has started for ticket #{ticket.id}.",
            'info'
        )

        return Response({'status': resolved_status, 'start_time': ticket.start_time})

    @action(detail=True, methods=['post'])
    def complete_work(self, request, pk=None):
        """Mark ticket as completed with optional proof images"""
        ticket = self.get_object()
        if not ticket_has_technician_access(ticket, request.user):
            raise PermissionDenied('You can only complete tickets assigned to you or your crew.')

        # Get proof images and completion notes from request
        proof_images = request.data.get('completion_proof_images', [])
        completion_notes = request.data.get('completion_notes', '')
        inventory_usage = request.data.get('inventory_usage')

        if ticket.status == 'In Progress':
            try:
                ensure_ticket_checklist_completed(ticket)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Store proof images and notes
        ticket.completion_proof_images = proof_images if isinstance(proof_images, list) else [proof_images]
        ticket.completion_notes = completion_notes

        try:
            resolved_status = apply_ticket_status_change(
                ticket,
                'Completed',
                changed_by=request.user,
                notes=completion_notes or 'Work completed with proof images',
                extra_update_fields=['completion_proof_images', 'completion_notes'],
                inventory_usage=inventory_usage,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Notify client
        create_notification(
            ticket.request.client,
            f"Your service ticket #{ticket.id} has been completed!",
            'success'
        )

        return Response({
            'status': resolved_status,
            'end_time': ticket.end_time,
            'proof_images': ticket.completion_proof_images,
            'message': 'Job completed with proof images uploaded'
        })

    @action(detail=True, methods=['post'])
    def request_reschedule(self, request, pk=None):
        ticket = self.get_object()
        if request.user.role != 'client' or ticket.request.client_id != request.user.id:
            raise PermissionDenied('You can only request reschedules for your own tickets.')
        if ticket.status not in CLIENT_RESCHEDULABLE_TICKET_STATUSES:
            return Response(
                {'error': 'Reschedules can only be requested before work has started.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        preferred_date_value = request.data.get('preferred_date')
        preferred_time_slot = normalize_time_slot(request.data.get('preferred_time_slot'))
        reason = str(request.data.get('reason', '')).strip()

        if not preferred_date_value or not preferred_time_slot or not reason:
            return Response(
                {'error': 'preferred_date, preferred_time_slot, and reason are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        preferred_date = parse_date(str(preferred_date_value))
        if preferred_date is None:
            return Response({'error': 'preferred_date must be a valid date'}, status=status.HTTP_400_BAD_REQUEST)
        if preferred_date < timezone.localdate():
            return Response({'error': 'preferred_date cannot be in the past'}, status=status.HTTP_400_BAD_REQUEST)

        request_obj = ticket.request
        request_obj.preferred_date = preferred_date
        request_obj.preferred_time_slot = preferred_time_slot
        request_obj.scheduling_notes = reason
        request_obj.save(update_fields=['preferred_date', 'preferred_time_slot', 'scheduling_notes', 'updated_at'])

        ticket.reschedule_requested = True
        ticket.reschedule_reason = reason
        ticket.reschedule_requested_at = timezone.now()
        ticket.save(update_fields=['reschedule_requested', 'reschedule_reason', 'reschedule_requested_at', 'updated_at'])

        ServiceStatusHistory.objects.create(
            ticket=ticket,
            status=ticket.status,
            changed_by=request.user,
            notes=(
                f"Client requested reschedule to {preferred_date.isoformat()} "
                f"({preferred_time_slot}): {reason}"
            )
        )

        recipients = User.objects.filter(role__in=['superadmin', 'admin'])
        if ticket.supervisor_id:
            recipients = recipients | User.objects.filter(id=ticket.supervisor_id)

        for recipient in recipients.distinct():
            create_notification(
                recipient,
                f"Ticket #{ticket.id} has a new reschedule request for {preferred_date.isoformat()} ({preferred_time_slot}).",
                'warning'
            )

        return Response({
            'status': 'Reschedule requested',
            'preferred_date': preferred_date,
            'preferred_time_slot': preferred_time_slot,
            'reason': reason,
        })

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        ticket = self.get_object()
        if ticket.status not in CLIENT_RESCHEDULABLE_TICKET_STATUSES:
            return Response(
                {'error': 'Only tickets that have not started can be rescheduled.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        scheduled_date_value = request.data.get('scheduled_date') or ticket.request.preferred_date
        scheduled_time_slot = normalize_time_slot(
            request.data.get('scheduled_time_slot') or ticket.request.preferred_time_slot
        )
        scheduled_time = None
        if request.data.get('scheduled_time'):
            scheduled_time = parse_time(str(request.data.get('scheduled_time')))
            if scheduled_time is None:
                return Response({'error': 'scheduled_time must be a valid time'}, status=status.HTTP_400_BAD_REQUEST)

        if scheduled_date_value in [None, '']:
            return Response({'error': 'scheduled_date is required'}, status=status.HTTP_400_BAD_REQUEST)

        scheduled_date = scheduled_date_value
        if not hasattr(scheduled_date, 'isoformat'):
            scheduled_date = parse_date(str(scheduled_date_value))
        if scheduled_date is None:
            return Response({'error': 'scheduled_date must be a valid date'}, status=status.HTTP_400_BAD_REQUEST)
        if scheduled_date < timezone.localdate():
            return Response({'error': 'scheduled_date cannot be in the past'}, status=status.HTTP_400_BAD_REQUEST)

        apply_schedule_fields(
            ticket,
            scheduled_date=scheduled_date,
            scheduled_time=scheduled_time,
            scheduled_time_slot=scheduled_time_slot,
        )
        ticket.reschedule_requested = False
        ticket.reschedule_reason = None
        ticket.reschedule_requested_at = None
        ticket.save()

        request_obj = ticket.request
        request_obj.preferred_date = scheduled_date
        request_obj.preferred_time_slot = scheduled_time_slot
        if request.data.get('notes'):
            request_obj.scheduling_notes = str(request.data.get('notes')).strip()
        request_obj.save(update_fields=['preferred_date', 'preferred_time_slot', 'scheduling_notes', 'updated_at'])

        ServiceStatusHistory.objects.create(
            ticket=ticket,
            status=ticket.status,
            changed_by=request.user,
            notes=(
                f"Schedule confirmed for {scheduled_date.isoformat()} "
                f"({scheduled_time_slot or 'time to be confirmed'})"
            )
        )

        create_notification(
            ticket.request.client,
            f"Ticket #{ticket.id} was rescheduled to {scheduled_date.isoformat()} ({scheduled_time_slot or 'time TBD'}).",
            'info'
        )
        if ticket.technician:
            create_notification(
                ticket.technician,
                f"Ticket #{ticket.id} was rescheduled to {scheduled_date.isoformat()} ({scheduled_time_slot or 'time TBD'}).",
                'info'
            )

        return Response({
            'status': 'Schedule updated',
            'scheduled_date': ticket.scheduled_date,
            'scheduled_time': ticket.scheduled_time,
            'scheduled_time_slot': ticket.scheduled_time_slot,
        })

    @action(detail=True, methods=['post'])
    def add_notes(self, request, pk=None):
        ticket = self.get_object()
        notes = request.data.get('notes', '').strip()
        if not notes:
            return Response({'error': 'Notes are required'}, status=status.HTTP_400_BAD_REQUEST)

        ticket.notes = f"{ticket.notes or ''}\n{notes}".strip()
        ticket.save()

        ServiceStatusHistory.objects.create(
            ticket=ticket,
            status=ticket.status,
            changed_by=request.user,
            notes=f"Technician notes: {notes}"
        )

        return Response({'status': 'Notes added', 'notes': ticket.notes})

    @action(detail=True, methods=['post'])
    def submit_feedback(self, request, pk=None):
        ticket = self.get_object()
        if request.user.role != 'client' or ticket.request.client_id != request.user.id:
            raise PermissionDenied('You can only rate your own completed tickets.')
        if ticket.status != 'Completed':
            return Response({'error': 'Feedback can only be submitted for completed tickets'}, status=status.HTTP_400_BAD_REQUEST)

        rating = request.data.get('rating', request.data.get('client_rating'))
        feedback = str(request.data.get('feedback', request.data.get('client_feedback', ''))).strip()

        try:
            rating = int(rating)
        except (TypeError, ValueError):
            return Response({'error': 'rating must be a number from 1 to 5'}, status=status.HTTP_400_BAD_REQUEST)

        if rating < 1 or rating > 5:
            return Response({'error': 'rating must be between 1 and 5'}, status=status.HTTP_400_BAD_REQUEST)

        ticket.client_rating = rating
        ticket.client_feedback = feedback or None
        ticket.save(update_fields=['client_rating', 'client_feedback', 'updated_at'])

        if ticket.technician:
            create_notification(
                ticket.technician,
                f"Client feedback received for ticket #{ticket.id}: {rating}/5",
                'info'
            )

        return Response({
            'status': 'Feedback submitted',
            'client_rating': ticket.client_rating,
            'client_feedback': ticket.client_feedback,
        })

    @action(detail=True, methods=['post'])
    def upload_photos(self, request, pk=None):
        ticket = self.get_object()
        photos = request.data.get('photos', []) or []
        videos = request.data.get('videos', []) or []
        media = request.data.get('media', []) or []
        uploaded_media = []
        if hasattr(request.FILES, 'getlist'):
            uploaded_media.extend(
                save_uploaded_proof_media(
                    ticket=ticket,
                    uploaded_files=request.FILES.getlist('photo_files'),
                    request=request,
                    media_type='photo',
                )
            )
            uploaded_media.extend(
                save_uploaded_proof_media(
                    ticket=ticket,
                    uploaded_files=request.FILES.getlist('video_files'),
                    request=request,
                    media_type='video',
                )
            )

        proof_media = normalize_proof_media_payload(photos=photos, videos=videos, media=media) + uploaded_media
        if not proof_media:
            return Response({'error': 'At least one photo or video proof entry is required'}, status=status.HTTP_400_BAD_REQUEST)

        checklist, _ = InspectionChecklist.objects.get_or_create(ticket=ticket)
        checklist.proof_media = list(checklist.proof_media or []) + proof_media
        checklist.save(update_fields=['proof_media'])

        photo_count = sum(1 for item in proof_media if item['type'] == 'photo')
        video_count = sum(1 for item in proof_media if item['type'] == 'video')
        ServiceStatusHistory.objects.create(
            ticket=ticket,
            status=ticket.status,
            changed_by=request.user,
            notes=f"Proof uploaded: {photo_count} photo(s), {video_count} video(s)"
        )

        return Response({
            'status': 'Proof uploaded',
            'photos': [item for item in proof_media if item['type'] == 'photo'],
            'videos': [item for item in proof_media if item['type'] == 'video'],
            'media': proof_media,
        })

    @action(detail=True, methods=['post'])
    def request_parts(self, request, pk=None):
        ticket = self.get_object()
        if request.user.role == 'technician' and not ticket_has_technician_access(ticket, request.user):
            return Response({'error': 'You can only request equipment for assigned tickets.'}, status=status.HTTP_403_FORBIDDEN)

        notes = str(request.data.get('notes') or '').strip()
        requested_parts = str(request.data.get('parts') or '').strip()
        item_requests = request.data.get('items') or request.data.get('equipment') or []
        if not isinstance(item_requests, list):
            return Response({'error': 'Equipment items must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
        item_requests = list(item_requests)

        item_id = request.data.get('item_id') or request.data.get('itemId')
        if item_id:
            item_requests.append({
                'item_id': item_id,
                'quantity': request.data.get('quantity', 1),
            })

        requested_items = []
        if item_requests:
            item_quantities = {}
            for entry in item_requests:
                entry_item_id = entry.get('item_id') or entry.get('itemId') or entry.get('id')
                quantity_value = entry.get('quantity', 1)
                if not entry_item_id:
                    return Response({'error': 'Each equipment item must include an item_id.'}, status=status.HTTP_400_BAD_REQUEST)
                try:
                    normalized_item_id = int(entry_item_id)
                    quantity = int(quantity_value)
                except (TypeError, ValueError):
                    return Response({'error': 'Equipment item and quantity must be valid numbers.'}, status=status.HTTP_400_BAD_REQUEST)
                if quantity <= 0:
                    return Response({'error': 'Quantity must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)
                item_quantities[normalized_item_id] = item_quantities.get(normalized_item_id, 0) + quantity

            inventory_items = {
                item.id: item
                for item in InventoryItem.objects.filter(id__in=item_quantities.keys())
            }
            missing_item_ids = [item_id for item_id in item_quantities.keys() if item_id not in inventory_items]
            if missing_item_ids:
                return Response({'error': 'One or more equipment items were not found.'}, status=status.HTTP_404_NOT_FOUND)

            for entry_item_id, quantity in item_quantities.items():
                item = inventory_items[entry_item_id]
                if quantity > item.available_quantity:
                    return Response(
                        {'error': f'Only {item.available_quantity} unit(s) are available for {item.name}.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                requested_items.append({'item': item, 'quantity': quantity})

            requested_parts = ', '.join(
                f"{entry['item'].name} x{entry['quantity']}" for entry in requested_items
            )

        if not requested_parts:
            return Response({'error': 'Requested equipment must be provided'}, status=status.HTTP_400_BAD_REQUEST)
        if ticket.status not in PARTS_REQUEST_TICKET_STATUSES:
            return Response(
                {'error': 'Additional equipment can only be requested after work has started.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reservations = []
        try:
            with transaction.atomic():
                for entry in requested_items:
                    item = entry['item']
                    quantity = entry['quantity']
                    reservation_notes = f'Additional equipment requested by {request.user.username}'
                    if notes:
                        reservation_notes = f'{reservation_notes}: {notes}'
                    reservation = create_pending_reservation(
                        item=item,
                        quantity=quantity,
                        technician=request.user,
                        required_date=ticket.scheduled_date or timezone.localdate(),
                        service_ticket=ticket,
                        performed_by=request.user,
                        notes=reservation_notes,
                    )
                    if reservation:
                        reservations.append(reservation)

                status_notes = f"Additional equipment requested: {requested_parts}"
                if notes:
                    status_notes = f'{status_notes} - {notes}'
                if ticket.status == 'In Progress':
                    apply_ticket_status_change(
                        ticket,
                        'On Hold',
                        changed_by=request.user,
                        notes=status_notes,
                    )
                else:
                    ServiceStatusHistory.objects.create(
                        ticket=ticket,
                        status=ticket.status,
                        changed_by=request.user,
                        notes=status_notes,
                    )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Notify admin workspace users that equipment is requested
        admins = User.objects.filter(role__in=['superadmin', 'admin'])
        for u in list(admins):
            create_notification(
                u,
                f"Additional equipment requested for ticket #{ticket.id}: {requested_parts}",
                'warning'
            )
        create_notification(
            ticket.request.client,
            (
                f"Ticket #{ticket.id} is temporarily on hold while additional equipment is being arranged."
                if ticket.status == 'On Hold'
                else f"Additional equipment is being arranged for ticket #{ticket.id}."
            ),
            'info'
        )

        response_payload = {'status': 'Additional equipment requested', 'parts': requested_parts}
        if reservations:
            response_payload['reservations'] = [
                {
                'id': reservation.id,
                'item_id': reservation.item_id,
                'item_name': reservation.item.name,
                'item_sku': reservation.item.sku,
                'quantity': reservation.quantity,
                'status': reservation.status,
                'required_date': reservation.required_date,
                'technician_id': reservation.technician_id,
                'technician_name': reservation.technician.username,
                'notes': reservation.notes,
                }
                for reservation in reservations
            ]
            response_payload['reservation'] = response_payload['reservations'][0]
            response_payload['inventory_reservations'] = serialize_ticket_inventory(ticket)
        return Response(response_payload)

    @action(detail=True, methods=['post'])
    def contact_client(self, request, pk=None):
        ticket = self.get_object()
        if ticket.status not in CONTACTABLE_TICKET_STATUSES:
            return Response(
                {'error': 'Clients can only be contacted while the ticket is active.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        method = request.data.get('method', 'phone')
        message = request.data.get('message', 'Technician needs to contact you regarding the service ticket.')

        # Notify client in-app and via email where available
        client = ticket.request.client
        create_notification(client, f"{request.user.username} ({method}) says: {message}", 'info')
        if client.email:
            send_notification_email(client, 'Technician Contact', message)

        ServiceStatusHistory.objects.create(
            ticket=ticket,
            status=ticket.status,
            changed_by=request.user,
            notes=f"Contact client via {method}: {message}"
        )

        return Response({'status': 'Client contacted', 'method': method})

    @action(detail=True, methods=['get'])
    def inventory_summary(self, request, pk=None):
        ticket = self.get_object()
        return Response({
            'ticket_id': ticket.id,
            'inventory_reservations': serialize_ticket_inventory(ticket),
        })

    @action(detail=True, methods=['get'])
    def proof_images(self, request, pk=None):
        """
        Secure proof image access with role-based permissions.

        Accessible by:
        - Client: Only their own service tickets
        - Admin/Superadmin: All tickets
        - Technician: Their assigned tickets
        """
        ticket = self.get_object()
        user = request.user
        user_role = str(user.role).strip().lower()

        # Check access permissions
        can_access = False

        # Admins and Superadmins can see all
        if user_role in ['admin', 'superadmin']:
            can_access = True
        # Technicians can see their assigned tickets
        elif user_role == 'technician':
            if ticket.technician == user or ticket.crew_assignments.filter(technician=user).exists():
                can_access = True
        # Clients can only see their own service tickets
        elif user_role == 'client':
            if ticket.request and ticket.request.client == user:
                can_access = True

        if not can_access:
            raise PermissionDenied('You do not have permission to view images for this ticket.')

        # Return proof images
        proof_images = ticket.completion_proof_images or []

        return Response({
            'ticket_id': ticket.id,
            'client': str(ticket.request.client) if ticket.request else None,
            'service_type': str(ticket.request.service_type.name) if ticket.request else None,
            'completion_proof_images': proof_images,
            'has_proof_images': len(proof_images) > 0,
            'image_count': len(proof_images),
        })

    @action(detail=False, methods=['get'])
    def report(self, request):
        """Service Ticket Report endpoint with proper field formatting"""
        # Use the report serializer for proper field names
        queryset = self.get_queryset().select_related(
            'request__client',
            'request__service_type',
            'technician'
        ).order_by('-created_at')

        serializer = ServiceTicketReportSerializer(queryset, many=True)
        return Response(serializer.data)
