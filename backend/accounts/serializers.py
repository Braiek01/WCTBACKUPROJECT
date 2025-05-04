# filepath: c:\Users\defin\WCPROJECTMVP5.0\BACKEND\accounts\serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model
# Remove the direct import of choices
# from .models import TENANT_ROLE_CHOICES # Import choices

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    """General User Serializer for display purposes."""
    tenant_id = serializers.ReadOnlyField(source='tenant.id') # Show tenant ID from public record

    class Meta:
        model = User
        # List fields to expose via API - exclude sensitive fields like password
        fields = ['id', 'uuid', 'username', 'email', 'first_name', 'last_name',
                  'role', 'role_in_tenant', 'is_active', 'is_staff',
                  'tenant_id', 'date_joined', 'last_updated']
        read_only_fields = ['id', 'uuid', 'date_joined', 'last_updated', 'tenant_id', 'role']

class TenantUserCreateSerializer(serializers.Serializer):
    """Serializer for creating users within a specific tenant context by a tenant admin."""
    username = serializers.CharField(max_length=150) # REQUIRED
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True) # OPTIONAL
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, style={'input_type': 'password'}, min_length=8)
    role_in_tenant = serializers.ChoiceField(choices=User.TENANT_ROLE_CHOICES, default='operator')

    # Validation happens in the view