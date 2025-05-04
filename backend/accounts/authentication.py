# filepath: c:\Users\defin\WCPROJECTMVP5.0\BACKEND\accounts\authentication.py
from django_tenants.utils import schema_context
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()

class PublicSchemaJWTAuthentication(JWTAuthentication):
    """
    Authenticates user based on JWT token, but always performs
    user lookup in the public schema.
    """
    def get_user(self, validated_token):
        """
        Attempts to find and return a user using the given validated token.
        Forces the lookup to occur in the public schema.
        """
        try:
            user_id = validated_token[settings.SIMPLE_JWT['USER_ID_CLAIM']]
        except KeyError:
            raise InvalidToken(_("Token contained no recognizable user identification"))

        try:
            # Force user lookup into the public schema
            with schema_context(settings.PUBLIC_SCHEMA_NAME):
                user = User.objects.get(**{settings.SIMPLE_JWT['USER_ID_FIELD']: user_id})
        except User.DoesNotExist:
            raise AuthenticationFailed(_("User not found"), code="user_not_found")

        if not user.is_active:
            raise AuthenticationFailed(_("User is inactive"), code="user_inactive")

        return user # Return the user found in the public schema