# backend/backrest/serializers.py
from rest_framework import serializers
from .models import (
    SSHKey, Server, BackrestRepository, 
    BackrestPlan, BackrestOperation, BackrestSnapshot,
    BackrestLog
)

class SSHKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = SSHKey
        fields = ['id', 'name', 'public_key', 'private_key', 'fingerprint', 'created_at']
        extra_kwargs = {
            'private_key': {'write_only': True},
            'fingerprint': {'read_only': True}
        }

class ServerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Server
        fields = [
            'id', 'name', 'hostname', 'ip_address', 'ssh_port', 
            'ssh_user', 'ssh_key', 'status', 'backrest_port', 
            'backrest_version', 'last_connection', 'error_message',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['status', 'backrest_version', 'last_connection', 'error_message']

class BackrestRepositorySerializer(serializers.ModelSerializer):
    class Meta:
        model = BackrestRepository
        fields = [
            'id', 'server', 'name', 'uri', 'password',
            'created_at', 'updated_at', 'repository_id'
        ]
        extra_kwargs = {
            'password': {'write_only': True},
            'repository_id': {'read_only': True}
        }

class BackrestPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackrestPlan
        fields = [
            'id', 'repository', 'name', 'paths', 'excludes',
            'schedule', 'retention_policy', 'created_at', 
            'updated_at', 'plan_id'
        ]
        read_only_fields = ['plan_id']

class BackrestSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackrestSnapshot
        fields = [
            'id', 'repository', 'plan', 'snapshot_id', 'time',
            'hostname', 'username', 'summary', 'size_bytes',
            'file_count', 'indexed_at'
        ]
        read_only_fields = ['indexed_at']

class BackrestOperationSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackrestOperation
        fields = [
            'id', 'repository', 'plan', 'operation_id', 'operation_type',
            'status', 'started_at', 'completed_at', 'snapshot_id',
            'stats', 'error', 'job'
        ]
        read_only_fields = ['operation_id', 'status']

class BackrestLogSerializer(serializers.ModelSerializer):
    server_name = serializers.CharField(source='server.name', read_only=True)
    
    class Meta:
        model = BackrestLog
        fields = ['id', 'server', 'server_name', 'level', 'message', 
                  'logger_name', 'error', 'timestamp', 'source']