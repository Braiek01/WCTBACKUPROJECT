import os
from celery import Celery
from celery.schedules import crontab


# Set the default Django settings module for the 'celery' program.
# Replace 'backup_system.settings' with your actual settings file path if different
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backup_system.settings')

# Create the Celery application instance
# The first argument 'backup_system' is the name of the current module,
# which helps Celery auto-discover tasks.
app = Celery('backup_system')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
# - namespace='CELERY' means all celery-related configuration keys
#   should have a `CELERY_` prefix in settings.py.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
# Celery will look for a 'tasks.py' file in each app.
app.autodiscover_tasks()

app.conf.beat_schedule = {
    # Existing tasks
    'sync-backrest-operations': {
        'task': 'backrest.tasks.sync_backrest_operations',
        'schedule': 60.0,  # Every 60 seconds
    },
    'process-backrest-logs': {
        'task': 'backrest.tasks.process_backrest_logs',
        'schedule': 120.0,  # Every 2 minutes
    },
    'handle-stuck-plans': {
        'task': 'backrest.tasks.handle_stuck_plans',
        'schedule': 300.0,  # Every 5 minutes
    },
    # Add new task to sync scheduled operations
    'sync-scheduled-operations': {
        'task': 'backrest.tasks.sync_scheduled_operations',
        'schedule': 900.0,  # Every 15 minutes
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')