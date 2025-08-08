from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import api_views
from .api_views import (
    SSHKeyViewSet, ServerViewSet, BackrestRepositoryViewSet,
    BackrestPlanViewSet, BackrestSnapshotViewSet, BackrestOperationViewSet,
    BackrestLogViewSet, MarkInstanceCompleteView, CheckBackrestServiceStatusView,
    BackrestStatusView ,
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
    path('repos/<str:repo_id>/stats/', api_views.repo_stats, name='repo_stats'),
    path('repos/<str:repo_id>/compute-stats/', api_views.compute_stats, name='compute_stats'),
    path('repos/<str:repo_id>/snapshots/', api_views.list_snapshots, name='list_snapshots'),
    path('restore/', api_views.restore_snapshot, name='restore_snapshot'),
    path('operations/', api_views.get_operations, name='get_operations'),
    path('backup/', api_views.trigger_backup, name='trigger_backup'),
    path('cancel/', api_views.cancel_operation, name='cancel_operation'),
    path('logs/fetch/', api_views.fetch_backrest_logs, name='fetch-backrest-logs'),
    path('repos/<str:repo_id>/check', api_views.check_repository, name='check-repository'),
    
  
]