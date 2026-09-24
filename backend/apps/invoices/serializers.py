from rest_framework import serializers

from .models import Invoice


class InvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = [
            "id", "transaction", "invoice_number", "pdf_url", "web_url",
            "secure_token", "is_viewed", "viewed_at", "organization", "created_at",
        ]
        read_only_fields = ["id", "secure_token", "created_at", "organization"]


class InvoiceListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = ["id", "invoice_number", "is_viewed", "viewed_at", "created_at"]
