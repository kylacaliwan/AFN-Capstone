from django.db import transaction

from notifications.models import Notification
from users.models import User

from .models import (
    InventoryReservation,
    InventoryTransaction,
    ServiceTypeInventoryRequirement,
)


def _notify_roles(message, notification_type='info', roles=None):
    target_roles = roles or ['superadmin', 'admin']
    recipients = User.objects.filter(role__in=target_roles)
    for recipient in recipients:
        Notification.objects.create(
            user=recipient,
            message=message,
            type=notification_type,
        )


def serialize_ticket_inventory(ticket):
    reservations = ticket.inventory_reservations.select_related('item', 'technician').order_by('id')
    return [
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


def _create_reservation_transaction(reservation, performed_by, notes):
    InventoryTransaction.objects.create(
        item=reservation.item,
        transaction_type='reservation',
        quantity=reservation.quantity,
        technician=reservation.technician,
        service_ticket=reservation.service_ticket,
        notes=notes,
        performed_by=performed_by,
    )


def create_pending_reservation(*, item, quantity, technician, required_date, service_ticket, performed_by, notes=''):
    if quantity <= 0:
        return None

    default_notes = notes or (
        f'Reserved for ticket #{service_ticket.id}' if service_ticket else 'Reserved stock allocation'
    )
    reservation = InventoryReservation.objects.create(
        item=item,
        technician=technician,
        quantity=quantity,
        required_date=required_date,
        service_ticket=service_ticket,
        notes=default_notes,
        status='pending',
    )
    _create_reservation_transaction(reservation, performed_by, default_notes)
    return reservation


def cancel_pending_reservation(reservation, *, performed_by, notes=''):
    if reservation.status != 'pending':
        return False

    InventoryTransaction.objects.create(
        item=reservation.item,
        transaction_type='cancellation',
        quantity=reservation.quantity,
        technician=reservation.technician,
        service_ticket=reservation.service_ticket,
        notes=notes or f'Released reservation #{reservation.id}',
        performed_by=performed_by,
    )
    reservation.status = 'cancelled'
    reservation.save(update_fields=['status'])
    return True


def fulfill_pending_reservation(reservation, *, performed_by, notes=''):
    if reservation.status != 'pending':
        return False

    InventoryTransaction.objects.create(
        item=reservation.item,
        transaction_type='cancellation',
        quantity=reservation.quantity,
        technician=reservation.technician,
        service_ticket=reservation.service_ticket,
        notes=f'Releasing reservation #{reservation.id} for issue',
        performed_by=performed_by,
    )
    InventoryTransaction.objects.create(
        item=reservation.item,
        transaction_type='issue',
        quantity=reservation.quantity,
        technician=reservation.technician,
        service_ticket=reservation.service_ticket,
        notes=notes or f'Issued reserved stock for ticket #{reservation.service_ticket_id}',
        performed_by=performed_by,
    )
    reservation.status = 'fulfilled'
    reservation.save(update_fields=['status'])
    return True


@transaction.atomic
def sync_ticket_reservations(ticket, *, performed_by):
    summary = {
        'requirements_count': 0,
        'reserved_count': 0,
        'shortages': [],
        'reservations': [],
    }

    technician = ticket.technician
    if not technician:
        return summary

    requirements = list(
        ServiceTypeInventoryRequirement.objects.filter(
            service_type=ticket.request.service_type,
            auto_reserve=True,
        ).select_related('item', 'service_type')
    )
    summary['requirements_count'] = len(requirements)
    if not requirements:
        return summary

    pending_reservations = list(
        InventoryReservation.objects.filter(service_ticket=ticket, status='pending').select_related('item', 'technician')
    )
    requirement_by_item = {requirement.item_id: requirement for requirement in requirements}

    for reservation in pending_reservations:
        requirement = requirement_by_item.get(reservation.item_id)
        if requirement is None or reservation.technician_id != technician.id:
            cancel_pending_reservation(
                reservation,
                performed_by=performed_by,
                notes=f'Resetting reservation for ticket #{ticket.id}',
            )

    for requirement in requirements:
        existing = InventoryReservation.objects.filter(
            service_ticket=ticket,
            item=requirement.item,
            technician=technician,
            status='pending',
        ).first()
        target_quantity = min(
            requirement.quantity,
            max(requirement.item.available_quantity, 0) + (existing.quantity if existing else 0),
        )
        if existing:
            if existing.quantity == target_quantity:
                summary['reserved_count'] += 1
                continue

            cancel_pending_reservation(
                existing,
                performed_by=performed_by,
                notes=f'Resetting reservation quantity for ticket #{ticket.id}',
            )
            requirement.item.refresh_from_db()

        item = requirement.item
        reserve_quantity = min(requirement.quantity, max(item.available_quantity, 0))
        shortage_quantity = max(requirement.quantity - reserve_quantity, 0)

        if reserve_quantity > 0:
            notes = f'Auto-reserved for {ticket.request.service_type.name}'
            if shortage_quantity:
                notes += f' ({reserve_quantity}/{requirement.quantity} reserved)'
            created = create_pending_reservation(
                item=item,
                quantity=reserve_quantity,
                technician=technician,
                required_date=ticket.scheduled_date,
                service_ticket=ticket,
                performed_by=performed_by,
                notes=notes,
            )
            if created:
                summary['reservations'].append(created)
                summary['reserved_count'] += 1

        if shortage_quantity:
            shortage_message = (
                f"Ticket #{ticket.id} needs {requirement.quantity} x {item.name}, "
                f"but only {reserve_quantity} could be reserved."
            )
            summary['shortages'].append({
                'item_id': item.id,
                'item_name': item.name,
                'required_quantity': requirement.quantity,
                'reserved_quantity': reserve_quantity,
                'missing_quantity': shortage_quantity,
            })
            _notify_roles(shortage_message, notification_type='warning')
            Notification.objects.create(
                user=technician,
                message=shortage_message,
                type='warning',
            )

    return {
        **summary,
        'reservations': serialize_ticket_inventory(ticket),
    }


@transaction.atomic
def release_ticket_reservations(ticket, *, performed_by, reason=''):
    released = 0
    for reservation in InventoryReservation.objects.filter(service_ticket=ticket, status='pending').select_related('item', 'technician'):
        released += int(cancel_pending_reservation(
            reservation,
            performed_by=performed_by,
            notes=reason or f'Released because ticket #{ticket.id} is no longer active.',
        ))
    return released


@transaction.atomic
def issue_ticket_reservations(ticket, *, performed_by, reason=''):
    issued = 0
    for reservation in InventoryReservation.objects.filter(service_ticket=ticket, status='pending').select_related('item', 'technician'):
        issued += int(fulfill_pending_reservation(
            reservation,
            performed_by=performed_by,
            notes=reason or f'Issued during completion of ticket #{ticket.id}.',
        ))
    return issued


@transaction.atomic
def issue_ticket_inventory_usage(ticket, *, usage, performed_by, reason=''):
    reservations = {
        reservation.id: reservation
        for reservation in InventoryReservation.objects.filter(
            service_ticket=ticket,
            status='pending',
        ).select_related('item', 'technician')
    }
    usage_rows = usage if isinstance(usage, list) else []
    used_reservation_ids = set()
    issued = 0

    for row in usage_rows:
        try:
            reservation_id = int(row.get('reservation_id') or row.get('reservationId'))
            used_quantity = int(row.get('quantity_used') if 'quantity_used' in row else row.get('quantityUsed'))
        except (AttributeError, TypeError, ValueError):
            raise ValueError('Inventory usage must include reservation_id and quantity_used.')

        reservation = reservations.get(reservation_id)
        if reservation is None:
            raise ValueError('One or more inventory reservations were not found for this ticket.')
        if used_quantity < 0:
            raise ValueError('Used quantity cannot be negative.')
        if used_quantity > reservation.quantity:
            raise ValueError(f'Used quantity for {reservation.item.name} cannot exceed reserved quantity.')

        used_reservation_ids.add(reservation_id)

        if used_quantity == 0:
            cancel_pending_reservation(
                reservation,
                performed_by=performed_by,
                notes=f'No stock used from reservation #{reservation.id} for ticket #{ticket.id}.',
            )
            continue

        if used_quantity == reservation.quantity:
            issued += int(fulfill_pending_reservation(
                reservation,
                performed_by=performed_by,
                notes=reason or f'Issued used stock for ticket #{ticket.id}.',
            ))
            continue

        original_quantity = reservation.quantity
        cancel_pending_reservation(
            reservation,
            performed_by=performed_by,
            notes=f'Released reservation #{reservation.id} before recording partial usage.',
        )
        InventoryTransaction.objects.create(
            item=reservation.item,
            transaction_type='issue',
            quantity=used_quantity,
            technician=reservation.technician,
            service_ticket=ticket,
            notes=reason or f'Issued {used_quantity}/{original_quantity} reserved unit(s) for ticket #{ticket.id}.',
            performed_by=performed_by,
        )
        reservation.quantity = used_quantity
        reservation.status = 'fulfilled'
        reservation.notes = f'{reservation.notes or ""}\nUsed {used_quantity}/{original_quantity} on completion.'.strip()
        reservation.save(update_fields=['quantity', 'status', 'notes'])
        issued += 1

    for reservation_id, reservation in reservations.items():
        if reservation_id not in used_reservation_ids:
            issued += int(fulfill_pending_reservation(
                reservation,
                performed_by=performed_by,
                notes=reason or f'Issued used stock for ticket #{ticket.id}.',
            ))

    return issued
