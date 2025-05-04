"""
URL configuration for backup_system project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse # For placeholder view
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

# Import API views
from accounts.api_views import UserViewSet, TenantUserCreateView
from tenants.api_views import TenantSignupView

# Router for tenant-specific ViewSets (like listing users within a tenant)
tenant_router = DefaultRouter()
# Register users endpoint under /api/users/ for tenants
tenant_router.register(r'users', UserViewSet, basename='tenant-user')
# Register other tenant-specific ViewSets here (e.g., backups)
# from backup_core.api_views import BackupViewSet # Example
# tenant_router.register(r'backups', BackupViewSet, basename='backup')

urlpatterns = [
    # --- SHARED URLs (Public Schema / Any Domain) ---
    path('admin/', admin.site.urls), # Django admin interface
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'), # JWT Login
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'), # JWT Refresh
    path('api/signup/', TenantSignupView.as_view(), name='tenant-signup'), # Tenant Signup

    # --- TENANT URLs (Resolved by Middleware for Tenant Domains) ---

    # Include URLs from tenant-specific apps (like backup_core)
    # These paths are relative to the tenant domain root (e.g., tenant.localhost/)
    #path('', include('backup_core.urls')), # Includes URLs defined in backup_core/urls.py

    # Include tenant-specific API endpoints managed by the router
    # This will create URLs like /api/users/, /api/users/{pk}/ etc. for the tenant
    path('api/', include(tenant_router.urls)),

    # Include other specific tenant API endpoints not using a router
    path('api/users/create/', TenantUserCreateView.as_view(), name='tenant-user-create'), # Create user within tenant

]