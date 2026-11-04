from rest_framework import serializers

from .models import WhatsAppConfig, WhatsAppMessage, WhatsAppTemplate


class WhatsAppConfigSerializer(serializers.ModelSerializer):
    has_access_token = serializers.SerializerMethodField()
    masked_access_token = serializers.SerializerMethodField()
    configured = serializers.SerializerMethodField()
    access_token_configured = serializers.SerializerMethodField()

    class Meta:
        model = WhatsAppConfig
        fields = [
            "id", "business_account_id", "phone_number_id", "access_token",
            "webhook_verify_token", "is_active", "has_access_token",
            "access_token_configured", "configured",
            "masked_access_token", "organization", "created_at",
        ]
        read_only_fields = ["id", "created_at", "organization"]
        extra_kwargs = {
            "access_token": {"write_only": True, "required": False, "allow_blank": True},
            "webhook_verify_token": {"required": False, "allow_blank": True},
        }

    def get_has_access_token(self, obj):
        from django.conf import settings
        return bool(obj.access_token or getattr(settings, "WHATSAPP_ACCESS_TOKEN", ""))

    def get_access_token_configured(self, obj):
        return self.get_has_access_token(obj)

    def get_configured(self, obj):
        from django.conf import settings
        phone_id = obj.phone_number_id or getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "")
        token = obj.access_token or getattr(settings, "WHATSAPP_ACCESS_TOKEN", "")
        return bool(phone_id and token)

    def get_masked_access_token(self, obj):
        from django.conf import settings
        token = obj.access_token or getattr(settings, "WHATSAPP_ACCESS_TOKEN", "")
        if token:
            return "••••" + token[-4:] if len(token) >= 4 else "••••"
        return ""

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        from django.conf import settings
        if not ret.get("phone_number_id"):
            ret["phone_number_id"] = getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "")
        if not ret.get("business_account_id"):
            ret["business_account_id"] = getattr(settings, "WHATSAPP_BUSINESS_ACCOUNT_ID", "")
        return ret

    def update(self, instance, validated_data):
        # Preserve existing access_token if empty string, whitespace, or not provided
        if "access_token" in validated_data:
            token = validated_data["access_token"]
            if not token or not token.strip():
                validated_data.pop("access_token")
            else:
                validated_data["access_token"] = token.strip()

        if "phone_number_id" in validated_data and validated_data["phone_number_id"]:
            validated_data["phone_number_id"] = validated_data["phone_number_id"].strip()

        if "business_account_id" in validated_data and validated_data["business_account_id"]:
            validated_data["business_account_id"] = validated_data["business_account_id"].strip()

        if "webhook_verify_token" in validated_data:
            wt = validated_data["webhook_verify_token"]
            if not wt or not wt.strip():
                validated_data.pop("webhook_verify_token")
            else:
                validated_data["webhook_verify_token"] = wt.strip()

        return super().update(instance, validated_data)


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
