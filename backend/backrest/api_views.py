# backend/backrest/api_views.py
import time
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
    BackrestPlan, BackrestOperation, BackrestSnapshot, BackrestLog, BackrestInstance, SystemOperation
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
from .client import BackrestClient

client = BackrestClient()

logger = logging.getLogger(__name__)

def process_log_timestamp(timestamp_value):
    """Process a timestamp value to ensure it's timezone-aware"""
    if isinstance(timestamp_value, (int, float)):
        # If it's a Unix timestamp (seconds since epoch)
        dt = datetime.fromtimestamp(timestamp_value)
        return timezone.make_aware(dt)
    elif isinstance(timestamp_value, str):
        # If it's a string timestamp
        try:
            dt = datetime.datetime.fromisoformat(timestamp_value.replace('Z', '+00:00'))
            if timezone.is_naive(dt):
                return timezone.make_aware(dt)
            return dt
        except (ValueError, TypeError):
            # Fallback parsing
            try:
                dt = datetime.datetime.strptime(timestamp_value, "%Y-%m-%d %H:%M:%S.%f")
                return timezone.make_aware(dt)
            except (ValueError, TypeError):
                # Another common format
                try:
                    dt = datetime.datetime.strptime(timestamp_value, "%Y-%m-%d %H:%M:%S")
                    return timezone.make_aware(dt)
                except (ValueError, TypeError):
                    pass
    
    # If all parsing fails, return current time
    return timezone.now()

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
        """Initialize Backrest instance with auth ENABLED and properly hashed passwords"""
        server = self.get_object()
        
        instance_id = request.data.get('instance_id', f"backrest-{server.id}")
        users = request.data.get('users', [{'name': 'admin', 'password': 'admin123'}])
        disable_auth = request.data.get('disable_auth', False)  # CHANGE: Enable auth by default
        
        try:
            # First, wait for Backrest service to be fully available
            import time
            max_retries = 5
            retry_delay = 3
            backrest_service = BackrestService(server)
            
            # FIXED: Prepare users with PRE-HASHED passwords
            backrest_users = []
            user_passwords = {}
            
            for user_data in users:
                username = user_data.get('name')
                password = user_data.get('password')
                
                # Store plaintext password for response
                user_passwords[username] = password
                
                # PRE-HASH the password and tell Backrest NOT to hash it again
                import bcrypt
                hashed_password = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
                
                backrest_users.append({
                    "name": username,
                    "needsBcrypt": False,  # IMPORTANT: Already hashed, don't hash again
                    "passwordBcrypt": hashed_password  # Send the hashed password
                })
            
            # Create config object with AUTH ENABLED
            config = {
                "instance": instance_id,
                "auth": {
                    "disabled": disable_auth,  # Use the parameter (default False = auth enabled)
                    "users": backrest_users
                }
            }
            
            # Try API configuration with retries
            success = False
            api_error = None
            
            for attempt in range(max_retries):
                try:
                    logger.info(f"Attempt {attempt+1}/{max_retries} to configure Backrest via API with AUTH ENABLED")
                    response = backrest_service._make_request('post', '/v1.Backrest/SetConfig', config)
                    success = True
                    logger.info("Successfully configured Backrest via API with authentication enabled")
                    break
                except Exception as e:
                    logger.warning(f"Attempt {attempt+1} failed: {str(e)}")
                    api_error = e
                    time.sleep(retry_delay)
                    retry_delay *= 2
            
            # If API configuration failed, try SSH configuration
            if not success:
                logger.info("API configuration failed, attempting SSH configuration")
                try:
                    client = get_ssh_client_for_server(server)
                    
                    import json
                    
                    # Create SSH config with ALREADY HASHED passwords
                    ssh_config = {
                        "instance": instance_id,
                        "auth": {
                            "disabled": disable_auth,
                            "users": backrest_users  # Use the same pre-hashed users
                        }
                    }
                    
                    config_json = json.dumps(ssh_config, indent=2)
                    
                    # Create config directory and write file
                    stdin, stdout, stderr = client.exec_command("sudo mkdir -p /opt/backrest/config")
                    
                    config_file = "/tmp/backrest_config.json"
                    stdin, stdout, stderr = client.exec_command(f"echo '{config_json}' > {config_file}")
                    
                    stdin, stdout, stderr = client.exec_command(f"sudo mv {config_file} /opt/backrest/config/config.json")
                    
                    # Set proper permissions
                    stdin, stdout, stderr = client.exec_command("sudo chown -R backrest:backrest /opt/backrest/config && sudo chmod 600 /opt/backrest/config/config.json")
                    
                    # Restart service to apply config
                    stdin, stdout, stderr = client.exec_command("sudo systemctl restart backrest")
                    
                    success = True
                    logger.info("Successfully configured Backrest via SSH with authentication enabled")
                    client.close()
                    
                except Exception as ssh_error:
                    logger.error(f"SSH configuration failed: {str(ssh_error)}")
            
            # Store instance ID in server model
            if hasattr(server, 'backrest_instance_id'):
                server.backrest_instance_id = instance_id
                server.save()
            
            # Create response config (without sensitive data)
            response_config = {
                "instance": instance_id,
                "auth": {
                    "disabled": disable_auth,
                    "users": [{"name": u["name"]} for u in backrest_users]
                }
            }
            
            # Create BackrestInstance record
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
            
            # Determine status message
            if success:
                status_message = "configured successfully with authentication enabled"
            else:
                status_message = "installation completed, but configuration failed - may need manual setup"
            
            return Response({
                "status": "success",
                "message": f"Backrest instance {status_message}",
                "instance_id": instance_id,
                "user_credentials": user_passwords,
                "config": response_config,
                "auth_enabled": not disable_auth,
                "note": "Authentication is now enabled. Use the provided credentials to log in."
            })
                
        except Exception as e:
            logger.exception(f"Failed to configure Backrest instance: {str(e)}")
            
            # Create fallback instance record
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
                "message": f"Failed to configure Backrest instance but created database record",
                "details": str(e),
                "instance_id": instance_id
            }, status=status.HTTP_202_ACCEPTED)
    

        


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

    @action(detail=False, methods=['get'])
    def repository_stats(self, request):
        """Get repository statistics including compression ratio"""
        repository_id = request.query_params.get('repository_id')
        
        if not repository_id:
            return Response({"error": "repository_id required"}, status=400)
        
        try:
            repository = BackrestRepository.objects.get(
                id=repository_id, 
                tenant=request.tenant
            )
            
            backrest_service = BackrestService(repository.server)
            
            # Call Backrest API to get operations
            operations_request = {
                "selector": {
                    "repoId": repository.repository_id
                }
            }
            
            operations = backrest_service._make_request(
                'post', 
                '/v1.Backrest/GetOperations', 
                operations_request
            )
            
            # Filter for stats operations only
            stats_operations = []
            for op in operations.get('operations', []):
                if op.get('op', {}).get('case') == 'operationStats':
                    stats_data = op['op']['value']['stats']
                    stats_operations.append({
                        'time': int(op.get('unixTimeEndMs', 0)),
                        'totalSizeBytes': int(stats_data.get('totalSize', 0)),
                        'compressionRatio': float(stats_data.get('compressionRatio', 0)),
                        'snapshotCount': int(stats_data.get('snapshotCount', 0)),
                        'totalBlobCount': int(stats_data.get('totalBlobCount', 0))
                    })
            
            # Sort by time
            stats_operations.sort(key=lambda x: x['time'])
            
            return Response({
                'status': 'success',
                'stats': stats_operations
            })
            
        except Exception as e:
            logger.error(f"Failed to get repository stats: {str(e)}")
            return Response({
                'status': 'error',
                'message': str(e)
            }, status=500)

    @action(detail=True, methods=['post'])
    def run_stats(self, request, pk=None):
        """Run stats operation on repository"""
        repository = self.get_object()
        
        try:
            backrest_service = BackrestService(repository.server)
            
            stats_request = {
                "value": repository.repository_id
            }
            
            response = backrest_service._make_request(
                'post',
                '/v1.Backrest/Stats',  # Stats operation endpoint
                stats_request
            )
            
            return Response({
                'status': 'success',
                'message': 'Stats operation started',
                'operation_id': response.get('operationId')
            })
            
        except Exception as e:
            return Response({
                'status': 'error', 
                'message': str(e)
            }, status=500)

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



    def perform_update(self, serializer):
        """Update a plan in Backrest and database"""
        plan = self.get_object()
        repository = serializer.validated_data['repository']
        
        if repository.tenant != self.request.tenant:
            raise PermissionDenied("Repository does not belong to your tenant")
        
        try:
            logger.info(f"Updating plan '{plan.plan_id}' for repo {repository.repository_id}")
            
            backrest_service = BackrestService(repository.server)
            response = backrest_service.update_plan(
                plan_id=plan.plan_id,
                repository_id=repository.repository_id,
                name=serializer.validated_data['name'],
                paths=serializer.validated_data['paths'],
                excludes=serializer.validated_data.get('excludes', []),
                schedule=serializer.validated_data['schedule'],
                retention_policy=serializer.validated_data['retention_policy']
            )
            
            logger.info(f"Plan updated successfully in Backrest: {response}")
            
            # Save to database
            serializer.save()
            
        except Exception as e:
            logger.exception(f"Failed to update plan in Backrest: {str(e)}")
            # Still save to database to keep UI in sync
            serializer.save()
            logger.warning(f"Updated plan in database but Backrest API call failed: {str(e)}")
        
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

    @action(detail=False, methods=['get' ,'post'], url_path='structured')
    def structured_operations(self, request):
        """Return structured operations based on logs with proper parsing"""
        tenant = request.tenant
        
        # Get query parameters
        days = int(request.query_params.get('days', 30))
        limit = int(request.query_params.get('limit', 100))
        operation_type = request.query_params.get('type', None)
        
        try:
            # Get logs for processing
            query = BackrestLog.objects.filter(tenant=tenant)
            
            # Apply date filtering if specified
            if days > 0:
                cutoff_date = timezone.now() - timezone.timedelta(days=days)
                query = query.filter(timestamp__gte=cutoff_date)
            
            # Get all logs for processing
            logs = query.order_by('-timestamp')[:5000]  # Get a good number to work with
            
            # Group logs by operation
            operations = self._parse_logs_to_operations(logs)
            
            # Apply operation type filter if specified
            if operation_type:
                operations = [op for op in operations if op.get('type') == operation_type]
            
            # Sort by start time (newest first)
            operations.sort(key=lambda op: op.get('started_at', timezone.now()), reverse=True)
            
            # Apply limit
            operations = operations[:limit]
            
            return Response({
                "status": "success",
                "count": len(operations),
                "results": operations
            })
        
        except Exception as e:
            logger.exception(f"Error processing backrest operations: {str(e)}")
            return Response({
                "status": "error",
                "message": str(e)
            }, status=500)
    
    def _parse_logs_to_operations(self, logs):
        """Parse logs into structured operations based on discovered patterns"""
        # First group logs by operation context
        operations_by_context = {}
        operations = []
        
        # Group logs by their operation context
        for log in logs:
            # Skip irrelevant logs
            if not log.message and not log.logger_name:
                continue
            
            raw_message = log.message or ""
            raw_logger = log.logger_name or ""
            timestamp = log.timestamp
            
            # Create context keys based on discovered patterns
            context_key = None
            repo_name = None
            plan_name = None
            op_type = None
            
            # Extract repo name and plan name
            repo_match = re.search(r'repo\s*["\']([^"\']+)["\']', raw_logger)
            if repo_match:
                repo_name = repo_match.group(1)
                
            plan_match = re.search(r'plan\s*["\']([^"\']+)["\']', raw_logger)
            if plan_match:
                plan_name = plan_match.group(1)
            
            # IMPROVED: Better type detection from logger name patterns
            if "backup for plan" in raw_logger:
                op_type = "backup"
                context_key = f"backup:{plan_name}:{timestamp.strftime('%Y-%m-%d %H:%M')}"
            elif "index snapshots" in raw_logger:
                op_type = "index"
                context_key = f"index:{repo_name}:{timestamp.strftime('%Y-%m-%d %H:%M')}"
            elif "restore snapshot" in raw_logger or "restore operation" in raw_logger:
                op_type = "restore"
                context_key = f"restore:{repo_name}:{timestamp.strftime('%Y-%m-%d %H:%M')}"
            elif "collect garbage" in raw_logger:
                op_type = "maintenance"
                context_key = f"maintenance:{timestamp.strftime('%Y-%m-%d %H:%M')}"
            elif "stats for repo" in raw_logger:
                op_type = "stats"
                context_key = f"stats:{repo_name}:{timestamp.strftime('%Y-%m-%d %H:%M')}"
            
            # NEW: Detect operation type from the message content
            elif "backup complete" in raw_message.lower() or "backup completed" in raw_message.lower():
                op_type = "backup"
                context_key = f"backup:message:{timestamp.strftime('%Y-%m-%d %H:%M')}"
            elif "task finished" in raw_message.lower():
                # Look at previous message to determine type if available
                if operations_by_context:
                    # Find nearest context in time
                    nearest_context = None
                    min_time_diff = float('inf')
                    for ctx_key, ctx_data in operations_by_context.items():
                        if "running task" in " ".join([log.get("message", "") for log in ctx_data["logs"]]):
                            time_diff = abs((timestamp - ctx_data["logs"][-1]["timestamp"]).total_seconds())
                            if time_diff < min_time_diff:
                                min_time_diff = time_diff
                                nearest_context = ctx_key
                                
                    if nearest_context and min_time_diff < 60:  # Within 60 seconds
                        context_key = nearest_context
                        op_type = operations_by_context[nearest_context]["type"]
                
                # If we still don't have a type, try to infer from surrounding logs
                if not op_type:
                    op_type = "maintenance"  # Default
                    context_key = f"maintenance:{timestamp.strftime('%Y-%m-%d %H:%M')}"
            
            # NEW: Handle scheduled tasks better
            elif "scheduled task" in raw_message.lower():
                # This is the start of a task - look ahead to determine type
                future_logs = [l for l in logs if l.timestamp > timestamp and l.timestamp < timestamp + timezone.timedelta(minutes=2)]
                future_types = []
                for future_log in future_logs:
                    if "backup" in (future_log.message or "").lower():
                        future_types.append("backup")
                    elif "index" in (future_log.message or "").lower():
                        future_types.append("index")
                    elif "garbage" in (future_log.message or "").lower():
                        future_types.append("maintenance")
                        
                if future_types:
                    op_type = max(set(future_types), key=future_types.count)  # Most common type
                    context_key = f"{op_type}:{timestamp.strftime('%Y-%m-%d %H:%M')}"
                else:
                    op_type = "unknown"
                    context_key = f"unknown:{timestamp.strftime('%Y-%m-%d %H:%M')}"
            
            # NEW: Look for specific operation keywords in message
            elif any(kw in raw_message.lower() for kw in ["index snapshots", "indexing"]):
                op_type = "index"
                context_key = f"index:{repo_name or 'unknown'}:{timestamp.strftime('%Y-%m-%d %H:%M')}"
            elif "garbage" in raw_message.lower():
                op_type = "maintenance"
                context_key = f"maintenance:{timestamp.strftime('%Y-%m-%d %H:%M')}"
            
            # Fall back to timestamp-based grouping if we still don't have a key
            if not context_key:
                # Group by 5-minute intervals for better clustering
                minute_bucket = timestamp.replace(minute=timestamp.minute // 5 * 5, second=0, microsecond=0)
                context_key = f"unknown:{minute_bucket.isoformat()}"
                op_type = "unknown"
            
            # Add to the appropriate operation context
            if context_key not in operations_by_context:
                operations_by_context[context_key] = {
                    "logs": [],
                    "type": op_type,
                    "plan_name": plan_name,
                    "repo_name": repo_name,
                    "start_time": timestamp,
                    "end_time": None,
                    "status": "unknown"
                }
            
            # Add log to this context
            operations_by_context[context_key]["logs"].append({
                "timestamp": timestamp,
                "message": raw_message,
                "logger": raw_logger,
                "level": log.level,
                "error": log.error,
                "server": log.server.hostname if log.server else "Unknown"
            })
            
            # Update start time if this log is earlier
            if timestamp < operations_by_context[context_key]["start_time"]:
                operations_by_context[context_key]["start_time"] = timestamp
        
        # Process each operation group
        for context_key, operation_data in operations_by_context.items():
            logs = sorted(operation_data["logs"], key=lambda x: x["timestamp"])
            
            if not logs:
                continue
                
            # Initialize operation with default values
            op = {
                "id": f"op-{operation_data['type']}-{int(operation_data['start_time'].timestamp())}",
                "type": operation_data["type"],
                "started_at": operation_data["start_time"],
                "completed_at": None,
                "duration": 0,
                "status": "unknown",
                "repository": operation_data["repo_name"] or "Unknown",
                "plan": operation_data["plan_name"] or "N/A",
                "message": "",
                "level": logs[0]["level"],
                "error": None,
                "server_name": logs[0]["server"]
            }
            
            # Create a descriptive message based on operation type
            if operation_data["type"] == "backup":
                if operation_data["plan_name"]:
                    op["message"] = f"Backup for plan '{operation_data['plan_name']}'"
                else:
                    op["message"] = f"Backup operation at {logs[0]['timestamp'].strftime('%Y-%m-%d %H:%M')}"
            elif operation_data["type"] == "index":
                if operation_data["repo_name"]:
                    op["message"] = f"Index snapshots for '{operation_data['repo_name']}'"
                else:
                    op["message"] = f"Index operation at {logs[0]['timestamp'].strftime('%Y-%m-%d %H:%M')}"
            elif operation_data["type"] == "maintenance":
                op["message"] = f"Maintenance operation at {logs[0]['timestamp'].strftime('%Y-%m-%d %H:%M')}"
            else:
                op["message"] = logs[0]["logger"] if logs[0]["logger"] else logs[0]["message"]
                
            # IMPROVED: Better status detection and timestamp handling
            op["status"] = self._determine_operation_status(logs)
            
            # Set completed_at and calculate duration if operation is complete
            for log in logs:
                if "task finished" in log["message"].lower() or "backup complete" in log["message"].lower():
                    op["completed_at"] = log["timestamp"]
                    break
            
            # If no explicit completion found but status is completed, use last log time
            if not op["completed_at"] and op["status"] in ["completed", "failed"]:
                op["completed_at"] = logs[-1]["timestamp"]
            
            # Calculate duration only if completed_at is available
            if op["completed_at"]:
                op["duration"] = (op["completed_at"] - op["started_at"]).total_seconds()
                
            # Add to operations list
            operations.append(op)
        
        # Apply filtering to remove redundant operations
        if operations:
            operations = self._filter_redundant_operations(operations)
                
        return operations
    
    # In the BackrestOperationViewSet class or relevant view that processes log entries:
    def _parse_backup_summary(self, summary_text):
        """Parse backup summary text into structured data"""
        result = {
            "files_changed": 0,
            "files_new": 0,
            "files_unmodified": 0,
            "dirs_changed": 0,
            "dirs_new": 0,
            "dirs_unmodified": 0,
            "tree_blobs": 0,
            "data_blobs": 0,
            "data_added": 0,
            "total_files_processed": 0,
            "total_bytes_processed": 0,
            "total_duration": 0,
            "snapshot_id": "",
            "efficiency": 0
        }
        
        try:
            # Clean up summary text
            if summary_text.startswith('summary:'):
                summary_text = summary_text[8:]
                
            # Extract each value using regex pattern matching
            files_new_match = re.search(r'files_new:(\d+)', summary_text)
            if files_new_match:
                result["files_new"] = int(files_new_match.group(1))
                result["files_changed"] = int(files_new_match.group(1))  # Map new files to changed
                
            files_changed_match = re.search(r'files_changed:(\d+)', summary_text)
            if files_changed_match:
                result["files_changed"] = int(files_changed_match.group(1))
                
            files_unmodified_match = re.search(r'files_unmodified:(\d+)', summary_text)
            if files_unmodified_match:
                result["files_unmodified"] = int(files_unmodified_match.group(1))
                
            dirs_new_match = re.search(r'dirs_new:(\d+)', summary_text)
            if dirs_new_match:
                result["dirs_new"] = int(dirs_new_match.group(1))
                result["dirs_changed"] = int(dirs_new_match.group(1))  # Map new dirs to changed
                
            dirs_changed_match = re.search(r'dirs_changed:(\d+)', summary_text)
            if dirs_changed_match:
                result["dirs_changed"] = int(dirs_changed_match.group(1))
                
            dirs_unmodified_match = re.search(r'dirs_unmodified:(\d+)', summary_text)
            if dirs_unmodified_match:
                result["dirs_unmodified"] = int(dirs_unmodified_match.group(1))
                
            tree_blobs_match = re.search(r'tree_blobs:(\d+)', summary_text)
            if tree_blobs_match:
                result["tree_blobs"] = int(tree_blobs_match.group(1))
                
            data_blobs_match = re.search(r'data_blobs:(\d+)', summary_text)
            if data_blobs_match:
                result["data_blobs"] = int(data_blobs_match.group(1))
                
            data_added_match = re.search(r'data_added:(\d+)', summary_text)
            if data_added_match:
                result["data_added"] = int(data_added_match.group(1))
                
            total_files_match = re.search(r'total_files_processed:(\d+)', summary_text)
            if total_files_match:
                result["total_files_processed"] = int(total_files_match.group(1))
                
            total_bytes_match = re.search(r'total_bytes_processed:(\d+)', summary_text)
            if total_bytes_match:
                result["total_bytes_processed"] = int(total_bytes_match.group(1))
                
            total_duration_match = re.search(r'total_duration:([0-9.]+)', summary_text)
            if total_duration_match:
                result["total_duration"] = float(total_duration_match.group(1))
                
            snapshot_id_match = re.search(r'snapshot_id:"([^"]+)"', summary_text)
            if snapshot_id_match:
                result["snapshot_id"] = snapshot_id_match.group(1)
                
            # Calculate efficiency if both values are available
            if result["total_bytes_processed"] > 0 and result["data_added"] > 0:
                result["efficiency"] = (1 - (result["data_added"] / result["total_bytes_processed"])) * 100
            
        except Exception as e:
            logger.warning(f"Error parsing backup summary: {e}")
        
        return result

    @action(detail=False, methods=['get'], url_path='dashboard')
    def operations_dashboard(self, request):
        """Generate a dashboard of operations statistics with improved categorization"""
        tenant = request.tenant
        days = int(request.query_params.get('days', 30))
        
        # Get cutoff date
        cutoff_date = timezone.now() - timezone.timedelta(days=days)
        
        # Get logs for processing
        logs = BackrestLog.objects.filter(
            tenant=tenant,
            timestamp__gte=cutoff_date
        ).order_by('-timestamp')
        
        # Parse logs into operations
        operations = self._parse_logs_to_operations(logs)
        
        # Filter out unknown operations for the dashboard
        known_operations = [op for op in operations if op["type"] != "unknown"]
        
        # Generate statistics
        total_operations = len(known_operations)
        operations_by_type = {}
        operations_by_status = {
            "completed": 0,
            "failed": 0,
            "running": 0,
            "unknown": 0
        }
        operations_by_repo = {}
        operations_by_plan = {}
        operations_by_date = {}
        
        for op in known_operations:
            # Count by type
            op_type = op["type"]
            operations_by_type[op_type] = operations_by_type.get(op_type, 0) + 1
            
            # Count by status
            status = op["status"]
            operations_by_status[status] = operations_by_status.get(status, 0) + 1
            
            # Count by repository
            repo = op["repository"]
            operations_by_repo[repo] = operations_by_repo.get(repo, 0) + 1
            
            # Count by plan
            plan = op["plan"]
            if plan != "N/A":
                operations_by_plan[plan] = operations_by_plan.get(plan, 0) + 1
            
            # Count by date (group by day)
            day = op["started_at"].strftime("%Y-%m-%d")
            operations_by_date[day] = operations_by_date.get(day, 0) + 1
        
        # Calculate average duration of completed operations
        completed_ops = [op for op in known_operations if op["status"] == "completed" and op["duration"] > 0]
        avg_duration = sum(op["duration"] for op in completed_ops) / len(completed_ops) if completed_ops else 0
        
        # Get recent failures
        failures = [op for op in known_operations if op["status"] == "failed"][:5]
        
        return Response({
            "status": "success",
            "total_operations": total_operations,
            "by_type": operations_by_type,
            "by_status": operations_by_status,
            "by_repository": operations_by_repo,
            "by_plan": operations_by_plan,
            "by_date": dict(sorted(operations_by_date.items())),
            "avg_duration_seconds": avg_duration,
            "recent_failures": failures,
            # Include count of filtered unknown operations
            "unknown_operations_filtered": len(operations) - len(known_operations)
        })


    def _determine_operation_status(self, logs):
        """Determine operation status based on log messages and patterns"""
        # Look for clear completion indicators
        if any("task finished" in log["message"].lower() for log in logs):
            return "completed"
        
        # Look for explicit backup completions
        if any("backup complete" in log["message"].lower() or "backup completed" in log["message"].lower() for log in logs):
            return "completed"
        
        # Look for explicit indexing completions
        if any("found" in log["message"].lower() and "snapshot" in log["message"].lower() and "indexed" in log["message"].lower() for log in logs):
            return "completed"
        
        # Look for failure messages
        if any("task failed" in log["message"].lower() for log in logs):
            return "failed"
        if any("error" in log["message"].lower() for log in logs):
            return "failed"
        
        # Look for running indicators
        if any("running task" in log["message"].lower() for log in logs):
            # Check if this is followed by completion within the logs
            if any("task finished" in log["message"].lower() for log in logs):
                return "completed"
            return "running"
        
        # Look for scheduled tasks
        if any("scheduled task" in log["message"].lower() for log in logs):
            # If task was scheduled but no completion yet
            if not any(("task finished" in log["message"].lower() or "backup complete" in log["message"].lower()) for log in logs):
                return "running"
        
        # For older logs (> 1 day), assume they completed if they have indicative keywords
        if logs and (timezone.now() - logs[0]["timestamp"]).days >= 1:
            if any(keyword in " ".join([log["message"].lower() for log in logs]) for keyword in 
                ["backup", "index", "snapshots", "garbage", "complete"]):
                return "completed"
        
        # Default status
        return "unknown"
    
    def _filter_redundant_operations(self, operations):
        """Filter out redundant operations and prioritize known operations"""
        if not operations:
            return []
            
        # Sort by timestamp (newest first)
        sorted_ops = sorted(operations, key=lambda x: x["started_at"], reverse=True)
        
        # Group operations that are likely duplicates (same type, close timestamps)
        unique_ops = []
        seen_keys = set()
        
        # First pass: add all non-unknown operations
        for op in sorted_ops:
            if op["type"] != "unknown":
                # Create a key that represents this operation's uniqueness
                minute_ts = op["started_at"].replace(second=0, microsecond=0)
                uniqueness_key = f"{op['type']}:{op['repository']}:{op['plan']}:{minute_ts.isoformat()}"
                
                if uniqueness_key not in seen_keys:
                    seen_keys.add(uniqueness_key)
                    unique_ops.append(op)
        
        # Second pass: only add unknown operations if they don't overlap with known ones
        for op in sorted_ops:
            if op["type"] == "unknown":
                # Check if this unknown operation overlaps with any known operation
                overlaps = False
                minute_ts = op["started_at"].replace(second=0, microsecond=0)
                
                for known_op in unique_ops:
                    known_ts = known_op["started_at"].replace(second=0, microsecond=0)
                    # If within 5 minutes of a known operation, consider it an overlap
                    if abs((minute_ts - known_ts).total_seconds()) < 300:
                        overlaps = True
                        break
                
                if not overlaps:
                    unique_ops.append(op)
        
        # Sort back by start time (newest first)
        return sorted(unique_ops, key=lambda x: x["started_at"], reverse=True)
    
    
    @action(detail=False, methods=['get'], url_path='raw-log-details/(?P<operation_id>.+)')
    def get_raw_log_details(self, request, operation_id=None):
        """Get raw log details for a specific operation directly from backrest.log file"""
        if not operation_id:
            return Response({"status": "error", "message": "No operation ID provided"}, status=400)
        
        # URL decode the operation_id to handle special characters
        operation_id = urllib.parse.unquote(operation_id)
        
        tenant = request.tenant
        
        # Get query parameters from request
        filter_date = request.query_params.get('date')
        filter_type = request.query_params.get('type')
        filter_plan = request.query_params.get('plan')
        operation_id_param = request.query_params.get('operation_id')
        strict_match = request.query_params.get('strict_match', 'false').lower() == 'true'
        
        logger.info(f"Getting logs for operation: {operation_id}")
        logger.info(f"Filter params - date: {filter_date}, type: {filter_type}, plan: {filter_plan}, strict: {strict_match}")
        
        try:
            # Parse the operation ID to extract plan name and timestamp
            plan_name = None
            timestamp_str = None
            operation_type = None
            
            # Pattern: op-backup for plan "manual_backup"-1753370597247
            match = re.search(r'op-([\w-]+) for plan "([^"]+)"-(\d+)', operation_id)
            if match:
                operation_type = match.group(1)
                plan_name = match.group(2)
                timestamp_str = match.group(3)
            else:
                # Try alternate pattern without quotes
                match = re.search(r'op-([\w-]+) for plan ([^-]+)-(\d+)', operation_id)
                if match:
                    operation_type = match.group(1)
                    plan_name = match.group(2)
                    timestamp_str = match.group(3)
                else:
                    # Try to extract any plan name
                    plan_match = re.search(r'for plan ["\']([^"\']+)["\']', operation_id)
                    if plan_match:
                        plan_name = plan_match.group(1)
                    
                    # Try to extract any timestamp
                    timestamp_match = re.search(r'-(\d+)$', operation_id)
                    if timestamp_match:
                        timestamp_str = timestamp_match.group(1)
            
            # Use the provided filter parameters if available, but prioritize extracted values
            if not plan_name and filter_plan:
                plan_name = filter_plan
            if not operation_type and filter_type:
                operation_type = filter_type
            
            # Find the server associated with this plan
            server = None
            if plan_name:
                try:
                    plan = BackrestPlan.objects.get(name=plan_name, tenant=tenant)
                    server = plan.repository.server
                except BackrestPlan.DoesNotExist:
                    try:
                        plan = BackrestPlan.objects.get(plan_id=plan_name, tenant=tenant)
                        server = plan.repository.server
                    except BackrestPlan.DoesNotExist:
                        server = Server.objects.filter(tenant=tenant).first()
            else:
                server = Server.objects.filter(tenant=tenant).first()
            
            if not server:
                return Response({
                    "status": "error",
                    "message": "No server available to fetch logs"
                }, status=404)
                
            # Create SSH connection
            ssh_client = get_ssh_client_for_server(server)
            
            if not ssh_client:
                return Response({
                    "status": "error",
                    "message": "Failed to connect to server"
                }, status=500)
            
            try:
                # Prepare more specific search terms
                search_commands = []
                
                if strict_match and plan_name:
                    # MOST SPECIFIC: Search for exact plan name with quotes and operation type
                    if operation_type:
                        search_commands.append(
                            f"grep -E '(backup|running task).*plan \\\"{re.escape(plan_name)}\\\"' /opt/backrest/data/processlogs/backrest.log | grep -v 'collect garbage'"
                        )
                    
                    # BACKUP: Search for exact plan name pattern
                    search_commands.append(
                        f"grep -F 'plan \"{plan_name}\"' /opt/backrest/data/processlogs/backrest.log | grep -v 'collect garbage'"
                    )
                    
                    # FALLBACK: Search for plan name without strict quotes
                    search_commands.append(
                        f"grep -E 'plan.*{re.escape(plan_name)}[^a-zA-Z0-9_]' /opt/backrest/data/processlogs/backrest.log | grep -v 'collect garbage'"
                    )
                else:
                    # Less strict search if not in strict mode
                    if plan_name:
                        search_commands.append(
                            f"grep -E 'plan.*{re.escape(plan_name)}' /opt/backrest/data/processlogs/backrest.log | grep -v 'collect garbage'"
                        )
                    
                    if operation_type:
                        search_commands.append(
                            f"grep -E '{operation_type}' /opt/backrest/data/processlogs/backrest.log | grep -v 'collect garbage'"
                        )
                
                # Add date filtering if available
                if filter_date:
                    date_filter = f"grep '{filter_date}'"
                    search_commands = [f"{cmd} | {date_filter}" for cmd in search_commands]
                
                # Try each search command until we get results
                raw_logs = ""
                search_used = ""
                
                for i, command in enumerate(search_commands):
                    logger.info(f"Trying search command {i+1}: {command}")
                    
                    stdin, stdout, stderr = ssh_client.exec_command(f"{command} | tail -n 200")
                    result = stdout.read().decode('utf-8')
                    
                    if result.strip():
                        raw_logs = result
                        search_used = command
                        logger.info(f"Found {len(result.split())} lines with command {i+1}")
                        break
                    else:
                        logger.info(f"No results from command {i+1}")
                
                # If no results from specific searches, try a broader search
                if not raw_logs.strip() and plan_name:
                    logger.info("Trying broader search...")
                    broad_command = f"grep -i '{plan_name}' /opt/backrest/data/processlogs/backrest.log | tail -n 100"
                    stdin, stdout, stderr = ssh_client.exec_command(broad_command)
                    raw_logs = stdout.read().decode('utf-8')
                    search_used = broad_command
                
                # Parse the raw logs
                parsed_logs = []
                summary_data = None
                target_plan_logs = []
                
                # Process each log line
                for line in raw_logs.strip().split('\n'):
                    try:
                        if line.strip():
                            log_entry = json.loads(line)
                            
                            # STRICT FILTERING: Only include logs that match the exact plan
                            if strict_match and plan_name:
                                log_plan_match = False
                                
                                # Check multiple fields for plan name
                                plan_fields = [
                                    log_entry.get('plan', ''),
                                    log_entry.get('logger', ''),
                                    log_entry.get('task', ''),
                                    log_entry.get('msg', '')
                                ]
                                
                                for field in plan_fields:
                                    if field and plan_name in field:
                                        # Ensure exact match, not substring
                                        if f'"{plan_name}"' in field or f"'{plan_name}'" in field:
                                            log_plan_match = True
                                            break
                                        # Also check for word boundaries
                                        if re.search(r'\b' + re.escape(plan_name) + r'\b', field):
                                            log_plan_match = True
                                            break
                                
                                if not log_plan_match:
                                    continue
                            
                            # Add to list for full context
                            parsed_logs.append(log_entry)
                            
                            # Track logs specifically for target plan
                            if plan_name and (
                                (log_entry.get('plan') == plan_name) or
                                (log_entry.get('logger', '').find(f'"{plan_name}"') != -1) or
                                (log_entry.get('task', '').find(f'"{plan_name}"') != -1)
                            ):
                                target_plan_logs.append(log_entry)
                                
                                # Check for backup complete message with summary
                                if (log_entry.get('msg') == 'backup complete' and 
                                    log_entry.get('plan') == plan_name and 
                                    'summary' in log_entry):
                                    summary_text = log_entry['summary']
                                    summary_data = self._parse_backup_summary(summary_text)
                                    if 'duration' in log_entry:
                                        summary_data['total_duration'] = log_entry['duration']
                            
                            # Extract timestamp for chronological ordering
                            if 'ts' in log_entry:
                                log_entry['timestamp'] = log_entry['ts']
                                
                    except Exception as e:
                        logger.error(f"Error parsing log line: {e}")
                        continue
                
                # Sort logs by timestamp
                parsed_logs.sort(key=lambda x: x.get('timestamp', 0))
                target_plan_logs.sort(key=lambda x: x.get('timestamp', 0))
                
                # Calculate additional statistics if available
                if summary_data:
                    if summary_data.get('total_bytes_processed', 0) > 0 and summary_data.get('data_added', 0) > 0:
                        summary_data['deduplication_ratio'] = summary_data['total_bytes_processed'] / summary_data['data_added']
                        summary_data['space_saved_percent'] = 100 * (1 - summary_data['data_added'] / summary_data['total_bytes_processed'])
                
                # Extract duration if found in logs
                duration = None
                for log in target_plan_logs:
                    if 'duration' in log:
                        duration = log['duration']
                        break
                
                # Return results with debugging info
                return Response({
                    "status": "success",
                    "operation_id": operation_id,
                    "raw_logs": parsed_logs,
                    "target_plan_logs": target_plan_logs,
                    "summary": summary_data,
                    "plan_name": plan_name,
                    "duration": duration,
                    "log_count": len(parsed_logs),
                    "target_plan_log_count": len(target_plan_logs),
                    "search_used": search_used,
                    "search_terms": [plan_name, operation_type, filter_date],
                    "date_used": filter_date,
                    "strict_match_used": strict_match
                })
                
            finally:
                ssh_client.close()
                
        except Exception as e:
            logger.exception(f"Error fetching raw log details: {str(e)}")
            return Response({
                "status": "error",
                "message": f"Failed to fetch raw log details: {str(e)}"
            }, status=500)
        

    def _get_server_for_plan(self, plan_name, tenant):
        """Get the server associated with a plan"""
        try:
            plan = BackrestPlan.objects.get(name=plan_name, tenant=tenant)
            return plan.repository.server
        except BackrestPlan.DoesNotExist:
            return None
        
        
    

class BackrestSnapshotViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for Backrest snapshots"""
    serializer_class = BackrestSnapshotSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantAdminOrOwner]
    
    def get_queryset(self):
        return BackrestSnapshot.objects.filter(tenant=self.request.tenant)
    
    # In BackrestSnapshotViewSet class, replace the restore method:
    @action(detail=False, methods=['post'])
    def restore(self, request):
        """Initiate a restore operation with correct Backrest API format"""
        snapshot_id = request.data.get('snapshot_id')
        repository_id = request.data.get('repository_id')
        target_path = request.data.get('target_path')
        include_paths = request.data.get('include_paths', ['/'])
        exclude_patterns = request.data.get('exclude_patterns', [])
        
        if not all([snapshot_id, repository_id, target_path]):
            return Response({
                "error": "snapshot_id, repository_id, and target_path are required"
            }, status=400)
        
        try:
            # Find repository
            repository = BackrestRepository.objects.get(
                repository_id=repository_id,
                tenant=request.tenant
            )
            
            # Ensure repository ID is valid
            backrest_repo_id = repository.repository_id
            if not backrest_repo_id or backrest_repo_id.strip() == "":
                backrest_repo_id = repository.name.replace(" ", "_").lower()
                repository.repository_id = backrest_repo_id
                repository.save()
            
            backrest_service = BackrestService(repository.server)
            
            # FIXED: Use correct Backrest API format with "value" wrapper
            restore_request = {
                "value": {
                    "repo": backrest_repo_id,
                    "snapshotId": snapshot_id,
                    "path": "/",
                    "target": target_path,
                    "includePaths": include_paths,
                    "excludePatterns": exclude_patterns
                }
            }
            
            logger.info(f"Calling Backrest restore with: {json.dumps(restore_request, indent=2)}")
            
            response = backrest_service._make_request(
                'POST',
                '/v1.Backrest/Restore',
                restore_request
            )
            
            # Create operation record
            operation = BackrestOperation.objects.create(
                tenant=request.tenant,
                repository=repository,
                operation_type="restore",
                operation_id=response.get('operationId') or f"restore_{int(time.time())}",
                status="running",
                started_at=timezone.now(),
                stats={
                    'snapshot_id': snapshot_id,
                    'target_path': target_path,
                    'include_paths': include_paths
                }
            )
            
            return Response({
                'status': 'success',
                'message': 'Restore operation started',
                'operation_id': operation.operation_id,
                'backrest_response': response
            })
            
        except BackrestRepository.DoesNotExist:
            return Response({
                "error": f"Repository not found: {repository_id}"
            }, status=404)
        except Exception as e:
            logger.error(f"Failed to initiate restore: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response({
                'status': 'error',
                'message': str(e)
            }, status=500)
        
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
        
    @action(detail=False, methods=['post'])
    def list_files(self, request):
        """List files in a snapshot"""
        repo_id = request.data.get('repoId')
        snapshot_id = request.data.get('snapshotId')
        path = request.data.get('path', '/')
        
        if not repo_id or not snapshot_id:
            return Response({
                "error": "repoId and snapshotId are required"
            }, status=400)
        
        try:
            # FIXED: Always lookup by repository_id field (the Backrest repo ID string)
            repository = BackrestRepository.objects.get(
                repository_id=repo_id,  # This is the string field like "testing"
                tenant=request.tenant
            )
            
            backrest_service = BackrestService(repository.server)
            
            # Call Backrest API to list files
            response = backrest_service.list_snapshot_files(repo_id, snapshot_id, path)
            
            return Response({
                'status': 'success',
                'entries': response.get('entries', []),
                'path': path
            })
            
        except BackrestRepository.DoesNotExist:
            return Response({
                "error": f"Repository not found with repository_id: {repo_id}",
                "available_repositories": list(
                    BackrestRepository.objects.filter(tenant=request.tenant)
                    .values('id', 'repository_id', 'name')
                )
            }, status=404)
        except Exception as e:
            logger.error(f"Failed to list snapshot files: {str(e)}")
            return Response({
                'status': 'error',
                'message': str(e)
            }, status=500)
        
    @action(detail=False, methods=['get'])
    def snapshots(self, request):
        """Get all snapshots from all repositories for restore"""
        try:
            repositories = BackrestRepository.objects.filter(tenant=request.tenant)
            all_snapshots = []
            
            for repo in repositories:
                try:
                    backrest_service = BackrestService(repo.server)
                    snapshots = backrest_service.get_snapshots(repo.repository_id)
                    
                    # Add repository info to each snapshot
                    for snapshot in snapshots:
                        snapshot['repository'] = repo.id
                        snapshot['repository_name'] = repo.name
                        snapshot['repository_id'] = repo.repository_id
                    
                    all_snapshots.extend(snapshots)
                    
                except Exception as e:
                    logger.error(f"Failed to get snapshots for repo {repo.name}: {str(e)}")
                    continue
            
            # Sort by time descending (newest first)
            all_snapshots.sort(key=lambda x: x.get('time', ''), reverse=True)
            
            logger.info(f"Returning {len(all_snapshots)} snapshots")
            return Response(all_snapshots)
            
        except Exception as e:
            logger.error(f"Failed to get snapshots: {str(e)}")
            return Response([], status=500)


   


    
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
            
        return queryset.order_by('-timestamp')

    @action(detail=False, methods=['post'])
    def fetch_from_server(self, request):
        """Fetch recent logs from Backrest server with enhanced debugging"""
        try:
            # Get repository ID if provided
            repo_id = request.data.get('repository_id')
            
            if repo_id:
                # Get specific repository
                try:
                    repo = BackrestRepository.objects.get(
                        repository_id=repo_id,
                        tenant=request.tenant
                    )
                    servers = [repo.server]
                except BackrestRepository.DoesNotExist:
                    return Response({
                        'status': 'error',
                        'message': f'Repository {repo_id} not found'
                    }, status=status.HTTP_404_NOT_FOUND)
            else:
                # Get all active servers
                server_ids = BackrestRepository.objects.filter(
                    tenant=request.tenant
                ).values_list('server_id', flat=True).distinct()
                servers = Server.objects.filter(id__in=server_ids)
            
            logs_imported = 0
            operations_updated = 0
            debug_info = []
            
            for server in servers:
                server_debug = {
                    'hostname': server.hostname,
                    'ssh_user': server.ssh_user,
                    'ssh_port': server.ssh_port,
                    'connection_status': 'failed',
                    'log_file_exists': False,
                    'log_file_size': 0,
                    'lines_found': 0,
                    'error': None
                }
                
                # Create SSH connection
                ssh_client = get_ssh_client_for_server(server)
                
                if not ssh_client:
                    server_debug['error'] = 'Failed to create SSH client'
                    debug_info.append(server_debug)
                    continue
                
                server_debug['connection_status'] = 'connected'
                
                try:
                    # First, check if the log file exists and get its info
                    check_cmd = "ls -la /opt/backrest/data/processlogs/backrest.log 2>/dev/null || echo 'FILE_NOT_FOUND'"
                    stdin, stdout, stderr = ssh_client.exec_command(check_cmd)
                    file_info = stdout.read().decode('utf-8').strip()
                    
                    if 'FILE_NOT_FOUND' in file_info:
                        server_debug['error'] = 'Log file does not exist at /opt/backrest/data/processlogs/backrest.log'
                        debug_info.append(server_debug)
                        ssh_client.close()
                        continue
                    else:
                        server_debug['log_file_exists'] = True
                        server_debug['file_info'] = file_info
                        
                        # Extract file size
                        try:
                            size_match = re.search(r'\s+(\d+)\s+', file_info)
                            if size_match:
                                server_debug['log_file_size'] = int(size_match.group(1))
                        except:
                            pass
                    
                    # Execute command to fetch logs
                    lines_to_fetch = request.data.get('lines', 500)
                    command = f"cat /opt/backrest/data/processlogs/backrest.log | tail -n {lines_to_fetch}"
                    stdin, stdout, stderr = ssh_client.exec_command(command)
                    log_data = stdout.read().decode('utf-8')
                    stderr_data = stderr.read().decode('utf-8')
                    
                    if stderr_data:
                        server_debug['stderr'] = stderr_data
                    
                    # Count lines and check if they're JSON
                    lines = log_data.strip().split('\n') if log_data.strip() else []
                    server_debug['lines_found'] = len([line for line in lines if line.strip()])
                    
                    valid_json_lines = 0
                    invalid_lines = []
                    server_logs_imported = 0
                    
                    # Process each log line
                    for i, line in enumerate(lines):
                        if not line.strip():
                            continue
                        
                        try:
                            # Parse JSON log entry
                            log_entry = json.loads(line)
                            valid_json_lines += 1
                            
                            # Create timestamp
                            timestamp = process_log_timestamp(log_entry.get('ts', 0))
                            message = log_entry.get('msg', '')[:255]
                            
                            # Check if record already exists
                            existing_logs = BackrestLog.objects.filter(
                                tenant=request.tenant,
                                server=server,
                                timestamp=timestamp,
                                message=message
                            )
                            
                            if existing_logs.exists():
                                # Log already exists, skip it
                                continue
                            else:
                                # Create new log record
                                BackrestLog.objects.create(
                                    tenant=request.tenant,
                                    server=server,
                                    timestamp=timestamp,
                                    message=message,
                                    level=log_entry.get('level', 'info'),
                                    logger_name=log_entry.get('logger', '')[:100],
                                    error=log_entry.get('error', ''),
                                    source='backrest.log'
                                )
                                server_logs_imported += 1
                                logs_imported += 1
                                
                        except json.JSONDecodeError as e:
                            if len(invalid_lines) < 3:  # Only store first 3 invalid lines
                                invalid_lines.append({
                                    'line_number': i + 1,
                                    'content': line[:100] + '...' if len(line) > 100 else line,
                                    'error': str(e)
                                })
                            continue
                        except Exception as entry_error:
                            logger.error(f"Error processing log entry: {str(entry_error)}")
                            # Add debug info for database errors
                            if len(invalid_lines) < 3:
                                invalid_lines.append({
                                    'line_number': i + 1,
                                    'content': f"Database error: {str(entry_error)}",
                                    'error': str(entry_error)
                                })
                    
                    server_debug['valid_json_lines'] = valid_json_lines
                    server_debug['invalid_lines'] = invalid_lines
                    server_debug['logs_imported_from_server'] = server_logs_imported
                    
                    # Close connection
                    ssh_client.close()
                    
                except Exception as server_error:
                    server_debug['error'] = str(server_error)
                    logger.error(f"Error fetching logs from server {server.hostname}: {str(server_error)}")
                
                debug_info.append(server_debug)
            
            return Response({
                'status': 'success',
                'logs_imported': logs_imported,
                'operations_updated': operations_updated,
                'debug_info': debug_info,
                'servers_checked': len(servers)
            })
            
        except Exception as e:
            logger.exception(f"Error fetching logs: {str(e)}")
            return Response({
                'status': 'error',
                'message': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='analyze-logs')
    def analyze_logs(self, request):
        """Analyze logs to understand patterns and improve parsing"""
        # Get logs for the specified period
        days = int(request.query_params.get('days', 3))
        limit = int(request.query_params.get('limit', 100))
        
        cutoff_date = timezone.now() - timezone.timedelta(days=days)
        logs = BackrestLog.objects.filter(
            tenant=request.tenant,
            timestamp__gte=cutoff_date
        ).order_by('-timestamp')[:1000]
        
        # Analyze raw_message patterns
        message_patterns = {}
        logger_patterns = {}
        timestamp_patterns = {}
        
        for log in logs:
            # Track message patterns
            message = log.message or ""
            generic_message = re.sub(r'\d+', 'N', message)
            generic_message = re.sub(r'\"[^\"]+\"', '"X"', generic_message)
            
            if generic_message in message_patterns:
                message_patterns[generic_message] += 1
            else:
                message_patterns[generic_message] = 1
                
            # Track logger name patterns
            logger_name = log.logger_name or ""
            generic_logger = re.sub(r'\"[^\"]+\"', '"X"', logger_name)
            
            if generic_logger in logger_patterns:
                logger_patterns[generic_logger] += 1
            else:
                logger_patterns[generic_logger] = 1
                
            # Track timestamp patterns (look for patterns in when logs are generated)
            hour_bucket = log.timestamp.replace(minute=0, second=0, microsecond=0)
            bucket_key = hour_bucket.strftime('%Y-%m-%d %H:00')
            
            if bucket_key in timestamp_patterns:
                timestamp_patterns[bucket_key] += 1
            else:
                timestamp_patterns[bucket_key] = 1
        
        # Sort patterns by frequency
        message_patterns = dict(sorted(message_patterns.items(), key=lambda x: x[1], reverse=True))
        logger_patterns = dict(sorted(logger_patterns.items(), key=lambda x: x[1], reverse=True))
        timestamp_patterns = dict(sorted(timestamp_patterns.items(), key=lambda x: x[1], reverse=True))
        
        return Response({
            "status": "success",
            "logs_analyzed": len(logs),
            "message_patterns": {k: v for k, v in list(message_patterns.items())[:20]},
            "logger_patterns": {k: v for k, v in list(logger_patterns.items())[:20]},
            "timestamp_patterns": {k: v for k, v in list(timestamp_patterns.items())[:20]},
            "sample_logs": [{
                "timestamp": log.timestamp.isoformat(),
                "message": log.message,
                "logger_name": log.logger_name,
                "level": log.level
            } for log in logs[:10]]
        }) 
       
    @action(detail=False, methods=['post'])
    def sync_logs(self, request):
        """Trigger immediate log sync without SSH connection issues"""
        try:
            # Instead of fetching from server directly, use existing structured operations
            # This avoids SSH connection issues
            
            # Get recent operations from database
            recent_operations = BackrestOperation.objects.filter(
                tenant=request.tenant
            ).order_by('-started_at')[:100]
            
            # Get recent logs from database  
            recent_logs = BackrestLog.objects.filter(
                tenant=request.tenant
            ).order_by('-timestamp')[:500]
            
            # Try to sync operations from Backrest API if available
            operations_synced = 0
            try:
                # Get all servers for this tenant
                server_ids = BackrestRepository.objects.filter(
                    tenant=request.tenant
                ).values_list('server_id', flat=True).distinct()
                servers = Server.objects.filter(id__in=server_ids)
                
                # Try to sync via API instead of SSH
                for server in servers:
                    try:
                        from .services import BackrestService
                        backrest_service = BackrestService(server)
                        
                        # Try to get operations via API
                        repos = BackrestRepository.objects.filter(server=server, tenant=request.tenant)
                        for repo in repos:
                            try:
                                operations = backrest_service.get_operations(repository_id=repo.repository_id)
                                # Process operations here if needed
                                operations_synced += len(operations.get('operations', []))
                            except Exception as repo_error:
                                logger.warning(f"Could not sync operations for repo {repo.repository_id}: {str(repo_error)}")
                                
                    except Exception as server_error:
                        logger.warning(f"Could not sync operations for server {server.hostname}: {str(server_error)}")
                        
            except Exception as sync_error:
                logger.warning(f"Could not sync operations: {str(sync_error)}")
            
            return Response({
                'status': 'success',
                'message': f'Log synchronization completed. Found {len(recent_logs)} logs and {len(recent_operations)} operations.',
                'logs_count': len(recent_logs),
                'operations_count': len(recent_operations),
                'operations_synced': operations_synced
            })
            
        except Exception as e:
            logger.exception(f"Error in sync_logs: {str(e)}")
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


import json
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from .client import BackrestClient
from rest_framework.response import Response
import re
from datetime import datetime
import uuid
import urllib


client = BackrestClient()


def get_client_for_repo(repo_id, tenant):
    """Get a BackrestClient for the server hosting this repository"""
    from .models import BackrestRepository
    
    try:
        # Find the repository and its server
        repo = BackrestRepository.objects.get(repository_id=repo_id, tenant=tenant)
        server = repo.server
        
        # Create client for this server
        return BackrestClient(server=server), repo
    except BackrestRepository.DoesNotExist:
        logger.error(f"Repository {repo_id} not found for tenant {tenant}")
        raise Exception(f"Repository {repo_id} not found")

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def repo_stats(request, repo_id):
    """Get statistics for a repository"""
    try:
        # Get client for this specific repository's server
        client, repo = get_client_for_repo(repo_id, request.tenant)
        
        # First check if we have recent stats in operation history
        stats = client.extract_stats_from_operations(repo_id)
        
        if not stats:
            # If no stats found, get from dashboard
            dashboard = client.get_summary_dashboard()
            for repo_summary in dashboard.get("repoSummaries", []):
                if repo_summary.get("id") == repo_id:
                    stats = {
                        "total_size": repo_summary.get("bytesScannedLast_30Days", 0),
                        "bytes_added": repo_summary.get("bytesAddedLast_30Days", 0),
                        "snapshots_count": len(repo_summary.get("recentBackups", {}).get("flowId", [])),
                        "backups_success": repo_summary.get("backupsSuccessLast_30Days", 0),
                        "backups_failed": repo_summary.get("backupsFailedLast_30Days", 0)
                    }
                    break
        
        # Add snapshot data for more detailed metrics
        try:
            # Get snapshots to extract additional metrics
            snapshots_response = client.list_snapshots(repo_id)
            snapshots = snapshots_response.get("snapshots", [])
            
            # Calculate average duration from snapshots
            total_duration = 0
            success_count = 0
            snapshot_count = len(snapshots)
            
            for snapshot in snapshots:
                summary = snapshot.get("summary", {})
                if "totalDuration" in summary:
                    total_duration += float(summary.get("totalDuration", 0))
                    success_count += 1
                    
            # Add additional metrics
            stats["snapshot_count"] = snapshot_count
            stats["avg_duration_minutes"] = total_duration / success_count if success_count > 0 else 0
            stats["success_rate"] = (success_count / snapshot_count * 100) if snapshot_count > 0 else 0
            
            # Try to get compression data if available
            comp_stats = client.extract_stats_from_operations(repo_id)
            if comp_stats:
                stats.update({
                    "total_size_on_disk": comp_stats.get("total_size_on_disk", 0),
                    "data_blobs": comp_stats.get("data_blobs", 0),
                    "tree_blobs": comp_stats.get("tree_blobs", 0),
                    "compression_ratio": comp_stats.get("compression_ratio", 1.0)
                })
            
        except Exception as snapshot_error:
            logger.warning(f"Error getting snapshot metrics: {str(snapshot_error)}")
        
        return JsonResponse({
            "status": "success",
            "repo_id": repo_id,
            "stats": stats or {}
        })
        
    except Exception as e:
        logger.error(f"Error getting stats for repo {repo_id}: {str(e)}")
        return JsonResponse({
            "status": "error", 
            "message": str(e)
        }, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def compute_stats(request, repo_id):
    """Trigger computation of repository statistics"""
    try:
        # Get client for this specific repository's server
        client, repo = get_client_for_repo(repo_id, request.tenant)
        result = client.compute_stats(repo_id)
        return JsonResponse({
            "status": "success",
            "message": "Stats computation triggered",
            "result": result
        })
        
    except Exception as e:
        logger.error(f"Error computing stats for repo {repo_id}: {str(e)}")
        return JsonResponse({
            "status": "error", 
            "message": str(e)
        }, status=500)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_snapshots(request, repo_id):
    """List snapshots for a repository"""
    try:
        # Get client for this specific repository's server
        client, repo = get_client_for_repo(repo_id, request.tenant)
        plan_id = request.GET.get("plan_id", None)
        snapshots = client.list_snapshots(repo_id, plan_id)
        return JsonResponse({
            "status": "success",
            "repo_id": repo_id,
            "snapshots": snapshots.get("snapshots", [])
        })
        
    except Exception as e:
        logger.error(f"Error listing snapshots for repo {repo_id}: {str(e)}")
        return JsonResponse({
            "status": "error", 
            "message": str(e)
        }, status=500)

# Update the restore_snapshot function with better debugging:

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def restore_snapshot(request):
    """Restore files from a snapshot with correct Backrest API format"""
    try:
        # Extract data from request
        snapshot_id = request.data.get('snapshot_id')
        repository_id = request.data.get('repository_id')
        target_path = request.data.get('target_path')
        include_paths = request.data.get('include_paths', ['/'])
        exclude_patterns = request.data.get('exclude_patterns', [])
        
        logger.info(f"=== RESTORE REQUEST RECEIVED ===")
        logger.info(f"snapshot_id: '{snapshot_id}'")
        logger.info(f"repository_id from frontend: '{repository_id}'")
        logger.info(f"target_path: '{target_path}'")
        logger.info(f"include_paths: {include_paths}")
        logger.info(f"exclude_patterns: {exclude_patterns}")
        
        if not all([snapshot_id, repository_id, target_path]):
            return JsonResponse({
                "status": "error",
                "message": f"Missing required fields"
            }, status=400)
        
        # Find the repository
        try:
            repository = BackrestRepository.objects.get(
                repository_id=repository_id,
                tenant=request.tenant
            )
        except BackrestRepository.DoesNotExist:
            # Try by database ID as fallback
            try:
                repository = BackrestRepository.objects.get(
                    id=repository_id,
                    tenant=request.tenant
                )
            except BackrestRepository.DoesNotExist:
                return JsonResponse({
                    "status": "error",
                    "message": f"Repository not found: {repository_id}"
                }, status=404)
        
        # Get the correct repository ID for Backrest
        backrest_repo_id = repository.repository_id
        if not backrest_repo_id or backrest_repo_id.strip() == "":
            # Generate from name if empty
            backrest_repo_id = repository.name.replace(" ", "_").lower()
            repository.repository_id = backrest_repo_id
            repository.save()
            logger.info(f"Updated repository_id to: {backrest_repo_id}")
        
        logger.info(f"Using repository ID: '{backrest_repo_id}'")
        
        # Create Backrest service
        backrest_service = BackrestService(repository.server)
        
        # CRITICAL FIX: Use the correct Backrest API format
        # Based on the Go service file, this should be a RestoreSnapshotRequest
        restore_request = {
            "value": {  # Wrap in "value" field like other Backrest APIs
                "repo": backrest_repo_id,
                "snapshotId": str(snapshot_id),
                "path": "/",  # Source path in snapshot
                "target": str(target_path),  # Where to restore to
                "includePaths": include_paths,
                "excludePatterns": exclude_patterns
            }
        }
        
        logger.info(f"=== CALLING BACKREST API ===")
        logger.info(f"URL: {backrest_service.base_url}/v1.Backrest/Restore")
        logger.info(f"Payload: {json.dumps(restore_request, indent=2)}")
        
        # Call the Backrest API with correct format
        response = backrest_service._make_request(
            'POST',
            '/v1.Backrest/Restore',
            restore_request
        )
        
        logger.info(f"✓ Backrest restore response: {response}")
        
        # Create operation record
        operation = BackrestOperation.objects.create(
            tenant=request.tenant,
            repository=repository,
            operation_type="restore",
            operation_id=response.get('operationId') or f"restore_{int(time.time())}",
            status="running",
            started_at=timezone.now(),
            stats={
                'snapshot_id': snapshot_id,
                'target_path': target_path,
                'include_paths': include_paths
            }
        )
        
        return JsonResponse({
            'status': 'success',
            'message': 'Restore operation started',
            'operation_id': operation.operation_id,
            'backrest_response': response
        })
        
    except Exception as e:
        logger.error(f"❌ RESTORE ERROR: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return JsonResponse({
            "status": "error", 
            "message": str(e)
        }, status=500)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_operations(request):
    """Get operations history"""
    try:
        last_n = request.GET.get("last_n")
        if last_n:
            last_n = int(last_n)
            
        repo_id = request.GET.get("repo_id")
        operation_type = request.GET.get("type")
        
        if not repo_id:
            return JsonResponse({
                "status": "error",
                "message": "repo_id is required"
            }, status=400)
        
        # Get client for this specific repository's server
        client, repo = get_client_for_repo(repo_id, request.tenant)
        
        # Build selector
        selector = {"repoId": repo_id}
            
        operations = client.get_operations(last_n=last_n, selector=selector)
        
        # Filter by operation type if specified
        if operation_type and "operations" in operations:
            filtered_ops = []
            for op in operations["operations"]:
                op_key = f"operation{operation_type.capitalize()}"
                if op_key in op:
                    filtered_ops.append(op)
            operations["operations"] = filtered_ops
            
        return JsonResponse({
            "status": "success",
            "operations": operations.get("operations", [])
        })
        
    except Exception as e:
        logger.error(f"Error getting operations: {str(e)}")
        return JsonResponse({
            "status": "error", 
            "message": str(e)
        }, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def trigger_backup(request):
    """Trigger a backup operation"""
    try:
        data = json.loads(request.body)
        plan_id = data.get("plan_id")
        
        if not plan_id:
            return JsonResponse({
                "status": "error",
                "message": "Missing required parameter: plan_id"
            }, status=400)
        
        # Get the plan's repository and server
        from .models import BackrestPlan, BackrestRepository
        try:
            plan = BackrestPlan.objects.get(plan_id=plan_id, tenant=request.tenant)
            repo = plan.repository
            client = BackrestClient(server=repo.server)
        except BackrestPlan.DoesNotExist:
            return JsonResponse({
                "status": "error", 
                "message": f"Plan {plan_id} not found"
            }, status=404)
        
        result = client.trigger_backup(plan_id)
        return JsonResponse({
            "status": "success",
            "message": "Backup operation triggered",
            "result": result
        })
        
    except Exception as e:
        logger.error(f"Error triggering backup: {str(e)}")
        return JsonResponse({
            "status": "error", 
            "message": str(e)
        }, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_operation(request):
    """Cancel an operation"""
    try:
        data = json.loads(request.body)
        operation_id = data.get("operation_id")
        repo_id = data.get("repo_id")  # Need repo_id to identify the server
        
        if not operation_id or not repo_id:
            return JsonResponse({
                "status": "error",
                "message": "Missing required parameters: operation_id and repo_id"
            }, status=400)
        
        # Get client for this specific repository's server
        client, repo = get_client_for_repo(repo_id, request.tenant)
        result = client.cancel_operation(operation_id)
        return JsonResponse({
            "status": "success",
            "message": "Operation cancellation requested",
            "result": result
        })
        
    except Exception as e:
        logger.error(f"Error cancelling operation: {str(e)}")
        return JsonResponse({
            "status": "error", 
            "message": str(e)
        }, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sync_data(request):
    """Trigger synchronization of all Backrest data"""
    try:
        # Import sync functions
        from .sync import sync_repositories, sync_operations, sync_snapshots
        
        # Run synchronization
        repos_result = sync_repositories()
        ops_result = sync_operations(last_n=50)
        snaps_result = sync_snapshots()
        
        return JsonResponse({
            "status": "success",
            "repositories": repos_result,
            "operations": ops_result,
            "snapshots": snaps_result
        })
    except Exception as e:
        logger.error(f"Error syncing Backrest data: {str(e)}")
        return JsonResponse({
            "status": "error",
            "message": str(e)
        }, status=500)

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def fetch_backrest_logs(request):
    """
    Fetch and process Backrest logs
    GET: Return existing logs from database
    POST: Force refresh from server
    """
    try:
        # Get all repositories for this tenant
        repositories = BackrestRepository.objects.filter(tenant=request.tenant)
        
        # For GET requests, just return operations from database
        if request.method == 'GET':
            # Get operations from database
            operations = BackrestOperation.objects.filter(
                repository__in=repositories
            ).order_by('-started_at')[:100]  # Limit to recent 100 operations
            
            # Serialize operations for response
            serializer = BackrestOperationSerializer(operations, many=True)
            
            return Response({
                "status": "success",
                "count": len(operations),
                "operations": serializer.data
            })
        
        # For POST requests (refresh), use the existing fetch_from_server functionality
        else:
            # Get all servers used by these repos
            server_ids = repositories.values_list('server_id', flat=True).distinct()
            servers = Server.objects.filter(id__in=server_ids)
            
            logs_imported = 0
            operations_updated = 0
            
            for server in servers:
                # Create SSH connection
                ssh_client = get_ssh_client_for_server(server)
                
                if not ssh_client:
                    continue
                
                try:
                    # Execute command to fetch logs
                    lines_to_fetch = 500  # Default to 500 lines
                    command = f"cat /opt/backrest/data/processlogs/backrest.log | tail -n {lines_to_fetch}"
                    stdin, stdout, stderr = ssh_client.exec_command(command)
                    log_data = stdout.read().decode('utf-8')
                    
                    # Process each log line
                    for line in log_data.strip().split('\n'):
                        if not line:
                            continue
                        
                        try:
                            # Parse JSON log entry
                            log_entry = json.loads(line)
                            
                            # Create log entry in database
                            BackrestLog.objects.create(
                                tenant=request.tenant,
                                server=server,
                                level=log_entry.get('level', 'info'),
                                message=log_entry.get('msg', '')[:255],
                                logger_name=log_entry.get('logger', '')[:100],
                                error=log_entry.get('error', ''),
                                timestamp=process_log_timestamp(log_entry.get('ts', 0)),
                                source="processlogs/backrest.log"
                            )
                            logs_imported += 1
                            
                            # Process operations from logs - simplified
                            # Process operations from logs - simplified version
                            if 'task finished' in log_entry.get('msg', '') or 'task failed' in log_entry.get('msg', ''):
                                logger_name = log_entry.get('logger', '')
                                
                                # Try to extract plan name from logger name
                                if ' for plan ' in logger_name:
                                    match = re.search(r'for plan \"(.+?)\"', logger_name)
                                    if match:
                                        plan_name = match.group(1)
                                        
                                        # Find matching plan
                                        plan = BackrestPlan.objects.filter(name=plan_name, tenant=request.tenant).first()
                                        
                                        if plan:
                                            # Find operation by plan
                                            operations = BackrestOperation.objects.filter(
                                                plan=plan,
                                                status='running'
                                            ).order_by('-started_at')
                                            
                                            if operations.exists():
                                                op = operations.first()
                                                op.status = 'completed' if 'task finished' in log_entry.get('msg', '') else 'failed'
                                                op.completed_at = timezone.make_aware(process_log_timestamp(log_entry.get('ts', 0)))
                                                
                                                # Extract duration if available
                                                duration = log_entry.get('duration')
                                                if duration:
                                                    op.duration_seconds = float(duration)
                                                    
                                                # Add error if failed
                                                if op.status == 'failed' and 'error' in log_entry:
                                                    op.error = log_entry['error']
                                                
                                                op.save()
                                                operations_updated += 1
                        
                        except json.JSONDecodeError:
                            # Skip invalid JSON lines
                            continue
                        except Exception as entry_error:
                            logger.error(f"Error processing log entry: {str(entry_error)}")
                    
                    # Close SSH connection
                    ssh_client.close()
                
                except Exception as server_error:
                    logger.error(f"Error fetching logs from server {server.hostname}: {str(server_error)}")
            
            # Return success response
            return Response({
                "status": "success",
                "logs_imported": logs_imported,
                "operations_updated": operations_updated
            })
    
    except Exception as e:
        logger.exception(f"Error fetching Backrest logs: {str(e)}")
        return Response({
            "status": "error",
            "message": str(e)
        }, status=500)
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def check_repository(request, repo_id):
    """Trigger integrity check for a repository"""
    try:
        # Get tenant from request
        tenant = request.tenant

        # Get repository
        repo = get_object_or_404(BackrestRepository, repository_id=repo_id, tenant=tenant)

        # Create a task for the check operation
        server = repo.server
        backrest_service = BackrestService(server)

        # Call the DoRepoTask method with TASK_CHECK
        response = backrest_service.check_repository(repo_id)
        
        # Record the check operation in the database - FIXED VERSION
        operation = BackrestOperation.objects.create(
            tenant=tenant,
            operation_type='check',
            status='completed' if response.get('status') == 'success' else 'failed',
            repository=repo,
            started_at=timezone.now(),
            completed_at=timezone.now(),
            # Store output in stats as JSON instead of using output field
            stats={'check_output': response.get('output', '')}
            # Remove the output parameter that caused the error
        )

        # Update repository integrity status based on check result
        repo.last_checked = timezone.now()
        repo.integrity = 'verified' if response.get('status') == 'success' else 'needs_check'
        repo.save()

        return Response({
            'status': 'success' if response.get('status') == 'success' else 'error',
            'message': 'Repository integrity check completed',
            'operation_id': operation.id,
            'output': response.get('output', '')
        })
    except Exception as e:
        logger.exception(f"Failed to check repository integrity: {str(e)}")
        return Response({
            'status': 'error',
            'message': f'Failed to check repository integrity: {str(e)}',
        }, status=500)
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def debug_restore(request):
    """Debug version of restore to see what's going wrong"""
    try:
        data = request.data
        logger.info(f"=== DEBUG RESTORE REQUEST ===")
        logger.info(f"Raw request data: {data}")
        
        # Check all repositories
        all_repos = BackrestRepository.objects.filter(tenant=request.tenant)
        logger.info(f"Available repositories:")
        for repo in all_repos:
            logger.info(f"  ID: {repo.id}, Name: '{repo.name}', repository_id: '{repo.repository_id}'")
        
        # Try to find repository
        repository_id = data.get('repository_id')
        logger.info(f"Looking for repository with ID: '{repository_id}'")
        
        repository = None
        
        # Try multiple lookup methods
        try:
            repository = BackrestRepository.objects.get(repository_id=repository_id, tenant=request.tenant)
            logger.info(f"Found by repository_id: {repository.name}")
        except BackrestRepository.DoesNotExist:
            try:
                repository = BackrestRepository.objects.get(id=repository_id, tenant=request.tenant)
                logger.info(f"Found by database ID: {repository.name}")
            except (BackrestRepository.DoesNotExist, ValueError):
                logger.error(f"Repository not found with either method")
                return JsonResponse({"error": "Repository not found", "available": [
                    {"id": r.id, "name": r.name, "repository_id": r.repository_id} for r in all_repos
                ]}, status=404)
        
        # Check the repository_id field
        backrest_repo_id = repository.repository_id
        logger.info(f"Repository found: {repository.name}")
        logger.info(f"repository_id field: '{backrest_repo_id}' (type: {type(backrest_repo_id)}, length: {len(str(backrest_repo_id))})")
        
        if not backrest_repo_id or backrest_repo_id.strip() == "":
            logger.error(f"repository_id field is EMPTY!")
            # Try to fix it
            backrest_repo_id = "testing"  # Hardcode for testing
            repository.repository_id = backrest_repo_id
            repository.save()
            logger.info(f"Fixed repository_id to: '{backrest_repo_id}'")
        
        # Create the restore request
        restore_request = {
            "value": {
                "repo": backrest_repo_id,
                "snapshotId": data.get('snapshot_id'),
                "path": "/",
                "target": data.get('target_path'),
                "includePaths": data.get('include_paths', ['/']),
                "excludePatterns": data.get('exclude_patterns', [])
            }
        }
        
        logger.info(f"Final restore request: {json.dumps(restore_request, indent=2)}")
        logger.info(f"repo field: '{restore_request['value']['repo']}'")
        logger.info(f"repo field length: {len(restore_request['value']['repo'])}")
        logger.info(f"repo field is empty: {not restore_request['value']['repo'] or restore_request['value']['repo'].strip() == ''}")
        
        # Make the API call
        backrest_service = BackrestService(repository.server)
        response = backrest_service._make_request('POST', '/v1.Backrest/Restore', restore_request)
        
        return JsonResponse({
            "status": "success",
            "message": "Restore started successfully",
            "response": response
        })
        
    except Exception as e:
        logger.error(f"Debug restore error: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({"error": str(e)}, status=500)
    
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """Get real dashboard statistics"""
    try:
        # Get recent operations
        operations = BackrestOperation.objects.filter(
            tenant=request.tenant,
            started_at__gte=timezone.now() - timedelta(days=30)
        )
        
        # Get backup stats
        backup_operations = operations.filter(operation_type='backup')
        
        stats = {
            'total_operations': operations.count(),
            'by_status': {
                'completed': operations.filter(status='completed').count(),
                'running': operations.filter(status='running').count(),
                'failed': operations.filter(status='failed').count(),
            },
            'by_type': {
                'backup': backup_operations.count(),
                'restore': operations.filter(operation_type='restore').count(),
                'maintenance': operations.filter(operation_type__in=['prune', 'check']).count(),
            },
            'recent_backups': []
        }
        
        # Get recent backup data
        recent_backups = backup_operations.order_by('-started_at')[:5]
        for backup in recent_backups:
            stats['recent_backups'].append({
                'id': backup.operation_id,
                'repository': backup.repository.name if backup.repository else 'Unknown',
                'plan': backup.plan.name if backup.plan else 'Manual',
                'status': backup.status,
                'started_at': backup.started_at,
                'completed_at': backup.completed_at,
                'size': backup.stats.get('total_bytes_processed', 0) if backup.stats else 0
            })
        
        return JsonResponse(stats)
        
    except Exception as e:
        logger.error(f"Dashboard stats error: {e}")
        return JsonResponse({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def live_activity(request):
    """Get live activity feed combining system operations and backrest operations"""
    try:
        limit = int(request.GET.get('limit', 10))
        
        # Get system operations
        system_ops = SystemOperation.objects.filter(
            tenant=request.tenant
        ).order_by('-started_at')[:limit]
        
        # Get recent backrest operations  
        backrest_ops = BackrestOperation.objects.filter(
            tenant=request.tenant
        ).order_by('-started_at')[:limit]
        
        activities = []
        
        # Process system operations
        for op in system_ops:
            activities.append({
                'id': f'sys_{op.id}',
                'type': op.operation_type,
                'status': op.status,
                'description': op.description,
                'user': op.user,
                'timestamp': op.started_at,
                'repository': op.repository.name if op.repository else None,
                'plan': op.plan.name if op.plan else None,
                'source': 'system'
            })
        
        # Process backrest operations
        for op in backrest_ops:
            activities.append({
                'id': f'br_{op.id}',
                'type': op.operation_type,
                'status': op.status,
                'description': f'{op.operation_type.title()} {op.status} for {op.repository.name if op.repository else "Unknown"}',
                'user': 'System',
                'timestamp': op.started_at,
                'repository': op.repository.name if op.repository else None,
                'plan': op.plan.name if op.plan else None,
                'source': 'backrest'
            })
        
        # Sort by timestamp and limit
        activities.sort(key=lambda x: x['timestamp'], reverse=True)
        activities = activities[:limit]
        
        return JsonResponse({
            'results': activities,
            'count': len(activities)
        })
        
    except Exception as e:
        logger.error(f"Live activity error: {e}")
        return JsonResponse({'error': str(e)}, status=500)