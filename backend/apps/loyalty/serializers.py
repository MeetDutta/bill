from rest_framework import serializers

from .models import LoyaltyAccount, LoyaltyRedemption, LoyaltyRule, LoyaltyTransaction


class LoyaltyAccountSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    class Meta:
        model = LoyaltyAccount
        fields = [
            "id", "customer", "customer_name", "customer_phone",
            "balance", "total_earned", "total_redeemed", "total_expired",
            "organization", "created_at",
        ]
        read_only_fields = [
            "id", "balance", "total_earned", "total_redeemed", "total_expired", "created_at",
        ]


class LoyaltyRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyRule
        fields = [
            "id", "name", "rule_type", "points", "per_amount",
            "min_transaction_amount", "max_points_per_transaction",
            "expiry_days", "is_active", "priority", "organization", "created_at",
        ]
        read_only_fields = ["id", "created_at", "organization"]


class LoyaltyTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyTransaction
        fields = [
            "id", "loyalty_account", "transaction_type", "points",
            "balance_after", "reference_type", "reference_id",
            "description", "expires_at", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class LoyaltyRedemptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyRedemption
        fields = ["id", "loyalty_account", "transaction", "points", "status", "created_at"]
        read_only_fields = ["id", "created_at"]


class RedeemPointsSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    points = serializers.DecimalField(max_digits=10, decimal_places=2)
    transaction_id = serializers.UUIDField(required=False)
