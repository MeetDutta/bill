from rest_framework import serializers

from .models import Plan, Subscription, SubscriptionUsage


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = [
            "id", "name", "tier", "description", "price_monthly", "price_yearly",
            "max_stores", "max_users", "max_customers", "max_whatsapp_messages",
            "max_campaigns", "max_products", "max_api_calls", "features",
            "is_active", "is_public", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class SubscriptionUsageSerializer(serializers.ModelSerializer):
    limit = serializers.IntegerField(read_only=True)
    usage_percentage = serializers.IntegerField(read_only=True)
    is_exceeded = serializers.BooleanField(read_only=True)

    class Meta:
        model = SubscriptionUsage
        fields = [
            "id", "metric", "current_usage", "limit",
            "usage_percentage", "is_exceeded", "period_start", "period_end",
        ]
        read_only_fields = ["id"]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    plan_tier = serializers.CharField(source="plan.tier", read_only=True)
    days_remaining = serializers.IntegerField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = Subscription
        fields = [
            "id", "organization", "plan", "plan_name", "plan_tier",
            "status", "billing_cycle", "start_date", "end_date",
            "trial_end_date", "cancelled_at", "cancel_reason",
            "payment_method", "days_remaining", "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class SubscriptionListSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    plan_tier = serializers.CharField(source="plan.tier", read_only=True)

    class Meta:
        model = Subscription
        fields = [
            "id", "plan", "plan_name", "plan_tier", "status",
            "billing_cycle", "start_date", "end_date",
        ]


class CreateSubscriptionSerializer(serializers.Serializer):
    plan_id = serializers.UUIDField()
    billing_cycle = serializers.ChoiceField(choices=[("monthly", "Monthly"), ("yearly", "Yearly")])
    payment_method = serializers.CharField(required=False, default="")
