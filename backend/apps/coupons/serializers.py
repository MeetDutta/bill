from rest_framework import serializers

from .models import Coupon, CouponRedemption


class CouponSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = [
            "id", "code", "name", "description", "discount_type",
            "discount_value", "min_order_value", "max_discount",
            "start_at", "expires_at", "usage_limit", "per_customer_limit",
            "used_count", "eligible_segments", "eligible_store_ids",
            "eligible_product_ids", "is_active", "organization", "created_at",
        ]
        read_only_fields = ["id", "used_count", "created_at", "organization"]


class CouponListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = [
            "id", "code", "name", "discount_type", "discount_value",
            "expires_at", "usage_limit", "used_count", "is_active",
        ]


class CouponRedemptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CouponRedemption
        fields = ["id", "coupon", "customer", "transaction", "discount_amount", "created_at"]
        read_only_fields = ["id", "created_at"]
