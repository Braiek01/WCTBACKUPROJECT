from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.core.exceptions import ValidationError
import uuid
import re
import logging

logger = logging.getLogger(__name__)

class UserManager(BaseUserManager):
    """Custom user manager for our User model."""

    def _create_user_internal(self, email, password, tenant, role, role_in_tenant, first_name, last_name, username, **extra_fields):
        """Internal helper to create users, handles common logic."""
        if not email:
            raise ValueError(_('The Email field must be set'))
        if not tenant:
            raise ValueError(_('A tenant must be provided to create a user.'))
        if not role:
            raise ValueError(_('A global role must be provided for the user.'))
        if not role_in_tenant:
            raise ValueError(_('A role within the tenant must be provided for the user.'))

        email = self.normalize_email(email)

        # Auto-generate username from email if not provided or empty
        if not username:
            username_prefix = re.sub(r'[^\w.@+-]', '', re.sub(r'@.*', '', email)).lower() # Sanitize and use email prefix
            if not username_prefix: # Handle cases where email prefix might be empty after sanitization
                username_prefix = "user"
            temp_username = username_prefix
            counter = 1
            # Use self.model.objects to query the User model correctly
            while self.model.objects.filter(username=temp_username).exists():
                temp_username = f"{username_prefix}{counter}"
                counter += 1
            username = temp_username
            logger.info(f"Generated unique username '{username}' for email '{email}'")

        user = self.model(
            email=email,
            username=username,
            first_name=first_name,
            last_name=last_name,
            tenant=tenant,
            role=role,
            role_in_tenant=role_in_tenant,
            **extra_fields
        )

        if password:
            user.set_password(password)
            logger.debug(f"Password set for user '{email}'.")
        else:
            user.set_unusable_password()
            logger.warning(f"No password provided for user '{email}'. Setting unusable password.")

        user.save(using=self._db)
        logger.info(f"User '{email}' created successfully with ID {user.pk}, role '{role}', role_in_tenant '{role_in_tenant}'.")
        return user

    def create_user(self, email, password, tenant, role, role_in_tenant, first_name, last_name, username=None, **extra_fields):
        """
        Creates and saves a regular user.
        - For TENANT_OWNER: is_staff=True, role_in_tenant is forced to OWNER.
        - For TENANT_MEMBER: is_staff=False, role_in_tenant is as provided (ADMIN or OPERATOR).
        """
        logger.debug(f"UserManager.create_user called for email: {email}, role: {role}, role_in_tenant: {role_in_tenant}")

        if role == User.Role.TENANT_OWNER:
            extra_fields.setdefault('is_staff', True)
            role_in_tenant = User.RoleInTenant.OWNER # Force role_in_tenant for Owner
            logger.debug(f"Setting is_staff=True and role_in_tenant=OWNER for TENANT_OWNER '{email}'.")
        elif role == User.Role.TENANT_MEMBER:
            extra_fields.setdefault('is_staff', False)
            if role_in_tenant not in [User.RoleInTenant.ADMIN, User.RoleInTenant.OPERATOR]:
                raise ValueError(_(f"Invalid role_in_tenant '{role_in_tenant}' for TENANT_MEMBER. Must be ADMIN or OPERATOR."))
            logger.debug(f"Setting is_staff=False for TENANT_MEMBER '{email}' with role_in_tenant '{role_in_tenant}'.")
        else:
            raise ValueError(_(f"Invalid global role '{role}' specified."))

        # PermissionsMixin fields - these are not strictly necessary if not using Django admin for complex permissions
        extra_fields.setdefault('is_superuser', False)

        return self._create_user_internal(email, password, tenant, role, role_in_tenant, first_name, last_name, username, **extra_fields)

    # create_superuser method is removed as per your request.


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        TENANT_OWNER = 'tenant_owner', _('Tenant Owner')
        TENANT_MEMBER = 'tenant_member', _('Tenant Member')

    class RoleInTenant(models.TextChoices):
        OWNER = 'owner', _('Owner') # Typically for the TENANT_OWNER
        ADMIN = 'admin', _('Administrator') # For TENANT_MEMBER with admin rights in tenant
        OPERATOR = 'operator', _('Operator') # For TENANT_MEMBER with basic rights in tenant

    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    email = models.EmailField(_('email address'), unique=True)
    username = models.CharField(
        _('username'), max_length=150, unique=True,
        help_text=_('Required. 150 characters or fewer. Auto-generated from email if not provided.'),
    )
    first_name = models.CharField(_('first name'), max_length=150, blank=True)
    last_name = models.CharField(_('last name'), max_length=150, blank=True)

    date_joined = models.DateTimeField(_('date joined'), default=timezone.now)
    last_updated = models.DateTimeField(_('last updated'), auto_now=True)
    is_active = models.BooleanField(_('active'), default=True)

    is_staff = models.BooleanField(
        _('staff status'), default=False,
        help_text=_('Designates whether the user can log into the Django admin site. True for Tenant Owners.')
    )
    # is_superuser is inherited from PermissionsMixin, will be False by default.

    tenant = models.ForeignKey(
        'tenants.Tenant', # String reference to avoid circular imports
        on_delete=models.CASCADE,
        null=False, blank=False, # All users must belong to a tenant
        related_name='users_public',
        help_text=_('The tenant this user belongs to.')
    )
    role = models.CharField(
        _('Global Role'), max_length=20, choices=Role.choices,
        null=False, blank=False, # Role is mandatory
        help_text=_('Global role of the user (Owner or Member of a Tenant).')
    )
    role_in_tenant = models.CharField(
        _('Role in Tenant'), max_length=20, choices=RoleInTenant.choices,
        null=False, blank=False, # Role in tenant is mandatory
        help_text=_("User's specific role within their tenant.")
    )

    objects = UserManager()

    USERNAME_FIELD = 'email'
    # 'username' is still useful for display and direct addressing if needed,
    # but not for initial login. It will be auto-generated.
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']


    class Meta:
        verbose_name = _('user')
        verbose_name_plural = _('users')
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'email'], name='unique_email_per_tenant_public'),
            models.UniqueConstraint(fields=['tenant', 'username'], name='unique_username_per_tenant_public'),
        ]


    def __str__(self):
        return f"{self.email} ({self.tenant.schema_name if self.tenant else 'No Tenant'})"

    def clean(self):
        super().clean()
        self.email = self.__class__.objects.normalize_email(self.email)
        if not self.tenant_id: # tenant_id check is more direct
            raise ValidationError(_("User must be associated with a tenant."))
        if not self.role:
            raise ValidationError(_("User global role must be set."))
        if not self.role_in_tenant:
            raise ValidationError(_("User role in tenant must be set."))

        # Ensure consistency between global role and tenant role
        if self.role == self.Role.TENANT_OWNER and self.role_in_tenant != self.RoleInTenant.OWNER:
            logger.warning(f"Correcting role_in_tenant for TENANT_OWNER {self.email} to OWNER.")
            self.role_in_tenant = self.RoleInTenant.OWNER
        if self.role == self.Role.TENANT_MEMBER and self.role_in_tenant == self.RoleInTenant.OWNER:
            raise ValidationError(_("TENANT_MEMBER cannot have OWNER role_in_tenant. Use ADMIN or OPERATOR."))


    def save(self, *args, **kwargs):
        # Ensure username is populated if not provided (e.g. during admin creation)
        if not self.username and self.email:
            username_prefix = re.sub(r'[^\w.@+-]', '', re.sub(r'@.*', '', self.email)).lower()
            if not username_prefix: username_prefix = "user"
            temp_username = username_prefix
            counter = 1
            # Use self.__class__.objects for querying within instance method
            while self.__class__.objects.filter(username=temp_username).exclude(pk=self.pk).exists():
                temp_username = f"{username_prefix}{counter}"
                counter += 1
            self.username = temp_username
            logger.info(f"Username for {self.email} set to '{self.username}' during save.")

        self.full_clean() # Call full_clean before saving
        super().save(*args, **kwargs)

