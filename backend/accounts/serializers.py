import logging
from django.contrib.auth import get_user_model
from rest_framework import serializers, exceptions
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

logger = logging.getLogger(__name__)
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
    role_in_tenant = serializers.ChoiceField(choices=User.RoleInTenant.choices, default='operator')

    # Validation happens in the view

class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        
        # Add custom claims
        token['username'] = user.username
        token['email'] = user.email
        token['role'] = user.role
        token['role_in_tenant'] = user.role_in_tenant
        
        return token
        
    def validate(self, attrs):
        data = super().validate(attrs)
        
        # Add tenant_domain and user details to response
        tenant = self.user.tenant
        domain = tenant.domains.filter(is_primary=True).first()
        if domain:
            data['tenant_domain'] = domain.domain
            
        # Add basic user info
        data['user'] = {
            'username': self.user.username,
            'email': self.user.email,
            'role': self.user.role,
            'role_in_tenant': self.user.role_in_tenant,
        }
        
        return data

class PasswordResetSerializer(serializers.Serializer):
    password = serializers.CharField(required=True, write_only=True)