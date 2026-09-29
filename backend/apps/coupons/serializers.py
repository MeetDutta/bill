from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers

from .models import Coupon, CouponRedemption


class CouponSerializer(serializers.ModelSerializer):
    start_at = serializers.DateTimeField(required=False, default=timezone.now)
    min_order_value = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0.00"))
    minimum_order_value = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, write_only=True)

    class Meta:
        model = Coupon
        fields = [
            "id", "code", "name", "description", "discount_type",
            "discount_value", "min_order_value", "minimum_order_value", "max_discount",
            "start_at", "expires_at", "usage_limit", "per_customer_limit",
            "used_count", "eligible_segments", "eligible_store_ids",
            "eligible_product_ids", "is_active", "organization", "created_at",
        ]
        read_only_fields = ["id", "used_count", "created_at", "organization"]

    def validate(self, attrs):
        request = self.context.get("request")
        org = getattr(request.user, "organization", None) if request and hasattr(request, "user") else None

        # Normalize code
        if "code" in attrs and attrs["code"]:
            attrs["code"] = attrs["code"].strip().upper()
            code = attrs["code"]
            if org:
                qs = Coupon.objects.filter(organization=org, code__iexact=code)
                if self.instance:
                    qs = qs.exclude(pk=self.instance.pk)
                if qs.exists():
                    raise serializers.ValidationError({
                        "code": ["Coupon code already exists in your organization."]
                    })

        # Alias minimum_order_value -> min_order_value
        if "minimum_order_value" in attrs:
            val = attrs.pop("minimum_order_value")
            if "min_order_value" not in attrs:
                attrs["min_order_value"] = val

        # Handle start_at and expires_at
        start_at = attrs.get("start_at") or (self.instance.start_at if self.instance else timezone.now())
        attrs["start_at"] = start_at

        expires_at = attrs.get("expires_at") or (self.instance.expires_at if self.instance else None)
        if expires_at and expires_at <= start_at:
            raise serializers.ValidationError({
                "expires_at": ["Expiration date must be after the start date."]
            })

        # Validate discount_type and discount_value
        discount_type = attrs.get("discount_type") or (self.instance.discount_type if self.instance else "percentage")
        discount_value = attrs.get("discount_value") if "discount_value" in attrs else (self.instance.discount_value if self.instance else None)
        if discount_value is not None:
            if discount_type == "percentage":
                if discount_value <= 0 or discount_value > 100:
                    raise serializers.ValidationError({
                        "discount_value": ["Percentage discount must be between 1 and 100."]
                    })
            else:
                if discount_value <= 0:
                    raise serializers.ValidationError({
                        "discount_value": ["Fixed discount amount must be greater than zero."]
                    })

        # Validate min_order_value
        min_order_value = attrs.get("min_order_value") if "min_order_value" in attrs else (self.instance.min_order_value if self.instance else Decimal("0.00"))
        if min_order_value is not None and min_order_value < 0:
            raise serializers.ValidationError({
                "min_order_value": ["Minimum order value cannot be negative."]
            })

        # Validate usage_limit
        usage_limit = attrs.get("usage_limit") if "usage_limit" in attrs else (self.instance.usage_limit if self.instance else 0)
        if usage_limit is not None and usage_limit < 0:
            raise serializers.ValidationError({
                "usage_limit": ["Usage limit cannot be negative."]
            })

        return attrs


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
