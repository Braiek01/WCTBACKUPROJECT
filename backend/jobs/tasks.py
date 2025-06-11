# filepath: c:\Users\defin\WCTPROJECTMVP6.0\backend\jobs\tasks.py
from celery import shared_task
from django.utils import timezone
# Remove ansible_runner import if no longer used directly
# import ansible_runner
import tempfile
import os
import json
import logging
import docker # Import the Docker SDK
from docker.errors import DockerException, NotFound, APIError
from .models import BackupJob, JobLog
from django.conf import settings

logger = logging.getLogger(__name__)

def log_job_message(job, level, message):
    """Helper to create JobLog entries."""
    try:
        JobLog.objects.create(job=job, level=level, message=message)
    except Exception as e:
        logger.error(f"Failed to log message for job {job.id}: {e}")

@shared_task(bind=True)
def run_ansible_backup_job(self, job_id):
    """
    Celery task to execute an Ansible playbook for a backup job using Docker.
    """
    job = None
    docker_client = None
    container = None
    exit_code = -1 # Default error code
    logs = ""

    try:
        job = BackupJob.objects.get(id=job_id)
        job.status = BackupJob.StatusChoices.RUNNING
        job.started_at = timezone.now()
        job.save(update_fields=['status', 'started_at'])
        log_job_message(job, JobLog.LevelChoices.INFO, f"Job started. Task ID: {self.request.id}. Using Docker runner.")

        # --- Prepare for Docker ---
        docker_client = docker.from_env() # Connect to Docker daemon

        # --- Define Mounts ---
        # 1. Playbooks directory
        playbooks_host_path = os.path.join(settings.BASE_DIR, 'ansible', 'playbooks')
        playbooks_container_path = '/ansible/playbooks' # Must match WORKDIR + relative path if used

        # 2. SSH Key
        # IMPORTANT: Assumes key is at C:\Users\defin\.ssh\id_ed25519
        # Adjust path if needed. Consider making this configurable.
        ssh_key_host_path = os.path.expanduser('~/.ssh') # Gets C:\Users\defin\.ssh on Windows host
        ssh_key_container_path = '/root/.ssh' # Standard location inside container

        # 3. Temporary Artifacts Directory (Optional but good practice)
        # Create a temporary dir on the HOST for artifacts
        with tempfile.TemporaryDirectory(prefix=f"ansible_job_{job.id}_artifacts_") as artifacts_host_dir:
            artifacts_container_path = '/ansible_artifacts'

            volumes = {
                playbooks_host_path: {'bind': playbooks_container_path, 'mode': 'ro'}, # Read-only playbooks
                ssh_key_host_path: {'bind': ssh_key_container_path, 'mode': 'ro'}, # Read-only SSH keys
                artifacts_host_dir: {'bind': artifacts_container_path, 'mode': 'rw'} # Writable artifacts dir
            }

            # --- Prepare Ansible Command ---
            # Use the relative path from the job model, relative to the container mount point
            playbook_container_path_full = os.path.join(playbooks_container_path, os.path.basename(job.playbook_path))

            # Create a simple inventory string for ansible-playbook -i
            # More complex inventories might require mounting an inventory file
            inventory_string = f"{job.target_hosts} ansible_user=root" # Adjust user if needed

            # Prepare extra vars string for --extra-vars
            extra_vars_string = json.dumps(job.extra_vars or {})

            # --- Handle Vault Password ---
            # Option A: Environment Variable (Recommended)
            # Assumes ANSIBLE_VAULT_PASSWORD env var is set where Celery worker runs
            environment = {"ANSIBLE_VAULT_PASSWORD": os.environ.get("ANSIBLE_VAULT_PASSWORD", "")}
            # Option B: Mount a vault password file (adjust paths)
            # vault_pass_file_host = '/path/to/host/vault_pass.txt'
            # vault_pass_file_container = '/ansible/vault_pass.txt'
            # volumes[vault_pass_file_host] = {'bind': vault_pass_file_container, 'mode': 'ro'}
            # vault_arg = f"--vault-password-file {vault_pass_file_container}"

            # Construct the ansible-playbook command to run inside the container
            command = [
                "ansible-playbook",
                "-i", inventory_string,
                "--private-key", os.path.join(ssh_key_container_path, 'id_ed25519'), # Adjust key filename if needed
                "--extra-vars", extra_vars_string,
                # Add vault password file arg if using Option B: vault_arg,
                playbook_container_path_full
            ]
            command_str = " ".join(command) # For logging
            log_job_message(job, JobLog.LevelChoices.DEBUG, f"Docker command: {command_str}")
            log_job_message(job, JobLog.LevelChoices.DEBUG, f"Docker volumes: {volumes}")

            # --- Run Container ---
            container = docker_client.containers.run(
                image="ansible-runner-image", # The image built earlier
                command=command,
                volumes=volumes,
                environment=environment, # Pass vault password env var
                detach=True, # Run in background initially
                # network_mode="host", # Use if container needs access to host network directly
            )

            # Wait for container to finish and get logs/exit code
            result = container.wait()
            exit_code = result.get('StatusCode', -1)
            logs = container.logs().decode('utf-8')

            log_job_message(job, JobLog.LevelChoices.DEBUG, f"Container logs:\n{logs[:2000]}...") # Log snippet
            log_job_message(job, JobLog.LevelChoices.INFO, f"Container finished with exit code: {exit_code}")

            # --- Process Results ---
            if exit_code == 0:
                job.status = BackupJob.StatusChoices.SUCCESS
                log_job_message(job, JobLog.LevelChoices.INFO, "Playbook executed successfully via Docker.")
            else:
                job.status = BackupJob.StatusChoices.FAILED
                error_message = f"Playbook execution via Docker failed with exit code {exit_code}. Check logs."
                log_job_message(job, JobLog.LevelChoices.ERROR, error_message)

    except BackupJob.DoesNotExist:
         logger.error(f"BackupJob with ID {job_id} not found.")
         return f"Job {job_id} not found." # No job to update
    except DockerException as e:
        logger.error(f"Docker error running job {job_id}: {e}", exc_info=True)
        if job:
            log_job_message(job, JobLog.LevelChoices.ERROR, f"Docker execution failed: {e}")
            job.status = BackupJob.StatusChoices.FAILED
    except Exception as e:
        logger.error(f"Error running backup job {job_id} via Docker: {e}", exc_info=True)
        if job:
            log_job_message(job, JobLog.LevelChoices.ERROR, f"Task failed unexpectedly: {e}")
            job.status = BackupJob.StatusChoices.FAILED
    finally:
        # --- Cleanup ---
        if container:
            try:
                container.remove() # Remove the container
                logger.info(f"Removed container {container.short_id} for job {job_id}")
            except APIError as e:
                logger.warning(f"Could not remove container {container.short_id}: {e}")
        if job and job.status in [BackupJob.StatusChoices.RUNNING, BackupJob.StatusChoices.FAILED]:
            # Ensure finished_at is set if job was marked running or failed
            job.finished_at = timezone.now()
            job.save(update_fields=['status', 'finished_at'])
            log_job_message(job, JobLog.LevelChoices.INFO, f"Job finished with status: {job.status}")

        # Return status based on exit code
        if exit_code == 0:
            return f"Job {job.id} completed successfully via Docker."
        else:
            # Raise an exception if failed, so Celery knows
            raise RuntimeError(f"Job {job.id} failed via Docker with exit code {exit_code}. Logs: {logs[:500]}")