"""
Utility functions for tenant management in the backup system.
"""
from django.conf import settings
from django.db import transaction
# from django.utils import timezone # Not used in the restored functions below
from django_tenants.utils import tenant_context # schema_context not used directly here
from django.contrib.auth import get_user_model
import logging
import re

logger = logging.getLogger(__name__)
User = get_user_model()


def create_tenant_user(tenant, username, email, password, first_name='', last_name='', role_in_tenant='operator', **extra_fields):
    """Creates a public user and a tenant user. Requires username."""
    logger.info(f"Attempting to create tenant user {username} (Email: {email}) for tenant {tenant.schema_name}")
    public_user = None
    try:
        with transaction.atomic():
            # 1. Create Public User
            # Ensure 'tenant' and 'role_in_tenant' are passed to create_user if your manager expects them
            public_user = User.objects.create_user(
                username=username,
                email=email, 
                password=password,
                first_name=first_name, last_name=last_name,
                role=User.Role.TENANT_MEMBER, # Explicitly set global role
                is_staff=False, 
                tenant=tenant, # Link to tenant
                role_in_tenant=role_in_tenant, # Set role within this tenant
                **extra_fields
            )
            logger.info(f"Created public user {username} linked to tenant {tenant.schema_name} with role_in_tenant '{role_in_tenant}'")

            # 2. Create Tenant User in tenant's schema
            try:
                with tenant_context(tenant):
                    if not User.objects.filter(username=username).exists():
                        # When creating in tenant schema, some fields like 'tenant' (FK) are not set.
                        # Global 'role' and 'role_in_tenant' should be consistent.
                        User.objects.create_user(
                            username=username,
                            email=email,
                            password=password, # Set password again
                            first_name=first_name, last_name=last_name,
                            role_in_tenant=role_in_tenant, # Consistent
                            is_staff=False, # Consistent
                            role=User.Role.TENANT_MEMBER, # Consistent global role
                            is_active=public_user.is_active # Match active status
                        )
                        logger.info(f"Created user {username} in schema {tenant.schema_name}")
                    else:
                        logger.warning(f"User {username} already exists in schema {tenant.schema_name}")
            except Exception as e_tenant:
                logger.error(f"Failed to create user {username} in schema {tenant.schema_name}: {e_tenant}", exc_info=True)
                raise 

        return public_user

    except Exception as e_public:
        logger.error(f"Failed to create public user {username}: {e_public}", exc_info=True)
        raise

def create_tenant_admin(tenant, username, email, password, first_name='', last_name='', role_in_tenant='admin', **extra_fields):
    """Creates a public user and a tenant admin user. Requires username."""
    logger.info(f"Attempting to create tenant admin {username} (Email: {email}) for tenant {tenant.schema_name}")
    public_user = None
    try:
        with transaction.atomic():
            # 1. Create Public User
            public_user = User.objects.create_user(
                username=username,
                email=email, 
                password=password,
                first_name=first_name, last_name=last_name,
                role=User.Role.TENANT_MEMBER, # Global role is still TENANT_MEMBER
                is_staff=True, # Tenant admins (sub-users) are staff
                tenant=tenant, 
                role_in_tenant=role_in_tenant, # Should be User.RoleInTenant.ADMIN
                **extra_fields
            )
            logger.info(f"Created public admin user {username} linked to tenant {tenant.schema_name} with role_in_tenant '{role_in_tenant}'")

            # 2. Create Tenant User in tenant's schema
            try:
                with tenant_context(tenant):
                     if not User.objects.filter(username=username).exists():
                        User.objects.create_user(
                            username=username,
                            email=email,
                            password=password, # Set password again
                            first_name=first_name, last_name=last_name,
                            role_in_tenant=role_in_tenant, # Consistent
                            is_staff=True, # Consistent
                            role=User.Role.TENANT_MEMBER, # Consistent global role
                            is_active=public_user.is_active # Match active status
                        )
                        logger.info(f"Created admin user {username} in schema {tenant.schema_name}")
                     else:
                          logger.warning(f"Admin user {username} already exists in schema {tenant.schema_name}")
            except Exception as e_tenant:
                logger.error(f"Failed to create admin user {username} in schema {tenant.schema_name}: {e_tenant}", exc_info=True)
                raise 

        return public_user

    except Exception as e_public:
        logger.error(f"Failed to create public admin user {username}: {e_public}", exc_info=True)
        raise


def create_tenant_owner_and_sync_to_schema(tenant, email, password, first_name, last_name, username=None, **extra_fields):
    """
    Creates the public TENANT_OWNER user and syncs them to their tenant's schema.
    The public user will have role=TENANT_OWNER and role_in_tenant=OWNER.
    is_staff is True for owners.
    """
    logger.info(f"Attempting to create tenant owner (Email: {email}, Username: {username}) for tenant {tenant.schema_name}")
    if not username: 
        username_prefix = re.sub(r'[^\w.@+-]', '', re.sub(r'@.*', '', email)).lower()
        if not username_prefix: username_prefix = "owner"
        temp_username = username_prefix
        counter = 1
        while User.objects.filter(username=temp_username).exists(): # Check public schema
            temp_username = f"{username_prefix}{counter}"
            counter += 1
        username = temp_username
        logger.info(f"Generated username '{username}' for owner '{email}'")

    public_owner_user = None
    try:
        with transaction.atomic():
            # 1. Create Public User (Owner)
            public_owner_user = User.objects.create_user(
                email=email,
                password=password,
                username=username,
                first_name=first_name,
                last_name=last_name,
                tenant=tenant,
                role=User.Role.TENANT_OWNER,
                role_in_tenant=User.RoleInTenant.OWNER,
                is_staff=True, 
                **extra_fields
            )
            logger.info(f"Public TENANT_OWNER user '{public_owner_user.username}' created for tenant '{tenant.name}'.")

            # 2. Sync/Create user in the tenant's schema
            with tenant_context(tenant):
                if not User.objects.filter(username=public_owner_user.username).exists():
                    User.objects.create_user(
                        email=public_owner_user.email,
                        password=password, 
                        username=public_owner_user.username,
                        first_name=public_owner_user.first_name,
                        last_name=public_owner_user.last_name,
                        role_in_tenant=User.RoleInTenant.OWNER, 
                        role=User.Role.TENANT_OWNER, 
                        is_staff=True, 
                        is_active=public_owner_user.is_active
                    )
                    logger.info(f"Owner user '{public_owner_user.username}' also created in schema '{tenant.schema_name}'.")
                else:
                    logger.warning(f"Owner user '{public_owner_user.username}' unexpectedly already existed in schema '{tenant.schema_name}'.")
        return public_owner_user
    except Exception as e:
        logger.error(f"Failed to create/sync tenant owner '{username}': {e}", exc_info=True)
        if public_owner_user and public_owner_user.pk: 
            try:
                public_owner_user.delete()
                logger.info(f"Cleaned up partially created public owner user '{username}'.")
            except Exception as e_delete:
                logger.error(f"Failed to clean up partially created public owner user '{username}': {e_delete}", exc_info=True)
        raise

def create_tenant_member_and_sync_to_schema(tenant, username, password, role_in_tenant, first_name='', last_name='', email=None, **extra_fields):
    """
    Creates a public TENANT_MEMBER user (sub-user) and syncs them to the tenant's schema.
    'is_staff' is determined by role_in_tenant (True for ADMIN, False for OPERATOR).
    """
    logger.info(f"Attempting to create tenant member {username} (Email: {email}) for tenant {tenant.schema_name} with role_in_tenant: {role_in_tenant}")
    if not username:
        raise ValueError("Username is required for tenant members.")
    # Ensure role_in_tenant is an Enum member if User.RoleInTenant is an Enum
    if not isinstance(role_in_tenant, User.RoleInTenant):
        try:
            role_in_tenant = User.RoleInTenant(str(role_in_tenant)) # Convert string to Enum
        except ValueError:
             raise ValueError(f"Invalid role_in_tenant value '{role_in_tenant}'. Must be a valid RoleInTenant choice.")

    if role_in_tenant not in [User.RoleInTenant.ADMIN, User.RoleInTenant.OPERATOR]:
        raise ValueError(f"Invalid role_in_tenant '{role_in_tenant}'. Must be ADMIN or OPERATOR.")

    member_email = email if email and email.strip() else None
    is_staff_status = (role_in_tenant == User.RoleInTenant.ADMIN)
    public_member_user = None

    try:
        with transaction.atomic():
            # 1. Create Public User (Member)
            public_member_user = User.objects.create_user(
                username=username,
                email=member_email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                tenant=tenant,
                role=User.Role.TENANT_MEMBER, # Global role for all sub-users
                role_in_tenant=role_in_tenant, # This should be the Enum member
                is_staff=is_staff_status,
                **extra_fields
            )
            logger.info(f"Public TENANT_MEMBER user '{public_member_user.username}' created for tenant '{tenant.name}', is_staff: {is_staff_status}.")

            # 2. Sync/Create user in the tenant's schema
            with tenant_context(tenant):
                if not User.objects.filter(username=public_member_user.username).exists():
                    User.objects.create_user(
                        username=public_member_user.username,
                        email=public_member_user.email,
                        password=password, 
                        first_name=public_member_user.first_name,
                        last_name=public_member_user.last_name,
                        role_in_tenant=public_member_user.role_in_tenant,
                        role=public_member_user.role, 
                        is_staff=public_member_user.is_staff,
                        is_active=public_member_user.is_active
                    )
                    logger.info(f"Member user '{public_member_user.username}' also created in schema '{tenant.schema_name}'.")
                else:
                    logger.warning(f"Member user '{public_member_user.username}' already existed in schema '{tenant.schema_name}'. Consider consistency check/update.")
        return public_member_user
    except Exception as e:
        logger.error(f"Failed to create/sync tenant member '{username}': {e}", exc_info=True)
        if public_member_user and public_member_user.pk: 
            try:
                public_member_user.delete()
                logger.info(f"Cleaned up partially created public member user '{username}'.")
            except Exception as e_delete:
                logger.error(f"Failed to clean up partially created public member user '{username}': {e_delete}", exc_info=True)
        raise

# --- Sub-User Management Utilities (Kept from previous state) ---

def get_tenant_sub_users(tenant_obj):
    """Retrieves all sub-users (non-owners) for a specific tenant from the public User table."""
    if not tenant_obj:
        return User.objects.none()
    return User.objects.filter(tenant=tenant_obj).exclude(role_in_tenant=User.RoleInTenant.OWNER).order_by('username')

def modify_tenant_sub_user(user_to_modify_username, tenant_obj, data_to_update):
    """
    Modifies a sub-user's details in both public and tenant schemas.
    `data_to_update` can contain: first_name, last_name, email, is_active, role_in_tenant, password.
    """
    logger.info(f"Attempting to modify sub-user '{user_to_modify_username}' in tenant '{tenant_obj.schema_name}'")
    try:
        with transaction.atomic():
            public_user = User.objects.get(username=user_to_modify_username, tenant=tenant_obj)
            if public_user.role_in_tenant == User.RoleInTenant.OWNER:
                raise PermissionError("Tenant owner details cannot be modified using this function.")

            public_updated_fields = []
            password_changed = False

            for field_name in ['first_name', 'last_name', 'email']:
                if field_name in data_to_update:
                    new_value = data_to_update[field_name]
                    if field_name == 'email' and new_value is not None and not str(new_value).strip():
                        new_value = None
                    setattr(public_user, field_name, new_value)
                    public_updated_fields.append(field_name)
            
            if 'is_active' in data_to_update:
                setattr(public_user, 'is_active', data_to_update['is_active'])
                public_updated_fields.append('is_active')
            
            if 'role_in_tenant' in data_to_update:
                new_role_str = data_to_update['role_in_tenant']
                # Ensure new_role_str is a valid value from User.RoleInTenant choices
                # For simplicity, assuming it's 'admin' or 'operator' string
                if new_role_str == User.RoleInTenant.OWNER.value: # Compare with .value
                    raise ValueError("Cannot change role_in_tenant to OWNER for a sub-user.")
                
                # Convert string to Enum member if your model field expects it,
                # or ensure your model's choices allow direct string assignment.
                # Assuming direct string assignment works or model field handles it.
                try:
                    new_role_enum = User.RoleInTenant(new_role_str)
                except ValueError:
                    raise ValueError(f"Invalid target role_in_tenant string: {new_role_str}")

                public_user.role_in_tenant = new_role_enum # Assign Enum member
                public_updated_fields.append('role_in_tenant')
                new_is_staff = (new_role_enum == User.RoleInTenant.ADMIN)
                if public_user.is_staff != new_is_staff:
                    public_user.is_staff = new_is_staff
                    public_updated_fields.append('is_staff')

            if 'password' in data_to_update and data_to_update['password']:
                public_user.set_password(data_to_update['password'])
                password_changed = True
            
            if public_updated_fields:
                public_user.save(update_fields=public_updated_fields)
            elif password_changed: 
                 public_user.save()

            logger.info(f"Public sub-user '{public_user.username}' updated. Fields: {public_updated_fields}, PwdChanged: {password_changed}")

            with tenant_context(tenant_obj):
                tenant_schema_user = User.objects.get(username=user_to_modify_username)
                for field in public_updated_fields: # Mirror updated fields
                    setattr(tenant_schema_user, field, getattr(public_user, field))
                # Also mirror global role and staff status if they were part of public_updated_fields implicitly
                tenant_schema_user.role = public_user.role 
                tenant_schema_user.is_staff = public_user.is_staff

                if password_changed:
                    tenant_schema_user.set_password(data_to_update['password'])
                tenant_schema_user.save()
                logger.info(f"Tenant schema sub-user '{tenant_schema_user.username}' synced.")
            
            return public_user
    except User.DoesNotExist:
        logger.error(f"Sub-user '{user_to_modify_username}' not found in tenant '{tenant_obj.schema_name}' for modification.")
        raise ValueError(f"User '{user_to_modify_username}' not found.")
    except (ValueError, PermissionError) as e:
        logger.warning(f"Modification of sub-user '{user_to_modify_username}' failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error modifying sub-user '{user_to_modify_username}': {e}", exc_info=True)
        raise

def delete_tenant_sub_user(user_to_delete_username, tenant_obj, permanent=False):
    """Deletes (or deactivates) a sub-user from public and tenant schemas."""
    logger.info(f"Attempting to {'permanently delete' if permanent else 'deactivate'} sub-user '{user_to_delete_username}' in tenant '{tenant_obj.schema_name}'")
    try:
        with transaction.atomic():
            public_user = User.objects.get(username=user_to_delete_username, tenant=tenant_obj)
            if public_user.role_in_tenant == User.RoleInTenant.OWNER:
                raise PermissionError("Tenant owner cannot be deleted using this function.")

            with tenant_context(tenant_obj):
                try:
                    tenant_schema_user = User.objects.get(username=user_to_delete_username)
                    if permanent:
                        tenant_schema_user.delete()
                        logger.info(f"Permanently deleted sub-user from schema '{tenant_obj.schema_name}'.")
                    elif tenant_schema_user.is_active:
                        tenant_schema_user.is_active = False
                        tenant_schema_user.save(update_fields=['is_active'])
                        logger.info(f"Deactivated sub-user in schema '{tenant_obj.schema_name}'.")
                except User.DoesNotExist:
                    logger.warning(f"Sub-user not found in schema '{tenant_obj.schema_name}' during deletion (already gone?).")

            if permanent:
                public_user.delete()
                logger.info(f"Permanently deleted public sub-user '{user_to_delete_username}'.")
                return {"message": f"User '{user_to_delete_username}' permanently deleted."}
            elif public_user.is_active:
                public_user.is_active = False
                public_user.save(update_fields=['is_active'])
                logger.info(f"Deactivated public sub-user '{user_to_delete_username}'.")
                return {"message": f"User '{user_to_delete_username}' deactivated."}
            else:
                return {"message": f"User '{user_to_delete_username}' was already inactive."}
    except User.DoesNotExist:
        logger.error(f"Sub-user '{user_to_delete_username}' not found in public records for tenant '{tenant_obj.schema_name}' for deletion.")
        raise ValueError(f"User '{user_to_delete_username}' not found.")
    except (ValueError, PermissionError) as e:
        logger.warning(f"Deletion/Deactivation of sub-user '{user_to_delete_username}' failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error deleting/deactivating sub-user '{user_to_delete_username}': {e}", exc_info=True)
        raise
