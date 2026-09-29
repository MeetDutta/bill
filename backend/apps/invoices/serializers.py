from rest_framework import serializers

from .models import Invoice


class InvoiceSerializer(serializers.ModelSerializer):
    transaction_details = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    store_name = serializers.CharField(source="transaction.store.name", read_only=True)
    customer_name = serializers.CharField(source="transaction.customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="transaction.customer.phone", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "transaction", "invoice_number", "pdf_url", "web_url",
            "secure_token", "is_viewed", "viewed_at", "organization", "created_at",
            "transaction_details", "organization_name", "store_name", "customer_name", "customer_phone",
        ]
        read_only_fields = ["id", "secure_token", "created_at", "organization"]

    def get_transaction_details(self, obj):
        from apps.transactions.serializers import TransactionSerializer
        return TransactionSerializer(obj.transaction).data


class InvoiceListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = ["id", "invoice_number", "is_viewed", "viewed_at", "created_at"]
