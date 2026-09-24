from rest_framework import serializers

from .models import Campaign, CampaignMessage


class CampaignSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = Campaign
        fields = [
            "id", "name", "campaign_type", "status", "segment_rules",
            "whatsapp_template_id", "message_content", "media_url",
            "scheduled_at", "sent_at", "total_recipients", "total_sent",
            "total_delivered", "total_read", "total_failed",
            "created_by", "created_by_name", "organization", "created_at",
        ]
        read_only_fields = [
            "id", "total_recipients", "total_sent", "total_delivered",
            "total_read", "total_failed", "created_at", "organization",
        ]


class CampaignListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campaign
        fields = [
            "id", "name", "campaign_type", "status", "total_recipients",
            "total_sent", "total_delivered", "total_failed",
            "scheduled_at", "sent_at", "created_at",
        ]


class CampaignMessageSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)

    class Meta:
        model = CampaignMessage
        fields = [
            "id", "campaign", "customer", "customer_name", "phone", "status",
            "provider_message_id", "sent_at", "delivered_at", "read_at",
            "failed_at", "failure_reason", "retry_count", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class SendCampaignSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    campaign_type = serializers.ChoiceField(choices=Campaign.CAMPAIGN_TYPE_CHOICES)
    message_content = serializers.CharField()
    segment_rules = serializers.DictField(default=dict)
    scheduled_at = serializers.DateTimeField(required=False)
