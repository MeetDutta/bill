from django.db import IntegrityError, transaction
from rest_framework import serializers

from .models import Customer, CustomerTimeline
from .utils import build_customer_address, normalize_phone, validate_mobile_number


def _split_full_name(raw_name: str) -> tuple[str, str]:
    parts = [p for p in str(raw_name or "").strip().split() if p]
    if not parts:
        return "", ""
    return parts[0], " ".join(parts[1:])


class CustomerSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    mobile_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    address = serializers.CharField(required=False, allow_blank=True, write_only=True)
    pincode = serializers.CharField(required=False, allow_blank=True, write_only=True)
    gst_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    full_address = serializers.CharField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id", "customer_id", "first_name", "last_name", "full_name",
            "phone", "mobile_number", "email", "date_of_birth", "anniversary_date",
            "address_line1", "address", "full_address", "city", "state", "postal_code", "pincode",
            "gstin", "gst_number", "tags", "preferred_store", "source",
            "credit_limit", "outstanding_credit", "is_walk_in",
            "total_purchases", "total_spend", "average_order_value",
            "last_purchase_at", "segment", "marketing_consent", "whatsapp_opt_in",
            "is_active", "organization", "created_at",
        ]
        read_only_fields = [
            "id", "customer_id", "outstanding_credit", "total_purchases", "total_spend",
            "average_order_value", "last_purchase_at", "created_at", "organization",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["full_name"] = instance.full_name
        data["address"] = instance.address_line1
        data["full_address"] = instance.full_address
        data["pincode"] = instance.postal_code
        data["gst_number"] = instance.gstin
        data["mobile_number"] = instance.phone
        return data

    def validate(self, attrs):
        request = self.context.get("request")
        org = getattr(request.user, "organization", None) if request and hasattr(request, "user") else None

        # Normalize alias fields into canonical model attributes
        full_name_in = attrs.pop("full_name", None)
        if full_name_in is not None and not attrs.get("first_name"):
            first, last = _split_full_name(full_name_in)
            attrs["first_name"] = first
            if last and "last_name" not in attrs:
                attrs["last_name"] = last

        if "address" in attrs and not attrs.get("address_line1"):
            attrs["address_line1"] = attrs.pop("address")
        else:
            attrs.pop("address", None)

        if "pincode" in attrs and not attrs.get("postal_code"):
            attrs["postal_code"] = attrs.pop("pincode")
        else:
            attrs.pop("pincode", None)

        if "gst_number" in attrs and not attrs.get("gstin"):
            attrs["gstin"] = attrs.pop("gst_number")
        else:
            attrs.pop("gst_number", None)

        mobile_alias = attrs.pop("mobile_number", None)
        if mobile_alias is not None and not attrs.get("phone"):
            attrs["phone"] = mobile_alias

        if self.instance is None:
            if not str(attrs.get("first_name") or "").strip():
                raise serializers.ValidationError({"first_name": ["Customer name is required."]})
            if "phone" not in attrs or not str(attrs.get("phone") or "").strip():
                raise serializers.ValidationError({"phone": ["Mobile number is required."]})

        if "phone" in attrs:
            raw_phone = str(attrs.get("phone") or "").strip()
            if raw_phone:
                valid, normalized, err = validate_mobile_number(raw_phone)
                if not valid:
                    raise serializers.ValidationError({"phone": [err]})
                attrs["phone"] = normalized
                if org:
                    qs = Customer.objects.filter(organization=org, phone=normalized)
                    if self.instance:
                        qs = qs.exclude(pk=self.instance.pk)
                    if qs.exists():
                        raise serializers.ValidationError({
                            "phone": ["Customer with this phone number already exists."]
                        })
            elif self.instance is None:
                raise serializers.ValidationError({"phone": ["Mobile number is required."]})

        return attrs

    def create(self, validated_data):
        try:
            with transaction.atomic():
                return super().create(validated_data)
        except IntegrityError:
            raise serializers.ValidationError({
                "phone": ["Customer with this phone number already exists."]
            })

    def update(self, instance, validated_data):
        try:
            with transaction.atomic():
                return super().update(instance, validated_data)
        except IntegrityError:
            raise serializers.ValidationError({
                "phone": ["Customer with this phone number already exists."]
            })


class CustomerListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    full_address = serializers.CharField(read_only=True)
    address = serializers.CharField(source="address_line1", read_only=True)
    pincode = serializers.CharField(source="postal_code", read_only=True)
    gst_number = serializers.CharField(source="gstin", read_only=True)
    mobile_number = serializers.CharField(source="phone", read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id", "customer_id", "first_name", "last_name", "full_name",
            "phone", "mobile_number", "email",
            "address_line1", "address", "full_address", "city", "state",
            "postal_code", "pincode", "gstin", "gst_number",
            "credit_limit", "outstanding_credit", "is_walk_in", "whatsapp_opt_in",
            "total_purchases", "total_spend", "segment", "last_purchase_at", "created_at",
        ]


class CustomerTimelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTimeline
        fields = ["id", "event_type", "reference_id", "metadata", "created_at"]
        read_only_fields = ["id", "created_at"]
