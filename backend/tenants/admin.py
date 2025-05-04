from django.contrib import admin
from django.utils.translation import gettext_lazy as _
from django.utils.html import format_html
from django.urls import reverse
from django.contrib import messages
from django.http import HttpResponseRedirect
from django import forms # Import forms
from .models import Tenant, Domain
# Ensure your utils are correctly imported and defined
from .utils import create_tenant_user, create_tenant_admin # We might not need create_tenant_with_owner here



@admin.register(Domain)
class DomainAdmin(admin.ModelAdmin):
    list_display = ('domain', 'tenant', 'is_primary')
    list_filter = ('is_primary', 'tenant') # Filter by tenant too
    search_fields = ('domain', 'tenant__name')
    readonly_fields = ('tenant', 'domain') # Domains should ideally be managed via API/signup

    def has_add_permission(self, request):
        # Prevent adding domains directly via admin
        return False

    def has_change_permission(self, request, obj=None):
         # Prevent changing domains directly via admin
         return False

# Minimal Tenant Admin for viewing
@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ('name', 'schema_name', 'email', 'company_name', 'is_active', 'created_on')
    search_fields = ('name', 'schema_name', 'email', 'company_name', 'last_name')
    list_filter = ('is_active',)
    ordering = ('name',)
    # Make schema_name read-only as it shouldn't be changed after creation
    readonly_fields = ('schema_name', 'created_on')

    # REMOVED all custom forms, inlines, save_model overrides, actions etc.

    def has_add_permission(self, request):
        # Prevent adding tenants directly via admin - use API signup
        return False