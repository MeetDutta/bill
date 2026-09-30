from rest_framework import serializers

from .models import Transaction, TransactionItem


class TransactionItemSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = TransactionItem
        fields = [
            "id", "product", "external_product_id", "name", "quantity",
            "unit_price", "discount", "tax", "total", "hsn_code",
        ]
        read_only_fields = ["id"]

    def get_name(self, obj):
        if obj.name:
            return obj.name
        if obj.product:
            return obj.product.name
        return "Item"


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


class TransactionItemIngestSerializer(serializers.Serializer):
    external_product_id = serializers.CharField(required=False, default="", allow_blank=True)
    name = serializers.CharField(max_length=255)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount = serializers.DecimalField(max_digits=12, decimal_places=2, default=0, required=False)
    tax = serializers.DecimalField(max_digits=12, decimal_places=2, default=0, required=False)
    total = serializers.DecimalField(max_digits=12, decimal_places=2)
    hsn_code = serializers.CharField(required=False, default="", allow_blank=True)

    def validate(self, attrs):
        qty = attrs.get("quantity", 0)
        price = attrs.get("unit_price", 0)
        disc = attrs.get("discount", 0)
        tax = attrs.get("tax", 0)
        item_total = attrs.get("total", 0)

        if qty <= 0:
            raise serializers.ValidationError({"quantity": "Quantity must be greater than zero."})
        if price < 0:
            raise serializers.ValidationError({"unit_price": "Unit price cannot be negative."})
        if disc < 0:
            raise serializers.ValidationError({"discount": "Discount cannot be negative."})
        if tax < 0:
            raise serializers.ValidationError({"tax": "Tax cannot be negative."})

        expected_total = (qty * price) - disc + tax
        if abs(expected_total - item_total) > 0.05:
            raise serializers.ValidationError({
                "total": f"Item total ({item_total}) does not match quantity * unit_price - discount + tax ({expected_total:.2f})"
            })
        return attrs


class TransactionIngestSerializer(serializers.Serializer):
    store_id = serializers.CharField()
    invoice_number = serializers.CharField()
    transaction_date = serializers.DateTimeField()
    customer = serializers.DictField(required=False, default=dict)
    items = serializers.ListField(child=TransactionItemIngestSerializer(), min_length=1)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount = serializers.DecimalField(max_digits=12, decimal_places=2, default=0, required=False)
    tax = serializers.DecimalField(max_digits=12, decimal_places=2)
    total = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_method = serializers.CharField(required=False, default="", allow_blank=True)
    external_source = serializers.CharField(required=False, default="", allow_blank=True)
    external_transaction_id = serializers.CharField(required=False, default="", allow_blank=True)

    def validate(self, attrs):
        items = attrs.get("items", [])
        if not items:
            raise serializers.ValidationError({"items": "At least one line item is required."})

        subtotal = attrs.get("subtotal")
        discount = attrs.get("discount", 0)
        tax = attrs.get("tax")
        total = attrs.get("total")

        expected_total = subtotal - discount + tax
        if abs(expected_total - total) > 0.05:
            raise serializers.ValidationError({
                "total": f"Transaction total ({total}) does not match subtotal ({subtotal}) - discount ({discount}) + tax ({tax}) = {expected_total:.2f}"
            })

        return attrs
