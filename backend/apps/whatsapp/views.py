from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
import requests

from common.pagination import StandardPagination
from common.permissions import IsAdminOrManager

from .models import WhatsAppConfig, WhatsAppMessage, WhatsAppTemplate
from .serializers import WhatsAppConfigSerializer, WhatsAppMessageSerializer, WhatsAppTemplateSerializer
from .service import WhatsAppConfigurationService


class WhatsAppConfigView(generics.RetrieveUpdateAPIView):
    serializer_class = WhatsAppConfigSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def get_object(self):
        org = WhatsAppConfigurationService.resolve_organization(self.request.user)
        obj = WhatsAppConfig.objects.filter(organization=org).first()
        if not obj:
            obj, _ = WhatsAppConfig.objects.get_or_create(
                organization=org,
                defaults={
                    "business_account_id": "",
                    "phone_number_id": "",
                    "access_token": "",
                    "is_active": True,
                },
            )
        return obj

    def post(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)


class WhatsAppConnectionTestView(APIView):
    """Verify saved or draft Meta credentials and phone-number resource without sending a message."""
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def post(self, request):
        org = WhatsAppConfigurationService.resolve_organization(request.user)
        phone_number_id = request.data.get("phone_number_id")
        access_token = request.data.get("access_token")
        business_account_id = request.data.get("business_account_id")

        result = WhatsAppConfigurationService.test_connection(
            phone_number_id=phone_number_id,
            access_token=access_token,
            business_account_id=business_account_id,
            organization=org,
        )
        return Response(result, status=200)

    def get(self, request):
        return self.post(request)


class WhatsAppTemplateListView(generics.ListCreateAPIView):
    serializer_class = WhatsAppTemplateSerializer
    pagination_class = StandardPagination
    filterset_fields = ["category", "status", "language"]

    def get_queryset(self):
        org = WhatsAppConfigurationService.resolve_organization(self.request.user)
        return WhatsAppTemplate.objects.filter(organization=org)

    def perform_create(self, serializer):
        org = WhatsAppConfigurationService.resolve_organization(self.request.user)
        serializer.save(organization=org)


class WhatsAppMessageListView(generics.ListAPIView):
    serializer_class = WhatsAppMessageSerializer
    pagination_class = StandardPagination
    filterset_fields = ["status", "message_type"]

    def get_queryset(self):
        org = WhatsAppConfigurationService.resolve_organization(self.request.user)
        return WhatsAppMessage.objects.filter(
            organization=org
        ).select_related("customer", "campaign")


class WhatsAppWebhookView(APIView):
    permission_classes = []

    def get(self, request):
        verify_token = request.query_params.get("hub.verify_token")
        challenge = request.query_params.get("hub.challenge")
        from django.conf import settings
        if verify_token == settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN:
            return Response(int(challenge))
        return Response("Invalid verify token", status=403)

    def post(self, request):
        from .tasks import process_webhook_task
        process_webhook_task.delay(request.data)
        return Response({"status": "ok"})
