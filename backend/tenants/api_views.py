from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils.text import slugify
from .models import Tenant, Domain
from django.contrib.auth import get_user_model
from .serializers import TenantSerializer, TenantSignupSerializer
from .utils import create_tenant_owner_and_sync_to_schema
import logging
import re

logger = logging.getLogger(__name__)
User = get_user_model()


class TenantSignupView(generics.CreateAPIView):
    serializer_class = TenantSignupSerializer
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        logger.info(f"Tenant signup attempt for tenant name: {data['name']}, company: {data.get('company_name', '')}, owner username: {data['username']}")

        try:
            base_schema_name = slugify(data['name']).replace('-', '_')
            if not base_schema_name:
                base_schema_name = "tenant"
            
            schema_name_candidate = base_schema_name
            counter = 1
            while Tenant.objects.filter(schema_name=schema_name_candidate).exists():
                schema_name_candidate = f"{base_schema_name}_{counter}"
                counter += 1
            
            tenant = Tenant.objects.create(
                schema_name=schema_name_candidate,
                name=data['name'],
                company_name=data.get('company_name', ''),
                email=data['email'],
                last_name=data.get('last_name', ''),
            )
            logger.info(f"Tenant object created with schema_name: {tenant.schema_name}")

            base_domain_part = re.sub(r'\s+', '-', data['name'].lower())
            base_domain_part = re.sub(r'[^\w\-]', '', base_domain_part)
            if not base_domain_part: base_domain_part = tenant.schema_name
            domain_url = f"{base_domain_part}.localhost"

            Domain.objects.create(
                domain=domain_url,
                tenant=tenant,
                is_primary=True
            )
            logger.info(f"Domain '{domain_url}' created for tenant '{tenant.name}'.")

            owner_user = create_tenant_owner_and_sync_to_schema(
                tenant=tenant,
                email=data['email'],
                password=data['password'],
                first_name=data.get('first_name', ''),
                last_name=data.get('last_name', ''),
                username=data['username']
            )

            tenant_response_serializer = TenantSerializer(tenant)
            logger.info(f"Successfully created tenant '{tenant.name}' with schema '{tenant.schema_name}' and owner '{owner_user.username}'.")
            return Response(tenant_response_serializer.data, status=status.HTTP_201_CREATED)

        except ValueError as e:
            logger.warning(f"Tenant signup failed due to ValueError: {e}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Tenant signup failed unexpectedly: {e}", exc_info=True)
            return Response({"error": "An unexpected error occurred during tenant signup."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class TenantDetailView(generics.RetrieveUpdateAPIView):
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer
    lookup_field = 'schema_name'
    permission_classes = [permissions.IsAdminUser]

    def get_object(self):
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        assert lookup_url_kwarg in self.kwargs, (
            'Expected view %s to be called with a URL keyword argument '
            'named "%s". Fix your URL conf, or set the `.lookup_field` '
            'attribute on the view correctly.' %
            (self.__class__.__name__, lookup_url_kwarg)
        )
        filter_kwargs = {self.lookup_field: self.kwargs[lookup_url_kwarg]}
        obj = get_object_or_404(queryset, **filter_kwargs)
        self.check_object_permissions(self.request, obj)
        return obj