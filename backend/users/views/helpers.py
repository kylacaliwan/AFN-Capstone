from django.conf import settings as django_settings
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db.models import Avg, Count, Q
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

from users.models import AdminSettings, User, UserCapabilityGrant
from users.serializers import (
    UserSerializer, UserRegistrationSerializer, UserLoginSerializer,
    UserUpdateSerializer, SelfUserUpdateSerializer,
    TechnicianLocationUpdateSerializer, PasswordChangeSerializer,
    PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    AdminSettingsSerializer, CapabilityGrantUpdateSerializer,
    CapabilityDefinitionSerializer,
)
from users.permissions import (
    IsAdmin, IsSuperadmin, IsSupervisor, IsTechnician, IsClient,
    IsAdminOrSupervisor, IsAdminOrSupervisorOrTechnician, IsSuperadminOrSupervisor,
    IsOwnerOrAdmin, CanManageUsers, CanManageStaffCapabilities, CanViewUserDirectory,
    CanViewSupervisorTechnicianDirectory,
)
from users.rbac import (
    MANAGE_STAFF_CAPABILITIES,
    USER_DIRECTORY_VIEW_CAPABILITIES,
    can_manage_user_capabilities,
    get_assignable_capability_codes,
    get_capability_catalog,
    get_role_capabilities,
    get_user_capability_codes,
    get_user_direct_capability_codes,
    is_admin_workspace_role,
    is_superadmin_role,
    user_has_any_capability,
    user_has_capability,
)
from services.models import ServiceRequest, ServiceTicket, ServiceType
from services.serializers import ServiceTypeSerializer
from services.models import TechnicianSkill


def authenticate_user_credentials(identifier, password):
    """
    Accept username or email and authenticate against Django's auth backend.
    """
    user = authenticate(username=identifier, password=password)
    if user:
        return user

    lookup_value = (identifier or '').strip()
    if not lookup_value:
        return None

    def authenticate_candidate(candidate):
        if not candidate or not candidate.is_active:
            return None

        # Detect legacy plain-text passwords and log a warning.
        if '$' not in (candidate.password or ''):
            logger.warning(
                'User %s (id=%s) has a plain-text password. '
                'Re-hashing it after successful legacy login.',
                candidate.username, candidate.pk,
            )
            if candidate.password == password:
                candidate.set_password(password)
                candidate.save(update_fields=['password'])
                return candidate

        return authenticate(username=candidate.username, password=password)

    for candidate in User.objects.filter(email__iexact=lookup_value).order_by('id'):
        authenticated_user = authenticate_candidate(candidate)
        if authenticated_user:
            return authenticated_user

    username_candidate = User.objects.filter(username__iexact=lookup_value).first()
    return authenticate_candidate(username_candidate)


def get_password_reset_users(identifier):
    """
    Resolve password-reset targets by username or email without exposing whether
    the identifier exists. Duplicate emails are supported by sending a reset
    email for each matching active account.
    """
    lookup_value = (identifier or '').strip()
    if not lookup_value:
        return []

    if '@' in lookup_value:
        return list(User.objects.filter(email__iexact=lookup_value, is_active=True).order_by('id'))

    user = User.objects.filter(username__iexact=lookup_value, is_active=True).first()
    return [user] if user else []


def send_password_reset_email(user):
    if not user.email:
        logger.warning('Skipping password reset email for user %s because no email address is set.', user.pk)
        return

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    reset_link = (
        f"{django_settings.FRONTEND_BASE_URL.rstrip('/')}/reset-password"
        f"?uid={uid}&token={token}"
    )
    display_name = user.get_full_name().strip() or user.username
    message = (
        f"Hello {display_name},\n\n"
        "We received a request to reset the password for your AFN Service Management account.\n"
        f"Username: {user.username}\n"
        f"Reset your password here: {reset_link}\n\n"
        "If you did not request this, you can safely ignore this email."
    )

    send_mail(
        subject='Reset your AFN Service Management password',
        message=message,
        from_email=django_settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
