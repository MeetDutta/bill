from rest_framework import serializers

from .models import Customer, CustomerTimeline


class CustomerSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id", "customer_id", "first_name", "last_name", "full_name",
            "phone", "email", "date_of_birth", "anniversary_date",
            "address_line1", "city", "state", "postal_code", "tags",
            "preferred_store", "source", "total_purchases", "total_spend",
            "average_order_value", "last_purchase_at", "segment",
            "marketing_consent", "whatsapp_opt_in", "is_active",
            "organization", "created_at",
        ]
        read_only_fields = [
            "id", "total_purchases", "total_spend", "average_order_value",
            "last_purchase_at", "created_at", "organization",
        ]


class CustomerListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id", "customer_id", "full_name", "phone", "email",
            "total_purchases", "total_spend", "segment", "last_purchase_at",
        ]


class CustomerTimelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTimeline
        fields = ["id", "event_type", "reference_id", "metadata", "created_at"]
        read_only_fields = ["id", "created_at"]
