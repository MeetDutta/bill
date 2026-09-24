from rest_framework import serializers

from .models import CustomerInsight, AIContentGeneration, AISegmentation


class AIContentGenerationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIContentGeneration
        fields = [
            "id", "content_type", "prompt", "generated_content",
            "parameters", "model_used", "tokens_used", "status",
            "error_message", "organization", "created_at",
        ]
        read_only_fields = [
            "id", "generated_content", "model_used", "tokens_used",
            "status", "error_message", "created_at",
        ]


class AICustomerInsightSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)

    class Meta:
        model = CustomerInsight
        fields = [
            "id", "customer", "customer_name", "insight_type", "score",
            "data", "recommendation", "model_version", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class AISegmentationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AISegmentation
        fields = [
            "id", "name", "description", "rules", "customer_count",
            "is_auto_generated", "last_calculated_at", "organization", "created_at",
        ]
        read_only_fields = [
            "id", "customer_count", "is_auto_generated", "last_calculated_at",
            "created_at",
        ]


class GenerateCampaignContentSerializer(serializers.Serializer):
    campaign_type = serializers.ChoiceField(
        choices=[
            ("promotional", "Promotional"),
            ("new_customer", "New Customer"),
            ("win_back", "Win-back"),
            ("birthday", "Birthday"),
            ("festival", "Festival"),
        ]
    )
    target_audience = serializers.CharField()
    product_name = serializers.CharField(required=False, default="")
    brand_name = serializers.CharField(required=False, default="")
    tone = serializers.ChoiceField(
        choices=[("professional", "Professional"), ("casual", "Casual"), ("friendly", "Friendly"), ("urgent", "Urgent")],
        default="professional",
    )
    language = serializers.ChoiceField(
        choices=[("en", "English"), ("hi", "Hindi"), ("mr", "Marathi")],
        default="en",
    )
    additional_context = serializers.CharField(required=False, default="")


class CustomerSegmentationSerializer(serializers.Serializer):
    segment_name = serializers.CharField(max_length=255)
    rules = serializers.DictField()
