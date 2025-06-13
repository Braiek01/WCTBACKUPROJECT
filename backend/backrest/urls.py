from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import (
    SSHKeyViewSet, ServerViewSet, BackrestRepositoryViewSet,
    BackrestPlanViewSet, BackrestSnapshotViewSet, BackrestOperationViewSet,
    BackrestLogViewSet, MarkInstanceCompleteView, CheckBackrestServiceStatusView,
    BackrestStatusView
)

router = DefaultRouter()
router.register(r'ssh-keys', SSHKeyViewSet, basename='ssh-key')
router.register(r'servers', ServerViewSet, basename='server')
router.register(r'repositories', BackrestRepositoryViewSet, basename='repository')
router.register(r'plans', BackrestPlanViewSet, basename='plan')
router.register(r'snapshots', BackrestSnapshotViewSet, basename='snapshot')
router.register(r'operations', BackrestOperationViewSet, basename='operation')
router.register(r'logs', BackrestLogViewSet, basename='backrest-logs')

urlpatterns = [
    path('', include(router.urls)),
    path('status/', BackrestStatusView.as_view(), name='backrest-status'),
    path('instances/<str:instance_id>/mark-complete/', MarkInstanceCompleteView.as_view(), name='mark-instance-complete'),
    path('servers/<int:server_id>/check_service_status/', CheckBackrestServiceStatusView.as_view(), name='check-service-status'),
]