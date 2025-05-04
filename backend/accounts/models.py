# Create your models here.
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
import uuid
import re


class UserManager(BaseUserManager):
    """Custom user manager for our User model."""

    def create_user(self, email, first_name, last_name, password=None, username=None, **extra_fields): # Accept username=None
        """Create and save a regular user with the given email and password."""
        if not email:
            raise ValueError(_('Users must have an email address'))

        # Remove automatic username generation here
        # if not username:
        #      # Basic generation from email - adjust as needed, ensure uniqueness elsewhere
        #      username_base = re.sub(r'[^a-zA-Z0-9_]', '', email.split('@')[0])[:140]
        #      if not username_base: username_base = f'user_{uuid.uuid4().hex[:8]}'
        #      username = username_base
        #      # Note: Uniqueness check should happen before saving if username is generated here.
        #      # It's generally better to require username in create_user signature or handle in view.
        #      extra_fields['username'] = username # Add generated username to extra_fields

        email = self.normalize_email(email)
        user = self.model(
            email=email,
            username=username, # Use provided username (can be None)
            first_name=first_name,
            last_name=last_name,
            **extra_fields
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, username, first_name, last_name, password=None, **extra_fields): # Keep username required here
        """Create and save a superuser with the given email and password."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        # Ensure username is provided for superuser creation
        if not username: # Keep this check for superuser
             raise ValueError(_('Superuser must have a username.'))


        if extra_fields.get('is_staff') is not True:
            raise ValueError(_('Superuser must have is_staff=True.'))
        if extra_fields.get('is_superuser') is not True:
            raise ValueError(_('Superuser must have is_superuser=True.'))

        # Pass username explicitly if it's required by create_user
        return self.create_user(email, first_name, last_name, password, username=username, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom User model for authentication and tenant association."""

    # --- Roles ---
    ROLE_CHOICES = (
        ('system_admin', _('System Admin')),
        ('tenant_owner', _('Tenant Owner')),
    )
    TENANT_ROLE_CHOICES = (
        ('owner', _('Owner')),
        ('admin', _('Administrator')),
        ('operator', _('Operator')),
    )

    # --- Identifiers ---
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    username = models.CharField(
        _('username'), max_length=150, unique=True,
        null=True, blank=True, # Allow null and blank
        help_text=_('Optional. 150 characters or fewer. Letters, digits and @/./+/-/_ only.'),
        error_messages={'unique': _("A user with that username already exists.")},
    )
    email = models.EmailField(_('email address'), unique=True) # Used for login

    # --- Basic Info ---
    first_name = models.CharField(_('first name'), max_length=150, blank=True)
    last_name = models.CharField(_('last name'), max_length=150, blank=True)
    date_joined = models.DateTimeField(_('date joined'), default=timezone.now)
    last_updated = models.DateTimeField(_('last updated'), auto_now=True)

    # --- Tenant Association (Public Schema Link) ---
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE, null=True, blank=True,
        related_name='users', help_text=_("Tenant this user belongs to (Public Schema only)")
    )

    # --- Permissions & Status ---
    is_active = models.BooleanField(_('active'), default=True)
    is_staff = models.BooleanField(
        _('staff status'), default=False,
        help_text=_('Designates whether the user can log into admin sites or has specific staff permissions.')
    )
    # is_superuser is inherited from PermissionsMixin

    # --- Roles (Applied) ---
    role = models.CharField(_('Global Role'), max_length=20, choices=ROLE_CHOICES, null=True, blank=True, help_text="Role in the public schema context.")
    role_in_tenant = models.CharField(_('Role in Tenant'), max_length=20, choices=TENANT_ROLE_CHOICES, default='operator', help_text="Role within the tenant's schema context.")

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name'] # Remove 'username'

    class Meta:
        verbose_name = _('user')
        verbose_name_plural = _('users')

    def __str__(self):
        return self.email

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self):
        return self.first_name

