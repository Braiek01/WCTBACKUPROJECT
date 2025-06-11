# filepath: c:\Users\defin\WCPROJECTMVP5.0\BACKEND\accounts\api_views.py
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import MyTokenObtainPairSerializer, UserSerializer, TenantUserCreateSerializer
from rest_framework import generics, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from django.contrib.auth import get_user_model
from django_tenants.utils import tenant_context
from django.db import IntegrityError
from tenants.utils import create_tenant_member_and_sync_to_schema, get_tenant_sub_users, modify_tenant_sub_user, delete_tenant_sub_user
from tenants.models import Tenant
import logging

User = get_user_model()
logger = logging.getLogger(__name__)

# --- Custom Permissions (IsTenantAdminOrOwner, IsSelfOrTenantAdminOrOwner) ---
class IsTenantAdminOrOwner(permissions.BasePermission):
    """
    Allows access only to users who are admins or owners of the current tenant.
    Assumes request.tenant and request.user are populated.
    """
    message = "You do not have permission to perform this action in this tenant."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if not hasattr(request, 'tenant') or not request.tenant:
            logger.warning(f"IsTenantAdminOrOwner: Tenant context not available for user {request.user.username}.")
            return False # No tenant context, deny permission

        # Check if the user belongs to the request's tenant
        if request.user.tenant != request.tenant:
            logger.warning(f"User {request.user.username} (tenant: {request.user.tenant.schema_name}) attempting action on tenant {request.tenant.schema_name}.")
            return False

        is_owner = request.user.role_in_tenant == User.RoleInTenant.OWNER
        is_admin = request.user.role_in_tenant == User.RoleInTenant.ADMIN
        
        return is_owner or is_admin

class IsSelfOrTenantAdminOrOwner(permissions.BasePermission):
    """
    Allows access if the user is the object owner (self) OR
    if the user is an admin or owner of the current tenant.
    """
    message = "You do not have permission to access or modify this resource."

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if not hasattr(request, 'tenant') or not request.tenant:
            return False

        # User is the object itself
        if obj == request.user:
            return True

        # User is admin or owner of the tenant the object belongs to
        # (assuming obj has a 'tenant' attribute that matches request.tenant)
        if hasattr(obj, 'tenant') and obj.tenant == request.tenant:
            is_owner = request.user.role_in_tenant == User.RoleInTenant.OWNER
            is_admin = request.user.role_in_tenant == User.RoleInTenant.ADMIN
            if is_owner or is_admin:
                return True
        return False

# --- Token Views (MyTokenObtainPairView) ---
class MyTokenObtainPairView(TokenObtainPairView):
    """
    Custom TokenObtainPairView to use the MyTokenObtainPairSerializer.
    This allows customizing the claims in the JWT token.
    """
    serializer_class = MyTokenObtainPairSerializer

# --- API Views ---

class UserViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows users within a tenant to be viewed, created (implicitly via router), updated, or deleted.
    Permissions vary by action.
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated] # Base permission

    def get_queryset(self):
        """
        This view should only return users within the current tenant's schema.
        For the 'list' action (e.g., GET /api/), we want to show only sub-users (excluding the owner).
        For 'retrieve' (e.g., GET /api/<pk>/), it can fetch any user including the owner,
        permissions will handle access.
        However, to keep the list view clean and focused on "sub-users" if this UserViewSet
        is indeed serving the root /api/ for listing, we'll filter here.
        If this UserViewSet is also used for retrieving the owner by PK, this filter might be too broad.
        Consider if /api/ should list owners or if that's a separate endpoint.

        Assuming /api/ (list action) should list only sub-users of the current tenant:
        """
        if not hasattr(self.request, 'tenant') or not self.request.tenant:
            logger.error(f"UserViewSet.get_queryset: Tenant context not available for user {self.request.user.username if self.request.user else 'Anonymous'}. Returning no users.")
            return User.objects.none()

        logger.debug(f"UserViewSet.get_queryset: Fetching users for tenant: {self.request.tenant.schema_name}")
        
        # User.objects.all() here queries the current tenant's schema due to middleware.
        # We exclude the 'OWNER' role_in_tenant to list only sub-users.
        queryset = User.objects.exclude(role_in_tenant=User.RoleInTenant.OWNER).order_by('id')
        
        logger.debug(f"UserViewSet.get_queryset: Returning {queryset.count()} sub-users for tenant {self.request.tenant.schema_name}.")
        return queryset

    def get_permissions(self):
        """
        Instantiates and returns the list of permissions that this view requires,
        based on the action being performed.
        """
        # Note: 'create' action is handled by TenantUserCreateView, not this viewset directly via router
        if self.action == 'list':
            # Only admins/owners can list all users
            permission_classes = [IsTenantAdminOrOwner]
        elif self.action in ['retrieve', 'update', 'partial_update']:
            # User can retrieve/update self, or admin/owner can retrieve/update others
            permission_classes = [IsSelfOrTenantAdminOrOwner]
        elif self.action == 'destroy':
            # Only admins/owners can delete users
            permission_classes = [IsTenantAdminOrOwner]
        else:
            # Default deny or use base permissions for any other actions
            permission_classes = self.permission_classes

        return [permission() for permission in permission_classes]

class TenantUserCreateView(generics.CreateAPIView):
    """
    API View for creating a new user within the current tenant's context.
    Accessed via tenant domain (e.g., tenant.localhost/api/users/create/).
    Requires tenant admin/owner privileges.
    """
    serializer_class = TenantUserCreateSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantAdminOrOwner] # Use custom permission

    def create(self, request, *args, **kwargs):
        tenant = request.tenant # Get tenant from middleware
        if not tenant:
             logger.error("Tenant context not found in request for user creation.")
             return Response({"error": "Tenant context not found."}, status=status.HTTP_400_BAD_REQUEST)

        logger.info(f"User creation request received for tenant: {tenant.schema_name} by user {request.user.email}")

        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as ve: # Catch validation errors from the serializer itself
            logger.warning(f"Serializer validation error during tenant user creation for tenant {tenant.schema_name}: {ve.detail}")
            return Response(ve.detail, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        # --- User Limit Check ---
        try:
            with tenant_context(tenant): # Explicit tenant context for safety
                current_users = User.objects.count()
            # Ensure max_users is an integer, default to a high number or handle if not set
            tenant_max_users = getattr(tenant, 'max_users', float('inf')) 
            if not isinstance(tenant_max_users, int):
                tenant_max_users = float('inf') # Or a sensible default like 1000

            if current_users >= tenant_max_users:
                 logger.warning(f"User limit reached for tenant '{tenant.name}'. Limit: {tenant_max_users}, Current: {current_users}")
                 return Response({"error": f"Cannot add user. Tenant '{tenant.name}' has reached its maximum user limit ({tenant_max_users})."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
             logger.error(f"Error checking user count for tenant {tenant.schema_name}: {e}", exc_info=True)
             return Response({"error": "Failed to verify tenant user limit."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        # --- End User Limit Check ---

        # --- Validate Username/Email Uniqueness within Tenant Context ---
        # These checks are good as a pre-emptive measure.
        # The final check will be at the database level or within the utility function.
        try:
            with tenant_context(tenant): # Explicit tenant context
                if User.objects.filter(username=data['username']).exists():
                    logger.warning(f"Username '{data['username']}' already exists in tenant {tenant.schema_name}")
                    # Let the utility function or DB handle the final IntegrityError for atomicity
                    # raise ValidationError({"username": ["A user with this username already exists in this tenant."]})
                if data.get('email') and User.objects.filter(email=data['email']).exists():
                    logger.warning(f"Email '{data['email']}' already exists in tenant {tenant.schema_name}")
                    # Let the utility function or DB handle the final IntegrityError
                    # raise ValidationError({"email": ["A user with this email already exists in this tenant."]})
        except Exception as e: # Catch other errors during uniqueness check
             logger.error(f"Error checking username/email uniqueness for tenant {tenant.schema_name}: {e}", exc_info=True)
             # Not returning here, let the main creation logic proceed and catch IntegrityError later
        # --- End Uniqueness Check ---

        # Corrected user creation logic:
        try:
            # Determine role_in_tenant from validated data, default to OPERATOR
            # Ensure the value from serializer is used, e.g., User.RoleInTenant.OPERATOR
            role_in_tenant_str = data.get('role_in_tenant', User.RoleInTenant.OPERATOR.value) # Get string value
            
            # Convert string role to Enum member if necessary, or ensure serializer provides the Enum member
            # For simplicity, assuming role_in_tenant_str is 'admin' or 'operator'
            if role_in_tenant_str == User.RoleInTenant.OWNER.value: # Prevent creating owner this way
                 logger.warning(f"Attempt to create user with 'OWNER' role_in_tenant via TenantUserCreateView by {request.user.username}.")
                 return Response({"error": "Cannot create users with 'OWNER' role through this endpoint."}, status=status.HTTP_400_BAD_REQUEST)
            
            # Map string to Enum member for the utility function
            try:
                role_in_tenant_enum = User.RoleInTenant(role_in_tenant_str)
            except ValueError:
                logger.warning(f"Invalid role_in_tenant string value '{role_in_tenant_str}' provided.")
                return Response({"role_in_tenant": [f"Invalid role: {role_in_tenant_str}."]}, status=status.HTTP_400_BAD_REQUEST)


            logger.info(f"Calling create_tenant_member_and_sync_to_schema for {data['username']} with role_in_tenant '{role_in_tenant_enum}' in tenant {tenant.schema_name}")
            
            created_user = create_tenant_member_and_sync_to_schema(
                tenant=tenant,
                username=data['username'],
                password=data['password'],
                role_in_tenant=role_in_tenant_enum, # Pass the Enum member
                email=data.get('email'), # Will be None if blank/not provided
                first_name=data.get('first_name', ''),
                last_name=data.get('last_name', '')
            )

            public_user_data = UserSerializer(created_user).data # Use your UserSerializer
            logger.info(f"Successfully created user {data['username']} for tenant {tenant.schema_name}")
            return Response(public_user_data, status=status.HTTP_201_CREATED)

        except ValidationError as ve: # Catch ValidationError from utility functions or model validation
            logger.warning(f"Validation error during utility function call for tenant user creation {data.get('username', 'N/A')} in tenant {tenant.schema_name}: {ve.detail if hasattr(ve, 'detail') else str(ve)}")
            return Response(ve.detail if hasattr(ve, 'detail') else {"error": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as ie:
            logger.error(f"Database integrity error during tenant user creation for {data.get('username', 'N/A')} in tenant {tenant.schema_name}: {ie}", exc_info=True)
            # More specific error messages based on constraint violation
            if 'username' in str(ie).lower():
                return Response({"username": ["A user with this username already exists in this tenant."]}, status=status.HTTP_400_BAD_REQUEST)
            if 'email' in str(ie).lower() and data.get('email'):
                return Response({"email": ["A user with this email already exists in this tenant."]}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"error": "User creation failed due to a data conflict (e.g., username or email already exists)."}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as ve: # Catch ValueErrors from utility (e.g., invalid role)
            logger.warning(f"Value error during user creation for tenant {tenant.schema_name}: {str(ve)}")
            return Response({"error": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e: # Generic catch-all for other unexpected errors
            logger.error(f"Unexpected error during tenant user creation for {data.get('username', 'N/A')} in tenant {tenant.schema_name}: {e}", exc_info=True)
            return Response({"error": "User creation failed.", "detail": "An internal error occurred during user creation."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class TenantSubUserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsTenantAdminOrOwner]

    def get_queryset(self):
        return get_tenant_sub_users(tenant_obj=self.request.tenant)

class TenantSubUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserSerializer # For GET and response of PUT/PATCH
    permission_classes = [IsTenantAdminOrOwner]
    lookup_field = 'username'

    def get_queryset(self):
        # Ensures we only operate on sub-users of the current tenant
        return User.objects.filter(tenant=self.request.tenant).exclude(role_in_tenant=User.RoleInTenant.OWNER)

    def get_object(self):
        obj = super().get_object()
        if obj.role_in_tenant == User.RoleInTenant.OWNER:
             raise PermissionDenied("This endpoint cannot be used to manage tenant owners.")
        return obj
        
    def update(self, request, *args, **kwargs):
        instance_username = self.kwargs.get(self.lookup_field)
        self.get_object() # This will raise 404 or PermissionDenied if not appropriate

        try:
            updated_user = modify_tenant_sub_user(
                user_to_modify_username=instance_username,
                tenant_obj=request.tenant,
                data_to_update=request.data
            )
            return Response(UserSerializer(updated_user).data)
        except ValueError as ve:
            return Response({"error": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied as pd:
            return Response({"error": str(pd)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            logger.error(f"Error updating sub-user '{instance_username}': {e}", exc_info=True)
            return Response({"error": "An unexpected error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def destroy(self, request, *args, **kwargs):
        instance_username = self.kwargs.get(self.lookup_field)
        self.get_object() # This will raise 404 or PermissionDenied if not appropriate

        permanent_delete = request.query_params.get('permanent', 'false').lower() == 'true'
        if permanent_delete and request.user.role_in_tenant != User.RoleInTenant.OWNER:
             return Response({"error": "Only tenant owners can permanently delete users."}, status=status.HTTP_403_FORBIDDEN)
        try:
            result = delete_tenant_sub_user(
                user_to_delete_username=instance_username,
                tenant_obj=request.tenant,
                permanent=permanent_delete
            )
            if permanent_delete:
                return Response(status=status.HTTP_204_NO_CONTENT) # Typical for successful permanent delete
            return Response(result, status=status.HTTP_200_OK) # For deactivation message
        except ValueError as ve:
            return Response({"error": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied as pd:
            return Response({"error": str(pd)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            logger.error(f"Error deleting sub-user '{instance_username}': {e}", exc_info=True)
            return Response({"error": "An unexpected error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
