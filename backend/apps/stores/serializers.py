from rest_framework import serializers

from .models import Store


class StoreSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source="manager.full_name", read_only=True)

    class Meta:
        model = Store
        fields = [
            "id", "name", "code", "address_line1", "address_line2",
            "city", "state", "postal_code", "phone", "manager",
            "manager_name", "status", "business_hours", "whatsapp_number",
            "organization", "created_at",
        ]
        read_only_fields = ["id", "created_at", "organization"]


class StoreListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = ["id", "name", "code", "city", "status", "phone"]
