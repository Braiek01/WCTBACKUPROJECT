# backend/backrest/services.py
import requests
import json
import logging
from urllib.parse import urlparse
import bcrypt  # Import bcrypt for password hashing
import time
import uuid

logger = logging.getLogger(__name__)

class BackrestService:
    """Service for interacting with Backrest API"""
    
    def __init__(self, server):
        self.server = server
        # Use the server's hostname and port for Backrest
        self.base_url = f"http://{server.hostname}:{server.backrest_port}"
        logger.info(f"BackrestService initialized with base URL: {self.base_url}")
    
    def _make_request(self, method, endpoint, data=None, auth_required=True):
        """Make a request to the Backrest API with enhanced error logging"""
        url = f"{self.base_url}{endpoint}"
        logger.info(f"Making {method} request to {url}")
        
        headers = {'Content-Type': 'application/json'}
        
        # Add authentication token if available
        if hasattr(self, 'token') and self.token and auth_required:
            headers['Authorization'] = f"Bearer {self.token}"
        
        try:
            if method.lower() == 'get':
                response = requests.get(url, headers=headers, timeout=30)
            elif method.lower() == 'post':
                # Log exact payload being sent
                logger.info(f"Request payload: {json.dumps(data)[:1000]}...")  # Limit for logs
                response = requests.post(url, json=data, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            # Log response details regardless of status
            logger.info(f"Response status: {response.status_code}")
            
            if response.status_code >= 400:
                logger.error(f"Error response body: {response.text}")
            
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Request error: {str(e)}")
            
            # Try to extract more information about the error
            if hasattr(e, 'response') and e.response:
                logger.error(f"Error status code: {e.response.status_code}")
                logger.error(f"Error response body: {e.response.text}")
            
            raise Exception(f"Backrest API error: {str(e)}")
    
    def create_repository(self, name, uri, password):
        """Create a new repository in Backrest"""
        logger.info(f"Creating repository: {name}")
        
        endpoint = "/v1.Backrest/AddRepo"
        
        # Generate a unique ID for the repo - could be the name with no spaces
        repo_id = name.replace(" ", "_").lower()
        
        # Format data according to the Backrest API requirements
        data = {
            "id": repo_id,  # Required field that was missing!
            "name": name,
            "uri": uri,
            "password": password,
            "env": [],
            "flags": [],
            "prunePolicy": {
                "maxUnusedPercent": 10,
                "schedule": {
                    "clock": "CLOCK_LAST_RUN_TIME",
                    "cron": "0 0 1 * *"  # Monthly prune
                }
            },
            "checkPolicy": {
                "readDataSubsetPercent": 0,
                "schedule": {
                    "clock": "CLOCK_LAST_RUN_TIME",
                    "cron": "0 0 1 * *"  # Monthly check
                }
            },
            "commandPrefix": {
                "ioNice": "IO_DEFAULT",
                "cpuNice": "CPU_DEFAULT"
            },
            "autoUnlock": False,
            "hooks": []
        }
        
        logger.info(f"Repository data: {json.dumps(data)}")
        return self._make_request('post', endpoint, data)
    
    def get_repositories(self):
        """Get list of repositories"""
        # Changed from GetRepositories to GetConfig
        endpoint = "/v1.Backrest/GetConfig"
        response = self._make_request('post', endpoint, {})
        
        # The repositories should be in the config
        if 'repositories' in response:
            return response['repositories']
        return []
    
    def create_plan(self, repository_id, name, paths, excludes=None, schedule=None, retention_policy=None, backup_flags=None):
        """Create a backup plan in Backrest"""
        if excludes is None:
            excludes = []
        
        try:
            # First get the current configuration to preserve modno
            current_config = self.get_config()
            logger.info(f"Got current config with modno={current_config.get('modno')}")
            
            # Generate a plan ID based on name
            plan_id = name.replace(" ", "_").lower()
            
            # Create a plan structure with ALL fields needed by Backrest
            backup_plan = {
                "id": plan_id,
                "repo": repository_id,
                "paths": paths,
                "excludes": excludes,
                "iexcludes": [],
                "hooks": [],
                "backup_flags": backup_flags or []
            }
            
            # Process schedule correctly - CHECK FOR DISABLED FIRST
            logger.info(f"Processing schedule: {schedule}")
            
            if schedule and isinstance(schedule, dict) and schedule.get('disabled') == True:
                # Handle explicitly disabled schedule
                logger.info("Setting DISABLED schedule")
                backup_plan["schedule"] = {
                    "disabled": True
                }
            elif schedule:
                # Process enabled schedule
                if isinstance(schedule, str):
                    # For string format (e.g. "0 1 * * 1")
                    cleaned_schedule = schedule.strip()
                    backup_plan["schedule"] = {
                        "clock": "CLOCK_LOCAL",
                        "cron": cleaned_schedule
                    }
                    logger.info(f"Adding schedule from string: '{cleaned_schedule}'")
                elif isinstance(schedule, dict):
                    # For dictionary format with non-disabled schedule
                    backup_plan["schedule"] = {
                        "clock": schedule.get("clock", "CLOCK_LOCAL")
                    }
                    
                    # Only add cron if not disabled
                    if "cron" in schedule:
                        backup_plan["schedule"]["cron"] = schedule["cron"]
                    elif not schedule.get("disabled"):
                        # Only set default if not disabled
                        backup_plan["schedule"]["cron"] = "0 1 * * 1"  # Default weekly
                else:
                    # Unexpected type
                    logger.warning(f"Unexpected schedule type: {type(schedule)}. Using default disabled.")
                    backup_plan["schedule"] = {
                        "disabled": True
                    }
            else:
                # No schedule provided - disable by default
                backup_plan["schedule"] = {
                    "disabled": True
                }
            
            # Process retention policy correctly - FIX THE POLICYKEEPALL CHECK
            logger.info(f"Processing retention policy: {retention_policy}")
            
            if retention_policy:
                # First check for policyKeepAll (from frontend)
                if 'policyKeepAll' in retention_policy and retention_policy['policyKeepAll'] is True:
                    logger.info("Setting 'policyKeepAll' retention policy")
                    backup_plan["retention"] = {
                        "policyKeepAll": True
                    }
                # Then check for keep_all (alternative format)
                elif 'keep_all' in retention_policy and retention_policy['keep_all']:
                    logger.info("Setting 'keep_all' retention policy")
                    backup_plan["retention"] = {
                        "policyKeepAll": True
                    }
                # Finally check for other policy types
                elif 'policyKeepLastN' in retention_policy:
                    backup_plan["retention"] = {
                        "policyKeepLastN": int(retention_policy['policyKeepLastN'])
                    }
                elif 'keep_last' in retention_policy and retention_policy['keep_last']:
                    backup_plan["retention"] = {
                        "policyKeepLastN": int(retention_policy['keep_last'])
                    }
                elif 'policyTimeBucketed' in retention_policy:
                    backup_plan["retention"] = {
                        "policyTimeBucketed": retention_policy['policyTimeBucketed']
                    }
                else:
                    # Time bucketed with individual fields
                    retention = {
                        "yearly": 0,
                        "monthly": 0,
                        "weekly": 0,
                        "daily": 0,
                        "hourly": 0,
                        "keepLastN": 7  # Default
                    }
                    
                    # Map field names from different formats
                    field_mapping = {
                        'keep_last': 'keepLastN',
                        'keep_hourly': 'hourly',
                        'keep_daily': 'daily',
                        'keep_weekly': 'weekly',
                        'keep_monthly': 'monthly',
                        'keep_yearly': 'yearly'
                    }
                    
                    # Process all possible field name formats
                    for django_field, backrest_field in field_mapping.items():
                        if django_field in retention_policy and retention_policy[django_field]:
                            retention[backrest_field] = int(retention_policy[django_field])
                    
                    backup_plan["retention"] = {
                        "policyTimeBucketed": retention
                    }
            else:
                # No retention policy provided - use policyKeepAll as default
                backup_plan["retention"] = {
                    "policyKeepAll": True
                }
            
            # LOG THE EXACT PLAN BEING CREATED FOR DEBUGGING
            logger.info(f"FINAL PLAN CONFIGURATION: {json.dumps(backup_plan, indent=2)}")
            
            # Ensure plans is initialized as an array
            if "plans" not in current_config:
                current_config["plans"] = []
                
            # Find index if plan already exists
            plan_index = None
            for i, plan in enumerate(current_config["plans"]):
                if isinstance(plan, dict) and plan.get("id") == plan_id:
                    plan_index = i
                    break
            
            if plan_index is not None:
                current_config["plans"][plan_index] = backup_plan
            else:
                current_config["plans"].append(backup_plan)
            
            # Send updated configuration
            response = self._make_request('post', '/v1.Backrest/SetConfig', current_config)
            return {"id": plan_id, "response": response}
        
        except Exception as e:
            logger.exception(f"Failed to create plan: {str(e)}")
            raise
    
    def update_plan(self, plan_id, repository_id, name, paths, excludes=None, schedule=None, retention_policy=None, backup_flags=None):
        """Update an existing backup plan in Backrest"""
        if excludes is None:
            excludes = []
        
        try:
            # Get current configuration to preserve modno and find the plan
            current_config = self.get_config()
            logger.info(f"Updating plan {plan_id} in config with modno={current_config.get('modno')}")
            
            # Find the plan to update
            if "plans" not in current_config:
                raise Exception(f"No plans found in configuration")
            
            plan_index = None
            for i, plan in enumerate(current_config["plans"]):
                if isinstance(plan, dict) and plan.get("id") == plan_id:
                    plan_index = i
                    break
            
            if plan_index is None:
                raise Exception(f"Plan {plan_id} not found in configuration")
            
            # Create updated plan structure
            updated_plan = {
                "id": plan_id,
                "repo": repository_id,
                "paths": paths,
                "excludes": excludes,
                "iexcludes": [],
                "hooks": [],
                "backup_flags": backup_flags or []
            }
            
            # Process schedule
            if schedule and isinstance(schedule, dict) and schedule.get('disabled') != True:
                if isinstance(schedule.get('cron'), str):
                    updated_plan["schedule"] = {
                        "clock": schedule.get("clock", "CLOCK_LOCAL"),
                        "cron": schedule["cron"]
                    }
                else:
                    updated_plan["schedule"] = {"disabled": True}
            else:
                updated_plan["schedule"] = {"disabled": True}
            
            # Process retention policy
            if retention_policy:
                if retention_policy.get('policyKeepAll'):
                    updated_plan["retention"] = {"policyKeepAll": True}
                elif retention_policy.get('keep_all'):
                    updated_plan["retention"] = {"policyKeepAll": True}
                elif retention_policy.get('policyKeepLastN'):
                    updated_plan["retention"] = {"policyKeepLastN": int(retention_policy['policyKeepLastN'])}
                elif retention_policy.get('keep_last'):
                    updated_plan["retention"] = {"policyKeepLastN": int(retention_policy['keep_last'])}
                else:
                    # Time bucketed retention
                    retention = {
                        "yearly": int(retention_policy.get('keep_yearly', 0)),
                        "monthly": int(retention_policy.get('keep_monthly', 0)),
                        "weekly": int(retention_policy.get('keep_weekly', 0)),
                        "daily": int(retention_policy.get('keep_daily', 0)),
                        "hourly": int(retention_policy.get('keep_hourly', 0)),
                        "keepLastN": int(retention_policy.get('keep_last', 7))
                    }
                    updated_plan["retention"] = {"policyTimeBucketed": retention}
            else:
                updated_plan["retention"] = {"policyKeepAll": True}
            
            logger.info(f"Updated plan configuration: {json.dumps(updated_plan, indent=2)}")
            
            # Replace the plan in the configuration
            current_config["plans"][plan_index] = updated_plan
            
            # Send updated configuration to Backrest
            response = self._make_request('post', '/v1.Backrest/SetConfig', current_config)
            return {"id": plan_id, "response": response}
        
        except Exception as e:
            logger.exception(f"Failed to update plan {plan_id}: {str(e)}")
            raise
    
    def _format_schedule(self, schedule):
        """Format schedule for Backrest API"""
        if not schedule:
            return {"disabled": True}
        
        # If it's a cron expression
        if isinstance(schedule, str):
            return {
                "cron": schedule,
                "clock": "CLOCK_LOCAL",
                "disabled": False
            }
        
        # Default to disabled schedule
        return {"disabled": True}
    
    def _format_retention_policy(self, retention_policy):
        """Format retention policy for Backrest API properly"""
        # Always initialize all fields to prevent the 'no policy' error
        result = {
            "keepLastN": 0,
            "hourly": 0,
            "daily": 0,
            "weekly": 0,
            "monthly": 0,
            "yearly": 0
        }
        
        # Map Django retention policy fields to Backrest fields
        field_mapping = {
            'keep_last': 'keepLastN',
            'keep_hourly': 'hourly',
            'keep_daily': 'daily',
            'keep_weekly': 'weekly',
            'keep_monthly': 'monthly',
            'keep_yearly': 'yearly'
        }
        
        # Only update fields that are provided
        for django_field, backrest_field in field_mapping.items():
            if django_field in retention_policy and retention_policy[django_field] is not None:
                result[backrest_field] = int(retention_policy[django_field])
        
        return result
    
    def trigger_backup(self, plan_id):
        """Trigger a backup for a plan with extended timeout"""
        data = {"value": plan_id}
        
        try:
            # Use a direct request with longer timeout and async behavior
            url = f"{self.base_url}/v1.Backrest/Backup"
            logger.info(f"Triggering backup for plan {plan_id} at {url}")
            
            # Make a non-blocking request - don't wait for backup to complete
            # Just ensure the request is successfully initiated
            response = requests.post(
                url, 
                json=data, 
                headers={'Content-Type': 'application/json'},
                timeout=5  # Short timeout just to start the backup
            )
            
            response.raise_for_status()
            
            # If we get here, the request was accepted (backup started)
            logger.info(f"Backup triggered successfully for plan {plan_id}")
            
            # Return a constructed operation ID based on plan ID
            import time
            operation_id = f"op_{plan_id}_{int(time.time())}"
            
            return {
                "status": "backup_started",
                "operation_id": operation_id,
                "plan_id": plan_id
            }
        
        except requests.exceptions.Timeout:
            # Don't treat timeout as a failure - the backup might still be running
            logger.info(f"Timeout while triggering backup for {plan_id} - this is normal, backup likely started")
            
            # Generate an operation ID for tracking
            import time, uuid
            operation_id = f"op_{plan_id}_{int(time.time())}_{uuid.uuid4().hex[:4]}"
            
            return {
                "status": "backup_initiated",
                "operation_id": operation_id,
                "plan_id": plan_id,
                "note": "Request timed out, but backup may be running. Check operations."
            }
            
        except Exception as e:
            logger.exception(f"Error triggering backup: {str(e)}")
            raise
    
    def get_operations(self, repository_id=None, plan_id=None):
        """Get operations from Backrest"""
        selector = {}
        if repository_id:
            selector['repositoryId'] = repository_id
        if plan_id:
            selector['planId'] = plan_id
            
        data = {"selector": selector}
        response = self._make_request('post', "/v1.Backrest/GetOperations", data)
        return response.get('operations', [])
    
    def get_snapshots(self, repository_id, plan_id=None):
        """Get snapshots for a repository"""
        # Changed from GetSnapshots to ListSnapshots
        endpoint = "/v1.Backrest/ListSnapshots"
        
        data = {
            "repo_id": repository_id
        }
        
        # Optional plan ID
        if plan_id:
            data["plan_id"] = plan_id
        
        response = self._make_request('post', endpoint, data)
        return response.get('snapshots', [])
    
    def discover_endpoints(self):
        """Try common endpoints to discover available API"""
        endpoints = [
            "/v1.Backrest/GetVersion",
            "/v1.Backrest/GetConfig",
            "/v1.Backrest/AddRepo", 
            "/v1.Backrest/Backup",
            "/v1.Backrest/GetOperations"
        ]
        
        results = {}
        for endpoint in endpoints:
            url = f"{self.base_url}{endpoint}"
            try:
                # Simple ping with empty data
                response = requests.post(url, json={}, timeout=5)
                results[endpoint] = {
                    "status": response.status_code,
                    "message": response.text[:100] if response.text else "No content"
                }
            except Exception as e:
                results[endpoint] = {"error": str(e)}
        
        return results
    
    def set_config(self, instance_id=None, users=None, disable_auth=False, data=None):
        """Set Backrest configuration with proper password handling"""
        endpoint = '/v1.Backrest/SetConfig'
        
        # If complete data is provided, use it directly
        if data:
            return self._make_request('post', endpoint, data)
        
        # Otherwise, first get current config to preserve modno and other fields
        try:
            current_config = self.get_config()
        except Exception as e:
            logger.warning(f"Error getting current config: {str(e)}")
            current_config = {}
        
        # Update only the specified fields
        if instance_id:
            current_config["instance"] = instance_id
        
        if "auth" not in current_config:
            current_config["auth"] = {}
        
        if users is not None:
            # FIXED: Don't double-hash passwords
            for user in users:
                # Check if password needs hashing
                if user.get("needsBcrypt") == True:
                    # Hash the password
                    password = user.get("passwordBcrypt", "")
                    user["passwordBcrypt"] = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
                    user["needsBcrypt"] = False
                # If needsBcrypt is False, password is already hashed - don't touch it
            
            current_config["auth"]["users"] = users
        
        current_config["auth"]["disabled"] = disable_auth
        
        return self._make_request('post', endpoint, current_config)

    def get_config(self):
        """Get the current Backrest configuration"""
        logger.info(f"Getting Backrest configuration")
        
        endpoint = "/v1.Backrest/GetConfig"
        return self._make_request('post', endpoint, {})
    
    def hash_user_password(username, password):
        """Utility function to consistently hash passwords for Backrest users"""
        try:
            # Hash the password with bcrypt
            hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            return {
                "name": username,
                "needsBcrypt": False,  # Already hashed
                "passwordBcrypt": hashed
            }
        except Exception as e:
            logger.error(f"Error hashing password for user {username}: {str(e)}")
            # Fallback - shouldn't normally happen
            return {
                "name": username,
                "needsBcrypt": True,
                "passwordBcrypt": password
            }
    
    def login(self, username, password):
        """Authenticate with Backrest API and get a session token"""
        endpoint = '/v1.Authentication/Login'
        data = {
            "username": username,
            "password": password
        }
        
        try:
            response = self._make_request('post', endpoint, data, auth_required=False)
            
            # Store the token in the service instance
            if 'token' in response:
                self.token = response['token']
                logger.info(f"Successfully authenticated as {username}")
            else:
                logger.warning(f"Authentication response did not contain token: {response}")
            
            return response
        except Exception as e:
            logger.error(f"Authentication failed: {str(e)}")
            raise
    
    def get_ssh_client(server):
        """Create an SSH client for a server"""
        import paramiko
        import tempfile
        import os
        
        try:
            # Create SSH client
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            # Get SSH key
            key_obj = server.ssh_key
            if not key_obj:
                logger.error(f"No SSH key configured for server {server.hostname}")
                return None
                
            # Create temporary key file
            temp_dir = tempfile.mkdtemp()
            key_path = os.path.join(temp_dir, 'id_rsa')
            with open(key_path, 'w') as f:
                f.write(key_obj.private_key)
            os.chmod(key_path, 0o600)
            
            # Connect to server
            client.connect(
                server.hostname,
                port=server.port,
                username=server.username,
                key_filename=key_path,
                timeout=10
            )
            
            return client
        except Exception as e:
            logger.error(f"Error connecting to server {server.hostname}: {str(e)}")
            return None
    
    def check_repository(self, repo_id):
        """
        Perform an integrity check on the repository
        
        Args:
            repo_id: The ID of the repository to check
        
        Returns:
            dict: Response containing status and output
        """
        try:
            # Create request payload
            payload = {
                "repo_id": repo_id,
                "task": 3  # TASK_CHECK = 3 from the DoRepoTaskRequest.Task enum
            }
            
            # Call the DoRepoTask endpoint
            response = self.client.post("/v1/DoRepoTask", json=payload)
            response.raise_for_status()
            
            # Get the operation ID from the response
            operation_id = response.json().get("id")
            
            if not operation_id:
                return {
                    "status": "error",
                    "output": "No operation ID returned from Backrest API"
                }
            
            # Poll for operation completion (this could be improved with a WebSocket listener)
            for _ in range(30):  # Wait for up to 5 minutes (30 * 10 seconds)
                time.sleep(10)
                
                # Get operation status
                operation = self.get_operation(operation_id)
                
                if operation.get("status") in ["completed", "success", "error", "failed"]:
                    # Get operation logs
                    logs_response = self.client.get(f"/v1/GetLogs?ref={operation.get('logref')}")
                    logs = logs_response.text if logs_response.ok else "No logs available"
                    
                    return {
                        "status": "success" if operation.get("status") in ["completed", "success"] else "error",
                        "output": logs
                    }
            
            return {
                "status": "timeout",
                "output": "Operation timed out"
            }
        except Exception as e:
            logger.exception(f"Error checking repository {repo_id}: {str(e)}")
            return {
                "status": "error",
                "output": f"Error checking repository: {str(e)}"
            }
    
    def list_snapshot_files(self, repo_id, snapshot_id, path='/'):
        """List files in a snapshot at a specific path"""
        try:
            request_data = {
                "repo": repo_id,
                "snapshotId": snapshot_id,
                "path": path
            }
            
            response = self._make_request(
                'post', 
                '/v1.Backrest/ListSnapshotFiles', 
                request_data
            )
            
            return response
            
        except Exception as e:
            logger.error(f"Failed to list snapshot files: {str(e)}")
            raise