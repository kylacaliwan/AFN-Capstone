# Auto-split from users/views.py
from users.views.helpers import *  # noqa: F401,F403
from users.signals import log_activity

class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and is_admin_workspace_role(request.user.role)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().prefetch_related('capability_grants')
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['login', 'register', 'password_reset_request', 'password_reset_confirm']:
            return [permissions.AllowAny()]
        elif self.action in ['available_capabilities', 'capabilities']:
            return [CanManageStaffCapabilities()]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [CanManageUsers()]
        elif self.action == 'list':
            return [CanViewUserDirectory()]
        return [permissions.IsAuthenticated()]

    def get_throttles(self):
        if self.action == 'login':
            self.throttle_scope = 'login'
            return [ScopedRateThrottle()]
        if self.action in ['password_reset_request', 'password_reset_confirm']:
            self.throttle_scope = 'password_reset'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        """Filter queryset based on user role"""
        user = self.request.user
        queryset = User.objects.none()

        # Support filtered users by query param from admin dashboard
        role_filter = self.request.query_params.get('role')

        if is_superadmin_role(user.role):
            queryset = User.objects.all().prefetch_related('capability_grants')
        elif user.role == 'admin' and user_has_any_capability(user, USER_DIRECTORY_VIEW_CAPABILITIES):
            queryset = User.objects.all().prefetch_related('capability_grants')
        elif user.role in ['admin', 'technician', 'client']:
            queryset = User.objects.filter(id=user.id).prefetch_related('capability_grants')

        if role_filter:
            queryset = queryset.filter(role=role_filter)

        return queryset

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'register':
            return UserRegistrationSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer

    @action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        """Get current user info"""
        if request.method.lower() == 'patch':
            serializer = SelfUserUpdateSerializer(request.user, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(UserSerializer(request.user).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def register(self, request):
        """Register a new user"""
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            token, created = Token.objects.get_or_create(user=user)
            return Response({
                'user': UserSerializer(user).data,
                'token': token.key
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def login(self, request):
        """User login"""
        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            user = authenticate_user_credentials(
                serializer.validated_data['username'],
                serializer.validated_data['password']
            )
            if user:
                token, created = Token.objects.get_or_create(user=user)
                log_activity(
                    actor=user,
                    category='security',
                    action='login',
                    target=user,
                    message=f'{user.get_full_name().strip() or user.username} logged in',
                )
                return Response({
                    'user': UserSerializer(user).data,
                    'token': token.key
                })
            log_activity(
                category='security',
                action='error',
                message='Failed login attempt',
                metadata={'identifier': serializer.validated_data['username']},
            )
            return Response(
                {'error': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def logout(self, request):
        """User logout"""
        try:
            log_activity(
                actor=request.user,
                category='security',
                action='logout',
                target=request.user,
                message=f'{request.user.get_full_name().strip() or request.user.username} logged out',
            )
            request.user.auth_token.delete()
            return Response({'message': 'Logged out successfully'})
        except Token.DoesNotExist:
            # Token already deleted or never created — still a clean logout
            return Response({'message': 'Logged out successfully'})
        except Exception as e:
            logger.error(f"Logout error for user {request.user.id}: {e}", exc_info=True)
            return Response({'error': 'Error logging out'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        """Change password for the authenticated user"""
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            request.user.set_password(serializer.validated_data['new_password'])
            request.user.save()
            return Response({'message': 'Password changed successfully'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def password_reset_request(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        identifier = serializer.validated_data['identifier']

        try:
            for user in get_password_reset_users(identifier):
                send_password_reset_email(user)
        except Exception as exc:
            logger.error('Password reset email failed for identifier %s: %s', identifier, exc, exc_info=True)
            return Response(
                {'error': 'Unable to send password reset email right now. Please try again later.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({
            'message': 'If an account exists for that email or username, a password reset link has been sent.'
        })

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def password_reset_confirm(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user_id = force_str(urlsafe_base64_decode(serializer.validated_data['uid']))
            user = User.objects.get(pk=user_id, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {'error': 'This password reset link is invalid or has expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = serializer.validated_data['token']
        if not default_token_generator.check_token(user, token):
            return Response(
                {'error': 'This password reset link is invalid or has expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        Token.objects.filter(user=user).delete()

        return Response({
            'message': 'Password has been reset successfully. Please sign in with your new password.'
        })

    @action(detail=False, methods=['get'])
    def available_capabilities(self, request):
        capability_catalog = get_capability_catalog(include_non_assignable=False)
        assignable_codes = get_assignable_capability_codes(request.user)
        allowed_capabilities = [
            capability
            for capability in capability_catalog
            if capability['code'] in assignable_codes
        ]
        serializer = CapabilityDefinitionSerializer(allowed_capabilities, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get', 'put'])
    def capabilities(self, request, pk=None):
        try:
            target_user = User.objects.prefetch_related('capability_grants').get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if not can_manage_user_capabilities(request.user, target_user):
            return Response(
                {'error': 'You do not have permission to manage this user.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        allowed_capabilities = get_assignable_capability_codes(request.user, target_user=target_user)

        if request.method.lower() == 'put':
            serializer = CapabilityGrantUpdateSerializer(
                data=request.data,
                context={'allowed_capabilities': allowed_capabilities},
            )
            serializer.is_valid(raise_exception=True)
            requested_capabilities = set(serializer.validated_data['capabilities'])
            current_capabilities = get_user_direct_capability_codes(target_user)

            capabilities_to_add = sorted(requested_capabilities - current_capabilities)
            capabilities_to_remove = sorted(current_capabilities - requested_capabilities)

            for capability_code in capabilities_to_add:
                UserCapabilityGrant.objects.create(
                    user=target_user,
                    capability_code=capability_code,
                    granted_by=request.user,
                )

            if capabilities_to_remove:
                UserCapabilityGrant.objects.filter(
                    user=target_user,
                    capability_code__in=capabilities_to_remove,
                ).delete()

            target_user = User.objects.prefetch_related('capability_grants').get(pk=target_user.pk)

        capability_catalog = get_capability_catalog(include_non_assignable=False)
        visible_catalog = [
            capability
            for capability in capability_catalog
            if capability['code'] in allowed_capabilities
        ]

        return Response({
            'user_id': target_user.id,
            'username': target_user.username,
            'role': target_user.role,
            'role_capabilities': sorted(get_role_capabilities(target_user.role)),
            'direct_capabilities': sorted(get_user_direct_capability_codes(target_user)),
            'effective_capabilities': sorted(get_user_capability_codes(target_user)),
            'available_capabilities': CapabilityDefinitionSerializer(visible_catalog, many=True).data,
        })

class AuthViewSet(viewsets.ViewSet):
    """ViewSet for authentication endpoints that don't require authentication"""
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['login', 'test_connection']:
            return [permissions.AllowAny()]
        if self.action in ['update_status', 'set_available']:
            return [IsAdmin()]
        if self.action in ['technicians', 'clients']:
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]

    def get_throttles(self):
        if self.action == 'login':
            self.throttle_scope = 'login'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def login(self, request):
        """User login"""
        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            user = authenticate_user_credentials(
                serializer.validated_data['username'],
                serializer.validated_data['password']
            )
            if user:
                token, created = Token.objects.get_or_create(user=user)
                log_activity(
                    actor=user,
                    category='security',
                    action='login',
                    target=user,
                    message=f'{user.get_full_name().strip() or user.username} logged in',
                )
                return Response({
                    'user': UserSerializer(user).data,
                    'token': token.key
                })
            log_activity(
                category='security',
                action='error',
                message='Failed login attempt',
                metadata={'identifier': serializer.validated_data['username']},
            )
            return Response(
                {'error': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def test_connection(self, request):
        """Test endpoint to verify frontend-backend connection"""
        return Response({'message': 'Backend is connected!', 'status': 'success'})

    @action(detail=False, methods=['post'])
    def verify_token(self, request):
        """Verify if token is valid"""
        return Response({'valid': True})

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        """Change user password"""
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            request.user.set_password(serializer.validated_data['new_password'])
            request.user.save()
            return Response({'message': 'Password changed successfully'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update user status (admin only)"""
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if new_status in ['active', 'inactive']:
            user.status = new_status
            user.save()
            return Response({'status': 'Status updated'})
        return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def set_available(self, request, pk=None):
        """Set technician availability"""
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if user.role != 'technician':
            return Response({'error': 'Only technicians can set availability'}, status=status.HTTP_400_BAD_REQUEST)

        is_available = request.data.get('is_available', True)
        user.is_available = is_available
        user.save()

        return Response({'is_available': user.is_available})

    @action(detail=False, methods=['get'])
    def technicians(self, request):
        """Get all technicians"""
        technicians = User.objects.filter(role='technician').values(
            'id', 'username', 'email', 'phone', 'current_latitude',
            'current_longitude', 'is_available', 'status'
        )
        return Response(technicians)

    @action(detail=False, methods=['get'])
    def clients(self, request):
        """Get all clients"""
        clients = User.objects.filter(role='client').values(
            'id', 'username', 'email', 'phone', 'address', 'status'
        )
        return Response(clients)
