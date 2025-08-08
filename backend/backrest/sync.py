# backend/backrest/sync.py
import logging
from django.utils import timezone
from django_tenants.utils import tenant_context
import json
from datetime import datetime
from .client import BackrestClient
from .models import BackrestRepository, BackrestOperation, BackrestSnapshot, BackrestStats

logger = logging.getLogger(__name__)

def sync_repositories():
    """Sync repositories from all Backrest servers to the database"""
    from tenants.models import Tenant
    
    logger.info("Starting repository sync")
    results = {}
    
    for tenant in Tenant.objects.filter(is_active=True).exclude(schema_name='public'):
        try:
            with tenant_context(tenant):
                from .models import Server, BackrestRepository
                from .services import BackrestService
                
                repos_added = 0
                repos_updated = 0
                
                # Get all servers for this tenant
                servers = Server.objects.filter(tenant=tenant, status='backrest_installed')
                
                for server in servers:
                    try:
                        # Connect to Backrest service
                        service = BackrestService(server)
                        
                        # Get repository data
                        repositories = service.list_repositories()
                        
                        # Update local database
                        for repo_data in repositories:
                            repo_id = repo_data.get('id')
                            if not repo_id:
                                continue
                                
                            # Check if repository exists
                            repo, created = BackrestRepository.objects.get_or_create(
                                repository_id=repo_id,
                                server=server,
                                defaults={
                                    'tenant': tenant,
                                    'name': repo_data.get('name', repo_id)
                                }
                            )
                            
                            if created:
                                repos_added += 1
                            else:
                                # Update fields
                                repo.name = repo_data.get('name', repo_id)
                                repo.save()
                                repos_updated += 1
                                
                    except Exception as e:
                        logger.error(f"Error syncing repositories for server {server.hostname}: {str(e)}")
                        
                results[tenant.name] = {
                    "status": "success", 
                    "repositories_added": repos_added,
                    "repositories_updated": repos_updated
                }
                
        except Exception as e:
            logger.exception(f"Error syncing repositories for tenant {tenant.name}")
            results[tenant.name] = {"status": "error", "error": str(e)}
    
    return results

def sync_operations(last_n=None):
    """Sync operations from all Backrest repositories"""
    from tenants.models import Tenant
    
    logger.info("Starting operations sync")
    results = {}
    
    for tenant in Tenant.objects.filter(is_active=True).exclude(schema_name='public'):
        try:
            with tenant_context(tenant):
                from .models import BackrestRepository, BackrestOperation, BackrestPlan
                from .services import BackrestService
                
                operations_added = 0
                operations_updated = 0
                
                repos = BackrestRepository.objects.filter(tenant=tenant)
                
                for repo in repos:
                    try:
                        # Get Backrest service
                        service = BackrestService(repo.server)
                        
                        # Get operations from Backrest API
                        operations = service.get_operations(repository_id=repo.repository_id, last_n=last_n)
                        
                        # Process each operation
                        for op_data in operations:
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
                                    # Try to create plan if found in config
                                    try:
                                        config = service.get_config()
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
                                    except Exception as e:
                                        logger.warning(f"Could not create plan {plan_id}: {str(e)}")
                            
                            # Check for existing operation
                            try:
                                operation = BackrestOperation.objects.get(operation_id=op_id)
                                
                                # Update operation status
                                operation.status = status
                                
                                # Set completion time if newly completed
                                if status in ['completed', 'failed', 'canceled'] and not operation.completed_at:
                                    operation.completed_at = timezone.now()
                                
                                # Update snapshot ID and stats
                                if 'snapshot_id' in op_data and op_data['snapshot_id']:
                                    operation.snapshot_id = op_data['snapshot_id']
                                if 'stats' in op_data and op_data['stats']:
                                    operation.stats = op_data['stats']
                                
                                operation.save()
                                operations_updated += 1
                                
                            except BackrestOperation.DoesNotExist:
                                # Create new operation
                                operation = BackrestOperation(
                                    tenant=tenant,
                                    repository=repo,
                                    plan=plan,
                                    operation_id=op_id,
                                    operation_type=op_type,
                                    status=status,
                                    started_at=timezone.now(),  # Approximate start time
                                )
                                
                                # Set snapshot ID and stats if available
                                if 'snapshot_id' in op_data and op_data['snapshot_id']:
                                    operation.snapshot_id = op_data['snapshot_id']
                                if 'stats' in op_data and op_data['stats']:
                                    operation.stats = op_data['stats']
                                
                                # Set completion time if already done
                                if status in ['completed', 'failed', 'canceled']:
                                    operation.completed_at = timezone.now()
                                
                                operation.save()
                                operations_added += 1
                                
                    except Exception as e:
                        logger.error(f"Error syncing operations for repo {repo.name}: {str(e)}")
                        
                results[tenant.name] = {
                    "status": "success", 
                    "operations_added": operations_added,
                    "operations_updated": operations_updated
                }
                
        except Exception as e:
            logger.exception(f"Error syncing operations for tenant {tenant.name}")
            results[tenant.name] = {"status": "error", "error": str(e)}
    
    return results

def sync_snapshots():
    """Sync snapshots from all Backrest repositories"""
    from tenants.models import Tenant
    
    logger.info("Starting snapshots sync")
    results = {}
    
    for tenant in Tenant.objects.filter(is_active=True).exclude(schema_name='public'):
        try:
            with tenant_context(tenant):
                from .models import BackrestRepository, BackrestSnapshot
                from .services import BackrestService
                
                snapshots_added = 0
                snapshots_updated = 0
                
                repos = BackrestRepository.objects.filter(tenant=tenant)
                
                for repo in repos:
                    try:
                        # Connect to Backrest service
                        service = BackrestService(repo.server)
                        
                        # Get snapshots from API
                        snapshots_response = service.get_snapshots(repo.repository_id)
                        snapshots = snapshots_response.get('snapshots', [])
                        
                        # Process each snapshot
                        for snap in snapshots:
                            snap_id = snap.get('id')
                            if not snap_id:
                                continue
                                
                            # Parse timestamp
                            timestamp = timezone.now()
                            if 'unixTimeMs' in snap:
                                try:
                                    ms = int(snap['unixTimeMs'])
                                    timestamp = timezone.datetime.fromtimestamp(ms / 1000)
                                except (ValueError, TypeError):
                                    pass
                            
                            # Get summary data
                            summary = snap.get('summary', {})
                            
                            # Check if snapshot exists in DB
                            try:
                                snapshot = BackrestSnapshot.objects.get(snapshot_id=snap_id)
                                
                                # Update snapshot
                                snapshot.timestamp = timestamp
                                snapshot.hostname = snap.get('hostname', '')
                                snapshot.username = snap.get('username', '')
                                snapshot.paths = json.dumps(snap.get('paths', []))
                                snapshot.tags = json.dumps(snap.get('tags', []))
                                snapshot.tree = snap.get('tree', '')
                                snapshot.summary = summary
                                snapshot.save()
                                
                                snapshots_updated += 1
                                
                            except BackrestSnapshot.DoesNotExist:
                                # Create new snapshot
                                BackrestSnapshot.objects.create(
                                    tenant=tenant,
                                    repository=repo,
                                    snapshot_id=snap_id,
                                    timestamp=timestamp,
                                    hostname=snap.get('hostname', ''),
                                    username=snap.get('username', ''),
                                    paths=json.dumps(snap.get('paths', [])),
                                    tags=json.dumps(snap.get('tags', [])),
                                    tree=snap.get('tree', ''),
                                    summary=summary
                                )
                                
                                snapshots_added += 1
                                
                    except Exception as e:
                        logger.error(f"Error syncing snapshots for repo {repo.name}: {str(e)}")
                        
                results[tenant.name] = {
                    "status": "success", 
                    "snapshots_added": snapshots_added,
                    "snapshots_updated": snapshots_updated
                }
                
        except Exception as e:
            logger.exception(f"Error syncing snapshots for tenant {tenant.name}")
            results[tenant.name] = {"status": "error", "error": str(e)}
    
    return results

def sync_repositories_for_server(server):
    """Sync repositories for a specific server"""
    from .services import BackrestService
    from .models import BackrestRepository
    
    try:
        service = BackrestService(server)
        repos_added = 0
        repos_updated = 0
        
        repositories = service.list_repositories()
        
        for repo_data in repositories:
            repo_id = repo_data.get('id')
            if not repo_id:
                continue
                
            repo, created = BackrestRepository.objects.get_or_create(
                repository_id=repo_id,
                server=server,
                defaults={
                    'tenant': server.tenant,
                    'name': repo_data.get('name', repo_id)
                }
            )
            
            if created:
                repos_added += 1
            else:
                repo.name = repo_data.get('name', repo_id)
                repo.save()
                repos_updated += 1
                
        return {
            "status": "success",
            "repositories_added": repos_added,
            "repositories_updated": repos_updated
        }
        
    except Exception as e:
        logger.error(f"Error syncing repositories for server {server.hostname}: {str(e)}")
        return {"status": "error", "error": str(e)}

def sync_operations_for_server(server):
    """Sync operations for repositories on a specific server"""
    from .models import BackrestRepository
    
    try:
        repos = BackrestRepository.objects.filter(server=server)
        ops_added = 0
        ops_updated = 0
        
        for repo in repos:
            result = sync_operations_for_repository(repo)
            if result.get('status') == 'success':
                ops_added += result.get('operations_added', 0)
                ops_updated += result.get('operations_updated', 0)
                
        return {
            "status": "success",
            "operations_added": ops_added,
            "operations_updated": ops_updated
        }
        
    except Exception as e:
        logger.error(f"Error syncing operations for server {server.hostname}: {str(e)}")
        return {"status": "error", "error": str(e)}

def sync_operations_for_repository(repo, last_n=50):
    """Sync operations for a specific repository"""
    from .models import BackrestOperation, BackrestPlan
    from .services import BackrestService
    
    try:
        service = BackrestService(repo.server)
        operations = service.get_operations(repository_id=repo.repository_id, last_n=last_n)
        
        operations_added = 0
        operations_updated = 0
        
        for op_data in operations:
            op_id = op_data.get('id')
            if not op_id:
                continue
                
            # Determine operation type & status
            op_type = op_data.get('type', '').lower().replace('type_', '')
            if not op_type:
                op_type = 'unknown'
                
            status = 'unknown'
            raw_status = op_data.get('status', '')
            if raw_status:
                status = raw_status.replace('STATUS_', '').lower()
                if status == 'inprogress':
                    status = 'running'
                elif status == 'success':
                    status = 'completed'
            
            # Get associated plan
            plan = None
            plan_id = op_data.get('plan_id')
            if plan_id:
                try:
                    plan = BackrestPlan.objects.get(plan_id=plan_id)
                except BackrestPlan.DoesNotExist:
                    # Try to create from config
                    pass
            
            # Create or update operation
            op, created = BackrestOperation.objects.update_or_create(
                operation_id=op_id,
                defaults={
                    'tenant': repo.tenant,
                    'repository': repo,
                    'plan': plan,
                    'operation_type': op_type,
                    'status': status,
                    'snapshot_id': op_data.get('snapshot_id', ''),
                    'stats': op_data.get('stats', {})
                }
            )
            
            # Set timestamps
            if created:
                op.started_at = timezone.now()
                operations_added += 1
            else:
                operations_updated += 1
                
            if status in ['completed', 'failed', 'canceled'] and not op.completed_at:
                op.completed_at = timezone.now()
                
            op.save()
            
        return {
            "status": "success",
            "operations_added": operations_added,
            "operations_updated": operations_updated
        }
        
    except Exception as e:
        logger.error(f"Error syncing operations for repository {repo.name}: {str(e)}")
        return {"status": "error", "error": str(e)}

def sync_all_servers():
    """Sync data from all active Backrest servers"""
    from tenants.models import Tenant
    from .models import Server
    
    results = {}
    
    for tenant in Tenant.objects.filter(is_active=True).exclude(schema_name='public'):
        try:
            with tenant_context(tenant):
                servers = Server.objects.filter(tenant=tenant, status='backrest_installed')
                
                for server in servers:
                    server_id = server.id
                    try:
                        # Sync repositories and operations
                        repo_result = sync_repositories_for_server(server)
                        op_result = sync_operations_for_server(server)
                        
                        results[server_id] = {
                            "server": server.hostname,
                            "repositories": repo_result,
                            "operations": op_result
                        }
                        
                    except Exception as e:
                        results[server_id] = {
                            "server": server.hostname,
                            "error": str(e)
                        }
                        
        except Exception as e:
            logger.exception(f"Error processing tenant {tenant.name}")
            
    return results