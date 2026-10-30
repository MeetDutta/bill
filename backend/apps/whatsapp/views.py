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


class WhatsAppConfigView(generics.RetrieveUpdateAPIView):
    serializer_class = WhatsAppConfigSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def get_object(self):
        obj, _ = WhatsAppConfig.objects.get_or_create(
            organization=self.request.user.organization,
            defaults={"business_account_id": "", "phone_number_id": "", "access_token": ""},
        )
        return obj

    def post(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)


class WhatsAppConnectionTestView(APIView):
    """Verify saved Meta credentials and phone-number resource without sending a message."""
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def post(self, request):
        config = WhatsAppConfig.objects.filter(organization=request.user.organization).first()
        checked_at = timezone.now().isoformat()
        if not config or not config.phone_number_id or not config.access_token:
            return Response({
                "connected": False,
                "checked_at": checked_at,
                "message": "WhatsApp is not configured. Save the phone number ID and access token first.",
                "reason": "not_configured",
            }, status=200)

        from django.conf import settings
        version = getattr(settings, "WHATSAPP_API_VERSION", "v20.0")
        base_url = getattr(settings, "WHATSAPP_API_BASE_URL", f"https://graph.facebook.com/{version}").rstrip("/")
        url = f"{base_url}/{config.phone_number_id}"
        try:
            response = requests.get(
                url,
                params={"fields": "id,display_phone_number,verified_name"},
                headers={"Authorization": f"Bearer {config.access_token}"},
                timeout=(3.05, 8),
            )
            if response.ok:
                payload = response.json()
                if not isinstance(payload, dict) or not payload.get("id"):
                    return Response({"connected": False, "checked_at": checked_at, "message": "Meta returned an unexpected response. Try again later.", "reason": "invalid_response"}, status=200)
                return Response({
                    "connected": True,
                    "checked_at": checked_at,
                    "message": "Meta API authentication succeeded and the configured phone-number resource is accessible.",
                    "phone_number": payload.get("display_phone_number", ""),
                    "verified_name": payload.get("verified_name", ""),
                })

            if response.status_code == 401:
                message, reason = "Meta rejected the access token. Check that it is valid and has not expired.", "invalid_credentials"
            elif response.status_code == 403:
                message, reason = "Access was denied. Check the token permissions and access to this WhatsApp Business resource.", "insufficient_permissions"
            elif response.status_code == 429:
                message, reason = "Meta rate-limited the connection test. Wait a moment and try again.", "rate_limited"
            else:
                message, reason = "Meta could not verify this resource. Check the phone number ID and Meta configuration.", "upstream_error"
            return Response({"connected": False, "checked_at": checked_at, "message": message, "reason": reason}, status=200)
        except requests.Timeout:
            return Response({"connected": False, "checked_at": checked_at, "message": "Meta did not respond before the connection test timed out.", "reason": "timeout"}, status=200)
        except requests.RequestException:
            return Response({"connected": False, "checked_at": checked_at, "message": "Could not reach Meta. Check the server's network connection and try again.", "reason": "network_error"}, status=200)
        except (ValueError, TypeError):
            return Response({"connected": False, "checked_at": checked_at, "message": "Meta returned an unexpected response. Try again later.", "reason": "invalid_response"}, status=200)


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
