# backend/backrest/log_monitor.py
import json
import os
import time
import logging
from pathlib import Path
from django.conf import settings

logger = logging.getLogger(__name__)

def monitor_backrest_log(log_path=None, callback=None):
    """
    Monitor the backrest log file for new entries
    
    Args:
        log_path: Path to backrest.log (default: from settings or ~/.config/backrest/backrest.log)
        callback: Function to call with each new log entry
    """
    if not log_path:
        log_path = getattr(settings, 'BACKREST_LOG_PATH', 
                          os.path.expanduser('~/.config/backrest/backrest.log'))
    
    if not os.path.exists(log_path):
        raise FileNotFoundError(f"Log file not found: {log_path}")
    
    logger.info(f"Starting to monitor Backrest log at {log_path}")
    
    # Get current file size
    file_size = os.path.getsize(log_path)
    
    try:
        with open(log_path, 'r') as f:
            # Seek to the end of the file
            f.seek(file_size)
            
            while True:
                # Read new lines
                line = f.readline()
                if line:
                    try:
                        # Parse JSON log entry
                        entry = json.loads(line)
                        
                        # Process entry
                        if callback:
                            callback(entry)
                        else:
                            process_log_entry(entry)
                            
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON in log: {line}")
                else:
                    # No new lines, wait before checking again
                    time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Log monitoring stopped by user")
    except Exception as e:
        logger.error(f"Error monitoring log file: {str(e)}")

def process_log_entry(entry):
    """Process a log entry from backrest.log"""
    from .models import BackrestRepository, BackrestOperation
    
    msg = entry.get('msg', '')
    level = entry.get('level', '')
    
    if 'backup_plan completed' in msg:
        plan_id = entry.get('plan_id')
        status = 'success' if entry.get('error') is None else 'error'
        logger.info(f"Backup completed for plan {plan_id} with status {status}")
        
        # You could update your database here
        # update_backup_status_in_db(plan_id, status)
        
    elif 'snapshot indexed' in msg:
        repo_id = entry.get('repo')
        snapshot_id = entry.get('snapshot_id')
        logger.info(f"New snapshot indexed: {snapshot_id} in repo {repo_id}")
        
        # Trigger a sync for this repository's snapshots
        from .tasks import sync_snapshots
        sync_snapshots.delay()