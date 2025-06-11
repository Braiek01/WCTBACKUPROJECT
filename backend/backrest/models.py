from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
import os, uuid
from cryptography.fernet import Fernet
from jobs.models import BackupJob

TENANT_MODEL = settings.TENANT_MODEL

def get_encryption_key():
    """Get or create encryption key for sensitive data"""
    key_path = os.path.join(settings.BASE_DIR, '.encryption_key')
    if os.path.exists(key_path):
        with open(key_path, 'rb') as f:
            return f.read()
    else:
        key = Fernet.generate_key()
        with open(key_path, 'wb') as f:
            f.write(key)
        os.chmod(key_path, 0o600)  # Secure permissions
        return key

def encrypt_value(value):
    """Encrypt sensitive values"""
    if not value:
        return value
    f = Fernet(get_encryption_key())
    return f.encrypt(value.encode()).decode()

def decrypt_value(value):
    """Decrypt sensitive values"""
    if not value:
        return value
    f = Fernet(get_encryption_key())
    return f.decrypt(value.encode()).decode()

class SSHKey(models.Model):
    tenant = models.ForeignKey(TENANT_MODEL, on_delete=models.CASCADE, related_name='ssh_keys')
    name = models.CharField(max_length=100)
    private_key = models.TextField()  # Will be encrypted
    public_key = models.TextField()
    fingerprint = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def save(self, *args, **kwargs):
        # Encrypt the private key before saving
        if self.private_key and not self.id:  # Only encrypt on first save
            self.private_key = encrypt_value(self.private_key)
            
        # Generate fingerprint if needed
        if not self.fingerprint and self.public_key:
            # This is a simple placeholder - real implementation would calculate actual fingerprint
            self.fingerprint = self.public_key.split()[1][:16]
            
        # Save the model
        super().save(*args, **kwargs)
        
        # Store the key in the filesystem with secure permissions
        ssh_dir = os.path.join(settings.BASE_DIR, '.ssh', f'tenant_{self.tenant.id}')
        os.makedirs(ssh_dir, exist_ok=True)
        os.chmod(ssh_dir, 0o700)
        
        key_path = os.path.join(ssh_dir, f"{self.name.replace(' ', '_')}")
        with open(key_path, 'w') as f:
            f.write(decrypt_value(self.private_key))
        os.chmod(key_path, 0o600)
        
        if self.public_key:
            with open(f"{key_path}.pub", 'w') as f:
                f.write(self.public_key)
            os.chmod(f"{key_path}.pub", 0o644)
    
    def get_decrypted_key(self):
        """Get the decrypted private key"""
        return decrypt_value(self.private_key)
    
    def get_key_path(self):
        """Get the path to the key file on disk"""
        return os.path.join(settings.BASE_DIR, '.ssh', f'tenant_{self.tenant.id}',
                          f"{self.name.replace(' ', '_')}")
    
    def __str__(self):
        return f"{self.name} ({self.tenant.schema_name})"

class Server(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', _('Pending')
        CONNECTED = 'connected', _('Connected')
        FAILED = 'failed', _('Failed')
        BACKREST_INSTALLED = 'backrest_installed', _('Backrest Installed')
    
    tenant = models.ForeignKey(TENANT_MODEL, on_delete=models.CASCADE, related_name='servers')
    name = models.CharField(max_length=100)
    hostname = models.CharField(max_length=255)
    ip_address = models.GenericIPAddressField()
    ssh_port = models.IntegerField(default=22)
    ssh_user = models.CharField(max_length=100)
    ssh_key = models.ForeignKey(SSHKey, on_delete=models.PROTECT, related_name='servers')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    last_connection = models.DateTimeField(null=True, blank=True)
    backrest_port = models.IntegerField(default=9898)
    backrest_version = models.CharField(max_length=20, blank=True, null=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    backrest_instance_id = models.CharField(max_length=255, blank=True, null=True)
    
    def __str__(self):
        return f"{self.name} ({self.hostname}:{self.ssh_port})"
    
    def get_backrest_url(self):
        """Get the URL to the Backrest API"""
        return f"http://{self.hostname}:{self.backrest_port}"

class BackrestRepository(models.Model):
    tenant = models.ForeignKey(TENANT_MODEL, on_delete=models.CASCADE, related_name='backrest_repositories')
    server = models.ForeignKey(Server, on_delete=models.CASCADE, related_name='repositories')
    repository_id = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=255)
    uri = models.CharField(max_length=1024)
    password = models.CharField(max_length=255)  # Will be encrypted
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def save(self, *args, **kwargs):
        # Encrypt the password before saving
        if self.password and not self.id:  # Only encrypt on first save
            self.password = encrypt_value(self.password)
        super().save(*args, **kwargs)
    
    def get_decrypted_password(self):
        """Get the decrypted repository password"""
        return decrypt_value(self.password)
    
    def __str__(self):
        return f"{self.name} ({self.server.name})"
    
    class Meta:
        verbose_name_plural = "Backrest repositories"

class BackrestPlan(models.Model):
    tenant = models.ForeignKey(TENANT_MODEL, on_delete=models.CASCADE, related_name='backrest_plans')
    repository = models.ForeignKey(BackrestRepository, on_delete=models.CASCADE, related_name='plans')
    plan_id = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=255)
    paths = models.JSONField(help_text="List of paths to backup")
    excludes = models.JSONField(default=list, blank=True, help_text="List of patterns to exclude")
    schedule = models.JSONField(help_text="Schedule configuration")
    retention_policy = models.JSONField(help_text="Retention policy configuration")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.name} ({self.repository.name})"

class BackrestSnapshot(models.Model):
    tenant = models.ForeignKey(TENANT_MODEL, on_delete=models.CASCADE, related_name='backrest_snapshots')
    repository = models.ForeignKey(BackrestRepository, on_delete=models.CASCADE, related_name='snapshots')
    plan = models.ForeignKey(BackrestPlan, on_delete=models.SET_NULL, null=True, related_name='snapshots')
    snapshot_id = models.CharField(max_length=255)
    time = models.DateTimeField()
    hostname = models.CharField(max_length=255)
    username = models.CharField(max_length=255)
    summary = models.JSONField(default=dict)
    size_bytes = models.BigIntegerField(null=True, blank=True)
    file_count = models.IntegerField(null=True, blank=True)
    indexed_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Snapshot {self.snapshot_id[:8]} ({self.time})"
    
    class Meta:
        unique_together = [('repository', 'snapshot_id')]

class BackrestOperation(models.Model):
    class OperationType(models.TextChoices):
        BACKUP = 'backup', _('Backup')
        PRUNE = 'prune', _('Prune')
        FORGET = 'forget', _('Forget')
        CHECK = 'check', _('Check')
        
    class StatusType(models.TextChoices):
        PENDING = 'pending', _('Pending')
        RUNNING = 'running', _('Running')
        COMPLETED = 'completed', _('Completed')
        FAILED = 'failed', _('Failed')
    
    tenant = models.ForeignKey(TENANT_MODEL, on_delete=models.CASCADE, related_name='backrest_operations')
    operation_id = models.CharField(max_length=255, unique=True)
    repository = models.ForeignKey(BackrestRepository, on_delete=models.CASCADE, related_name='operations')
    plan = models.ForeignKey(BackrestPlan, on_delete=models.SET_NULL, null=True, related_name='operations')
    operation_type = models.CharField(max_length=20, choices=OperationType.choices)
    status = models.CharField(max_length=20, choices=StatusType.choices, default=StatusType.PENDING)
    started_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    snapshot_id = models.CharField(max_length=255, null=True, blank=True)
    stats = models.JSONField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    job = models.OneToOneField(
        'jobs.BackupJob',  # Use string reference to avoid circular imports
        on_delete=models.SET_NULL,
        null=True, 
        blank=True,
        related_name='backrest_operation'
    )
    scheduled_at = models.DateTimeField(null=True, blank=True, 
                                       help_text="When this operation is scheduled to run")
    
    def __str__(self):
        return f"{self.operation_type} operation {self.operation_id[:8]} ({self.status})"
    
    # Add this method to get a user-friendly status
    def get_display_status(self):
        if self.status == "scheduled" and self.scheduled_at and self.scheduled_at > timezone.now():
            return f"Waiting - {self.scheduled_at.strftime('%Y-%m-%d %H:%M')}"
        return self.status

class BackrestLog(models.Model):
    """Model to store Backrest logs from various sources"""
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE)
    server = models.ForeignKey('Server', on_delete=models.CASCADE)
    level = models.CharField(max_length=20)
    message = models.TextField()
    logger_name = models.CharField(max_length=255, blank=True)
    error = models.TextField(blank=True)
    timestamp = models.DateTimeField()
    source = models.CharField(max_length=255, help_text="Source of the log (file path)")
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['timestamp']),
            models.Index(fields=['level']),
            models.Index(fields=['server']),
        ]

class BackrestInstance(models.Model):
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='backrest_instances')
    server = models.ForeignKey('Server', on_delete=models.CASCADE, related_name='backrest_instances')
    instance_id = models.CharField(max_length=255)
    install_path = models.CharField(max_length=255, default='/opt/backrest')
    port = models.IntegerField(default=9898)
    is_active = models.BooleanField(default=True)
    # Add this field
    setup_completed = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('tenant', 'instance_id')
    
    def __str__(self):
        return f"{self.tenant.name} - {self.instance_id}"