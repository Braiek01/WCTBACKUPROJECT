from django.urls import path
from .api_views import TenantSignupView, TenantDetailView # Assuming you have/will have TenantDetailView

app_name = 'tenants'

urlpatterns = [
    path('signup/', TenantSignupView.as_view(), name='tenant-signup'),
    # Example: if you have a view to get/update tenant details by its schema_name
    # This would typically be accessed via the public schema or by a superuser
    path('<str:schema_name>/', TenantDetailView.as_view(), name='tenant-detail'),
]