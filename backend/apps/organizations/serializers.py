from rest_framework import serializers

from .models import Organization


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id", "name", "legal_name", "logo", "email", "phone",
            "address_line1", "address_line2", "city", "state", "country",
            "postal_code", "gst_number", "pan_number", "timezone",
            "currency", "default_language", "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class OrganizationListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "email", "phone", "country", "is_active"]
