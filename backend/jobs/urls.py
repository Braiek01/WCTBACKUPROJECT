# filepath: c:\Users\defin\WCTPROJECTMVP6.0\backend\jobs\urls.py
from django.urls import path
from .api_views import CreateBackupJobView, RecentActivityListView, TriggerMysqlDumpBackupView , TriggerTestFileCreateView # Import new views

app_name = 'jobs'

urlpatterns = [
    
    path('create/', CreateBackupJobView.as_view(), name='create-backup-job'),
    path('activity/', RecentActivityListView.as_view(), name='recent-activity'), # Add path for activity
    path('mysqldump-backup/', TriggerMysqlDumpBackupView.as_view(), name='mysqldump-backup'), # Add path for trigger-mysqldump-backup
    path('trigger-test-file/', TriggerTestFileCreateView.as_view(), name='trigger-test-file'),
    # Add paths for list, detail, logs later
    # path('', BackupJobListView.as_view(), name='list-backup-jobs'),
    # path('<int:pk>/', BackupJobDetailView.as_view(), name='detail-backup-job'),
    # path('<int:job_pk>/logs/', JobLogListView.as_view(), name='list-job-logs'),
]
