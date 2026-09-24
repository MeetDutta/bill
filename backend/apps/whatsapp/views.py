from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response

from common.pagination import StandardPagination

from .models import WhatsAppConfig, WhatsAppMessage, WhatsAppTemplate
from .serializers import WhatsAppConfigSerializer, WhatsAppMessageSerializer, WhatsAppTemplateSerializer


class WhatsAppConfigView(generics.RetrieveUpdateAPIView):
    serializer_class = WhatsAppConfigSerializer

    def get_object(self):
        obj, _ = WhatsAppConfig.objects.get_or_create(
            organization=self.request.user.organization,
            defaults={"business_account_id": "", "phone_number_id": "", "access_token": ""},
        )
        return obj


class WhatsAppTemplateListView(generics.ListCreateAPIView):
    serializer_class = WhatsAppTemplateSerializer
    pagination_class = StandardPagination
    filterset_fields = ["category", "status", "language"]

    def get_queryset(self):
        return WhatsAppTemplate.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class WhatsAppMessageListView(generics.ListAPIView):
    serializer_class = WhatsAppMessageSerializer
    pagination_class = StandardPagination
    filterset_fields = ["status", "message_type"]

    def get_queryset(self):
        return WhatsAppMessage.objects.filter(
            organization=self.request.user.organization
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
