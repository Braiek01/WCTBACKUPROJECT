from django.utils import timezone
from .models import SystemOperation
import logging

logger = logging.getLogger(__name__)

class ActivityLogger:
    """Utility class for logging system operations to activity feed"""
    
    @staticmethod
    def log_login(tenant, username):
        """Log user login"""
        try:
            return SystemOperation.objects.create(
                tenant=tenant,
                operation_type='login',
                status='completed',
                user=username,
                description=f'User "{username}" logged in',
                completed_at=timezone.now()
            )
        except Exception as e:
            logger.error(f"Failed to log login: {e}")
    

    
    @staticmethod
    def log_backup_started(tenant, repository, plan=None, user=None):
        """Log backup start"""
        try:
            plan_name = plan.name if plan else 'Manual'
            return SystemOperation.objects.create(
                tenant=tenant,
                operation_type='backup_started',
                status='running',
                user=user,
                repository=repository,
                plan=plan,
                description=f'Backup started for "{repository.name}" ({plan_name})',
                details={
                    'repository_name': repository.name,
                    'plan_name': plan_name,
                }
            )
        except Exception as e:
            logger.error(f"Failed to log backup start: {e}")
    
    @staticmethod
    def log_backup_completed(tenant, repository, plan=None, user=None, stats=None):
        """Log backup completion"""
        try:
            plan_name = plan.name if plan else 'Manual'
            operation = SystemOperation.objects.create(
                tenant=tenant,
                operation_type='backup_completed',
                status='completed',
                user=user,
                repository=repository,
                plan=plan,
                description=f'Backup completed for "{repository.name}" ({plan_name})',
                completed_at=timezone.now(),
                details={
                    'repository_name': repository.name,
                    'plan_name': plan_name,
                    'stats': stats or {}
                }
            )
            return operation
        except Exception as e:
            logger.error(f"Failed to log backup completion: {e}")
    
    @staticmethod
    def log_repository_created(tenant, repository, user=None):
        """Log repository creation"""
        try:
            return SystemOperation.objects.create(
                tenant=tenant,
                operation_type='repository_created',
                status='completed',
                user=user,
                repository=repository,
                description=f'Repository "{repository.name}" created',
                completed_at=timezone.now(),
                details={
                    'repository_name': repository.name,
                    'repository_uri': repository.uri
                }
            )
        except Exception as e:
            logger.error(f"Failed to log repository creation: {e}")
    
    @staticmethod
    def log_restore_started(tenant, repository, user=None, snapshot_id=None):
        """Log restore start"""
        try:
            return SystemOperation.objects.create(
                tenant=tenant,
                operation_type='restore_started',
                status='running',
                user=user,
                repository=repository,
                description=f'Restore started for "{repository.name}"',
                details={
                    'repository_name': repository.name,
                    'snapshot_id': snapshot_id
                }
            )
        except Exception as e:
            logger.error(f"Failed to log restore start: {e}")