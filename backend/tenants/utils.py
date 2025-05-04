"""
Utility functions for tenant management in the backup system.
"""
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django_tenants.utils import tenant_context, schema_context
from django.contrib.auth import get_user_model
import logging
import re # Import re for username generation

logger = logging.getLogger(__name__)
User = get_user_model()


def create_tenant_user(tenant, username, email, password, first_name='', last_name='', role_in_tenant='operator', **extra_fields):
    """Creates a public user and a tenant user. Requires username."""
    logger.info(f"Attempting to create tenant user {username} (Email: {email}) for tenant {tenant.schema_name}")
    public_user = None
    try:
        with transaction.atomic():
            # 1. Create Public User
            public_user = User.objects.create_user(
                username=username,
                email=email, # Should be unique or placeholder
                password=password,
                first_name=first_name, last_name=last_name,
                tenant=tenant,
                role='tenant_user', # Generic role in public schema for tenant users
                is_staff=False, # Regular tenant users are not staff by default
                **extra_fields
            )
            logger.info(f"Created public user {username} linked to tenant {tenant.schema_name}")

            # 2. Create Tenant User
            try:
                with tenant_context(tenant):
                    if not User.objects.filter(username=username).exists():
                        tenant_user = User.objects.create_user(
                            username=username,
                            email=email,
                            password=password,
                            first_name=first_name, last_name=last_name,
                            role_in_tenant=role_in_tenant,
                            is_staff=False, # Not staff within tenant context either by default
                            role='tenant_user' # Role within tenant schema context
                        )
                        logger.info(f"Created user {username} in schema {tenant.schema_name}")
                    else:
                        logger.warning(f"User {username} already exists in schema {tenant.schema_name}")
            except Exception as e_tenant:
                logger.error(f"Failed to create user {username} in schema {tenant.schema_name}: {e_tenant}", exc_info=True)
                raise # Rollback

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
                email=email, # Should be unique
                password=password,
                first_name=first_name, last_name=last_name,
                tenant=tenant,
                role='tenant_admin', # Role in public schema
                is_staff=True, # Tenant admins ARE staff (can access admin potentially)
                **extra_fields
            )
            logger.info(f"Created public admin user {username} linked to tenant {tenant.schema_name}")

            # 2. Create Tenant User
            try:
                with tenant_context(tenant):
                     if not User.objects.filter(username=username).exists():
                        tenant_user = User.objects.create_user(
                            username=username,
                            email=email,
                            password=password,
                            first_name=first_name, last_name=last_name,
                            role_in_tenant=role_in_tenant, # 'admin' or 'owner'
                            is_staff=True, # Staff within tenant context
                            role='tenant_admin' # Role within tenant schema context
                        )
                        logger.info(f"Created admin user {username} in schema {tenant.schema_name}")
                     else:
                          logger.warning(f"Admin user {username} already exists in schema {tenant.schema_name}")
            except Exception as e_tenant:
                logger.error(f"Failed to create admin user {username} in schema {tenant.schema_name}: {e_tenant}", exc_info=True)
                raise # Rollback

        return public_user

    except Exception as e_public:
        logger.error(f"Failed to create public admin user {username}: {e_public}", exc_info=True)
        raise
