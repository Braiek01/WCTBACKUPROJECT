# filepath: c:\Users\defin\WCTPROJECTMVP6.0\backend\jobs\api_views.py
import shlex
from rest_framework import generics, permissions, status, views
from rest_framework.response import Response
from django.db import transaction
import logging
import subprocess
import tempfile
import os
import stat
import subprocess
import logging
from django.conf import settings
import ansible_runner # Import ansible_runner
import uuid # For unique run identifiers

from .models import BackupJob, JobLog # Import JobLog
from .serializers import ( # Import ActivityLogSerializer
    CreateBackupJobSerializer,
    BackupJobResponseSerializer,
    ActivityLogSerializer,
    MysqlDumpTriggerSerializer, # Import the new serializer
    TestFileCreateTriggerSerializer # Import the new serializer
)
from .tasks import run_ansible_backup_job
# Import your tenant permission if needed
# from accounts.api_views import IsTenantAdminOrOwner

logger = logging.getLogger(__name__)



def windows_to_wsl_path(windows_path):
    """Converts a Windows path to a WSL-accessible path."""
    path = str(windows_path).replace('\\', '/') # Ensure input is string
    if ':' in path:
        drive, rest_of_path = path.split(':', 1)
        # CORRECTED LINE:
        path = f"/mnt/{drive.lower()}{rest_of_path}"
    return path



import json

def get_ssh_key_from_bitwarden(item_name, bw_session):
    """Fetch SSH private key from Bitwarden item, supporting all common SSH key item layouts."""
    result = subprocess.run(
        ["bw", "get", "item", item_name],
        capture_output=True,
        text=True,
        env={**os.environ, "BW_SESSION": bw_session}
    )
    
    # Log the raw output for debugging
    logger.debug(f"Bitwarden CLI return code: {result.returncode}")
    logger.debug(f"Bitwarden CLI stdout (first 100 chars): {result.stdout[:100] if result.stdout else 'Empty'}")
    logger.debug(f"Bitwarden CLI stderr (first 100 chars): {result.stderr[:100] if result.stderr else 'Empty'}")
    
    if result.returncode != 0:
        logger.error(f"Failed to get SSH key from Bitwarden: {result.stderr}")
        raise Exception(f"Could not retrieve SSH key from Bitwarden: {result.stderr}")
    
    # Check if output is empty
    if not result.stdout or result.stdout.strip() == "":
        logger.error("Bitwarden CLI returned empty output")
        raise Exception("Bitwarden CLI returned empty output. Check your session token and item name.")
    
    # Check for known error messages
    if "not logged in" in result.stdout.lower() or "not logged in" in result.stderr.lower():
        logger.error("Bitwarden CLI reports not logged in. Session may have expired.")
        raise Exception("Bitwarden session expired. Please re-authenticate.")
    
    # Try to parse as JSON
    try:
        item = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Bitwarden output as JSON: {e}")
        logger.error(f"Raw output: {result.stdout}")
        raise Exception(f"Invalid response from Bitwarden CLI. Output was not valid JSON: {result.stdout[:100]}...")
    
    # Check for SSH Key type (type 5) first
    if item.get('type') == 5 and 'sshKey' in item and 'privateKey' in item['sshKey']:
        logger.info("Found SSH key in Bitwarden item's sshKey.privateKey field (native SSH key type)")
        private_key = item['sshKey']['privateKey']
        return private_key.strip()
        
    # If not an SSH Key type, try other locations...
    
    # 1. Top-level 'privateKey' (older format)
    private_key = item.get("privateKey")
    if private_key:
        logger.info("Found SSH key in top-level privateKey field")
        return private_key.strip()
        
    # 2. In 'fields' as 'private key'
    fields = item.get("fields", [])
    if fields:
        for field in fields:
            if field.get("name", "").lower() == "private key":
                private_key = field.get("value", "")
                if private_key:
                    logger.info("Found SSH key in fields array")
                    return private_key.strip()
    
    # 3. In 'login'->'password' (rare)
    login = item.get("login", {})
    if login and "password" in login and "PRIVATE KEY" in login["password"]:
        logger.info("Found SSH key in login.password field")
        return login["password"].strip()
    
    # 4. In 'notes'
    notes = item.get("notes")
    if notes is not None and "PRIVATE KEY" in notes:  # Fixed! Check if notes exists and isn't None
        logger.info("Found SSH key in notes field")
        return notes.strip()
    
    # If we got here, no SSH key was found
    logger.error(f"SSH private key not found in Bitwarden item. Available fields: {list(item.keys())}")
    raise Exception("SSH private key not found in Bitwarden item")

def test_ssh_key(key_path, target_host, username):
    """Test SSH key validity using ssh-keygen and ssh -T."""
    # Test key format
    keygen_result = subprocess.run(
        ['ssh-keygen', '-l', '-f', key_path],
        capture_output=True,
        text=True
    )
    logger.info(f"ssh-keygen test results: {keygen_result.stdout}")
    if keygen_result.stderr:
        logger.error(f"ssh-keygen errors: {keygen_result.stderr}")

    # Test connection
    ssh_test = subprocess.run(
        [
            'ssh',
            '-i', key_path,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'BatchMode=yes',
            '-T',
            f'{username}@{target_host}'
        ],
        capture_output=True,
        text=True
    )
    logger.info(f"SSH test exit code: {ssh_test.returncode}")
    if ssh_test.stdout:
        logger.info(f"SSH test output: {ssh_test.stdout}")
    if ssh_test.stderr:
        logger.error(f"SSH test errors: {ssh_test.stderr}")

    return keygen_result.returncode == 0 and ssh_test.returncode == 0

class CreateBackupJobView(generics.CreateAPIView):
    """
    API endpoint to create and trigger a new backup job.
    """
    serializer_class = CreateBackupJobSerializer
    # Adjust permissions as needed - e.g., only tenant admins/owners
    permission_classes = [permissions.IsAuthenticated] # Add IsTenantAdminOrOwner if needed

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data

        try:
            # Use transaction.atomic to ensure job creation and task sending are linked
            with transaction.atomic():
                # Create the job instance, linking to tenant and user
                job = BackupJob.objects.create(
                    tenant=request.tenant, # Assumes TenantMainMiddleware adds tenant to request
                    user=request.user,
                    name=validated_data['name'],
                    target_hosts=validated_data['target_hosts'],
                    playbook_path=validated_data['playbook_path'],
                    backup_type=validated_data['backup_type'],
                    extra_vars=validated_data.get('extra_vars', {}),
                    status=BackupJob.StatusChoices.PENDING # Explicitly set pending
                )
                logger.info(f"Created BackupJob {job.id} for tenant {request.tenant.schema_name}")

                # Send task to Celery worker
                task_result = run_ansible_backup_job.delay(job.id)
                logger.info(f"Dispatched Celery task {task_result.id} for BackupJob {job.id}")

            # Prepare response using the response serializer
            response_serializer = BackupJobResponseSerializer(job)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED) # Use 201 Created

        except Exception as e:
            logger.error(f"Failed to create/dispatch backup job for tenant {request.tenant.schema_name}: {e}", exc_info=True)
            return Response({"detail": "Failed to create or dispatch backup job."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class RecentActivityListView(generics.ListAPIView):
    """
    API endpoint to retrieve recent activity logs (JobLog entries)
    for the current tenant's dashboard.
    """
    serializer_class = ActivityLogSerializer
    permission_classes = [permissions.IsAuthenticated] # Ensure user is logged in

    def get_queryset(self):
        # Filter logs belonging to jobs of the current tenant
        # Order by timestamp descending to get the latest first
        # Limit the number of results (e.g., last 20)
        tenant = self.request.tenant
        return JobLog.objects.filter(job__tenant=tenant).order_by('-timestamp')[:20] # Adjust limit as needed

class TriggerMysqlDumpBackupView(views.APIView):
    """
    Triggers an Ansible playbook via Docker to perform a MySQL dump.
    """
    permission_classes = [permissions.IsAuthenticated] # Or IsAdminUser, or a custom permission

    def post(self, request, *args, **kwargs):
        serializer = MysqlDumpTriggerSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        
        target_host_ip = validated_data['target_host_ip']
        ssh_user = validated_data['ssh_user']
        ssh_private_key_content = validated_data['ssh_private_key']
        
        db_name = validated_data['mysql_database_name']
        db_user = validated_data['mysql_user']
        db_password = validated_data['mysql_password']
        backup_dir_on_target = validated_data['mysql_backup_directory']

        # Define paths
        # Assuming your playbooks are in backend/ansible/playbooks
        host_playbooks_dir = os.path.join(settings.BASE_DIR, 'ansible', 'playbooks')
        playbook_name = 'mysqldump_playbook.yml' # Your playbook file

        # Create a temporary directory for Ansible artifacts (inventory, SSH key)
        # This directory will be mounted into the Docker container.
        with tempfile.TemporaryDirectory() as temp_ansible_run_dir_host:
            logger.info(f"Temporary Ansible run directory created: {temp_ansible_run_dir_host}")

            # 1. Write SSH private key to a temporary file
            ssh_key_filename = 'id_rsa_ansible_temp'
            host_ssh_key_path = os.path.join(temp_ansible_run_dir_host, ssh_key_filename)
            with open(host_ssh_key_path, 'w') as f:
                f.write(ssh_private_key_content)
            # Set permissions for the SSH key file (readable only by owner)
            os.chmod(host_ssh_key_path, stat.S_IRUSR | stat.S_IWUSR) # 0600
            logger.info(f"Temporary SSH key written to: {host_ssh_key_path}")

            # After writing the SSH key to the temp file:
            logger.info(f"SSH key permissions check: {oct(os.stat(host_ssh_key_path).st_mode & 0o777)}")

            # Path to SSH key inside the Docker container
            docker_ssh_key_path = f"/mnt/ansible_run_data/{ssh_key_filename}"

            # 2. Create dynamic inventory file
            inventory_content = f"""
[target_server]
{target_host_ip} ansible_user={ssh_user} ansible_ssh_private_key_file={docker_ssh_key_path} ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
"""
            host_inventory_path = os.path.join(temp_ansible_run_dir_host, 'inventory.ini')
            with open(host_inventory_path, 'w') as f:
                f.write(inventory_content.strip())
            logger.info(f"Temporary inventory file written to: {host_inventory_path}")
            
            # Path to inventory inside the Docker container
            docker_inventory_path = "/mnt/ansible_run_data/inventory.ini"
            docker_playbook_path = f"/mnt/playbooks/{playbook_name}"

            # 3. Construct Docker command
            # Ensure the Docker image for Ansible is available (e.g., cytopia/ansible or your custom one)
            # For Windows paths in Docker mounts, ensure they are correctly formatted if needed,
            # though Docker Desktop usually handles C:\... paths well.
            docker_command = [
                "docker", "run", "--rm",
                "-v", f"{host_playbooks_dir}:/mnt/playbooks:ro",      # Mount playbooks read-only
                "-v", f"{temp_ansible_run_dir_host}:/mnt/ansible_run_data:ro", # Mount temp dir with key/inventory read-only
                "my-ansible-runner:latest", # Or your preferred Ansible Docker image
                "ansible-playbook",
                "-i", docker_inventory_path,
                docker_playbook_path,
                "--extra-vars", f"mysql_database_name='{db_name}' mysql_user='{db_user}' mysql_password='{db_password}' mysql_backup_directory='{backup_dir_on_target}'"
            ]
            
            logger.info(f"Executing Docker command: {' '.join(docker_command)}")

            try:
                # 4. Execute the Docker command
                process = subprocess.run(docker_command, capture_output=True, text=True, check=False) # check=False to handle non-zero exit codes manually
                
                logger.info(f"Ansible playbook execution finished. RC: {process.returncode}")
                logger.debug(f"Ansible STDOUT:\n{process.stdout}")
                if process.stderr:
                    logger.error(f"Ansible STDERR:\n{process.stderr}")

                if process.returncode == 0:
                    return Response({
                        "message": "MySQL dump playbook executed successfully.",
                        "output": process.stdout,
                        "playbook_log_details": "See server logs for full stdout/stderr." 
                    }, status=status.HTTP_200_OK)
                else:
                    return Response({
                        "message": "MySQL dump playbook execution failed.",
                        "error": process.stderr or "Unknown error, check logs.",
                        "output": process.stdout,
                        "playbook_log_details": "See server logs for full stdout/stderr."
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            except FileNotFoundError:
                logger.error("Docker command not found. Is Docker installed and in PATH?")
                return Response({"error": "Docker command not found. Ensure Docker is installed and accessible."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            except Exception as e:
                logger.error(f"An unexpected error occurred: {str(e)}", exc_info=True)
                return Response({"error": f"An unexpected error occurred: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        # Temporary directory and its contents (key, inventory) are automatically cleaned up here



class TriggerTestFileCreateView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TestFileCreateTriggerSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            logger.error("Serializer validation failed: %s", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        target_host_ip = validated_data['target_host_ip']
        ssh_user = validated_data['ssh_user']
        bitwarden_item_name = validated_data.get('bitwarden_item_name', 'ansible-ssh-key')
        bw_session = os.environ.get("BW_SESSION")
        logger.info(f"Received request for host: {target_host_ip}, user: {ssh_user}, bitwarden_item_name: {bitwarden_item_name}")

        if not bw_session:
            logger.error("Bitwarden session key (BW_SESSION) not set in environment.")
            return Response({"error": "Bitwarden session key (BW_SESSION) not set in environment."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        ssh_private_key_content = ""
        try:
            ssh_private_key_content = get_ssh_key_from_bitwarden(bitwarden_item_name, bw_session)
            logger.info("Successfully fetched SSH key from Bitwarden.")
        except Exception as e:
            logger.error(f"Failed to fetch SSH key from Bitwarden: {e}", exc_info=True)
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        target_file_path_param = validated_data.get('target_file_path')
        target_file_content_param = validated_data.get('target_file_content')

        playbook_name = 'file_test.yml' # Assuming this is your target playbook
        # Construct the absolute path to the playbook
        # settings.BASE_DIR should be /mnt/c/Users/defin/WCTPROJECTMVP6.0/backend
        playbook_path = os.path.join(settings.BASE_DIR, 'ansible', 'playbooks', playbook_name)
        logger.info(f"Playbook path resolved to: {playbook_path}")

        if not os.path.exists(playbook_path):
            logger.error(f"Playbook not found at: {playbook_path}")
            return Response({"error": f"Playbook not found at specified path: {playbook_path}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Create a temporary directory for ansible-runner's private_data_dir
        # This directory will hold the ssh key, inventory, and artifacts.
        # It will be automatically cleaned up when the 'with' block exits.
        with tempfile.TemporaryDirectory(prefix="ansible_runner_") as runner_temp_dir:
            logger.info(f"Created temporary directory for ansible-runner: {runner_temp_dir}")

            # 1. Write SSH key to a file within the runner_temp_dir
            temp_key_filename = "temp_ssh_key"
            temp_key_path = os.path.join(runner_temp_dir, temp_key_filename)
            try:
                with open(temp_key_path, 'w') as tf:
                    tf.write(ssh_private_key_content)
                    tf.write('\n')  # Ensure there's a newline at the end
                # Change permissions to 0600
                os.chmod(temp_key_path, 0o600)  # Use os.chmod instead of os.fchmod
                logger.info(f"Temporary SSH key written to: {temp_key_path}")
                
                # Verify the key content
                with open(temp_key_path, 'r') as tf:
                    logger.debug(f"Key file contents (first line): {tf.readline().strip()}")
                    
            except Exception as e:
                logger.error(f"Failed to write SSH key to temp file: {e}", exc_info=True)
                return Response({"error": "Failed to write SSH key to temp file."}, status=500)

            # After writing the SSH key to the temp file:
            logger.info(f"SSH key permissions check: {oct(os.stat(temp_key_path).st_mode & 0o777)}")

            # 2. Create dynamic inventory content pointing to the SSH key file
            # The path to the key in the inventory should be absolute or relative to where ansible-runner executes.
            # Using the absolute path to the temp key is safest here.
            inventory_content = (
                "[target_server]\n"
                f"{target_host_ip} ansible_user={ssh_user} ansible_ssh_private_key_file={temp_key_path} "
                "ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -vvv' "
                "ansible_ssh_extra_args='-o ConnectTimeout=10'\n"
            )
            
            # Write inventory to a file within runner_temp_dir
            inventory_filename = "inventory.ini"
            inventory_file_path = os.path.join(runner_temp_dir, inventory_filename)
            try:
                with open(inventory_file_path, 'w') as invf:
                    invf.write(inventory_content)
                logger.info(f"Temporary inventory file written to: {inventory_file_path}")
                logger.debug(f"Inventory content:\n{inventory_content}")
            except Exception as e:
                logger.error(f"Failed to write inventory file: {e}", exc_info=True)
                # No need to manually remove temp_key_path, TemporaryDirectory handles cleanup
                return Response({"error": "Failed to write inventory file."}, status=500)

            # 3. Build extra vars as a dictionary
            extra_vars_dict = {}
            if target_file_path_param:
                extra_vars_dict['target_file_path'] = target_file_path_param
            if target_file_content_param is not None:
                extra_vars_dict['target_file_content'] = target_file_content_param
            logger.info(f"Extra vars dictionary: {extra_vars_dict}")

            # 4. Run the ansible-playbook command using ansible-runner
            run_identifier = str(uuid.uuid4())
            logger.info(f"Executing Ansible playbook using ansible-runner. Run ID: {run_identifier}")
            
            # Ensure playbook_path is an absolute path to the playbook file itself
            # ansible-runner will typically copy project contents if playbook is relative to a project dir,
            # but an absolute path to the .yml file is also fine.
            
            runner_config = {
                'private_data_dir': runner_temp_dir,
                'playbook': playbook_path, # Absolute path to your playbook .yml file
                'inventory': inventory_file_path, # Path to the inventory file we created
                'extravars': extra_vars_dict,
                'verbosity': 4, # For detailed output, similar to -vvvv
                'quiet': False, # Show runner output
                'ident': run_identifier, # Unique ID for this run
                # 'project_dir': os.path.join(settings.BASE_DIR, 'ansible', 'playbooks') # If playbook was relative
            }
            
            logger.debug(f"Ansible Runner config: {runner_config}")

            try:
                # Replace the ansible-runner execution block:
                runner = ansible_runner.run(
                    private_data_dir=runner_temp_dir,
                    playbook=os.path.basename(playbook_path),
                    project_dir=os.path.dirname(playbook_path),
                    inventory=inventory_file_path,
                    extravars=extra_vars_dict,
                    verbosity=4,
                    quiet=False,
                    ident=run_identifier
                )

                logger.info(f"Ansible Runner execution finished. Status: {runner.status}, RC: {runner.rc}")
                
                # Get output
                stdout = runner.stdout.read() if runner.stdout else ""
                stderr = runner.stderr.read() if runner.stderr else ""
                
                logger.debug(f"Ansible Runner STDOUT:\n{stdout}")
                if stderr:
                    logger.error(f"Ansible Runner STDERR:\n{stderr}")

                if runner.rc == 0:
                    return Response({
                        "message": f"Playbook '{playbook_name}' executed successfully.",
                        "output": stdout,
                        "run_identifier": run_identifier
                    }, status=status.HTTP_200_OK)
                else:
                    return Response({
                        "message": f"Playbook '{playbook_name}' execution failed.",
                        "error": stderr or "Unknown error, check logs.",
                        "output": stdout,
                        "run_identifier": run_identifier,
                        "return_code": runner.rc
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            except Exception as e:
                logger.error(f"Exception during Ansible Runner execution: {e}", exc_info=True)
                return Response(
                    {"error": f"Exception during Ansible Runner execution: {str(e)}"}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        # The 'with tempfile.TemporaryDirectory() as runner_temp_dir:' block ensures cleanup.
        # No manual os.remove needed for files inside runner_temp_dir.

    def get(self, request, *args, **kwargs):
        return Response({"message": "GET request to TriggerTestFileCreateView. Use POST to trigger playbook via WSL."}, status=status.HTTP_200_OK)

# Add views later for listing jobs, getting details, logs etc.
# class BackupJobListView(generics.ListAPIView): ...
# class BackupJobDetailView(generics.RetrieveAPIView): ...
# class JobLogListView(generics.ListAPIView): ...