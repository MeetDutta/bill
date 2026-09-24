from rest_framework import serializers

from .models import Transaction, TransactionItem


class TransactionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionItem
        fields = [
            "id", "product", "external_product_id", "name", "quantity",
            "unit_price", "discount", "tax", "total", "hsn_code",
        ]
        read_only_fields = ["id"]


class TransactionSerializer(serializers.ModelSerializer):
    items = TransactionItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id", "store", "customer", "invoice_number", "transaction_date",
            "status", "subtotal", "discount", "tax", "total",
            "payment_method", "payment_reference", "external_source",
            "external_transaction_id", "notes", "loyalty_points_earned",
            "loyalty_points_redeemed", "bill_sent", "bill_sent_at",
            "items", "item_count", "organization", "created_at",
        ]
        read_only_fields = [
            "id", "loyalty_points_earned", "loyalty_points_redeemed",
            "bill_sent", "bill_sent_at", "created_at", "organization",
        ]


class TransactionListSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id", "invoice_number", "customer", "store", "total",
            "payment_method", "status", "transaction_date", "item_count",
        ]


class TransactionIngestSerializer(serializers.Serializer):
    store_id = serializers.CharField()
    invoice_number = serializers.CharField()
    transaction_date = serializers.DateTimeField()
    customer = serializers.DictField()
    items = serializers.ListField()
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax = serializers.DecimalField(max_digits=12, decimal_places=2)
    total = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_method = serializers.CharField(required=False, default="")
    external_source = serializers.CharField(required=False, default="")
    external_transaction_id = serializers.CharField(required=False, default="")
