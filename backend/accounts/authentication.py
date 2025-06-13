# filepath: c:\Users\defin\WCPROJECTMVP5.0\BACKEND\accounts\authentication.py
from django_tenants.utils import schema_context
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend, BaseBackend
from django.db.models import Q # Import Q object for OR queries
import logging
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed
from django.utils.translation import gettext_lazy as _

logger = logging.getLogger(__name__)
User = get_user_model()
UserModel = get_user_model() # <--- DEFINE UserModel HERE

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
                user = UserModel.objects.get(**{settings.SIMPLE_JWT['USER_ID_FIELD']: user_id})
        except UserModel.DoesNotExist:
            raise AuthenticationFailed(_("User not found"), code="user_not_found")

        if not user.is_active:
            raise AuthenticationFailed(_("User is inactive"), code="user_inactive")

        return user # Return the user found in the public schema

class EmailOrUsernameLoginBackend(BaseBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        # Get the actual login identifier. If USERNAME_FIELD is 'email',
        # Django's authenticate() passes it as a keyword arg named 'email'.
        identifier_field_name = UserModel.USERNAME_FIELD # This will be 'email'
        login_identifier = kwargs.get(identifier_field_name)
        if username: # If simplejwt passes it directly as username (e.g. if USERNAME_FIELD was 'username')
            login_identifier = username

        logger.debug(
            f"EmailOrUsernameLoginBackend: Authenticating with identifier_field='{identifier_field_name}', "
            f"login_identifier='{login_identifier}', password present: {'Yes' if password else 'No'}"
        )

        if not login_identifier or not password:
            logger.warning("EmailOrUsernameLoginBackend: login_identifier or password not provided.")
            return None

        try:
            # Attempt to authenticate as a tenant owner by email (identifier_field_name is 'email')
            logger.debug(f"Checking for TENANT_OWNER with {identifier_field_name}: '{login_identifier}'")
            # Construct the query dynamically using the identifier_field_name
            owner_query_filter = {
                f"{identifier_field_name}__iexact": login_identifier,
                "role": UserModel.Role.TENANT_OWNER
            }
            user_as_owner = UserModel.objects.filter(**owner_query_filter).first()

            if user_as_owner:
                logger.debug(f"Found potential owner: {getattr(user_as_owner, identifier_field_name)}, active: {user_as_owner.is_active}")
                if user_as_owner.check_password(password):
                    if user_as_owner.is_active:
                        logger.info(f"Authenticated tenant owner by {identifier_field_name}: {login_identifier}")
                        return user_as_owner
                    else:
                        logger.warning(f"Tenant owner {login_identifier} is INACTIVE.")
                        return None
                else:
                    logger.warning(f"Password check FAILED for owner: {login_identifier}")
            else:
                logger.debug(f"No TENANT_OWNER found with {identifier_field_name}: '{login_identifier}'")

            # Attempt to authenticate as a tenant member by username
            # For members, we assume they might try to log in using their 'username' field,
            # even if the request field is 'email'.
            logger.debug(f"Checking for TENANT_MEMBER with username: '{login_identifier}'")
            user_as_member = UserModel.objects.filter(
                (Q(username__iexact=login_identifier) | Q(email__iexact=login_identifier)) & 
                Q(role=UserModel.Role.TENANT_MEMBER)
            ).first()

            if user_as_member:
                logger.debug(f"Found potential member: {user_as_member.username}, active: {user_as_member.is_active}")
                if user_as_member.check_password(password):
                    if user_as_member.is_active:
                        logger.info(f"Authenticated tenant member by username: {login_identifier}")
                        return user_as_member
                    else:
                        logger.warning(f"Tenant member {login_identifier} is INACTIVE.")
                        return None
                else:
                    logger.warning(f"Password check FAILED for member: {login_identifier}")
            else:
                logger.debug(f"No TENANT_MEMBER found with username: '{login_identifier}'")

            logger.warning(f"Authentication failed for identifier: '{login_identifier}'. No matching active user with correct password.")
            return None

        except Exception as e:
            logger.error(f"Exception during authentication for '{login_identifier}': {e}", exc_info=True)
            return None

    def get_user(self, user_id):
        try:
            user = UserModel.objects.get(pk=user_id)
            return user
        except UserModel.DoesNotExist:
            return None