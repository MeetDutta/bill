from rest_framework import serializers

from .models import Product, ProductCategory


class ProductCategorySerializer(serializers.ModelSerializer):
    def validate_name(self, value):
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError("Category name cannot be empty.")
        request = self.context.get("request")
        organization = getattr(getattr(request, "user", None), "organization", None)
        queryset = ProductCategory.objects.filter(organization=organization, name__iexact=normalized)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A category with this name already exists.")
        return normalized

    class Meta:
        model = ProductCategory
        fields = ["id", "name", "description", "parent", "is_active", "created_at"]
        read_only_fields = ["id", "created_at", "organization"]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "external_id", "name", "description", "brand", "sku", "barcode",
            "category", "category_name", "unit_price", "cost_price",
            "selling_price", "purchase_price", "mrp", "unit",
            "tax_rate", "hsn_code", "current_stock", "min_stock",
            "track_inventory", "image", "is_active",
            "organization", "created_at",
        ]
        read_only_fields = ["id", "created_at", "organization", "current_stock"]
        extra_kwargs = {
            "external_id": {"required": False, "allow_blank": True},
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)
        if "selling_price" in data and "unit_price" not in data:
            data["unit_price"] = data["selling_price"]
        if "purchase_price" in data and "cost_price" not in data:
            data["cost_price"] = data["purchase_price"]

        category_val = data.get("category")
        if isinstance(category_val, str) and category_val.strip():
            cat_str = category_val.strip()
            import uuid
            try:
                uuid.UUID(cat_str)
            except ValueError:
                request = self.context.get("request")
                org = getattr(getattr(request, "user", None), "organization", None)
                if org:
                    cat_obj, _ = ProductCategory.objects.get_or_create(
                        organization=org,
                        name=cat_str,
                    )
                    data["category"] = str(cat_obj.id)
        return super().to_internal_value(data)

    def create(self, validated_data):
        if not validated_data.get("external_id"):
            import uuid
            validated_data["external_id"] = f"PRD-{uuid.uuid4().hex[:8].upper()}"
        return super().create(validated_data)


class ProductListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default="General")

    class Meta:
        model = Product
        fields = [
            "id", "external_id", "name", "brand", "sku", "barcode",
            "category", "category_name", "unit_price", "cost_price",
            "selling_price", "purchase_price", "tax_rate", "unit",
            "current_stock", "min_stock", "track_inventory", "is_active"
        ]


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
