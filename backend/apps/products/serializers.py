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


class ProductListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "external_id", "name", "sku", "unit_price", "tax_rate", "is_active"]
