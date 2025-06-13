# filepath: c:\Users\defin\WCPROJECTMVP5.0\BACKEND\tenants\serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Tenant, Domain
import re # For validation/generation if needed

User = get_user_model()

class TenantSerializer(serializers.ModelSerializer):
    """Serializer for displaying Tenant information."""
    class Meta:
        model = Tenant
        # Exclude sensitive or internal fields if necessary
        fields = ['id', 'name', 'schema_name', 'first_name', 'last_name', 'email',
                  'company_name', 'is_active', 'created_on', 'max_users', 'max_storage_gb']
        read_only_fields = ['id', 'schema_name', 'created_on']

class DomainSerializer(serializers.ModelSerializer):
    """Serializer for displaying Domain information."""
    class Meta:
        model = Domain
        fields = ['id', 'domain', 'is_primary', 'tenant']
        read_only_fields = ['id', 'tenant']

class TenantSignupSerializer(serializers.Serializer):
    """Serializer for new tenant + owner signup request."""
    # Tenant fields
    name = serializers.CharField(max_length=100, help_text="Name of the tenant/organization.")
    company_name = serializers.CharField(max_length=100, required=False, allow_blank=True)

    # Owner fields
    username = serializers.CharField(max_length=150, help_text="Desired username for the tenant owner.") # <-- ADDED
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, help_text="Owner's last name.") # Removed schema generation note
    email = serializers.EmailField(help_text="Owner's email address (used for login).")
    password = serializers.CharField(write_only=True, style={'input_type': 'password'}, min_length=8)

    def validate_email(self, value):
        """Check if email already exists in public schema User table."""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_username(self, value): # <-- ADDED validation
        """Check if username already exists in public schema User table."""
        if not value or not value.strip():
             raise serializers.ValidationError("Owner username is required.")
        if not re.match(r'^[\w.@+-]+$', value): # Use Django's default username chars
             raise serializers.ValidationError("Enter a valid username. This value may contain only letters, numbers, and @/./+/-/_ characters.")
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def validate_last_name(self, value):
        """Ensure last name is provided."""
        if not value or not value.strip():
            raise serializers.ValidationError("Last name is required.")
        # Removed character check, schema name generation is separate
        return value.strip()

    def validate_name(self, value):
        """Ensure tenant name is provided."""
        if not value or not value.strip():
            raise serializers.ValidationError("Tenant name is required.")
        return value.strip()