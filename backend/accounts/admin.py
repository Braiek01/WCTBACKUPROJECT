from django.contrib import admin
from django.utils.translation import gettext_lazy as _
# Import the User model correctly
from .models import User
# Import BaseUserAdmin from django.contrib.auth.admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
import logging

logger = logging.getLogger(__name__)

# --- UserProfileInline Removed ---

# Minimal User Admin for viewing data
@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # Use fields relevant to your current User model
    list_display = ('email', 'username', 'first_name', 'last_name', 'is_staff', 'is_active', 'tenant', 'role', 'role_in_tenant')
    list_filter = ('is_staff', 'is_active', 'role', 'role_in_tenant', 'tenant')
    search_fields = ('email', 'username', 'first_name', 'last_name', 'tenant__name')
    ordering = ('email',)

    # Define fieldsets for the detail view (adjust as needed)
    # Note: BaseUserAdmin provides standard fieldsets, you might need to customize
    fieldsets = (
        (None, {'fields': ('email', 'password')}), # Password field is handled by BaseUserAdmin
        (_('Personal info'), {'fields': ('first_name', 'last_name', 'username')}),
        (_('Permissions'), {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
         # Add tenant and role info
        (_('Tenant Info'), {'fields': ('tenant', 'role', 'role_in_tenant')}),
        (_('Important dates'), {'fields': ('last_login', 'date_joined')}),
    )
    # Define fields for the add form (if allowing add via admin, which is discouraged now)
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        (_('Tenant Info'), {'fields': ('tenant', 'role', 'role_in_tenant')}),
    )

    # Make tenant field read-only after creation?
    # readonly_fields = ('tenant',) # Consider making tenant read-only in change view

    # --- inlines Removed ---

    # Keep default save_model, get_form, get_fieldsets from BaseUserAdmin