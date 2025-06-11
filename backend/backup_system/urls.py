"""
URL configuration for backup_system project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse # For placeholder view
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from accounts.serializers import MyTokenObtainPairSerializer # Import custom serializer
from rest_framework_simplejwt.views import TokenObtainPairView # Keep TokenRefreshView
from accounts.api_views import MyTokenObtainPairView # Import custom view

# Import API views

# Router for tenant-specific ViewSets (like listing users within a tenant)

# URLs that should be available on the public schema (e.g., signup, main admin, token auth)
public_urlpatterns = [
    path('admin/', admin.site.urls), # Django admin on public schema
    path('api/tenants/', include('tenants.urls')), # For tenant signup, etc.
    path('api/token/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),


]

# URLs that are tenant-specific (these will be prefixed by the tenant domain/subdomain)
# These are typically included directly in urlpatterns and TenantMainMiddleware handles routing.
tenant_specific_urlpatterns = [
    # path('admin/', admin.site.urls), # If you want a separate admin site per tenant
    path('api/', include('accounts.urls')), # For tenant user management
    path('api/jobs/', include('jobs.urls')), 
    path('api/backrest/', include('backrest.urls')),    # For jobs app (assuming jobs.urls exists)
    # Add other tenant-specific app URLs here
]
urlpatterns = public_urlpatterns + tenant_specific_urlpatterns

# The main urlpatterns list.
# django-tenants middleware will route requests based on the hostname.
# Requests to the public domain will use routes that can be resolved here.
# Requests to a tenant domain will also try to resolve against these,
# and TenantMainMiddleware sets the schema.
