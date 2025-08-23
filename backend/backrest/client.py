import requests
import json
from django.utils import timezone
import logging
from django.conf import settings
from .models import Server

logger = logging.getLogger(__name__)

class BackrestClient:
    """Client for interacting with Backrest API"""
    
    def __init__(self, server=None, base_url=None, auth=None):
        """
        Initialize with a Server model instance or direct URL
        
        Args:
            server: Server model instance with backrest installed
            base_url: Direct base URL (used if server not provided)
            auth: Optional tuple of (username, password) for basic auth
        """
        self.server = server
        self.auth = auth
        
        if server:
            # Use server-specific Backrest URL
            self.base_url = f"{server.get_backrest_url()}/v1"
            logger.debug(f"Initialized BackrestClient with server URL: {self.base_url}")
        elif base_url:
            # Use provided base URL
            self.base_url = base_url
            logger.debug(f"Initialized BackrestClient with base URL: {self.base_url}")
        else:
            # Default URL only for local development/testing
            self.base_url = getattr(settings, 'BACKREST_API_URL', 'http://localhost:9898')
            logger.warning(f"Using default Backrest URL - this should only happen in development")
        
        self.headers = {"Content-Type": "application/json"}
    
    def _handle_response(self, response):
        """Handle response and return JSON or raise exception"""
        if response.status_code != 200:
            logger.error(f"Backrest API error: {response.status_code} {response.text}")
            response.raise_for_status()
        return response.json()
    
    def _make_request(self, endpoint, method="POST", data=None):
        """Make request to Backrest API"""
        # Handle both legacy and new URL format
        if self.server:
            url = f"{self.base_url}.Backrest/{endpoint}"
        else:
            url = f"{self.base_url}/v1.Backrest/{endpoint}"
        
        try:
            logger.debug(f"Making {method} request to {url}")
            if method.upper() == "GET":
                response = requests.get(url, headers=self.headers, auth=self.auth)
            else:
                payload = json.dumps(data or {})
                response = requests.post(url, headers=self.headers, data=payload, auth=self.auth)
            
            return self._handle_response(response)
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Backrest API error: {str(e)}")
            raise

    # === EXISTING METHODS ===
    
    def get_version(self):
        """Get Backrest version"""
        try:
            if self.server:
                response = requests.get(f"{self.server.get_backrest_url()}/version")
            else:
                base = self.base_url.split('/v1')[0]  # Remove "/v1" if present
                response = requests.get(f"{base}/version")
            return self._handle_response(response)
        except Exception as e:
            logger.error(f"Error getting Backrest version: {e}")
            return None
    
    def create_repository(self, name, uri, password):
        """Create a new repository"""
        if self.server:
            url = f"{self.base_url}.Backrest/CreateRepo"
            payload = {
                "name": name,
                "uri": uri,
                "password": password
            }
            response = requests.post(url, json=payload)
            return self._handle_response(response)
        else:
            return self._make_request("CreateRepo", data={
                "name": name, 
                "uri": uri, 
                "password": password
            })
    
    def get_repositories(self):
        """Get list of repositories"""
        if self.server:
            url = f"{self.base_url}.Backrest/GetRepos"
            response = requests.post(url, json={})
            return self._handle_response(response)
        else:
            return self._make_request("GetRepos", data={})
    
    def create_plan(self, repository_id, name, paths, excludes=None, schedule=None, retention_policy=None):
        """Create a backup plan"""
        if self.server:
            url = f"{self.base_url}.Backrest/CreatePlan"
            payload = {
                "repoId": repository_id,
                "name": name,
                "paths": paths,
                "excludes": excludes or [],
                "schedule": schedule or {},
                "retentionPolicy": retention_policy or {}
            }
            response = requests.post(url, json=payload)
            return self._handle_response(response)
        else:
            return self._make_request("CreatePlan", data={
                "repoId": repository_id,
                "name": name,
                "paths": paths,
                "excludes": excludes or [],
                "schedule": schedule or {},
                "retentionPolicy": retention_policy or {}
            })
    
    def get_plans(self, repo_id=None):
        """Get backup plans"""
        if self.server:
            url = f"{self.base_url}.Backrest/GetPlans"
            payload = {}
            if repo_id:
                payload["repoId"] = repo_id
            response = requests.post(url, json=payload)
            return self._handle_response(response)
        else:
            payload = {}
            if repo_id:
                payload["repoId"] = repo_id
            return self._make_request("GetPlans", data=payload)
    
    def trigger_backup(self, plan_id):
        """Trigger a backup for a plan"""
        if self.server:
            url = f"{self.base_url}.Backrest/Backup"
            payload = {"value": plan_id}
            response = requests.post(url, json=payload)
            return self._handle_response(response)
        else:
            return self._make_request("Backup", data={"value": plan_id})
    
    def get_operations(self, last_n=None, selector=None, repo_id=None, plan_id=None, limit=100):
        """
        Get operations history
        
        Args:
            last_n: Number of latest operations to return
            selector: Custom selector dict
            repo_id: Repository ID for filtering
            plan_id: Plan ID for filtering
            limit: Maximum number of operations to return (legacy)
        """
        if self.server:
            url = f"{self.base_url}.Backrest/GetOperations"
            sel = {}
            if repo_id:
                sel["repoId"] = repo_id
            if plan_id:
                sel["planId"] = plan_id
                
            payload = {"selector": sel, "limit": limit}
            response = requests.post(url, json=payload)
            return self._handle_response(response)
        else:
            # Use combined selector if provided
            if selector is None:
                selector = {}
                if repo_id:
                    selector["repoId"] = repo_id
                if plan_id:
                    selector["planId"] = plan_id
            
            payload = {}
            if selector:
                payload["selector"] = selector
            if last_n:
                payload["lastN"] = last_n
            elif limit:
                payload["lastN"] = limit
                
            return self._make_request("GetOperations", data=payload)
    
    def get_operation(self, operation_id):
        """Get a specific operation"""
        if self.server:
            url = f"{self.base_url}.Backrest/GetOperation"
            payload = {"value": operation_id}
            response = requests.post(url, json=payload)
            return self._handle_response(response)
        else:
            return self._make_request("GetOperation", data={"value": operation_id})
    
    def get_snapshots(self, repo_id):
        """Get snapshots for a repository"""
        if self.server:
            url = f"{self.base_url}.Backrest/GetSnapshots"
            payload = {"value": repo_id}
            response = requests.post(url, json=payload)
            return self._handle_response(response)
        else:
            return self._make_request("ListSnapshots", data={"repoId": repo_id})
            
    # === NEW METHODS FROM EXTENDED IMPLEMENTATION ===
    
    def get_config(self):
        """Get Backrest configuration"""
        return self._make_request("GetConfig", data={})
    
    def add_repo(self, repo_data):
        """Add a new repository"""
        return self._make_request("AddRepo", data=repo_data)
    
    def get_summary_dashboard(self):
        """Get dashboard summary including statistics"""
        return self._make_request("GetSummaryDashboard", data={})
    
    def compute_stats(self, repo_id):
        """Trigger stats computation for a repository"""
        data = {
            "repoId": repo_id,
            "task": "TASK_STATS"
        }
        return self._make_request("DoRepoTask", data=data)
    
    def extract_stats_from_operations(self, repo_id, last_n=10):
        """Extract stats from operations history"""
        operations = self.get_operations(
            last_n=last_n, 
            selector={"repoId": repo_id}
        )
        
        for op in operations.get("operations", []):
            if op.get("status") == "STATUS_SUCCESS" and "operationRepoTask" in op:
                task_info = op.get("operationRepoTask", {})
                if task_info.get("task") == "TASK_STATS":
                    return self._process_stats_data(task_info)
        
        return None
    
    def _process_stats_data(self, task_info):
        """Process statistics data from task output"""
        stats = {}
        output = task_info.get("lastStatus", {}).get("output", {})
        
        if not output:
            return stats
        
        # Extract key statistics
        stats["total_size"] = output.get("totalSize", 0)
        stats["total_file_count"] = output.get("totalFileCount", 0)
        stats["total_blob_count"] = output.get("totalBlobCount", 0)
        stats["data_blobs"] = output.get("dataBlobs", 0)
        stats["tree_blobs"] = output.get("treeBlobs", 0)
        
        # Calculate compression ratio if available
        if "totalSize" in output and "totalSizeOnDisk" in output:
            total_size = output.get("totalSize", 0)
            size_on_disk = output.get("totalSizeOnDisk", 0)
            if size_on_disk > 0:
                stats["compression_ratio"] = total_size / size_on_disk
        
        return stats
    
    def list_snapshots(self, repo_id, plan_id=None):
        """List snapshots for a repository"""
        data = {
            "repoId": repo_id
        }
        if plan_id:
            data["planId"] = plan_id
            
        return self._make_request("ListSnapshots", data=data)
    
    def list_snapshot_files(self, repo_id, snapshot_id, path="/"):
        """List files in a snapshot"""
        data = {
            "repoId": repo_id,
            "snapshotId": snapshot_id,
            "path": path
        }
        
        try:
            return self._make_request("ListSnapshotFiles", data=data)
        except Exception as e:
            logger.error(f"Error listing snapshot files: {str(e)}")
            # Return empty structure if API call fails
            return {
                "entries": []
            }
    
    def restore_snapshot(self, repo_id, snapshot_id, path="/", target="", plan_id=""):
        """
        Restore files from a snapshot
        
        Args:
            repo_id: Repository ID
            snapshot_id: ID of the snapshot to restore from
            path: Path within snapshot to restore (default: root)
            target: Target directory to restore to (empty = auto-generate)
            plan_id: Optional plan ID
        """
        data = {
            "repoId": repo_id,
            "snapshotId": snapshot_id,
            "path": path,
            "target": target,
            "planId": plan_id
        }
        return self._make_request("Restore", data=data)
    
    def cancel_operation(self, operation_id):
        """Cancel an operation by ID"""
        data = {
            "value": operation_id
        }
        return self._make_request("Cancel", data=data)
    
    def get_logs(self, ref):
        """
        Get logs for an operation
        Note: This is a streaming endpoint, so we need special handling
        """
        if self.server:
            url = f"{self.base_url}.Backrest/GetLogs"
        else:
            url = f"{self.base_url}/v1.Backrest/GetLogs"
            
        data = {
            "ref": ref
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=data, auth=self.auth, stream=True)
            response.raise_for_status()
            
            # Collect all chunks
            log_data = b''
            for chunk in response.iter_content(chunk_size=4096):
                if chunk:
                    log_data += chunk
            
            # Try to parse as JSON
            try:
                return json.loads(log_data)
            except json.JSONDecodeError:
                # Return as text if not valid JSON
                return log_data.decode('utf-8')
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error getting logs: {str(e)}")
            raise