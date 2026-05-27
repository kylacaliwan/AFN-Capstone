from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from .models import AdminSettings, ChangeLog, User, TechnicianProfile, ClientProfile, ManagementProfile
from .rbac import (
    get_default_admin_scope_for_role,
    get_unknown_capability_codes,
    get_user_capability_codes,
    is_admin_scoped_role,
    is_superadmin_role,
)


class UserSerializer(serializers.ModelSerializer):
    capabilities = serializers.SerializerMethodField()
    current_latitude = serializers.SerializerMethodField()
    current_longitude = serializers.SerializerMethodField()
    is_available = serializers.SerializerMethodField()
    skill_level = serializers.SerializerMethodField()
    max_daily_assignments = serializers.SerializerMethodField()

    # Include profile data based on role
    technician_profile = serializers.SerializerMethodField()
    client_profile = serializers.SerializerMethodField()
    management_profile = serializers.SerializerMethodField()

    def get_capabilities(self, obj):
        return sorted(get_user_capability_codes(obj))

    def get_technician_profile(self, obj):
        if obj.role == 'technician' and hasattr(obj, 'technician_profile'):
            return {
                'current_latitude': obj.technician_profile.current_latitude,
                'current_longitude': obj.technician_profile.current_longitude,
                'is_available': obj.technician_profile.is_available,
                'skill_level': obj.technician_profile.skill_level,
                'max_daily_assignments': obj.technician_profile.max_daily_assignments,
            }
        return None

    def get_current_latitude(self, obj):
        return obj.current_latitude if obj.role == 'technician' else None

    def get_current_longitude(self, obj):
        return obj.current_longitude if obj.role == 'technician' else None

    def get_is_available(self, obj):
        return obj.is_available if obj.role == 'technician' else None

    def get_skill_level(self, obj):
        return obj.skill_level if obj.role == 'technician' else None

    def get_max_daily_assignments(self, obj):
        return obj.max_daily_assignments if obj.role == 'technician' else None

    def get_client_profile(self, obj):
        if obj.role == 'client' and hasattr(obj, 'client_profile'):
            return {
                'client_type': obj.client_profile.client_type,
                'company_name': obj.client_profile.company_name,
                'credit_limit': obj.client_profile.credit_limit,
                'account_balance': obj.client_profile.account_balance,
            }
        return None

    def get_management_profile(self, obj):
        if obj.role in ['admin', 'superadmin'] and hasattr(obj, 'management_profile'):
            return {
                'admin_scope': obj.management_profile.admin_scope,
            }
        return None

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'role', 'phone', 'address', 'status', 'is_active',
                  'capabilities', 'created_at', 'updated_at',
                  'current_latitude', 'current_longitude', 'is_available',
                  'skill_level', 'max_daily_assignments',
                  'technician_profile', 'client_profile', 'management_profile']
        read_only_fields = ['id', 'created_at', 'updated_at']


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)
    password_confirm = serializers.CharField(write_only=True, required=True)
    current_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    current_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    is_available = serializers.BooleanField(required=False)
    skill_level = serializers.ChoiceField(
        choices=[choice[0] for choice in TechnicianProfile._meta.get_field('skill_level').choices],
        required=False,
    )
    max_daily_assignments = serializers.IntegerField(required=False, min_value=1)
    VALID_ROLES = {'superadmin', 'admin', 'technician', 'client'}
    ELEVATED_ROLES = {'superadmin', 'admin', 'technician'}

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password_confirm',
                  'first_name', 'last_name', 'role', 'phone', 'address',
                  'current_latitude', 'current_longitude', 'is_available',
                  'skill_level', 'max_daily_assignments']

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        try:
            validate_password(attrs['password'])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc

        # Validate phone number
        phone = attrs.get('phone')
        if phone:
            phone_digits = ''.join(filter(str.isdigit, str(phone)))
            if not 10 <= len(phone_digits) <= 15:
                raise serializers.ValidationError({
                    'phone': 'Phone number must contain 10 to 15 digits.'
                })

        requested_role = attrs.get('role') or 'client'
        if requested_role not in self.VALID_ROLES:
            raise serializers.ValidationError({
                'role': 'Unsupported role. Use one of: superadmin, admin, technician, client.'
            })

        if requested_role == 'superadmin' and User.objects.filter(role='superadmin').exists():
            raise serializers.ValidationError({'role': 'Only one superadmin account is allowed.'})

        request = self.context.get('request') if hasattr(self, 'context') else None
        is_request_superadmin = (
            request and
            getattr(request, 'user', None) and
            request.user.is_authenticated and
            is_superadmin_role(request.user.role)
        )

        if requested_role in self.ELEVATED_ROLES and not is_request_superadmin:
            raise serializers.ValidationError({
                'role': 'Only the superadmin can create admin or staff accounts.'
            })

        attrs['role'] = requested_role
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        role = validated_data.get('role') or 'client'
        validated_data['role'] = role
        profile_fields = {
            'current_latitude',
            'current_longitude',
            'is_available',
            'skill_level',
            'max_daily_assignments',
        }
        profile_data = {
            field: validated_data.pop(field)
            for field in list(validated_data.keys())
            if field in profile_fields
        }

        # Create the user
        user = User.objects.create_user(**validated_data)

        # Create appropriate profile based on role
        if role in ['superadmin', 'admin']:
            profile, _ = ManagementProfile.objects.get_or_create(
                user=user,
                defaults={'admin_scope': get_default_admin_scope_for_role(role) or 'general'},
            )
            default_scope = get_default_admin_scope_for_role(role)
            if default_scope and profile.admin_scope != default_scope:
                profile.admin_scope = default_scope
                profile.save(update_fields=['admin_scope'])
        elif role == 'technician':
            profile, _ = TechnicianProfile.objects.get_or_create(user=user)
            updated_fields = []
            for field, value in profile_data.items():
                setattr(profile, field, value)
                updated_fields.append(field)
            if updated_fields:
                profile.save(update_fields=updated_fields)
        elif role == 'client':
            ClientProfile.objects.get_or_create(user=user)
        return user


class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True)


class ChangeLogSerializer(serializers.ModelSerializer):
    model = serializers.CharField(source='content_type.model', read_only=True)
    app_label = serializers.CharField(source='content_type.app_label', read_only=True)
    object_label = serializers.SerializerMethodField()
    changed_by_name = serializers.SerializerMethodField()
    changed_by_role = serializers.CharField(source='changed_by.role', read_only=True)

    class Meta:
        model = ChangeLog
        fields = [
            'id',
            'app_label',
            'model',
            'object_id',
            'object_label',
            'action',
            'field_name',
            'old_value',
            'new_value',
            'changed_by',
            'changed_by_name',
            'changed_by_role',
            'changed_at',
            'summary',
        ]
        read_only_fields = fields

    def get_object_label(self, obj):
        content_object = obj.content_object
        if content_object is None:
            return f'{obj.content_type.model} #{obj.object_id}'
        return str(content_object)

    def get_changed_by_name(self, obj):
        user = obj.changed_by
        if not user:
            return 'System'
        full_name = f'{user.first_name} {user.last_name}'.strip()
        return full_name or user.username


class UserUpdateSerializer(serializers.ModelSerializer):
    current_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    current_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    is_available = serializers.BooleanField(required=False)
    skill_level = serializers.ChoiceField(
        choices=[choice[0] for choice in TechnicianProfile._meta.get_field('skill_level').choices],
        required=False,
    )
    max_daily_assignments = serializers.IntegerField(required=False, min_value=1)

    def validate_phone(self, value):
        """Validate phone number format"""
        if value:
            phone_digits = ''.join(filter(str.isdigit, str(value)))
            if not 10 <= len(phone_digits) <= 15:
                raise serializers.ValidationError('Phone number must contain 10 to 15 digits.')
        return value

    def validate_role(self, value):
        current_role = getattr(self.instance, 'role', None)
        if value == current_role:
            return value

        request = self.context.get('request') if hasattr(self, 'context') else None
        actor = getattr(request, 'user', None)

        if not actor or not actor.is_authenticated or not is_superadmin_role(getattr(actor, 'role', None)):
            raise serializers.ValidationError('Only the superadmin can change account roles.')

        if current_role == 'superadmin' and value != 'superadmin':
            raise serializers.ValidationError('The superadmin account cannot be demoted here.')

        if value == 'superadmin':
            existing_superadmin = User.objects.filter(role='superadmin')
            if getattr(self.instance, 'pk', None):
                existing_superadmin = existing_superadmin.exclude(pk=self.instance.pk)
            if existing_superadmin.exists():
                raise serializers.ValidationError('Only one superadmin account is allowed.')

        return value

    class Meta:
        model = User
        fields = [
            'username', 'email', 'first_name', 'last_name', 'phone', 'address',
            'role', 'status', 'current_latitude', 'current_longitude',
            'is_available', 'skill_level', 'max_daily_assignments'
        ]

    def update(self, instance, validated_data):
        profile_fields = {
            'current_latitude',
            'current_longitude',
            'is_available',
            'skill_level',
            'max_daily_assignments',
        }
        profile_data = {
            field: validated_data.pop(field)
            for field in list(validated_data.keys())
            if field in profile_fields
        }

        instance = super().update(instance, validated_data)

        if profile_data and instance.role == 'technician':
            profile, _ = TechnicianProfile.objects.get_or_create(user=instance)
            updated_fields = []
            for field, value in profile_data.items():
                setattr(profile, field, value)
                updated_fields.append(field)
            if updated_fields:
                profile.save(update_fields=updated_fields)

        return instance


class SelfUserUpdateSerializer(serializers.ModelSerializer):
    """Restricted serializer for self-service profile edits."""

    def validate_phone(self, value):
        """Validate phone number format"""
        if value:
            phone_digits = ''.join(filter(str.isdigit, str(value)))
            if not 10 <= len(phone_digits) <= 15:
                raise serializers.ValidationError('Phone number must contain 10 to 15 digits.')
        return value

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'phone', 'address']

    def to_internal_value(self, data):
        allowed_fields = set(self.fields.keys())
        unexpected_fields = sorted(set(data.keys()) - allowed_fields)
        if unexpected_fields:
            raise serializers.ValidationError({
                field: 'This field cannot be updated on this endpoint.'
                for field in unexpected_fields
            })
        return super().to_internal_value(data)


class TechnicianLocationUpdateSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    accuracy = serializers.FloatField(required=False, default=0)


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=False, write_only=True)
    current_password = serializers.CharField(required=False, write_only=True)
    new_password = serializers.CharField(required=True)

    def validate(self, attrs):
        old_password = attrs.get('old_password') or attrs.get('current_password')
        if not old_password:
            raise serializers.ValidationError({'current_password': 'Current password is required'})

        user = self.context['request'].user
        if not user.check_password(old_password):
            raise serializers.ValidationError({'current_password': 'Current password is incorrect'})

        try:
            validate_password(attrs['new_password'], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)}) from exc

        attrs['old_password'] = old_password
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    identifier = serializers.CharField(required=True, trim_whitespace=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, write_only=True)
    password_confirm = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': "Password fields didn't match."})

        try:
            validate_password(attrs['new_password'])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)}) from exc

        return attrs


class AdminSettingsSerializer(serializers.ModelSerializer):
    systemName = serializers.CharField(source='system_name')
    supportEmail = serializers.EmailField(source='support_email')
    enableNotifications = serializers.BooleanField(source='enable_notifications')
    autoDispatchEnabled = serializers.BooleanField(source='auto_dispatch_enabled')
    smsNotificationsEnabled = serializers.BooleanField(source='sms_notifications_enabled')
    defaultTimeZone = serializers.CharField(source='default_time_zone')
    maxTechnicianAssignments = serializers.IntegerField(source='max_technician_assignments', min_value=1, max_value=50)

    class Meta:
        model = AdminSettings
        fields = [
            'systemName',
            'supportEmail',
            'enableNotifications',
            'autoDispatchEnabled',
            'smsNotificationsEnabled',
            'defaultTimeZone',
            'maxTechnicianAssignments',
        ]


class CapabilityGrantUpdateSerializer(serializers.Serializer):
    capabilities = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=True,
    )

    def validate_capabilities(self, value):
        normalized_capabilities = []
        for capability_code in value:
            normalized_code = str(capability_code or '').strip()
            if normalized_code and normalized_code not in normalized_capabilities:
                normalized_capabilities.append(normalized_code)

        unknown_capabilities = get_unknown_capability_codes(normalized_capabilities)
        if unknown_capabilities:
            raise serializers.ValidationError(
                f"Unknown capability code(s): {', '.join(unknown_capabilities)}"
            )

        allowed_capabilities = set(self.context.get('allowed_capabilities') or [])
        disallowed_capabilities = sorted(set(normalized_capabilities) - allowed_capabilities)
        if disallowed_capabilities:
            raise serializers.ValidationError(
                f"You cannot assign capability code(s): {', '.join(disallowed_capabilities)}"
            )

        return normalized_capabilities


class CapabilityDefinitionSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField()
    category = serializers.CharField()
    assignable = serializers.BooleanField()
