from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import TenantUserCreateView, UserViewSet ,TenantSubUserListView, TenantSubUserDetailView # Assuming UserViewSet manages list/retrieve/update/delete

app_name = 'accounts'

router = DefaultRouter()
# The UserViewSet will handle endpoints like:
# /api/users/ (GET for list, POST for create - though you have a dedicated create view)
# /api/users/{user_uuid}/ (GET for retrieve, PUT/PATCH for update, DELETE for delete)
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    # Dedicated endpoint for creating a user within a tenant, typically by a tenant admin/owner
    path('users/create/', TenantUserCreateView.as_view(), name='tenant-user-create'),
     path('users/sub-users/', TenantSubUserListView.as_view(), name='tenant-sub-user-list'),
     path('users/sub-users/<str:username>/', TenantSubUserDetailView.as_view(), name='tenant-sub-user-detail'),
    # Include router URLs for other user operations (list, retrieve, update, delete)
    path('', include(router.urls)),
]
urlpatterns += router.urls