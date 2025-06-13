# Create your models here.
from django.db import models
from django_tenants.models import TenantMixin, DomainMixin
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
import uuid
import re # Import re for potential use, though save method is removed


class Tenant(TenantMixin):
    """
    Tenant model for multi-tenancy.
    Each tenant has their own schema.
    """
    name = models.CharField(max_length=100)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100) # Keep for potential use in views
    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=20, blank=True)
    company_name = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    created_on = models.DateTimeField(auto_now_add=True)

    # Additional tenant information
    address = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    zip_code = models.CharField(max_length=20, blank=True)

    # Tenant settings
    max_users = models.PositiveIntegerField(default=10) # Increased default
    max_storage_gb = models.PositiveIntegerField(default=5) # Decreased default

    # Required by django-tenants
    auto_create_schema = True
    auto_drop_schema = True # Be careful with this in production

    class Meta:
        verbose_name = _("Tenant")
        verbose_name_plural = _("Tenants")

    def __str__(self):
        return self.name

    def get_primary_domain(self):
        """Get the primary domain object for the tenant."""
        return self.domains.filter(is_primary=True).first()

    def get_primary_domain_url(self):
        """Get the tenant's primary domain URL (assuming http for local)."""
        domain = self.get_primary_domain()
        if domain:
            # Use http for localhost development
            protocol = "http" # Change to https if using SSL locally or in production
            return f"{protocol}://{domain.domain}"
        return None

    # Removed the generate_domain_name method - logic moved to view
    # Removed the save method - schema_name generation moved to view


class Domain(DomainMixin):
    """
    Domain model for django-tenants.
    Associates domains with tenants.
    """
    # DomainMixin already includes the tenant field (ForeignKey to TENANT_MODEL)
    # and the domain field (CharField).

    is_primary = models.BooleanField(
        default=True,
        verbose_name=_("Primary Domain"),
        help_text=_("Designates whether this is the primary domain for the tenant")
    )

    class Meta:
        verbose_name = _("Domain")
        verbose_name_plural = _("Domains")

    def __str__(self):
        return self.domain
