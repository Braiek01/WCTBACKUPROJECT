# filepath: c:\Users\defin\WCPROJECTMVP5.0\BACKEND\tenants\api_views.py
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.db import transaction
from django.contrib.auth import get_user_model
from django_tenants.utils import tenant_context # Keep this if needed elsewhere, not used in create

from .models import Tenant, Domain
from .serializers import TenantSignupSerializer, TenantSerializer # Ensure TenantSerializer exists
from .utils import create_tenant_admin # Use the admin creation for the owner
import re
import logging

User = get_user_model()
logger = logging.getLogger(__name__)

class TenantSignupView(generics.CreateAPIView):
    """
    API View for Public Tenant Signup.
    Creates a new Tenant, its primary Domain, and the initial Owner User.
    Accessible without authentication.
    """
    serializer_class = TenantSignupSerializer
    permission_classes = [permissions.AllowAny] # Anyone can attempt to sign up

    # --- TEMPORARY DEBUGGING METHOD REMOVED ---
    # def post(self, request, *args, **kwargs):
    #     """Override post to test if the view is reached."""
    #     logger.info("TenantSignupView POST method reached for debugging!")
    #     logger.debug(f"Request data: {request.data}")
    #     return Response({"message": "Signup view reached successfully via POST!"}, status=status.HTTP_200_OK)
    # --- END TEMPORARY DEBUGGING METHOD ---


    # --- ORIGINAL CREATE METHOD RESTORED ---
    @transaction.atomic # Ensure all steps succeed or fail together
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        logger.info(f"Attempting signup for email: {data['email']}")

        # --- Generate schema_name (URL safe, unique) ---
        # Use a combination or a more robust unique identifier if last name isn't ideal
        base_schema_name = re.sub(r'[^a-zA-Z0-9]', '', data['last_name'].lower())[:50] # Limit length
        if not base_schema_name: base_schema_name = 'tenant' # Fallback
        schema_name = base_schema_name
        counter = 1
        while Tenant.objects.filter(schema_name=schema_name).exists():
            schema_name = f"{base_schema_name}{counter}" # Append number directly
            counter += 1
            if len(schema_name) > 63: # PostgreSQL schema name limit
                 # Handle extremely unlikely case of very long name + many collisions
                 logger.error(f"Could not generate unique schema name for base '{base_schema_name}'")
                 return Response({"error": "Could not generate unique identifier."}, status=status.HTTP_400_BAD_REQUEST)
        logger.debug(f"Generated schema_name: {schema_name}")

        # --- Generate domain name ---
        # For local dev: uses .localhost
        domain_name = f"{schema_name}.localhost"
        # For production: use your actual domain suffix
        # domain_name = f"{schema_name}.yourbackupapp.com"
        logger.debug(f"Generated domain_name: {domain_name}")

        # --- Create Tenant ---
        try:
            tenant = Tenant(
                schema_name=schema_name,
                name=data['name'],
                first_name=data['first_name'],
                last_name=data['last_name'],
                email=data['email'],
                company_name=data.get('company_name', ''),
                # Add other fields from Tenant model if needed, ensure they have defaults or are optional
            )
            tenant.save() # This creates the schema
            logger.info(f"Tenant {schema_name} created successfully.")
        except Exception as e:
            logger.error(f"Failed to create tenant {schema_name}: {e}", exc_info=True)
            # Clean up if schema creation failed partially? (TenantMixin might handle this)
            return Response({"error": "Failed to create tenant."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # --- Create Domain ---
        try:
            domain = Domain(
                domain=domain_name,
                tenant=tenant,
                is_primary=True
            )
            domain.save()
            logger.info(f"Domain {domain_name} created for tenant {schema_name}.")
        except Exception as e:
            logger.error(f"Failed to create domain {domain_name} for tenant {schema_name}: {e}", exc_info=True)
            # Tenant object still exists, but domain failed. Transaction should roll back.
            return Response({"error": "Failed to create tenant domain."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # --- Create Tenant Owner User ---
        try:
            # Use the utility function, passing username=None
            owner_user = create_tenant_admin( # Use create_tenant_admin for owner
                tenant=tenant,
                username=None, # Pass None for username
                email=data['email'], # Email is required by serializer
                password=data['password'],
                first_name=data['first_name'],
                last_name=data['last_name'],
                role_in_tenant='owner' # Explicitly set owner role
            )
            logger.info(f"Owner user (Email: {owner_user.email}) created for tenant {schema_name}.") # Log email instead of username
        except Exception as e:
            logger.error(f"Failed to create owner user for tenant {schema_name}: {e}", exc_info=True)
            # Tenant and Domain might exist. Transaction should roll back.
            return Response({"error": "Failed to create tenant owner."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # --- Prepare Response ---
        # Return data about the created tenant (excluding sensitive info)
        # Ensure you have a TenantSerializer defined in tenants/serializers.py
        response_data = TenantSerializer(tenant).data
        response_data['domain'] = domain_name # Add the domain explicitly

        headers = self.get_success_headers(response_data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)
    # --- END ORIGINAL CREATE METHOD ---