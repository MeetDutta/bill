from rest_framework import serializers

from .models import WhatsAppConfig, WhatsAppMessage, WhatsAppTemplate


class WhatsAppConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppConfig
        fields = [
            "id", "business_account_id", "phone_number_id",
            "webhook_verify_token", "is_active", "organization", "created_at",
        ]
        read_only_fields = ["id", "created_at", "organization"]
        extra_kwargs = {"access_token": {"write_only": True}}


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
