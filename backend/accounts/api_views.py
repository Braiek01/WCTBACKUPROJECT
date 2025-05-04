# filepath: c:\Users\defin\WCPROJECTMVP5.0\BACKEND\accounts\api_views.py
from rest_framework import generics, permissions, status, viewsets
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django_tenants.utils import tenant_context

from .serializers import UserSerializer, TenantUserCreateSerializer
from tenants.utils import create_tenant_user, create_tenant_admin # Import the utilities
from tenants.models import Tenant # Import Tenant for checks
import logging
import re # For email generation

User = get_user_model()
logger = logging.getLogger(__name__)

# --- Custom Permission (Corrected) ---
class IsTenantAdminOrOwner(permissions.BasePermission):
    """
    Allows access only to users who are admin or owner within the current tenant context.
    Looks up user by email within the tenant schema.
    """
    message = 'You do not have permission to perform this action within this tenant.'

    def has_permission(self, request, view):
        # Ensure user is authenticated and tenant context exists
        if not request.user or not request.user.is_authenticated or not hasattr(request, 'tenant'):
            logger.warning("Permission check failed: User not authenticated or tenant context missing.")
            return False

        # Check the user's role *within the current tenant's schema* using email
        try:
            with tenant_context(request.tenant):
                # Fetch the user record from the tenant schema using the authenticated user's email
                tenant_user = User.objects.get(email=request.user.email) # <-- Use email for lookup
                # Check if the role_in_tenant allows the action
                is_allowed = tenant_user.role_in_tenant in ['owner', 'admin']
                if not is_allowed:
                    logger.warning(f"Permission denied for user {request.user.email} in tenant {request.tenant.schema_name}. Role: {tenant_user.role_in_tenant}")
                return is_allowed
        except User.DoesNotExist:
            # This case should ideally not happen if user creation logic is correct,
            # but good to log if it does.
            logger.error(f"CRITICAL: User {request.user.email} authenticated but NOT found in tenant schema {request.tenant.schema_name} during permission check.")
            return False
        except Exception as e:
             logger.error(f"Error during tenant permission check for user {request.user.email} in tenant {request.tenant.schema_name}: {e}", exc_info=True)
             return False

# --- API Views ---

class UserViewSet(viewsets.ModelViewSet): # <-- CHANGE THIS LINE
    """
    API endpoint that allows users within a tenant to be viewed, created (implicitly via router), updated, or deleted.
    Permissions vary by action.
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated] # Base permission

    def get_queryset(self):
        """
        This view should only return users within the current tenant's schema.
        The tenant context is already set by the middleware.
        """
        logger.debug(f"Fetching users for tenant: {self.request.tenant.schema_name}")
        return User.objects.all().order_by('id')

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

    # Optional: Add custom logic for destroy if needed
    # def destroy(self, request, *args, **kwargs):
    #     instance = self.get_object()
    #     # Add checks here, e.g., prevent deleting the last owner?
    #     if instance.role_in_tenant == 'owner' and User.objects.filter(role_in_tenant='owner').count() <= 1:
    #          return Response({"detail": "Cannot delete the last owner."}, status=status.HTTP_400_BAD_REQUEST)
    #     self.perform_destroy(instance)
    #     return Response(status=status.HTTP_204_NO_CONTENT)


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
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # --- User Limit Check ---
        try:
            with tenant_context(tenant):
                current_users = User.objects.count()
            if current_users >= tenant.max_users:
                 logger.warning(f"User limit reached for tenant '{tenant.name}'. Limit: {tenant.max_users}, Current: {current_users}")
                 return Response({"error": f"Cannot add user. Tenant '{tenant.name}' has reached its maximum user limit ({tenant.max_users})."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
             logger.error(f"Error checking user count for tenant {tenant.schema_name}: {e}", exc_info=True)
             return Response({"error": "Failed to verify tenant user limit."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        # --- End User Limit Check ---

        # --- Validate Username/Email Uniqueness within Tenant Context ---
        try:
            with tenant_context(tenant):
                if User.objects.filter(username=data['username']).exists():
                    logger.warning(f"Username '{data['username']}' already exists in tenant {tenant.schema_name}")
                    return Response({"username": ["A user with this username already exists in this tenant."]}, status=status.HTTP_400_BAD_REQUEST)
                if data.get('email') and User.objects.filter(email=data['email']).exists():
                    logger.warning(f"Email '{data['email']}' already exists in tenant {tenant.schema_name}")
                    return Response({"email": ["A user with this email already exists in this tenant."]}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
             logger.error(f"Error checking username/email uniqueness for tenant {tenant.schema_name}: {e}", exc_info=True)
             return Response({"error": "Failed to verify username/email uniqueness."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        # --- End Uniqueness Check ---


        # --- Generate Placeholder Email if Needed ---
        final_email = data.get('email')
        if not final_email:
            logger.info(f"Email not provided for {data['username']}, generating placeholder...")
            # Use a simple, likely unique format
            placeholder_email = f"{data['username']}+{tenant.schema_name}@placeholder.local"
            # We assume this won't collide based on the previous uniqueness check,
            # but a loop could be added for extreme safety.
            final_email = placeholder_email
            logger.info(f"Generated placeholder email: {final_email}")
        # --- End Email Handling ---

        try:
            # Use the appropriate utility based on the requested role
            role_in_tenant = data.get('role_in_tenant', 'operator')
            user_creation_data = {
                'username': data['username'],
                'email': final_email,
                'password': data['password'],
                'first_name': data.get('first_name', ''),
                'last_name': data.get('last_name', ''),
                'role_in_tenant': role_in_tenant
            }

            if role_in_tenant in ['owner', 'admin']:
                logger.info(f"Calling create_tenant_admin for {data['username']} in tenant {tenant.schema_name}")
                created_user = create_tenant_admin(tenant=tenant, **user_creation_data)
            else:
                logger.info(f"Calling create_tenant_user for {data['username']} in tenant {tenant.schema_name}")
                created_user = create_tenant_user(tenant=tenant, **user_creation_data)

            # Return data of the created public user record
            user_data = UserSerializer(created_user).data
            logger.info(f"Successfully created user {data['username']} for tenant {tenant.schema_name}")
            return Response(user_data, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Tenant user creation failed for tenant {tenant.schema_name}: {e}", exc_info=True)
            # The utility functions use transaction.atomic, so rollback should occur
            return Response({"error": "User creation failed.", "detail": "An internal error occurred during user creation."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
