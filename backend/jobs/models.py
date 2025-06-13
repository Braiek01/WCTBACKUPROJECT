# filepath: c:\Users\defin\WCTPROJECTMVP6.0\backend\jobs\models.py
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
import uuid

# Decide if jobs are public (with tenant FK) or tenant-specific
# Assuming public for now for simpler cross-tenant admin views later
TENANT_MODEL = settings.TENANT_MODEL # "tenants.Tenant"

class BackupJob(models.Model):
    class StatusChoices(models.TextChoices):
        PENDING = 'pending', _('Pending')
        RUNNING = 'running', _('Running')
        SUCCESS = 'success', _('Success')
        FAILED = 'failed', _('Failed')
        CANCELLED = 'cancelled', _('Cancelled')

    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    tenant = models.ForeignKey(TENANT_MODEL, on_delete=models.CASCADE, related_name='backup_jobs')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='backup_jobs')
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=StatusChoices.choices, default=StatusChoices.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    target_hosts = models.TextField()
    playbook_path = models.CharField(max_length=500)
    backup_type = models.CharField(max_length=50)
    extra_vars = models.JSONField(default=dict, blank=True)
    # Add fields for results like size, duration etc. later
    # backup_size_bytes = models.BigIntegerField(null=True, blank=True)
    # duration_seconds = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return f"Job {self.id} ({self.name}) for {self.tenant.schema_name}"

class JobLog(models.Model):
    class LevelChoices(models.TextChoices):
        INFO = 'info', _('Info')
        WARNING = 'warning', _('Warning')
        ERROR = 'error', _('Error')
        DEBUG = 'debug', _('Debug')

    job = models.ForeignKey(BackupJob, on_delete=models.CASCADE, related_name='logs')
    timestamp = models.DateTimeField(auto_now_add=True)
    level = models.CharField(max_length=10, choices=LevelChoices.choices, default=LevelChoices.INFO)
    message = models.TextField()

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.timestamp} [{self.level.upper()}] - {self.message[:50]}..."