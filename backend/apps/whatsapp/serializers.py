from rest_framework import serializers

from .models import WhatsAppConfig, WhatsAppMessage, WhatsAppTemplate


class WhatsAppConfigSerializer(serializers.ModelSerializer):
    has_access_token = serializers.SerializerMethodField()
    masked_access_token = serializers.SerializerMethodField()

    class Meta:
        model = WhatsAppConfig
        fields = [
            "id", "business_account_id", "phone_number_id", "access_token",
            "webhook_verify_token", "is_active", "has_access_token",
            "masked_access_token", "organization", "created_at",
        ]
        read_only_fields = ["id", "created_at", "organization"]
        extra_kwargs = {
            "access_token": {"write_only": True, "required": False},
        }

    def get_has_access_token(self, obj):
        return bool(obj.access_token)

    def get_masked_access_token(self, obj):
        if obj.access_token:
            return "••••" + obj.access_token[-4:] if len(obj.access_token) >= 4 else "••••"
        return ""


class WhatsAppTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppTemplate
        fields = [
            "id", "template_id", "name", "language", "category",
            "status", "components", "is_active", "organization", "created_at",
        ]
        read_only_fields = ["id", "created_at", "organization"]


class WhatsAppMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppMessage
        fields = [
            "id", "customer", "phone_number", "message_type", "template",
            "content", "status", "provider_message_id", "sent_at",
            "delivered_at", "read_at", "failed_at", "failure_reason",
            "retry_count", "campaign", "metadata", "organization", "created_at",
        ]
        read_only_fields = ["id", "created_at", "organization"]
