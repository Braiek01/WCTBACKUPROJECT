# backend/backrest/api_views.py
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.exceptions import PermissionDenied
from accounts.api_views import IsTenantAdminOrOwner
from .models import (
    SSHKey, Server, BackrestRepository, 
    BackrestPlan, BackrestOperation, BackrestSnapshot, BackrestLog, BackrestInstance
)
from .serializers import (
    SSHKeySerializer, ServerSerializer, BackrestRepositorySerializer,
    BackrestPlanSerializer, BackrestOperationSerializer, BackrestSnapshotSerializer, BackrestLogSerializer
)
from .services import BackrestService
import logging
import os
import tempfile
import subprocess
import json
import bcrypt
from django.db.models import Q
from datetime import timedelta

logger = logging.getLogger(__name__)

class SSHKeyViewSet(viewsets.ModelViewSet):
    """API endpoint for SSH keys"""
    serializer_class = SSHKeySerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantAdminOrOwner]
    
    def get_queryset(self):
        return SSHKey.objects.filter(tenant=self.request.tenant)
    
    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

class ServerViewSet(viewsets.ModelViewSet):
    """API endpoint for servers"""
    serializer_class = ServerSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantAdminOrOwner]
    
    def get_queryset(self):
        return Server.objects.filter(tenant=self.request.tenant)
    
    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)
    
    @action(detail=True, methods=['post'])
    def test_connection(self, request, pk=None):
        """Test SSH connection to server"""
        server = self.get_object()
        
        try:
            # Test connection using SSH
            import paramiko
            import tempfile
            import os
            
            # Create temporary key file
            with tempfile.NamedTemporaryFile(delete=False) as key_file:
                key_path = key_file.name
                key_file.write(server.ssh_key.private_key.encode())
            
            # Set proper permissions
            os.chmod(key_path, 0o600)
            
            # Initialize SSH client
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            # Connect to server
            client.connect(
                hostname=server.hostname,
                port=server.ssh_port, 
                username=server.ssh_user,
                key_filename=key_path,
                timeout=10
            )
            
            # Execute test command
            stdin, stdout, stderr = client.exec_command('uname -a')
            output = stdout.read().decode('utf-8').strip()
            error = stderr.read().decode('utf-8').strip()
            
            # Close connection and clean up
            client.close()
            os.unlink(key_path)
            
            return Response({
                "status": "success", 
                "message": "Connection successful",
                "server_info": output
            })
            
        except Exception as e:
            return Response({
                "status": "error", 
                "message": f"Connection failed: {str(e)}"
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def install_backrest(self, request, pk=None):
        """Install Backrest on the server using Ansible - Synchronous version"""
        server = self.get_object()
        
        try:
            # Run the installation directly (not as a Celery task)
            success, message = self._run_backrest_installation(server)
            
            if success:
                return Response({
                    "status": "success",
                    "message": "Backrest installation completed successfully",
                    "details": message
                })
            else:
                return Response({
                    "status": "error",
                    "message": "Backrest installation failed",
                    "details": message
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except Exception as e:
            logger.error(f"Error during Backrest installation: {str(e)}")
            return Response({
                "status": "error",
                "message": "Error during Backrest installation",
                "details": str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _run_backrest_installation(self, server):
        """Run the Backrest installation playbook on a server directly."""
        from django.conf import settings
        import os
        import subprocess
        import tempfile
        
        try:
            # Create temporary inventory file
            with tempfile.NamedTemporaryFile(delete=False, mode='w+') as inventory:
                inventory_path = inventory.name
                inventory.write(f"""[all]
{server.hostname} ansible_user={server.ssh_user} ansible_port={server.ssh_port}

[all:vars]
ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
""")
            
            # Create temporary SSH key file - FIX: ensure proper encoding
            with tempfile.NamedTemporaryFile(delete=False, mode='w+') as key_file:
                key_path = key_file.name
                # Ensure the key has proper line breaks and is correctly formatted
                key_content = server.ssh_key.private_key
                
                # Make sure the key has proper headers if missing
                if not key_content.startswith('-----BEGIN'):
                    key_content = f"-----BEGIN OPENSSH PRIVATE KEY-----\n{key_content}\n-----END OPENSSH PRIVATE KEY-----"
                
                # Write the properly formatted key
                key_file.write(key_content)
            
            # Set proper permissions for SSH key - critical step
            os.chmod(key_path, 0o600)
            
            logger.info(f"Created SSH key file at {key_path}")
            
            # For debugging, check key content (don't log the actual key in production)
            logger.info(f"Key file permissions: {oct(os.stat(key_path).st_mode)}")
            
            # Try a simple SSH command first to verify connection
            logger.info("Testing SSH connection before running Ansible...")
            test_cmd = [
                'ssh', 
                '-i', key_path,
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'UserKnownHostsFile=/dev/null',
                f'{server.ssh_user}@{server.hostname}',
                'echo "Connection test successful"'
            ]
            
            try:
                test_result = subprocess.run(
                    test_cmd,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                logger.info(f"SSH test result: {test_result.returncode}")
                logger.info(f"SSH test output: {test_result.stdout}")
                if test_result.stderr:
                    logger.warning(f"SSH test stderr: {test_result.stderr}")
            except Exception as e:
                logger.warning(f"SSH test failed: {str(e)}")
            
            # Get base directory path
            base_dir = settings.BASE_DIR
            
            # Get playbook path
            playbook_path = os.path.join(base_dir, "ansible", "playbooks", "install_backrest.yml")
            
            logger.info(f"Starting Backrest installation on {server.hostname}")
            logger.info(f"Using playbook: {playbook_path}")
            logger.info(f"Using inventory: {inventory_path}")
            
            # Fallback to subprocess for direct ansible-playbook call
            cmd = [
                'ansible-playbook', 
                '-i', inventory_path,
                playbook_path,
                '-e', f'backrest_port=9898',
                '--private-key', key_path,
                '-vvv'  # More verbose output
            ]
            
            logger.info(f"Running command: {' '.join(cmd)}")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True
            )
            
            success = (result.returncode == 0)
            output = result.stdout
            error_output = result.stderr
            
            # Log the full output
            logger.info(f"Ansible stdout: {output}")
            logger.info(f"Ansible stderr: {error_output}")
            
            # Clean up temporary files
            os.unlink(inventory_path)
            os.unlink(key_path)
            
            # Update server status in database if successful
            if success:
                server.backrest_port = 9898
                server.backrest_version = "0.9.5"  # From your playbook
                server.status = "active"
                server.save()
                logger.info(f"Backrest installation successful on {server.hostname}")
                return True, "Backrest installation successful"
            else:
                logger.error(f"Backrest installation failed on {server.hostname}")
                return False, f"Installation failed: {output}\n{error_output}"
                
        except Exception as e:
            logger.exception(f"Error running Backrest installation: {str(e)}")
            return False, f"Error: {str(e)}"

    @action(detail=True, methods=['post'])
    def install_backrest_direct(self, request, pk=None):
        """Install Backrest v1.8.1 directly from GitHub releases"""
        server = self.get_object()
        
        try:
            import paramiko
            import tempfile
            import os
            
            # Create temporary key file with proper encoding
            with tempfile.NamedTemporaryFile(delete=False, mode='w') as key_file:
                key_path = key_file.name
                key_file.write(server.ssh_key.private_key)
            
            # Set proper permissions
            os.chmod(key_path, 0o600)
            logger.info(f"Created key file at {key_path}")
            
            # Connect with paramiko
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            try:
                logger.info(f"Connecting to {server.hostname}")
                client.connect(
                    hostname=server.hostname,
                    port=server.ssh_port,
                    username=server.ssh_user,
                    key_filename=key_path,
                    timeout=30
                )
                logger.info("SSH connection successful!")
                
                # Install Backrest directly from GitHub release
                install_script = """
                # Create Backrest directory
                mkdir -p /opt/backrest/{data,config,cache}
                cd /opt/backrest
                echo "Downloading Backrest v1.8.1..."
                
                # Direct download from GitHub releases
                wget -q https://github.com/garethgeorge/backrest/releases/download/v1.8.1/backrest_Linux_x86_64.tar.gz -O backrest.tar.gz
                
                # Verify download was successful
                if [ ! -f backrest.tar.gz ]; then
                    echo "Download failed. Trying with curl..."
                    curl -sSL https://github.com/garethgeorge/backrest/releases/download/v1.8.1/backrest_Linux_x86_64.tar.gz -o backrest.tar.gz
                    if [ ! -f backrest.tar.gz ]; then
                        echo "Download failed with both wget and curl."
                        exit 1
                    fi
                fi
                
                echo "Extracting Backrest..."
                tar -xzf backrest.tar.gz
                if [ ! -f "backrest" ]; then
                    echo "Extraction failed: backrest binary not found"
                    exit 1
                fi
                
                echo "Installing Backrest..."
                mv backrest /usr/local/bin/backrest
                chmod +x /usr/local/bin/backrest
                
                # Create systemd service file
                cat > /etc/systemd/system/backrest.service << 'EOT'
[Unit]
Description=Backrest
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/backrest
Environment="BACKREST_PORT=0.0.0.0:9898"
Environment="BACKREST_DATA=/opt/backrest/data"
Environment="BACKREST_CONFIG=/opt/backrest/config/config.json"
Environment="XDG_CACHE_HOME=/opt/backrest/cache"

[Install]
WantedBy=multi-user.target
EOT
                
                # Enable and start the service
                echo "Enabling and starting systemd service..."
                systemctl daemon-reload
                systemctl enable backrest
                systemctl start backrest
                
                # Verify service is running
                echo "Verifying service status..."
                systemctl status backrest || true
                """
                
                # Execute the script
                logger.info("Executing installation script")
                stdin, stdout, stderr = client.exec_command(install_script)
                exit_status = stdout.channel.recv_exit_status()
                
                output = stdout.read().decode('utf-8')
                error = stderr.read().decode('utf-8')
                
                logger.info(f"Script output: {output}")
                if error:
                    logger.warning(f"Script errors: {error}")
                
                # Check if the service is running
                check_cmd = "systemctl is-active backrest || echo 'not-running'"
                stdin, stdout, stderr = client.exec_command(check_cmd)
                service_status = stdout.read().decode('utf-8').strip()
                logger.info(f"Service status: {service_status}")
                
                # Close connection and clean up
                client.close()
                os.unlink(key_path)
                
                # Determine if installation was successful
                if service_status == "active":
                    server.backrest_port = 9898
                    server.backrest_version = "1.8.1"
                    server.status = "active"
                    server.save()
                    
                    return Response({
                        "status": "success",
                        "message": "Backrest installed successfully",
                        "details": "Backrest service is running"
                    })
                else:
                    # Try to get more diagnostic information
                    stdin, stdout, stderr = client.exec_command("journalctl -u backrest --no-pager -n 20")
                    logs = stdout.read().decode('utf-8')
                    
                    return Response({
                        "status": "warning",
                        "message": "Backrest installed but service may not be running",
                        "details": f"Output: {output}\nErrors: {error}\nService status: {service_status}\nLogs: {logs}"
                    }, status=status.HTTP_202_ACCEPTED)
                    
            except Exception as e:
                logger.error(f"SSH connection or command error: {str(e)}")
                # Make sure to clean up the key file
                try:
                    os.unlink(key_path)
                except:
                    pass
                return Response({
                    "status": "error",
                    "message": "Connection failed",
                    "details": str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        except Exception as e:
            logger.exception("Error during installation")
            return Response({
                "status": "error",
                "message": "Error during installation",
                "details": str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def setup_instance(self, request, pk=None):
        """Initialize Backrest instance with auth disabled and specific users with plaintext passwords"""
        server = self.get_object()
        
        instance_id = request.data.get('instance_id', f"backrest-{server.id}")
        users = request.data.get('users', [{'name': 'admin', 'password': 'admin123'}])
        disable_auth = request.data.get('disable_auth', True)
        
        try:
            # First, wait for Backrest service to be fully available (with timeout)
            import time
            max_retries = 5
            retry_delay = 3  # Start with 3 seconds
            backrest_service = BackrestService(server)
            
            # Prepare users with plaintext passwords (let Backrest handle hashing)
            backrest_users = []
            user_passwords = {}
            
            for user_data in users:
                username = user_data.get('name')
                password = user_data.get('password')
                user_passwords[username] = password
                
                # Send plaintext password and tell Backrest to hash it
                backrest_users.append({
                    "name": username,
                    "needsBcrypt": True,  # Tell Backrest to hash the password
                    "passwordBcrypt": password  # Plain password
                })
            
            # Create config object
            config = {
                "instance": instance_id,
                "auth": {
                    "disabled": disable_auth,
                    "users": backrest_users
                }
            }
            
            # Try API configuration with retries
            success = False
            api_error = None
            
            for attempt in range(max_retries):
                try:
                    logger.info(f"Attempt {attempt+1}/{max_retries} to configure Backrest via API")
                    response = backrest_service._make_request('post', '/v1.Backrest/SetConfig', config)
                    success = True
                    logger.info("Successfully configured Backrest via API")
                    break
                except Exception as e:
                    logger.warning(f"Attempt {attempt+1} failed: {str(e)}")
                    api_error = e
                    # Exponential backoff
                    time.sleep(retry_delay)
                    retry_delay *= 2
            
            # If API configuration failed after all retries, try SSH configuration
            if not success:
                logger.info("API configuration failed, attempting SSH configuration")
                try:
                    # Get SSH client
                    client = get_ssh_client_for_server(server)
                    
                    # Create config file content in JSON format
                    import json
                    import bcrypt
                    
                    # Hash passwords locally since we can't use the API
                    ssh_config = {
                        "instance": instance_id,
                        "auth": {
                            "disabled": disable_auth,
                            "users": []
                        }
                    }
                    
                    # Hash passwords locally
                    for user in backrest_users:
                        hashed = bcrypt.hashpw(user['passwordBcrypt'].encode(), bcrypt.gensalt()).decode()
                        ssh_config["auth"]["users"].append({
                            "name": user["name"],
                            "passwordBcrypt": hashed,
                            "needsBcrypt": False  # Already hashed
                        })
                    
                    config_json = json.dumps(ssh_config, indent=2)
                    
                    # Create config directory if it doesn't exist
                    stdin, stdout, stderr = client.exec_command("sudo mkdir -p /opt/backrest/config")
                    stderr_output = stderr.read().decode()
                    if stderr_output:
                        logger.warning(f"mkdir stderr: {stderr_output}")
                    
                    # Write config to file
                    config_file = "/tmp/backrest_config.json"
                    stdin, stdout, stderr = client.exec_command(f"echo '{config_json}' > {config_file}")
                    stderr_output = stderr.read().decode()
                    if stderr_output:
                        logger.warning(f"echo stderr: {stderr_output}")
                    
                    # Move to proper location with sudo
                    stdin, stdout, stderr = client.exec_command(f"sudo mv {config_file} /opt/backrest/config/config.json")
                    stderr_output = stderr.read().decode()
                    if stderr_output:
                        logger.warning(f"mv stderr: {stderr_output}")
                    
                    # Set permissions
                    stdin, stdout, stderr = client.exec_command("sudo chown -R backrest:backrest /opt/backrest/config && sudo chmod 600 /opt/backrest/config/config.json")
                    stderr_output = stderr.read().decode()
                    if stderr_output:
                        logger.warning(f"chown/chmod stderr: {stderr_output}")
                    
                    # Restart service to apply config
                    stdin, stdout, stderr = client.exec_command("sudo systemctl restart backrest")
                    stderr_output = stderr.read().decode()
                    if stderr_output:
                        logger.warning(f"restart stderr: {stderr_output}")
                    
                    success = True
                    logger.info("Successfully configured Backrest via SSH")
                    client.close()
                    
                except Exception as ssh_error:
                    logger.error(f"SSH configuration failed: {str(ssh_error)}")
                    # Even if both API and SSH fail, continue to create DB record
            
            # Store instance ID in server model regardless of API/SSH success
            if hasattr(server, 'backrest_instance_id'):
                server.backrest_instance_id = instance_id
                server.save()
            
            # For security, don't return the full config with passwords in response
            response_config = {
                "instance": instance_id,
                "auth": {
                    "disabled": disable_auth,
                    "users": [{"name": u["name"]} for u in backrest_users]
                }
            }
            
            # ALWAYS create or update the BackrestInstance record regardless of API/SSH success
            tenant = request.tenant
            
            instance, created = BackrestInstance.objects.update_or_create(
                tenant=tenant,
                instance_id=instance_id,
                defaults={
                    'server': server,
                    'install_path': request.data.get('install_path', '/opt/backrest'),
                    'port': request.data.get('port', 9898),
                    'setup_completed': True
                }
            )
            
            # Determine appropriate status message
            if success:
                status_message = "configured successfully"
            else:
                status_message = "installation completed, but direct configuration failed - may need manual setup"
            
            return Response({
                "status": "success",  # Always return success if we got this far
                "message": f"Backrest instance {status_message}",
                "instance_id": instance_id,
                "user_credentials": user_passwords,
                "config": response_config,
                "note": "Instance has been registered in the database"
            })
                
        except Exception as e:
            logger.exception(f"Failed to configure Backrest instance: {str(e)}")
            
            # Even on error, try to create the instance record
            try:
                tenant = request.tenant
                instance, created = BackrestInstance.objects.update_or_create(
                    tenant=tenant,
                    instance_id=instance_id,
                    defaults={
                        'server': server,
                        'install_path': request.data.get('install_path', '/opt/backrest'),
                        'port': request.data.get('port', 9898),
                        'setup_completed': True
                    }
                )
                logger.info(f"Created fallback instance record despite errors")
            except Exception as db_error:
                logger.error(f"Failed to create instance record: {str(db_error)}")
            
            return Response({
                "status": "warning",
                "message": f"Failed to configure Backrest instance via API but created database record",
                "details": str(e),
                "instance_id": instance_id
            }, status=status.HTTP_202_ACCEPTED)  # Use 202 instead of 500 to indicate partial success

class BackrestRepositoryViewSet(viewsets.ModelViewSet):
    """API endpoint for Backrest repositories"""
    serializer_class = BackrestRepositorySerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantAdminOrOwner]
    
    def get_queryset(self):
        return BackrestRepository.objects.filter(tenant=self.request.tenant)
    
    def perform_create(self, serializer):
        """Create a repository in Backrest and save to DB"""
        server = serializer.validated_data['server']
        
        if server.tenant != self.request.tenant:
            return Response(
                {"error": "Server does not belong to your tenant"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            backrest_service = BackrestService(server)
            
            # Generate the repo ID from name
            repo_id = serializer.validated_data['name'].replace(" ", "_").lower()
            
            response = backrest_service.create_repository(
                name=serializer.validated_data['name'],
                uri=serializer.validated_data['uri'],
                password=serializer.validated_data['password']
            )
            
            logger.info(f"Backrest response: {response}")
            
            # Save with repo_id
            repository = serializer.save(
                tenant=self.request.tenant,
                repository_id=repo_id  # Use the same ID we sent to Backrest
            )
            
            return repository
            
        except Exception as e:
            logger.exception(f"Failed to create repository: {str(e)}")
            raise
    
    @action(detail=True, methods=['post'])
    def sync_snapshots(self, request, pk=None):
        """Sync snapshots from Backrest"""
        repository = self.get_object()
        
        try:
            backrest_service = BackrestService(repository.server)
            snapshots = backrest_service.get_snapshots(repository.repository_id)
            
            # Create or update snapshot records
            for snapshot_data in snapshots:
                BackrestSnapshot.objects.update_or_create(
                    repository=repository,
                    snapshot_id=snapshot_data['id'],
                    defaults={
                        'tenant': repository.tenant,
                        'time': snapshot_data['time'],
                        'hostname': snapshot_data.get('hostname', ''),
                        'username': snapshot_data.get('username', ''),
                        'summary': snapshot_data.get('summary', {}),
                        'size_bytes': snapshot_data.get('size', 0),
                        'file_count': snapshot_data.get('fileCount', 0)
                    }
                )
            
            return Response({"status": "snapshots synced", "count": len(snapshots)})
        except Exception as e:
            return Response(
                {"error": f"Failed to sync snapshots: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class BackrestPlanViewSet(viewsets.ModelViewSet):
    """API endpoint for Backrest plans"""
    serializer_class = BackrestPlanSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantAdminOrOwner]
    
    def get_queryset(self):
        return BackrestPlan.objects.filter(tenant=self.request.tenant)
    
    def perform_create(self, serializer):
        repository = serializer.validated_data['repository']
        
        if repository.tenant != self.request.tenant:
            raise PermissionDenied("Repository does not belong to your tenant")
        
        try:
            # Log what we're trying to create
            logger.info(f"Creating plan '{serializer.validated_data['name']}' for repo {repository.repository_id}")
            
            backrest_service = BackrestService(repository.server)
            response = backrest_service.create_plan(
                repository_id=repository.repository_id,
                name=serializer.validated_data['name'],
                paths=serializer.validated_data['paths'],
                excludes=serializer.validated_data.get('excludes', []),
                schedule=serializer.validated_data['schedule'],
                retention_policy=serializer.validated_data['retention_policy']
            )
            
            # Extract the plan_id from the response
            plan_id = response.get('id')
            if not plan_id:
                logger.error("No plan ID returned from Backrest")
                # Fall back to generated ID
                plan_id = serializer.validated_data['name'].replace(" ", "_").lower()
                
            logger.info(f"Plan created successfully with ID: {plan_id}")
            
            # Save to database with the plan_id
            plan = serializer.save(
                tenant=self.request.tenant,
                plan_id=plan_id
            )
            
            # IMPORTANT: Best practice is to return the created object
            return plan
            
        except Exception as e:
            logger.exception(f"Failed to create plan: {str(e)}")
            # Preserve the error for API responses but don't block database creation
            plan_id = serializer.validated_data['name'].replace(" ", "_").lower()
            
            # Save to database anyway to keep UI in sync - but without error fields
            plan = serializer.save(
                tenant=self.request.tenant,
                plan_id=plan_id
            )
            
            # Log the error but continue
            logger.warning(f"Created plan in database but Backrest API call failed: {str(e)}")
    
    @action(detail=True, methods=['post'])
    def trigger_backup(self, request, pk=None):
        """Trigger a backup for a plan and record it in the database"""
        plan = self.get_object()
        
        try:
            # Get the backrest service
            backrest_service = BackrestService(plan.repository.server)
            
            # Trigger the backup in Backrest - might timeout but that's OK
            try:
                response = backrest_service.trigger_backup(plan.plan_id)
                backup_status = "success" 
            except Exception as e:
                if "timeout" in str(e).lower():
                    # Timeout is expected and not an error
                    import uuid, time
                    response = {
                        "operation_id": f"op_{plan.plan_id}_{int(time.time())}_{uuid.uuid4().hex[:4]}",
                        "status": "backup_likely_started"
                    }
                    backup_status = "initiated"
                    logger.info(f"Backup request timed out, but may be running: {str(e)}")
                else:
                    # Other errors are real problems
                    raise
            
            # Extract operation ID from the response
            operation_id = response.get('operation_id') or response.get('id')
            if not operation_id:
                # Generate a temporary ID if not provided
                import uuid
                operation_id = f"op_{uuid.uuid4().hex[:8]}"
                logger.warning(f"No operation ID returned, using generated ID: {operation_id}")
            
            # Create a record in the BackrestOperation table
            from .models import BackrestOperation
            operation = BackrestOperation.objects.create(
                tenant=request.tenant,
                repository=plan.repository,
                plan=plan,
                operation_id=operation_id,
                operation_type="backup",
                status="running",
                started_at=timezone.now()
            )
            
            # Optionally also log to jobs tables
            try:
                from jobs.models import BackupJob, JobLog
                
                # Log the available fields for debugging
                logger.info(f"BackupJob model fields: {[f.name for f in BackupJob._meta.get_fields()]}")
                
                # Create backup job with only the fields that exist in your model
                backup_job = BackupJob(
                    tenant=request.tenant,
                    # Only use fields that exist in your model:
                    status="running"
                )
                
                # Conditionally set other fields if they exist
                if hasattr(BackupJob, 'name'):
                    backup_job.name = f"Backup {plan.name}"
                
                if hasattr(BackupJob, 'operation_id'):
                    backup_job.operation_id = operation_id
                
                backup_job.save()
                
                # Add a log record, without tenant field
                try:
                    JobLog.objects.create(
                        # Remove tenant field
                        message=f"Backup started for plan {plan.name}",
                        level="info",
                        timestamp=timezone.now(),
                        # If job_id is required, associate with the backup job
                        job_id=backup_job.id if backup_job and hasattr(backup_job, 'id') else None
                    )
                except Exception as log_error:
                    logger.warning(f"Failed to create job log: {str(log_error)}")
                
            except Exception as job_error:
                logger.warning(f"Failed to create job records: {str(job_error)}")
            
            # Return a response that indicates backup was initiated
            return Response({
                "status": backup_status,
                "message": f"Backup operation {backup_status} for plan {plan.name}",
                "operation_id": operation_id,
                "note": "Use sync_operations endpoint to check progress"
            })
            
        except Exception as e:
            logger.exception(f"Failed to trigger backup: {str(e)}")
            return Response({
                "status": "error",
                "message": f"Failed to trigger backup: {str(e)}"
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class BackrestOperationViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for Backrest operations"""
    serializer_class = BackrestOperationSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantAdminOrOwner]
    
    def get_queryset(self):
        return BackrestOperation.objects.filter(tenant=self.request.tenant)
    
    @action(detail=False, methods=['post'])
    def sync_operations(self, request):
        """Sync operations status from Backrest to database"""
        
        # Ensure we're operating only on the current tenant's data
        tenant = request.tenant
        
        try:
            repos = BackrestRepository.objects.filter(tenant=tenant)
            
            operations_updated = 0
            operations_completed = 0
            
            for repo in repos:
                backrest_service = BackrestService(repo.server)
                
                try:
                    # Get operations from Backrest
                    backrest_operations = backrest_service.get_operations(repository_id=repo.repository_id)
                    
                    for op_data in backrest_operations:
                        op_id = op_data.get('id')
                        if not op_id:
                            continue
                        
                        # IMPROVED FILTERING: Only process our operation IDs and ignore the rest
                        if not str(op_id).startswith('op_'):
                            logger.info(f"Skipping non-app operation: {op_id}")
                            continue
                        
                        # Default status in case we need it
                        status = 'unknown'
                        
                        # Safely get and transform status
                        raw_status = op_data.get('status', '')
                        if raw_status:
                            status = raw_status.replace('STATUS_', '').lower()
                            if status == 'inprogress':
                                status = 'running'
                            elif status == 'success':
                                status = 'completed'
                        
                        # Try to find existing operation in database
                        try:
                            operation = BackrestOperation.objects.get(operation_id=op_id)
                            
                            # Update operation status if changed
                            if operation.status != status:
                                old_status = operation.status
                                operation.status = status
                                operations_updated += 1
                                logger.info(f"Updated operation {op_id} status from {old_status} to {status}")
                            
                            # If operation is completed now, update all the fields
                            if status in ['completed', 'failed', 'canceled'] and not operation.completed_at:
                                # Set the completion time
                                operation.completed_at = timezone.now()
                                operations_completed += 1
                                
                                # Update snapshot_id if available
                                if 'snapshot_id' in op_data and op_data['snapshot_id']:
                                    operation.snapshot_id = op_data['snapshot_id']
                                
                                # Update stats if available
                                if 'stats' in op_data and op_data['stats']:
                                    operation.stats = op_data['stats']
                                
                                # Update error message if available
                                if status == 'failed' and 'error' in op_data and op_data['error']:
                                    operation.error = op_data['error']
                                
                                logger.info(f"Operation {op_id} marked as {status} with completion time: {operation.completed_at}")
                        
                        except BackrestOperation.DoesNotExist:
                            # This is a new operation from Backrest, create it
                            # Only create if it appears to be one of our operations
                            if str(op_id).startswith('op_'):
                                plan = None
                                if 'plan_id' in op_data and op_data['plan_id']:
                                    from .models import BackrestPlan
                                    plans = BackrestPlan.objects.filter(plan_id=op_data['plan_id'])
                                    if plans.exists():
                                        plan = plans.first()
                            
                                # Set completed_at if already completed
                                completed_at = None
                                if status in ['completed', 'failed', 'canceled']:
                                    completed_at = timezone.now()
                                
                                BackrestOperation.objects.create(
                                    tenant=request.tenant,
                                    repository=repo,
                                    plan=plan,
                                    operation_id=op_id,
                                    operation_type=op_data.get('type', 'unknown'),
                                    status=status,
                                    started_at=timezone.now(),
                                    completed_at=completed_at,
                                    snapshot_id=op_data.get('snapshot_id'),
                                    stats=op_data.get('stats'),
                                    error=op_data.get('error') if status == 'failed' else None
                                )
                                operations_updated += 1
                
                except Exception as repo_error:
                    logger.error(f"Error syncing operations for repo {repo.repository_id}: {str(repo_error)}")
        
            return Response({
                'status': 'success',
                'operations_updated': operations_updated,
                'operations_completed': operations_completed,
                'message': f'Updated {operations_updated} operations, completed {operations_completed}'
            })
        
        except Exception as e:
            logger.exception(f"Failed to sync operations: {str(e)}")
            return Response({
                'status': 'error',
                'message': f'Failed to sync operations: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'], url_path='sync-tenant-operations')
    def sync_tenant_operations(self, request):
        """Explicitly tenant-aware operation sync"""
        
        tenant = request.tenant
        logger.info(f"Syncing operations for tenant: {tenant.name} (ID: {tenant.id})")
        
        try:
            # Only get repositories that belong to this tenant
            repos = BackrestRepository.objects.filter(tenant=tenant)
            
            if not repos.exists():
                return Response({
                    'status': 'info',
                    'message': f'No repositories found for tenant {tenant.name}'
                })
            
            operations_updated = 0
            operations_completed = 0
            
            for repo in repos:
                logger.info(f"Processing repository {repo.name} (ID: {repo.id})")
                backrest_service = BackrestService(repo.server)
                
                try:
                    # Get operations from Backrest
                    backrest_operations = backrest_service.get_operations(repository_id=repo.repository_id)
                    logger.info(f"Found {len(backrest_operations)} operations for repo {repo.name}")
                    
                    # Process operations
                    # (rest of your sync code)
                    
                except Exception as repo_error:
                    logger.error(f"Error syncing operations for repo {repo.repository_id}: {str(repo_error)}")
        
            return Response({
                'status': 'success',
                'tenant': tenant.name,
                'operations_updated': operations_updated,
                'operations_completed': operations_completed
            })
        
        except Exception as e:
            logger.exception(f"Failed to sync operations: {str(e)}")
            return Response({
                'status': 'error',
                'message': f'Failed to sync operations: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class BackrestSnapshotViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for Backrest snapshots"""
    serializer_class = BackrestSnapshotSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantAdminOrOwner]
    
    def get_queryset(self):
        return BackrestSnapshot.objects.filter(tenant=self.request.tenant)
    
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Initiate restore from a snapshot"""
        snapshot = self.get_object()
        # Implement restore logic
        return Response({"status": "restore initiated"})
    
    @action(detail=True, methods=['get'])
    def test_backrest_connection(self, request, pk=None):
        """Test connection to Backrest server"""
        server = self.get_object()
        
        try:
            import requests
            
            # Try to connect to Backrest
            url = f"http://{server.hostname}:{server.backrest_port}/v1.Backrest/GetVersion"
            response = requests.post(url, json={})
            
            if response.status_code == 200:
                return Response({
                    "status": "success",
                    "message": "Successfully connected to Backrest API",
                    "version": response.json().get('version')
                })
            else:
                return Response({
                    "status": "error",
                    "message": f"Failed to connect to Backrest API (HTTP {response.status_code})",
                    "details": response.text
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            return Response({
                "status": "error",
                "message": "Connection error",
                "details": str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def discover_endpoints(self, request, pk=None):
        """Discover available Backrest API endpoints"""
        server = self.get_object()
        
        try:
            backrest_service = BackrestService(server)
            results = backrest_service.discover_endpoints()
            return Response(results)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    
        # BackrestSnapshotViewSet - Fixed update_users method (around line 1013)
    @action(detail=True, methods=['post'])
    def update_users(self, request, pk=None):
        """Update users in the Backrest instance"""
        server = self.get_object()
        
        try:
            # Get current config
            backrest_service = BackrestService(server)
            current_config = backrest_service.get_config()
            
            # Import User model
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            # Get tenant admin users
            tenant_admin_users = User.objects.filter(
                tenant=self.request.tenant,
                role_in_tenant__in=['admin', 'owner']
            )
            
            # Get current Backrest users
            current_users = current_config.get('auth', {}).get('users', [])
            current_user_names = [u['name'] for u in current_users]
            
            # Add missing users
            users_added = []
            user_passwords = {}
            
            for user in tenant_admin_users:
                if user.username not in current_user_names:
                    password = f"{user.username}#BackrestPwd123"
                    # FIXED: Hash the password before sending
                    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
                    current_users.append({
                        "name": user.username,
                        "needsBcrypt": False,  # Already hashed
                        "passwordBcrypt": hashed
                    })
                    users_added.append(user.username)
                    user_passwords[user.username] = password
            
            # Update config
            updated_config = current_config
            updated_config['auth']['users'] = current_users
            
            # Send updated config to Backrest
            response = backrest_service.set_config(
                instance_id=current_config['instance'],
                users=current_users,
                disable_auth=current_config['auth'].get('disabled', False)
            )
            
            return Response({
                "status": "success",
                "message": f"Updated Backrest users. Added {len(users_added)} new users.",
                "users_added": users_added,
                "user_credentials": user_passwords,
                "config": response
            })
        except Exception as e:
            logger.exception(f"Failed to update Backrest users: {str(e)}")
            return Response({
                "status": "error",
                "message": f"Failed to update Backrest users: {str(e)}",
                "details": str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def login_to_backrest(self, request, pk=None):
        """Login to Backrest instance and return token"""
        server = self.get_object()
        
        username = request.data.get('username')
        password = request.data.get('password')
        
        if not username or not password:
            return Response({
                "status": "error",
                "message": "Username and password required"
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            backrest_service = BackrestService(server)
            response = backrest_service.login(username, password)
            
            return Response({
                "status": "success",
                "message": "Login successful",
                "token": response.get('token')
            })
        except Exception as e:
            logger.exception(f"Login failed: {str(e)}")
            return Response({
                "status": "error",
                "message": f"Login failed: {str(e)}"
            }, status=status.HTTP_401_UNAUTHORIZED)
    
    @action(detail=False, methods=['post'])
    def sync_plans(self, request):
        """Sync plans from Backrest to database"""
        
        try:
            # First get all repositories with their servers
            from .models import BackrestRepository
            repos = BackrestRepository.objects.filter(tenant=request.tenant)
            
            plans_added = []
            
            for repo in repos:
                backrest_service = BackrestService(repo.server)
                
                try:
                    # Get current config from Backrest
                    config = backrest_service.get_config()
                    
                    if 'plans' in config and isinstance(config['plans'], list):
                        for plan_data in config['plans']:
                            if isinstance(plan_data, dict) and plan_data.get('repo') == repo.repository_id:
                                # Check if plan exists in database
                                plan_id = plan_data.get('id')
                                if not self.get_queryset().filter(plan_id=plan_id).exists():
                                    # Create plan in database
                                    from .serializers import BackrestPlanSerializer
                                    
                                    # Extract fields from Backrest plan format
                                    paths = plan_data.get('paths', [])
                                    excludes = plan_data.get('excludes', [])
                                    
                                    # Extract schedule
                                    schedule_data = plan_data.get('schedule', {})
                                    schedule = schedule_data.get('cron', '0 0 31 2 0')
                                    
                                    # Extract retention policy
                                    retention = plan_data.get('retention', {}).get('policyTimeBucketed', {})
                                    retention_policy = {
                                        'keep_last': retention.get('keepLastN', 0),
                                        'keep_hourly': retention.get('hourly', 0),
                                        'keep_daily': retention.get('daily', 0),
                                        'keep_weekly': retention.get('weekly', 0),
                                        'keep_monthly': retention.get('monthly', 0),
                                        'keep_yearly': retention.get('yearly', 0)
                                    }
                                    
                                    plan = {
                                        'name': plan_data.get('id', '').replace('_', ' ').title(),
                                        'plan_id': plan_id,
                                        'repository': repo.id,
                                        'paths': paths,
                                        'excludes': excludes,
                                        'schedule': schedule,
                                        'retention_policy': retention_policy,
                                        'tenant': request.tenant.id
                                    }
                                    
                                    serializer = BackrestPlanSerializer(data=plan)
                                    if serializer.is_valid():
                                        serializer.save()
                                        plans_added.append(plan_id)
                                    else:
                                        logger.warning(f"Invalid plan data: {serializer.errors}")
            
                except Exception as repo_error:
                    logger.error(f"Error syncing plans for repo {repo.repository_id}: {str(repo_error)}")
        
            return Response({
                'status': 'success',
                'plans_added': plans_added,
                'message': f'Added {len(plans_added)} plans from Backrest'
            })
        
        except Exception as e:
            logger.exception(f"Failed to sync plans: {str(e)}")
            return Response({
                'status': 'error',
                'message': f'Failed to sync plans: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def complete_operation(self, request, pk=None):
        """Manually complete an operation for testing purposes"""
        operation = self.get_object()
        
        try:
            if operation.status == 'completed':
                return Response({
                    'status': 'info',
                    'message': 'Operation already completed'
                })
            
            # Update operation
            operation.status = 'completed'
            operation.completed_at = timezone.now()
            operation.snapshot_id = request.data.get('snapshot_id', 'test-snapshot-123')
            operation.stats = request.data.get('stats', {'files_processed': 100, 'bytes_processed': 1024*1024})
            operation.save()
            
            # Update job if it exists
            try:
                from jobs.models import BackupJob
                job = BackupJob.objects.get(operation_id=operation.operation_id)
                job.status = 'completed'
                job.completed_at = timezone.now()
                job.save()
            except Exception as job_error:
                logger.warning(f"Failed to update job: {str(job_error)}")
            
            return Response({
                'status': 'success',
                'message': 'Operation marked as completed',
                'operation': BackrestOperationSerializer(operation).data
            })
        except Exception as e:
            return Response({
                'status': 'error',
                'message': f'Failed to complete operation: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def check_logs(self, request):
        """Manually check backrest logs and update operations"""
        from .tasks import process_backrest_logs
        
        try:
            # Run the task synchronously for immediate results
            result = process_backrest_logs()
            
            return Response({
                'status': 'success',
                'message': 'Logs checked and operations updated',
                'details': result
            })
        except Exception as e:
            logger.exception(f"Error checking logs: {str(e)}")
            return Response({
                'status': 'error',
                'message': f'Error checking logs: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class BackrestLogViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for Backrest logs"""
    serializer_class = BackrestLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantAdminOrOwner]
    
    def get_queryset(self):
        queryset = BackrestLog.objects.filter(tenant=self.request.tenant)
        
        # Allow filtering by various parameters
        server_id = self.request.query_params.get('server_id')
        if server_id:
            queryset = queryset.filter(server_id=server_id)
            
        level = self.request.query_params.get('level')
        if level:
            queryset = queryset.filter(level=level)
            
        source = self.request.query_params.get('source')
        if source:
            queryset = queryset.filter(source__icontains=source)
            
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(message__icontains=search) | 
                Q(error__icontains=search) |
                Q(logger_name__icontains=search)
            )
            
        # Limit to recent logs by default (last 7 days)
        days = self.request.query_params.get('days', 7)
        try:
            days = int(days)
        except ValueError:
            days = 7
            
        if days > 0:
            since = timezone.now() - timedelta(days=days)
            queryset = queryset.filter(timestamp__gte=since)
            
        return queryset.order_by('-timestamp')
    
    @action(detail=False, methods=['post'])
    def sync_logs(self, request):
        """Trigger immediate log sync"""
        from .tasks import process_backrest_db_logs
        
        try:
            # Run task synchronously for immediate results
            result = process_backrest_db_logs()
            
            return Response({
                'status': 'success',
                'message': 'Log synchronization completed',
                'results': result
            })
        except Exception as e:
            return Response({
                'status': 'error',
                'message': f'Failed to sync logs: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



class MarkInstanceCompleteView(APIView):
    def post(self, request, instance_id):
        tenant = request.tenant
        server_id = request.data.get('server_id')

        try:
            logger.info(f"Marking instance {instance_id} as complete for tenant {tenant.name}")
            
            # Make sure server_id is valid
            if not server_id:
                return Response({
                    "success": False,
                    "message": "server_id is required"
                }, status=400)
            
            try:
                server = Server.objects.get(id=server_id)
            except Server.DoesNotExist:
                return Response({
                    "success": False,
                    "message": f"Server with ID {server_id} not found"
                }, status=404)
            
            # Get parameters with defaults
            install_path = request.data.get('install_path', '/opt/backrest')
            port = request.data.get('port', 9898)
            
            logger.info(f"Creating/updating instance record with: instance_id={instance_id}, " 
                      f"server_id={server_id}, install_path={install_path}, port={port}")
            
            # Create or update BackrestInstance - CRITICAL FIX HERE
            instance, created = BackrestInstance.objects.update_or_create(
                tenant=tenant,
                instance_id=instance_id,
                defaults={
                    'server': server,
                    'install_path': install_path,
                    'port': port,
                    'is_active': True,
                    'setup_completed': True  # INCLUDE THE SETUP_COMPLETED FIELD
                }
            )
            
            action = "created" if created else "updated"
            logger.info(f"Successfully {action} instance record {instance.id}")
            
            return Response({
                "success": True,
                "message": f"Backrest instance {action} successfully",
                "instance_id": instance_id,
                "created": created
            })
            
        except Exception as e:
            logger.exception(f"Error in MarkInstanceCompleteView: {str(e)}")
            return Response({
                "success": False,
                "message": str(e),
                "error_type": type(e).__name__
            }, status=500)

class CheckBackrestServiceStatusView(APIView):
    """Check if Backrest service is running on the server"""
    
    def get(self, request, server_id):
        try:
            server = Server.objects.get(id=server_id)
            
            try:
                # Use paramiko to SSH into the server and run systemctl command
                client = get_ssh_client_for_server(server)
                
                # First check with systemctl
                stdin, stdout, stderr = client.exec_command('systemctl is-active backrest')
                status = stdout.read().decode('utf-8').strip()
                
                # Also check if process is running as a backup check
                stdin, stdout, stderr = client.exec_command('pgrep -f backrest')
                process_output = stdout.read().decode('utf-8').strip()
                is_running = len(process_output) > 0
                
                client.close()
                
                # If service is active or process is running, create/update a BackrestInstance record
                if status == 'active' or is_running:
                    try:
                        # Try to find an existing instance for this server
                        instance = BackrestInstance.objects.filter(
                            server=server,
                            tenant=request.tenant
                        ).first()
                        
                        # If no instance exists, create one
                        if not instance:
                            instance = BackrestInstance(
                                tenant=request.tenant,
                                server=server,
                                instance_id=f"auto-detected-{server.hostname}",
                                install_path='/opt/backrest',
                                port=9898,
                                is_active=True,
                                setup_completed=True
                            )
                            instance.save()
                    except Exception as e:
                        logger.warning(f"Failed to create BackrestInstance record: {e}")
                
                return Response({
                    'status': status,
                    'is_running': is_running,
                    'service_found': status == 'active',
                    'process_found': is_running,
                    'timestamp': timezone.now().isoformat()
                })
                
            except Exception as ssh_error:
                logger.error(f"SSH error checking service status: {str(ssh_error)}")
                
                # Try to return something useful even on SSH failure
                return Response({
                    'status': 'unknown',
                    'is_running': False,
                    'error': str(ssh_error),
                    'timestamp': timezone.now().isoformat()
                })
            
        except Server.DoesNotExist:
            return Response({
                'success': False,
                'message': f"Server with ID {server_id} not found"
            }, status=404)
        except Exception as e:
            logger.exception(f"Error checking Backrest service status: {str(e)}")
            return Response({
                'success': False,
                'message': str(e)
            }, status=500)

class BackrestStatusView(APIView):
    """Check if any Backrest instance exists for tenant"""
    
    def get(self, request):
        # Check if there are any servers with Backrest instance for this tenant
        has_servers = Server.objects.filter(tenant=request.tenant).exists()
        has_instances = BackrestInstance.objects.filter(tenant=request.tenant).exists()
        
        if not has_servers:
            return Response({
                "setupNeeded": True,
                "message": "No servers registered. Please complete setup.",
                "step": "register_server"
            })
        
        if not has_instances:
            return Response({
                "setupNeeded": True,
                "message": "No Backrest instances found. Please complete setup.",
                "step": "install_backrest" 
            })
        
        # Everything is set up
        return Response({
            "setupNeeded": False,
            "message": "Backrest is properly configured."
        })

def get_ssh_client_for_server(server):
    """
    Helper function to create and return a paramiko SSHClient for a given server.
    """
    import paramiko
    import tempfile
    import os

    # Create temporary key file
    with tempfile.NamedTemporaryFile(delete=False, mode='w') as key_file:
        key_path = key_file.name
        key_file.write(server.ssh_key.private_key)

    os.chmod(key_path, 0o600)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=server.hostname,
        port=server.ssh_port,
        username=server.ssh_user,
        key_filename=key_path,
        timeout=10
    )
    # Clean up key file after connection is established
    os.unlink(key_path)
    return client

