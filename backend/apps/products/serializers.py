from rest_framework import serializers

from .models import Product, ProductCategory


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ["id", "name", "description", "parent", "is_active", "created_at"]
        read_only_fields = ["id", "created_at", "organization"]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "external_id", "name", "description", "sku", "barcode",
            "category", "category_name", "unit_price", "cost_price",
            "tax_rate", "hsn_code", "image", "is_active",
            "organization", "created_at",
        ]
        read_only_fields = ["id", "created_at", "organization"]
        extra_kwargs = {
            "external_id": {"required": False, "allow_blank": True},
        }

    def create(self, validated_data):
        if not validated_data.get("external_id"):
            import uuid
            validated_data["external_id"] = f"PRD-{uuid.uuid4().hex[:8].upper()}"
        return super().create(validated_data)


class ProductListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "external_id", "name", "sku", "unit_price", "tax_rate", "is_active"]


class SupplierSerializer(serializers.ModelSerializer):
    total_purchases = serializers.SerializerMethodField()
    purchase_orders_count = serializers.SerializerMethodField()

    class Meta:
        from .models import Supplier
        model = Supplier
        fields = [
            "id", "name", "contact_person", "phone", "email", "address",
            "gstin", "pan", "notes", "opening_balance", "is_active",
            "total_purchases", "purchase_orders_count", "created_at",
        ]
        read_only_fields = ["id", "created_at", "total_purchases", "purchase_orders_count"]

    def get_total_purchases(self, obj):
        from django.db.models import Sum
        from decimal import Decimal
        res = obj.purchase_orders.aggregate(t=Sum("total_amount"))["t"]
        return str(res or Decimal("0.00"))

    def get_purchase_orders_count(self, obj):
        return obj.purchase_orders.count()
