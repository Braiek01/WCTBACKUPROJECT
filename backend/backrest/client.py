import requests
import json
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

class BackrestClient:
    """Client for interacting with Backrest API"""
    
    def __init__(self, server):
        """Initialize with a Server model instance"""
        self.server = server
        self.base_url = f"{server.get_backrest_url()}/v1"
    
    def _handle_response(self, response):
        """Handle response and return JSON or raise exception"""
        if response.status_code != 200:
            logger.error(f"Backrest API error: {response.status_code} {response.text}")
            response.raise_for_status()
        return response.json()
    
    def get_version(self):
        """Get Backrest version"""
        try:
            response = requests.get(f"{self.server.get_backrest_url()}/version")
            return self._handle_response(response)
        except Exception as e:
            logger.error(f"Error getting Backrest version: {e}")
            return None
    
    def create_repository(self, name, uri, password):
        """Create a new repository"""
        url = f"{self.base_url}.Backrest/CreateRepo"
        payload = {
            "name": name,
            "uri": uri,
            "password": password
        }
        response = requests.post(url, json=payload)
        return self._handle_response(response)
    
    def get_repositories(self):
        """Get list of repositories"""
        url = f"{self.base_url}.Backrest/GetRepos"
        response = requests.post(url, json={})
        return self._handle_response(response)
    
    def create_plan(self, repository_id, name, paths, excludes=None, schedule=None, retention_policy=None):
        """Create a backup plan"""
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
    
    def get_plans(self, repo_id=None):
        """Get backup plans"""
        url = f"{self.base_url}.Backrest/GetPlans"
        payload = {}
        if repo_id:
            payload["repoId"] = repo_id
        response = requests.post(url, json=payload)
        return self._handle_response(response)
    
    def trigger_backup(self, plan_id):
        """Trigger a backup for a plan"""
        url = f"{self.base_url}.Backrest/Backup"
        payload = {"value": plan_id}
        response = requests.post(url, json=payload)
        return self._handle_response(response)
    
    def get_operations(self, repo_id=None, plan_id=None, limit=100):
        """Get operations"""
        url = f"{self.base_url}.Backrest/GetOperations"
        selector = {}
        if repo_id:
            selector["repoId"] = repo_id
        if plan_id:
            selector["planId"] = plan_id
            
        payload = {"selector": selector, "limit": limit}
        response = requests.post(url, json=payload)
        return self._handle_response(response)
    
    def get_operation(self, operation_id):
        """Get a specific operation"""
        url = f"{self.base_url}.Backrest/GetOperation"
        payload = {"value": operation_id}
        response = requests.post(url, json=payload)
        return self._handle_response(response)
    
    def get_snapshots(self, repo_id):
        """Get snapshots for a repository"""
        url = f"{self.base_url}.Backrest/GetSnapshots"
        payload = {"value": repo_id}
        response = requests.post(url, json=payload)
        return self._handle_response(response)