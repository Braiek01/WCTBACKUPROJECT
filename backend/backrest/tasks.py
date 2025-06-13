from backrest.services import BackrestService
from celery import shared_task
import logging
from django.utils import timezone  # Ensure this is imported
from django_tenants.utils import tenant_context
from django.db import connection
from datetime import timedelta
import json
import paramiko
import tempfile
import os
import re
import croniter

logger = logging.getLogger(__name__)

@shared_task
def sync_backrest_operations():
    """Improved sync to catch scheduled operations"""
    from tenants.models import Tenant
    from datetime import datetime, timedelta
    
    logger.info("Starting improved Backrest operations sync")
    results = {}
    
    for tenant in Tenant.objects.filter(is_active=True).exclude(schema_name='public'):
        try:
            with tenant_context(tenant):
                from .models import BackrestRepository, BackrestOperation, BackrestPlan
                
                repos = BackrestRepository.objects.filter(tenant=tenant)
                operations_added = 0
                operations_updated = 0
                
                for repo in repos:
                    backrest_service = BackrestService(repo.server)
                    
                    try:
                        # Get ALL operations from Backrest for this repo
                        backrest_ops = backrest_service.get_operations(repository_id=repo.repository_id)
                        
                        # Process each operation
                        for op_data in backrest_ops:
                            op_id = op_data.get('id')
                            if not op_id:
                                continue
                                
                            # Determine operation type
                            op_type = op_data.get('type', '').lower().replace('type_', '')
                            if not op_type:
                                op_type = 'unknown'
                                
                            # Determine operation status
                            status = 'unknown'
                            raw_status = op_data.get('status', '')
                            if raw_status:
                                status = raw_status.replace('STATUS_', '').lower()
                                if status == 'inprogress':
                                    status = 'running'
                                elif status == 'success':
                                    status = 'completed'
                            
                            # Get plan if available
                            plan = None
                            plan_id = op_data.get('plan_id')
                            if plan_id:
                                try:
                                    plan = BackrestPlan.objects.get(plan_id=plan_id)
                                except BackrestPlan.DoesNotExist:
                                    # Try to create the plan in the database
                                    try:
                                        config = backrest_service.get_config()
                                        for plan_data in config.get('plans', []):
                                            if plan_data.get('id') == plan_id:
                                                plan = BackrestPlan.objects.create(
                                                    tenant=tenant,
                                                    repository=repo,
                                                    name=plan_id.replace('_', ' ').title(),
                                                    plan_id=plan_id,
                                                    paths=','.join(plan_data.get('paths', [])),
                                                    excludes=','.join(plan_data.get('excludes', []))
                                                )
                                                break
                                    except Exception as plan_error:
                                        logger.warning(f"Could not create plan: {str(plan_error)}")
                            
                            # Check for existing operation
                            try:
                                operation = BackrestOperation.objects.get(operation_id=op_id)
                                
                                # Update if status changed
                                if operation.status != status:
                                    operation.status = status
                                    
                                    # Set completion time if newly completed
                                    if status in ['completed', 'failed', 'canceled'] and not operation.completed_at:
                                        operation.completed_at = timezone.now()
                                        
                                    # Update other fields
                                    if 'snapshot_id' in op_data and op_data['snapshot_id']:
                                        operation.snapshot_id = op_data['snapshot_id']
                                    if 'stats' in op_data and op_data['stats']:
                                        operation.stats = op_data['stats']
                                    
                                    operation.save()
                                    operations_updated += 1
                                
                            except BackrestOperation.DoesNotExist:
                                # Create new operation
                                operation, is_new = create_or_update_operation(
                                    tenant=tenant,
                                    repository=repo,
                                    plan=plan,  
                                    op_data=op_data,
                                    op_type=op_type,
                                    status=status
                                )

                                if is_new:
                                    operations_added += 1
                                else:
                                    operations_updated += 1
                                
                    except Exception as repo_error:
                        logger.error(f"Error processing repo {repo.name}: {str(repo_error)}")
                
                results[tenant.name] = {
                    "status": "success", 
                    "operations_added": operations_added,
                    "operations_updated": operations_updated
                }
                
        except Exception as e:
            logger.exception(f"Error processing tenant {tenant.name}")
            results[tenant.name] = {"status": "error", "error": str(e)}
    
    return results

@shared_task
def process_backrest_logs():
    """Process backrest logs from servers to update operation statuses"""
    from tenants.models import Tenant
    
    logger.info("Starting Backrest logs processing task")
    results = {}
    
    # Skip public tenant as it doesn't have backrest tables
    for tenant in Tenant.objects.filter(is_active=True).exclude(schema_name='public'):
        try:
            with tenant_context(tenant):
                from .models import BackrestRepository, BackrestOperation, Server
                
                # Get all running operations
                running_ops = BackrestOperation.objects.filter(
                    status='running', 
                    completed_at__isnull=True
                )
                
                if not running_ops.exists():
                    logger.info(f"No running operations found for tenant {tenant.name}")
                    results[tenant.name] = {"status": "skipped", "message": "No running operations"}
                    continue
                    
                logger.info(f"Processing {running_ops.count()} running operations for tenant {tenant.name}")
                
                # Get unique servers that need log processing
                server_ids = set()
                for op in running_ops:
                    if op.repository and op.repository.server:
                        server_ids.add(op.repository.server.id)
                
                operations_updated = 0
                
                # Process each server
                for server_id in server_ids:
                    server = Server.objects.get(id=server_id)
                    logger.info(f"Processing logs from server {server.hostname}")
                    
                    try:
                        # Get relevant operations for this server
                        server_ops = running_ops.filter(repository__server=server)
                        ops_by_plan = {}
                        
                        # Group operations by plan name for easier matching
                        for op in server_ops:
                            if op.plan:
                                plan_name = op.plan.plan_id
                                ops_by_plan[plan_name] = op
                        
                        # Fetch and process logs
                        log_entries = fetch_backrest_logs(server)
                        if log_entries:
                            # Process log entries
                            for entry in log_entries:
                                operations_updated += process_log_entry(entry, ops_by_plan)
                                
                    except Exception as server_error:
                        logger.error(f"Error processing logs from server {server.hostname}: {str(server_error)}")
                
                results[tenant.name] = {
                    "status": "success", 
                    "operations_updated": operations_updated,
                    "message": f"Updated {operations_updated} operations from log files"
                }
                
        except Exception as e:
            logger.exception(f"Error processing tenant {tenant.name}")
            results[tenant.name] = f"Error: {str(e)}"
    
    return results

def fetch_backrest_logs(server):
    """Fetch backrest logs from the server"""
    try:
        log_entries = []
        
        # Create temporary key file
        with tempfile.NamedTemporaryFile(delete=False, mode='w') as key_file:
            key_path = key_file.name
            key_file.write(server.ssh_key.private_key)
        
        # Set proper permissions
        os.chmod(key_path, 0o600)
        
        # Connect with paramiko
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=server.hostname,
            port=server.ssh_port,
            username=server.ssh_user,
            key_filename=key_path,
            timeout=30
        )
        
        # Get the last 1000 lines from the log file (adjust as needed)
        cmd = "tail -n 1000 /opt/backrest/data/processlogs/backrest.log"
        stdin, stdout, stderr = client.exec_command(cmd)
        
        # Read log lines
        log_data = stdout.read().decode('utf-8')
        
        # Clean up
        client.close()
        os.unlink(key_path)
        
        # Split into lines and parse JSON
        for line in log_data.strip().split('\n'):
            if not line:
                continue
                
            try:
                entry = json.loads(line)
                log_entries.append(entry)
            except json.JSONDecodeError:
                logger.warning(f"Could not parse log line: {line[:100]}...")
        
        return log_entries
        
    except Exception as e:
        logger.exception(f"Error fetching logs from server {server.hostname}: {str(e)}")
        return []

def process_log_entry(entry, ops_by_plan):
    """Process a single log entry and update matching operations"""
    from .models import BackrestOperation
    operations_updated = 0
    
    try:
        # Skip entries that aren't about backup completion
        if not (entry.get('msg') == 'backup complete' or 
                entry.get('msg') == 'backup failed'):
            return 0
            
        # Get plan name and status
        plan_name = entry.get('plan')
        if not plan_name:
            return 0
            
        # Check if we have a matching operation
        if plan_name not in ops_by_plan:
            return 0
            
        operation = ops_by_plan[plan_name]
        
        # Determine status from message
        if entry.get('msg') == 'backup complete':
            status = 'completed'
        else:
            status = 'failed'
        
        # Only update if different
        if operation.status != status:
            logger.info(f"Updating operation {operation.operation_id} for plan {plan_name} to {status}")
            
            # Get stats from summary if available
            stats = None
            summary_text = entry.get('summary')
            if summary_text and isinstance(summary_text, str):
                # Extract snapshot ID
                snapshot_match = re.search(r'snapshot_id:\"([^\"]+)\"', summary_text)
                snapshot_id = snapshot_match.group(1) if snapshot_match else None
                
                # Parse stats from summary text
                stats = {}
                for match in re.findall(r'(\w+):(\d+)', summary_text):
                    stats[match[0]] = int(match[1])
                    
                # Update operation
                operation.status = status
                operation.completed_at = timezone.now()
                if snapshot_id:
                    operation.snapshot_id = snapshot_id
                if stats:
                    operation.stats = stats
                operation.save()
                
                # Update job if it exists
                try:
                    from jobs.models import BackupJob
                    jobs = BackupJob.objects.filter(operation_id=operation.operation_id)
                    if jobs.exists():
                        job = jobs.first()
                        job.status = "completed" if status == "completed" else "failed"
                        job.completed_at = timezone.now()
                        job.save()
                except Exception as job_error:
                    logger.warning(f"Failed to update job: {str(job_error)}")
                    
                operations_updated += 1
    
    except Exception as e:
        logger.exception(f"Error processing log entry: {str(e)}")
        
    return operations_updated

@shared_task
def manage_monthly_retention():
    """
    Monthly task that keeps only the most recent full backup from the previous month
    and removes all other backups from that month.
    """
    from tenants.models import Tenant
    from datetime import datetime
    import calendar
    
    logger.info("Starting monthly backup retention management")
    results = {}
    
    # Current date information
    now = timezone.now()
    current_month = now.month
    current_year = now.year
    
    # Calculate previous month
    if current_month == 1:
        previous_month = 12
        previous_year = current_year - 1
    else:
        previous_month = current_month - 1
        previous_year = current_year
    
    # Format for tag matching
    previous_month_tag = f"month-{previous_year}-{previous_month:02d}"
    
    # Process each tenant
    for tenant in Tenant.objects.filter(is_active=True).exclude(schema_name='public'):
        try:
            with tenant_context(tenant):
                from .models import BackrestRepository, BackrestPlan
                from .services import BackrestService
                
                repos = BackrestRepository.objects.all()
                for repo in repos:
                    try:
                        # Get the backrest service for this repository
                        backrest_service = BackrestService(repo.server)
                        
                        # 1. Identify snapshots from previous month with "full-backup" tag
                        snapshots = backrest_service.get_snapshots(repo.repository_id)
                        
                        full_snapshots = []
                        for snapshot in snapshots:
                            tags = snapshot.get('tags', [])
                            if (previous_month_tag in tags and 
                                "full-backup" in tags and 
                                "monday-backup" in tags):
                                full_snapshots.append(snapshot)
                        
                        # Sort by time to find the last full backup of the month
                        if full_snapshots:
                            # Sort by timestamp (newest first)
                            sorted_snapshots = sorted(
                                full_snapshots, 
                                key=lambda s: s.get('time', ''), 
                                reverse=True
                            )
                            
                            # The latest full backup from previous month
                            latest_full = sorted_snapshots[0]
                            
                            # 2. Keep this snapshot but forget the others from previous month
                            for snapshot in snapshots:
                                tags = snapshot.get('tags', [])
                                snapshot_id = snapshot.get('id')
                                
                                # If it's from the previous month but not the latest full backup
                                if (previous_month_tag in tags and 
                                    snapshot_id != latest_full.get('id')):
                                    
                                    logger.info(f"Forgetting snapshot {snapshot_id} " 
                                                f"from previous month {previous_month_tag}")
                                    
                                    # Forget this snapshot
                                    try:
                                        backrest_service.forget_snapshot(
                                            repo.repository_id, 
                                            snapshot_id
                                        )
                                    except Exception as forget_error:
                                        logger.error(f"Error forgetting snapshot {snapshot_id}: {forget_error}")
                        
                        # 3. After forgetting snapshots, run prune to actually reclaim space
                        backrest_service.prune_repository(repo.repository_id)
                        
                    except Exception as repo_error:
                        logger.error(f"Error processing repository {repo.id}: {str(repo_error)}")
                
                results[tenant.name] = {"status": "success", "message": "Retention management completed"}
                
        except Exception as e:
            logger.exception(f"Error processing tenant {tenant.name}")
            results[tenant.name] = f"Error: {str(e)}"
    
    return results

@shared_task
def handle_stuck_plans():
    """Check for rapidly triggered backups and reset them"""
    from tenants.models import Tenant
    from django.utils import timezone
    from datetime import timedelta
    
    for tenant in Tenant.objects.filter(is_active=True).exclude(schema_name='public'):
        try:
            with tenant_context(tenant):
                from .models import BackrestOperation
                from .services import BackrestService
                
                # Find plans with too many recent operations
                recent_time = timezone.now() - timedelta(minutes=10)
                operations = BackrestOperation.objects.filter(
                    started_at__gte=recent_time,
                    operation_type="backup"
                )
                
                # Group by plan and count
                plan_counts = {}
                for op in operations:
                    plan_id = op.plan.plan_id if op.plan else None
                    if not plan_id:
                        continue
                        
                    if plan_id not in plan_counts:
                        plan_counts[plan_id] = []
                    plan_counts[plan_id].append(op)
                
                # Check for plans with too many operations
                for plan_id, ops in plan_counts.items():
                    if len(ops) >= 5:  # More than 5 operations in 10 minutes is a loop
                        logger.warning(f"Detected backup loop for plan {plan_id}")
                        
                        # Get the server to cancel operations
                        if ops and ops[0].repository and ops[0].repository.server:
                            server = ops[0].repository.server
                            backrest_service = BackrestService(server)
                            
                            # Stop the loop by updating the plan's schedule
                            try:
                                config = backrest_service.get_config()
                                for i, plan in enumerate(config.get("plans", [])):
                                    if plan.get("id") == plan_id:
                                        # Disable the schedule temporarily
                                        config["plans"][i]["schedule"] = {"disabled": True}
                                        
                                        # Save the change
                                        backrest_service._make_request('post', '/v1.Backrest/SetConfig', config)
                                        logger.info(f"Disabled schedule for looping plan: {plan_id}")
                                        break
                            except Exception as e:
                                logger.error(f"Error stopping backup loop: {str(e)}")
        
        except Exception as e:
            logger.error(f"Error handling stuck plans for tenant {tenant.name}: {str(e)}")
    
    return {"status": "completed"}

@shared_task
def sync_scheduled_operations():
    """Sync upcoming scheduled operations from plans to database"""
    from tenants.models import Tenant
    from datetime import datetime
    
    logger.info("Syncing scheduled backup operations")
    results = {}
    
    for tenant in Tenant.objects.filter(is_active=True).exclude(schema_name='public'):
        try:
            with tenant_context(tenant):
                from .models import BackrestPlan, BackrestOperation, BackrestRepository
                
                # Get all plans with schedules
                plans = BackrestPlan.objects.all()
                scheduled_count = 0
                
                for plan in plans:
                    # Skip plans without schedules
                    if not plan.schedule or plan.schedule == "disabled":
                        continue
                    
                    try:
                        # Parse cron expression
                        cron_schedule = plan.schedule
                        
                        # Get a croniter instance for this schedule
                        now = datetime.now()
                        cron = croniter.croniter(cron_schedule, now)
                        
                        # Get the next execution time
                        next_execution = cron.get_next(datetime)
                        
                        # Check if we already have a pending operation for this execution time
                        existing_operation = BackrestOperation.objects.filter(
                            plan=plan,
                            status__in=['pending', 'scheduled'],
                            scheduled_at__year=next_execution.year,
                            scheduled_at__month=next_execution.month,
                            scheduled_at__day=next_execution.day,
                            scheduled_at__hour=next_execution.hour,
                            scheduled_at__minute=next_execution.minute,
                        ).first()
                        
                        if not existing_operation:
                            # Create a pending operation for this plan
                            operation = BackrestOperation.objects.create(
                                tenant=tenant,
                                repository=plan.repository,
                                plan=plan,
                                operation_id=f"scheduled_{plan.plan_id}_{int(next_execution.timestamp())}",
                                operation_type="backup",
                                status="scheduled",  # Use "scheduled" status to distinguish from "pending"
                                started_at=None,  # Will be set when actually started
                                scheduled_at=timezone.make_aware(next_execution)  # Add this field to the model
                            )
                            scheduled_count += 1
                            
                            # If you have job tables, create corresponding job records
                            try:
                                from jobs.models import BackupJob, JobLog
                                
                                backup_job = BackupJob.objects.create(
                                    tenant=tenant,
                                    name=f"Scheduled backup: {plan.name}",
                                    status="scheduled",
                                    scheduled_at=timezone.make_aware(next_execution),
                                    operation_id=operation.operation_id
                                )
                                
                                JobLog.objects.create(
                                    job=backup_job,
                                    message=f"Backup scheduled for {next_execution.strftime('%Y-%m-%d %H:%M')}",
                                    level="info",
                                    timestamp=timezone.now()
                                )
                            except Exception as job_error:
                                logger.warning(f"Failed to create job record: {str(job_error)}")
                    
                    except Exception as plan_error:
                        logger.error(f"Error processing plan {plan.name}: {str(plan_error)}")
                
                results[tenant.name] = {
                    "status": "success",
                    "scheduled_operations": scheduled_count
                }
                
        except Exception as tenant_error:
            logger.exception(f"Error processing tenant {tenant.name}")
            results[tenant.name] = {"status": "error", "error": str(tenant_error)}
    
    return results

@shared_task
def process_backrest_db_logs():
    """Process Backrest SQLite tasklog files to get detailed logs"""
    from tenants.models import Tenant
    import sqlite3
    
    logger.info("Processing Backrest SQLite logs")
    results = {}
    
    for tenant in Tenant.objects.filter(is_active=True).exclude(schema_name='public'):
        try:
            with tenant_context(tenant):
                from .models import Server, BackrestLog
                
                servers = Server.objects.all()
                logs_added = 0
                
                for server in servers:
                    try:
                        # Connect to remote server via SSH
                        with tempfile.NamedTemporaryFile(delete=False, mode='w') as key_file:
                            key_path = key_file.name
                            key_file.write(server.ssh_key.private_key)
                        
                        os.chmod(key_path, 0o600)
                        
                        # Setup SSH client
                        client = paramiko.SSHClient()
                        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                        client.connect(
                            hostname=server.hostname,
                            port=server.ssh_port,
                            username=server.ssh_user,
                            key_filename=key_path,
                            timeout=30
                        )
                        
                        # First check if tasklog files exist
                        cmd = "ls -la /opt/backrest/data/tasklogs/*.sqlite"
                        stdin, stdout, stderr = client.exec_command(cmd)
                        tasklog_files = stdout.read().decode('utf-8')
                        
                        if not tasklog_files:
                            logger.info(f"No tasklog SQLite files found on server {server.hostname}")
                            continue
                        
                        # Create a temporary directory
                        temp_dir = tempfile.mkdtemp()
                        
                        # Download the SQLite files
                        sftp = client.open_sftp()
                        for line in tasklog_files.strip().split('\n'):
                            parts = line.split()
                            if len(parts) > 8:  # Basic check for ls -la output format
                                remote_path = parts[-1]
                                filename = os.path.basename(remote_path)
                                local_path = os.path.join(temp_dir, filename)
                                
                                try:
                                    sftp.get(remote_path, local_path)
                                    
                                    # Process this SQLite file
                                    conn = sqlite3.connect(local_path)
                                    cursor = conn.cursor()
                                    
                                    # Query the logs table - adjust this based on actual schema
                                    cursor.execute("""
                                        SELECT timestamp, level, message, logger, error
                                        FROM logs
                                        ORDER BY timestamp DESC
                                        LIMIT 1000
                                    """)
                                    
                                    logs = cursor.fetchall()
                                    cursor.close()
                                    conn.close()
                                    
                                    # Store in the database
                                    for log in logs:
                                        timestamp, level, message, logger_name, error = log
                                        
                                        # Convert timestamp to datetime
                                        log_time = datetime.fromtimestamp(timestamp)
                                        
                                        # Check if log already exists
                                        existing_log = BackrestLog.objects.filter(
                                            timestamp=timezone.make_aware(log_time),
                                            message=message,
                                            server=server
                                        ).first()
                                        
                                        if not existing_log:
                                            BackrestLog.objects.create(
                                                tenant=tenant,
                                                server=server,
                                                level=level,
                                                message=message,
                                                logger_name=logger_name,
                                                error=error if error else "",
                                                timestamp=timezone.make_aware(log_time),
                                                source=f"tasklog/{filename}"
                                            )
                                            logs_added += 1
                                    
                                except Exception as sqlite_error:
                                    logger.error(f"Error processing SQLite file {filename}: {str(sqlite_error)}")
                        
                        # Also process the backrest.log text file
                        try:
                            cmd = "cat /opt/backrest/data/processlogs/backrest.log | tail -n 1000"
                            stdin, stdout, stderr = client.exec_command(cmd)
                            log_data = stdout.read().decode('utf-8')
                            
                            for line in log_data.strip().split('\n'):
                                if not line:
                                    continue
                                
                                try:
                                    # Parse JSON log entry
                                    log_entry = json.loads(line)
                                    
                                    # Extract fields
                                    timestamp = log_entry.get('ts', 0)
                                    level = log_entry.get('level', 'info')
                                    message = log_entry.get('msg', '')
                                    logger_name = log_entry.get('logger', '')
                                    error = log_entry.get('error', '')
                                    
                                    # Convert timestamp to datetime
                                    log_time = datetime.fromtimestamp(timestamp)
                                    
                                    # Check if log already exists
                                    existing_log = BackrestLog.objects.filter(
                                        timestamp=timezone.make_aware(log_time),
                                        message=message,
                                        server=server
                                    ).first()
                                    
                                    if not existing_log:
                                        BackrestLog.objects.create(
                                            tenant=tenant,
                                            server=server,
                                            level=level,
                                            message=message,
                                            logger_name=logger_name,
                                            error=error,
                                            timestamp=timezone.make_aware(log_time),
                                            source="processlogs/backrest.log"
                                        )
                                        logs_added += 1
                                        
                                except json.JSONDecodeError:
                                    # Not a valid JSON line - might be a plain text log
                                    logger.debug(f"Could not parse log line: {line[:100]}...")
                                
                        except Exception as log_error:
                            logger.error(f"Error processing backrest.log: {str(log_error)}")
                        
                        # Clean up
                        sftp.close()
                        client.close()
                        shutil.rmtree(temp_dir)
                        os.unlink(key_path)
                        
                    except Exception as server_error:
                        logger.error(f"Error processing logs from server {server.hostname}: {str(server_error)}")
                
                results[tenant.name] = {
                    "status": "success",
                    "logs_added": logs_added
                }
                
        except Exception as tenant_error:
            logger.exception(f"Error processing tenant {tenant.name}")
            results[tenant.name] = {"status": "error", "error": str(tenant_error)}
    
    return results

# Update the operation creation part in sync_backrest_operations task
def create_or_update_operation(tenant, repository, plan, op_data, op_type, status):
    """Helper to create or update operation with complete data"""
    from .models import BackrestOperation
    
    op_id = op_data.get('id')
    if not op_id:
        return None
        
    try:
        # Try to get existing operation
        operation = BackrestOperation.objects.get(operation_id=op_id)
        
        # Update fields
        operation.status = status
        
        # Set completion time if newly completed
        if status in ['completed', 'failed', 'canceled'] and not operation.completed_at:
            operation.completed_at = timezone.now()
            
        # Update other fields
        if 'snapshot_id' in op_data and op_data['snapshot_id']:
            operation.snapshot_id = op_data['snapshot_id']
        if 'stats' in op_data and op_data['stats']:
            operation.stats = op_data['stats']
        
        operation.save()
        return operation, False  # False means updated existing
        
    except BackrestOperation.DoesNotExist:
        # Create new operation with all fields properly set
        operation = BackrestOperation(
            tenant=tenant,
            repository=repository,
            plan=plan,
            operation_id=op_id,
            operation_type=op_type,
            status=status,
            started_at=timezone.now() - timedelta(minutes=5)  # Approximate start time
        )
        
        # Set snapshot ID and stats if available
        if 'snapshot_id' in op_data and op_data['snapshot_id']:
            operation.snapshot_id = op_data['snapshot_id']
        if 'stats' in op_data and op_data['stats']:
            operation.stats = op_data['stats']
        
        # Set completion time if already done
        if status in ['completed', 'failed', 'canceled']:
            operation.completed_at = timezone.now()
        
        # Ensure non-null fields for foreign keys
        if not repository:
            logger.warning(f"Missing repository for operation {op_id}")
            return None
            
        operation.save()
        return operation, True  # True means newly created