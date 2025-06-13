# filepath: c:\Users\defin\WCTPROJECTMVP6.0\backend\jobs\serializers.py
from rest_framework import serializers
from .models import BackupJob, JobLog # Import JobLog

class CreateBackupJobSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=True)
    target_hosts = serializers.CharField(required=True)
    playbook_path = serializers.CharField(max_length=500, required=True)
    backup_type = serializers.CharField(max_length=50, required=True)
    extra_vars = serializers.JSONField(required=False, default=dict)
    # Add publicKey if youfrontend request added it to the 
    publicKey = serializers.CharField(required=False, allow_blank=True)

class BackupJobResponseSerializer(serializers.ModelSerializer):
    job_id = serializers.IntegerField(source='id') # Map id to job_id

    class Meta:
        model = BackupJob
        fields = ('job_id', 'status', 'uuid') # Return ID, status, uuid

class ActivityLogSerializer(serializers.ModelSerializer):
    """
    Serializer for displaying recent activity logs on the dashboard.
    Maps JobLog fields to a format suitable for the frontend timeline.
    """
    # You might want to customize fields based on what the timeline needs
    # e.g., derive a 'description' or map 'level' to an 'icon' or 'color'
    job_name = serializers.CharField(source='job.name', read_only=True)
    timestamp_iso = serializers.DateTimeField(source='timestamp', format='iso-8601', read_only=True)

    class Meta:
        model = JobLog
        fields = (
            'id',
            'job', # Include job ID if needed
            'job_name', # Include job name
            'timestamp_iso', # Use ISO format for easier frontend parsing
            'level',
            'message',
        )
        read_only_fields = fields # Make all fields read-only for this view

class MysqlDumpTriggerSerializer(serializers.Serializer):
    target_host_ip = serializers.IPAddressField(required=True)
    ssh_user = serializers.CharField(max_length=100, required=True)
    ssh_private_key = serializers.CharField(style={'base_template': 'textarea.html'}, required=True)
    
    mysql_database_name = serializers.CharField(max_length=100, required=True)
    mysql_user = serializers.CharField(max_length=100, required=True)
    mysql_password = serializers.CharField(max_length=100, required=True, allow_blank=False) # Consider security implications
    mysql_backup_directory = serializers.CharField(max_length=255, required=True)

    # You could add backup_job_name, backup_job_uuid if needed by the playbook later
    # backup_job_name = serializers.CharField(max_length=255, required=False)
    # backup_job_uuid = serializers.UUIDField(required=False)

    def validate_ssh_private_key(self, value):
        """
        Basic validation for SSH key format (starts with -----BEGIN, ends with -----END).
        More robust validation could be added.
        """
        if not value.strip().startswith("-----BEGIN") or \
           not value.strip().endswith("PRIVATE KEY-----"):
            raise serializers.ValidationError(
                "Invalid SSH private key format. Must start with '-----BEGIN ... PRIVATE KEY-----' "
                "and end with '-----END ... PRIVATE KEY-----'."
            )
        return value

class TestFileCreateTriggerSerializer(serializers.Serializer):
    target_host_ip = serializers.IPAddressField(required=True)
    ssh_user = serializers.CharField(max_length=100, required=True)
    ssh_private_key = serializers.CharField(
        style={'base_template': 'textarea.html'},
        required=False,  # <-- Make optional
        allow_blank=True
    )
    bitwarden_item_name = serializers.CharField(required=False, allow_blank=True)  # <-- Add this

    # Optional parameters for the test file playbook
    target_file_path = serializers.CharField(max_length=255, required=False, allow_blank=True)
    target_file_content = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, data):
        # Require at least one source of SSH key
        if not data.get('ssh_private_key') and not data.get('bitwarden_item_name'):
            raise serializers.ValidationError(
                "You must provide either 'ssh_private_key' or 'bitwarden_item_name'."
            )
        return data

    def validate_ssh_private_key(self, value):
        if value and (not value.strip().startswith("-----BEGIN") or not value.strip().endswith("PRIVATE KEY-----")):
            raise serializers.ValidationError(
                "Invalid SSH private key format. Must start with '-----BEGIN ... PRIVATE KEY-----' "
                "and end with '-----END ... PRIVATE KEY-----'."
            )
        return value