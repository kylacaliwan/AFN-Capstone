"""
Auto-logging signals for the ChangeLog audit trail.

Automatically records create/update/delete operations on critical models:
- ServiceRequest, ServiceTicket, User, AfterSalesCase, MaintenanceSchedule

This ensures previous records are NEVER lost — every change is preserved.
"""

import logging
import threading

from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import post_save, pre_save, pre_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)

# Thread-local storage for tracking the current request user
_thread_locals = threading.local()


def ensure_user_role_profile(user):
    """Create the role-specific profile row expected by serializers and APIs."""
    from users.models import (
        ClientProfile,
        ManagementProfile,
        TechnicianProfile,
    )

    role_profile_map = {
        'superadmin': ManagementProfile,
        'admin': ManagementProfile,
        'technician': TechnicianProfile,
        'client': ClientProfile,
    }
    profile_model = role_profile_map.get(getattr(user, 'role', None))
    if not profile_model:
        return

    defaults = {}
    if profile_model.__name__ == 'ManagementProfile':
        from users.rbac import get_default_admin_scope_for_role

        defaults['admin_scope'] = get_default_admin_scope_for_role(user.role) or 'general'

    profile_model.objects.get_or_create(user=user, defaults=defaults)


def set_current_user(user):
    """Call this from middleware to set the current request user."""
    _thread_locals.user = user


def set_current_request_meta(request):
    """Store request metadata for activity logs without passing request around."""
    if request is None:
        _thread_locals.request_meta = {}
        return

    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip_address = forwarded_for.split(',')[0].strip() if forwarded_for else request.META.get('REMOTE_ADDR')
    _thread_locals.request_meta = {
        'ip_address': ip_address or None,
        'user_agent': request.META.get('HTTP_USER_AGENT', ''),
    }


def get_current_user():
    """Get the user set by middleware, or None."""
    return getattr(_thread_locals, 'user', None)


def get_current_request_meta():
    return getattr(_thread_locals, 'request_meta', {}) or {}


# Fields to track on each model (only these will be logged on update)
TRACKED_FIELDS = {
    'ServiceType': ['name', 'description', 'estimated_duration', 'estimated_cost', 'max_daily_assignments', 'procedures', 'required_equipment'],
    'ServiceRequest': ['status', 'priority', 'description', 'service_type_id', 'client_id', 'preferred_date', 'preferred_time_slot', 'request_source', 'scheduling_notes'],
    'ServiceTicket': ['status', 'priority', 'technician_id', 'supervisor_id', 'scheduled_date', 'scheduled_time', 'scheduled_time_slot', 'auto_assigned', 'reschedule_requested', 'reschedule_reason', 'warranty_status', 'completion_notes', 'client_rating'],
    'User': ['role', 'status', 'email', 'is_active'],
    'TechnicianProfile': ['current_latitude', 'current_longitude', 'last_location_update', 'is_available', 'skill_level', 'max_daily_assignments'],
    'AfterSalesCase': ['status', 'priority', 'case_type', 'assigned_to_id', 'resolution_notes'],
    'MaintenanceSchedule': ['status', 'next_due_date', 'risk_level'],
    'InventoryItem': ['name', 'sku', 'category_id', 'item_type', 'quantity', 'minimum_stock', 'reserved_quantity', 'warehouse_location', 'unit_price', 'status', 'supplier'],
    'InventoryReservation': ['status', 'quantity', 'fulfilled_quantity', 'notes'],
    'InventoryTransaction': ['transaction_type', 'quantity', 'technician_id', 'service_ticket_id', 'notes', 'performed_by_id'],
    'ServiceTypeInventoryRequirement': ['service_type_id', 'item_id', 'quantity', 'auto_reserve', 'notes'],
}


def _get_tracked_fields(instance):
    """Get the fields we should track for this model."""
    model_name = instance.__class__.__name__
    return TRACKED_FIELDS.get(model_name, [])


def _should_track(instance):
    """Check if this model instance should be tracked."""
    return instance.__class__.__name__ in TRACKED_FIELDS


ACTIVITY_CATEGORIES = {
    'User': 'users',
    'TechnicianProfile': 'users',
    'ServiceType': 'settings',
    'ServiceRequest': 'requests',
    'ServiceTicket': 'tickets',
    'AfterSalesCase': 'communication',
    'MaintenanceSchedule': 'tickets',
    'InventoryItem': 'inventory',
    'InventoryReservation': 'inventory',
    'InventoryTransaction': 'inventory',
    'ServiceTypeInventoryRequirement': 'inventory',
}


ACTION_LABELS = {
    'create': 'created',
    'update': 'updated',
    'delete': 'deleted',
}


def _actor_label(user):
    if not user:
        return 'System'
    return user.get_full_name().strip() or user.username


def _target_label(instance):
    try:
        return str(instance)
    except Exception:
        return f'{instance.__class__.__name__} #{instance.pk}'


def log_activity(*, actor=None, category='system', action='system', target=None, message='', metadata=None):
    """Create a readable operational log row for admin/superadmin activity feeds."""
    from users.models import ActivityLog

    request_meta = get_current_request_meta()
    actor = actor or get_current_user()
    target_model = ''
    target_app_label = ''
    target_id = None
    target_label = ''

    if target is not None:
        meta = target._meta
        target_model = meta.model_name
        target_app_label = meta.app_label
        target_id = target.pk
        target_label = _target_label(target)

    ActivityLog.objects.create(
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        actor_role=getattr(actor, 'role', '') if actor else '',
        category=category,
        action=action,
        target_app_label=target_app_label,
        target_model=target_model,
        target_id=target_id,
        target_label=target_label,
        message=message[:255],
        metadata=metadata or {},
        ip_address=request_meta.get('ip_address'),
        user_agent=request_meta.get('user_agent', ''),
    )


def _write_activity_from_change(instance, action, *, field_name='', old_value=None, new_value=None):
    actor = get_current_user()
    model_name = instance.__class__.__name__
    category = ACTIVITY_CATEGORIES.get(model_name, 'system')
    actor_name = _actor_label(actor)
    action_label = ACTION_LABELS.get(action, action)
    target_label = _target_label(instance)

    if action == 'update' and field_name:
        message = f'{actor_name} updated {model_name} #{instance.pk}: {field_name}'
    else:
        message = f'{actor_name} {action_label} {target_label}'

    try:
        log_activity(
            actor=actor,
            category=category,
            action=action,
            target=instance,
            message=message,
            metadata={
                'field_name': field_name,
                'old_value': old_value,
                'new_value': new_value,
            },
        )
    except Exception as e:
        logger.warning(f'ActivityLog {action} failed: {e}')


# ── Pre-save: capture old values ──────────────────────────────────────
@receiver(pre_save)
def changelog_pre_save(sender, instance, **kwargs):
    if not _should_track(instance):
        return

    if instance.pk:
        try:
            old_instance = sender.objects.get(pk=instance.pk)
            instance._changelog_old_values = {
                field: str(getattr(old_instance, field, ''))
                for field in _get_tracked_fields(instance)
            }
            instance._changelog_is_new = False
        except sender.DoesNotExist:
            instance._changelog_is_new = True
    else:
        instance._changelog_is_new = True


# ── Post-save: write ChangeLog entries ────────────────────────────────
@receiver(post_save)
def changelog_post_save(sender, instance, created, **kwargs):
    if not _should_track(instance):
        return

    # Import here to avoid circular imports
    from users.models import ChangeLog

    ct = ContentType.objects.get_for_model(sender)
    user = get_current_user()

    if created or getattr(instance, '_changelog_is_new', True):
        # Record creation
        try:
            ChangeLog.objects.create(
                content_type=ct,
                object_id=instance.pk,
                action='create',
                field_name='',
                old_value=None,
                new_value=str(instance),
                changed_by=user,
                summary=f'Created {sender.__name__} #{instance.pk}',
            )
            _write_activity_from_change(instance, 'create', new_value=str(instance))
        except Exception as e:
            logger.warning(f'ChangeLog create failed: {e}')
    else:
        # Record field-level updates
        old_values = getattr(instance, '_changelog_old_values', {})
        for field in _get_tracked_fields(instance):
            old_val = old_values.get(field, '')
            new_val = str(getattr(instance, field, ''))
            if old_val != new_val:
                try:
                    ChangeLog.objects.create(
                        content_type=ct,
                        object_id=instance.pk,
                        action='update',
                        field_name=field,
                        old_value=old_val,
                        new_value=new_val,
                        changed_by=user,
                        summary=f'{sender.__name__} #{instance.pk}: {field} changed from "{old_val}" to "{new_val}"',
                    )
                    _write_activity_from_change(
                        instance,
                        'update',
                        field_name=field,
                        old_value=old_val,
                        new_value=new_val,
                    )
                except Exception as e:
                    logger.warning(f'ChangeLog update failed: {e}')

    if sender.__name__ == 'User':
        try:
            ensure_user_role_profile(instance)
        except Exception as e:
            logger.warning(f'User profile sync failed for user {instance.pk}: {e}')


# ── Pre-delete: record deletion ───────────────────────────────────────
@receiver(pre_delete)
def changelog_pre_delete(sender, instance, **kwargs):
    if not _should_track(instance):
        return

    from users.models import ChangeLog

    ct = ContentType.objects.get_for_model(sender)
    user = get_current_user()

    try:
        ChangeLog.objects.create(
            content_type=ct,
            object_id=instance.pk,
            action='delete',
            field_name='',
            old_value=str(instance),
            new_value=None,
            changed_by=user,
            summary=f'Deleted {sender.__name__} #{instance.pk}: {instance}',
        )
        _write_activity_from_change(instance, 'delete', old_value=str(instance))
    except Exception as e:
        logger.warning(f'ChangeLog delete failed: {e}')
