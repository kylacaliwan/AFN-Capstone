# Auto-split from services/views.py
from services.views.helpers import (
    CanManageServiceRequests,
    PermissionDenied,
    Response,
    ServiceRequest,
    ServiceRequestSerializer,
    ServiceStatusHistory,
    ServiceTicket,
    User,
    action,
    build_initial_ticket_payload,
    clear_reschedule_request,
    create_notification,
    get_ticket_team_members,
    get_visible_service_requests_queryset,
    is_admin_workspace_role,
    logger,
    permissions,
    release_ticket_reservations,
    send_notification_email,
    status,
    sync_ticket_team_availability,
    transaction,
    user_can_manage_service_requests,
    viewsets,
)

class ServiceRequestViewSet(viewsets.ModelViewSet):
    queryset = ServiceRequest.objects.all()
    serializer_class = ServiceRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['create']:
            return [permissions.IsAuthenticated()]  # Any authenticated user can create requests
        elif self.action in ['update', 'partial_update', 'destroy', 'approve', 'reject']:
            return [CanManageServiceRequests()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        """Filter queryset based on user role"""
        if self.action in ['approve', 'reject', 'update', 'partial_update', 'destroy']:
            return ServiceRequest.objects.select_related('client', 'location', 'service_type').order_by('request_date', 'id')
        return get_visible_service_requests_queryset(self.request.user)

    def perform_create(self, serializer):
        with transaction.atomic():
            # New requests stay in the review queue until an admin or supervisor approves them.
            request_obj = serializer.save(status='Pending', auto_ticket_created=False)

        # Send notification to admin
        admins = User.objects.filter(role__in=['superadmin', 'admin'])
        for admin in admins:
            create_notification(
                admin,
                f"New service request #{request_obj.id} from {request_obj.client.username} is pending review.",
                'info'
            )
            send_notification_email(
                admin,
                'New Service Request Submitted',
                f"Service request #{request_obj.id} from {request_obj.client.username} is waiting for review."
            )

        create_notification(
            request_obj.client,
            f"Your service request #{request_obj.id} has been submitted and is pending review.",
            'info'
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve request (ticket already auto-created at submission)"""
        with transaction.atomic():
            service_request = self.get_object()
            if service_request.status in ['Cancelled', 'Completed']:
                return Response(
                    {'error': f'Cannot approve a {service_request.status.lower()} request.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            service_request.status = 'Approved'
            service_request.save(update_fields=['status'])

            # Ensure ticket exists (auto-created at submission, but create if missing for consistency)
            ticket = ServiceTicket.objects.filter(request=service_request).first()
            if not ticket:
                ticket = ServiceTicket.objects.create(
                    request=service_request,
                    supervisor=None,
                    **build_initial_ticket_payload(service_request),
                )
                service_request.auto_ticket_created = True
                service_request.save(update_fields=['auto_ticket_created'])
                logger.info(f"Auto-created missing Ticket #{ticket.id} for Request #{service_request.id} during approval")

            # Record the admin workspace user who approved the ticket for ownership/audit.
            if ticket and not ticket.supervisor and is_admin_workspace_role(request.user.role):
                ticket.supervisor = request.user
                ticket.save(update_fields=['supervisor'])

            # Attempt auto-dispatch if enabled in admin settings
            from users.models import AdminSettings
            from services.auto_dispatch import should_attempt_auto_dispatch, auto_assign_technician

            try:
                admin_settings = AdminSettings.objects.first()
                auto_dispatch_enabled = admin_settings.auto_dispatch_enabled if admin_settings else False

                if auto_dispatch_enabled and should_attempt_auto_dispatch(ticket):
                    logger.info(f"Attempting auto-dispatch for ticket {ticket.id} (auto_dispatch_enabled={auto_dispatch_enabled})")
                    if auto_assign_technician(ticket):
                        logger.info(f"Successfully auto-assigned ticket {ticket.id} during approval")
                    else:
                        logger.info(f"Auto-dispatch attempted but no suitable technician found for ticket {ticket.id}")
                elif not auto_dispatch_enabled:
                    logger.debug("Auto-dispatch is disabled in admin settings")
            except Exception as e:
                logger.error(f"Error during auto-dispatch for ticket {ticket.id}: {e}")
                # Don't fail the approval if auto-dispatch fails

            # Notify client
            create_notification(
                service_request.client,
                f"Your service request has been approved. Ticket #{ticket.id} is ready for assignment.",
                'success'
            )
            send_notification_email(
                service_request.client,
                'Service Request Approved',
                f'Your service request for {service_request.service_type.name} has been approved. Ticket #{ticket.id} has been created.'
            )

            return Response({'status': 'Request approved'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel the service request"""
        service_request = self.get_object()
        related_ticket = ServiceTicket.objects.filter(request=service_request).select_related('technician').first()

        can_cancel = (
            user_can_manage_service_requests(request.user) or
            (request.user.role == 'client' and service_request.client_id == request.user.id)
        )
        if not can_cancel:
            raise PermissionDenied('You do not have permission to cancel this service request.')

        if service_request.status == 'Completed':
            return Response(
                {'error': 'Completed requests cannot be cancelled.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if related_ticket and related_ticket.status in ['In Progress', 'Completed']:
            return Response(
                {'error': f'Request cannot be cancelled while ticket #{related_ticket.id} is {related_ticket.status.lower()}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        service_request.status = 'Cancelled'
        service_request.save(update_fields=['status', 'updated_at'])

        if related_ticket and related_ticket.status != 'Cancelled':
            related_ticket.status = 'Cancelled'
            clear_reschedule_request(related_ticket)
            related_ticket.save(update_fields=[
                'status',
                'reschedule_requested',
                'reschedule_reason',
                'reschedule_requested_at',
                'updated_at',
            ])
            sync_ticket_team_availability(related_ticket)
            release_ticket_reservations(
                related_ticket,
                performed_by=request.user,
                reason='Released because the parent service request was cancelled.',
            )
            ServiceStatusHistory.objects.create(
                ticket=related_ticket,
                status='Cancelled',
                changed_by=request.user,
                notes='Ticket cancelled because the parent service request was cancelled.'
            )
            for assigned_technician in get_ticket_team_members(related_ticket):
                create_notification(
                    assigned_technician,
                    f"Ticket #{related_ticket.id} was cancelled before work started.",
                    'warning'
                )

        create_notification(
            service_request.client,
            "Your service request has been cancelled.",
            'warning'
        )

        return Response({'status': 'Request cancelled'})
