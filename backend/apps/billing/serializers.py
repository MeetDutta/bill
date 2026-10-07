from decimal import Decimal
from rest_framework import serializers
from apps.billing.models import BusinessConfig, HeldCart, CashRegister
from apps.billing.business_types import BUSINESS_TYPES
from apps.products.models import Product, InventoryMovement, PurchaseOrder, PurchaseOrderItem
from apps.transactions.models import Transaction, TransactionItem, SalesReturn, SalesReturnItem, CustomerCreditPayment
from apps.customers.models import Customer


class BusinessConfigSerializer(serializers.ModelSerializer):
    business_type_display = serializers.CharField(source="get_business_type_display", read_only=True)
    schema = serializers.SerializerMethodField()
    gstin = serializers.CharField(source="organization.gst_number", read_only=True)
    trade_name = serializers.CharField(source="organization.name", read_only=True)
    tax_mode = serializers.CharField(source="default_tax_mode", required=False)
    allow_credit_sales = serializers.BooleanField(source="credit_sales_enabled", required=False)
    max_cashier_discount_percent = serializers.DecimalField(source="max_discount_cashier", max_digits=5, decimal_places=2, required=False)
    default_invoice_format = serializers.CharField(source="invoice_format", required=False)
    invoice_terms_and_conditions = serializers.CharField(source="terms_and_conditions", required=False, allow_blank=True)
    auto_send_digital_bill = serializers.BooleanField(source="auto_send_whatsapp", required=False)
    auto_print_bill = serializers.BooleanField(source="auto_print", required=False)

    class Meta:
        model = BusinessConfig
        fields = [
            "id",
            "business_type",
            "business_type_display",
            "schema",
            "gst_enabled",
            "tax_mode",
            "default_tax_rate",
            "gstin",
            "trade_name",
            "allow_credit_sales",
            "default_credit_limit",
            "default_invoice_format",
            "invoice_prefix",
            "invoice_terms_and_conditions",
            "invoice_footer",
            "allow_negative_stock",
            "max_cashier_discount_percent",
            "require_customer",
            "auto_print_bill",
            "auto_send_digital_bill",
            "low_stock_threshold",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]

    def to_internal_value(self, data):
        if hasattr(data, "get"):
            val = data.get("business_type")
            if isinstance(val, list) and val:
                val = val[0]
            if isinstance(val, str):
                if hasattr(data, "copy"):
                    data = data.copy()
                else:
                    data = dict(data)
                data["business_type"] = val.upper()
        return super().to_internal_value(data)

    def get_schema(self, obj):
        bt = (obj.business_type or "RETAIL").lower()
        return BUSINESS_TYPES.get(bt, BUSINESS_TYPES.get("other", {}))

    def validate_business_type(self, value):
        if value:
            return value.upper()
        return value


class HeldCartSerializer(serializers.ModelSerializer):
    cashier_name = serializers.SerializerMethodField()
    store_name = serializers.CharField(source="store.name", read_only=True)
    hold_reference = serializers.CharField(source="reference", required=False)
    customer_name = serializers.CharField(read_only=True)
    customer_phone = serializers.CharField(read_only=True)
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = HeldCart
        fields = [
            "id",
            "hold_reference",
            "customer_name",
            "customer_phone",
            "cart_data",
            "subtotal",
            "item_count",
            "notes",
            "store",
            "store_name",
            "cashier_name",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_cashier_name(self, obj):
        return obj.cashier.get_full_name() if obj.cashier else "Cashier"


class POSProductSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "barcode",
            "qr_code",
            "category",
            "brand",
            "description",
            "selling_price",
            "purchase_price",
            "mrp",
            "tax_rate",
            "hsn_code",
            "unit",
            "current_stock",
            "min_stock",
            "max_stock",
            "supplier",
            "track_inventory",
            "is_active",
            "is_low_stock",
            "product_attributes",
        ]


class POSProductQuickCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    sku = serializers.CharField(max_length=100, required=False, allow_blank=True)
    barcode = serializers.CharField(max_length=100, required=False, allow_blank=True)
    category = serializers.CharField(max_length=100, required=False, allow_blank=True)
    brand = serializers.CharField(max_length=100, required=False, allow_blank=True)
    selling_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    mrp = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    purchase_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0.00"))
    tax_rate = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, default=Decimal("0.00"))
    hsn_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    unit = serializers.CharField(max_length=20, required=False, default="pcs")
    opening_stock = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=Decimal("0.00"))
    min_stock = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=Decimal("0.00"))
    product_attributes = serializers.JSONField(required=False, default=dict)


class InventoryMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    sku = serializers.CharField(source="product.sku", read_only=True)
    user_name = serializers.SerializerMethodField()
    store_name = serializers.CharField(source="store.name", read_only=True)

    class Meta:
        model = InventoryMovement
        fields = [
            "id",
            "product",
            "product_name",
            "sku",
            "store",
            "store_name",
            "user_name",
            "movement_type",
            "quantity",
            "previous_stock",
            "new_stock",
            "reference_type",
            "reference_id",
            "notes",
            "created_at",
        ]

    def get_user_name(self, obj):
        return obj.user.get_full_name() if obj.user else "System"


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = [
            "id",
            "product",
            "product_name",
            "quantity",
            "purchase_price",
            "tax_rate",
            "total",
        ]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()
    tax_amount = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "po_number",
            "supplier",
            "supplier_ref",
            "supplier_name",
            "supplier_invoice_number",
            "purchase_date",
            "total_amount",
            "tax_amount",
            "status",
            "notes",
            "created_by_name",
            "items",
            "created_at",
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else "Staff"

    def get_supplier_name(self, obj):
        if obj.supplier_ref:
            return obj.supplier_ref.name
        return obj.supplier_name or obj.supplier or "Supplier"

    def get_tax_amount(self, obj):
        total_tax = Decimal("0.00")
        for it in obj.items.all():
            line_sub = (it.purchase_price or Decimal("0.00")) * (it.quantity or Decimal("0.00"))
            rate = it.tax_rate or Decimal("0.00")
            total_tax += (line_sub * (rate / Decimal("100.00")))
        return str(round(total_tax, 2))
