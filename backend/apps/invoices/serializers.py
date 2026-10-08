from rest_framework import serializers

from .models import Invoice


class InvoiceSerializer(serializers.ModelSerializer):
    transaction_details = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    store_name = serializers.CharField(source="transaction.store.name", read_only=True)
    customer_name = serializers.CharField(source="transaction.customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="transaction.customer.phone", read_only=True)
    subtotal = serializers.DecimalField(source="transaction.subtotal", max_digits=12, decimal_places=2, read_only=True)
    discount = serializers.DecimalField(source="transaction.discount", max_digits=12, decimal_places=2, read_only=True)
    tax = serializers.DecimalField(source="transaction.tax", max_digits=12, decimal_places=2, read_only=True)
    total = serializers.DecimalField(source="transaction.total", max_digits=12, decimal_places=2, read_only=True)
    payment_status = serializers.CharField(source="transaction.payment_status", read_only=True)
    payment_method = serializers.CharField(source="transaction.payment_method", read_only=True)
    origin_quotation_id = serializers.SerializerMethodField()
    origin_quotation_number = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id", "transaction", "invoice_number", "invoice_type", "template_format",
            "pdf_url", "web_url", "secure_token", "is_viewed", "viewed_at",
            "organization", "created_at", "terms_and_conditions", "custom_notes",
            "transaction_details", "organization_name", "store_name", "customer_name", "customer_phone",
            "subtotal", "discount", "tax", "total", "payment_status", "payment_method",
            "origin_quotation_id", "origin_quotation_number",
        ]
        read_only_fields = ["id", "secure_token", "created_at", "organization"]

    def get_transaction_details(self, obj):
        from apps.transactions.serializers import TransactionSerializer
        return TransactionSerializer(obj.transaction).data

    def get_origin_quotation_id(self, obj):
        if hasattr(obj, "origin_quotation") and obj.origin_quotation:
            return str(obj.origin_quotation.id)
        return None

    def get_origin_quotation_number(self, obj):
        if hasattr(obj, "origin_quotation") and obj.origin_quotation:
            return obj.origin_quotation.quotation_number
        return None


class PublicInvoiceSerializer(serializers.ModelSerializer):
    business = serializers.SerializerMethodField()
    store = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    store_name = serializers.CharField(source="transaction.store.name", read_only=True)
    customer_name = serializers.CharField(source="transaction.customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="transaction.customer.phone", read_only=True)
    transaction_date = serializers.DateTimeField(source="transaction.transaction_date", read_only=True)
    subtotal = serializers.DecimalField(source="transaction.subtotal", max_digits=12, decimal_places=2, read_only=True)
    discount = serializers.DecimalField(source="transaction.discount", max_digits=12, decimal_places=2, read_only=True)
    tax = serializers.DecimalField(source="transaction.tax", max_digits=12, decimal_places=2, read_only=True)
    total = serializers.DecimalField(source="transaction.total", max_digits=12, decimal_places=2, read_only=True)
    payment_method = serializers.CharField(source="transaction.payment_method", read_only=True)
    loyalty_points_earned = serializers.IntegerField(source="transaction.loyalty_points_earned", read_only=True)
    loyalty_balance = serializers.SerializerMethodField()
    loyalty_tier = serializers.SerializerMethodField()
    portal_token = serializers.SerializerMethodField()
    smart_offer = serializers.SerializerMethodField()
    product_recommendation = serializers.SerializerMethodField()
    transaction_details = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id", "invoice_number", "pdf_url", "web_url", "secure_token", "is_viewed", "viewed_at",
            "business", "store", "customer", "items", "transaction_date",
            "subtotal", "discount", "tax", "total", "payment_method",
            "loyalty_points_earned", "loyalty_balance", "loyalty_tier", "portal_token",
            "smart_offer", "product_recommendation", "created_at",
            "organization_name", "store_name", "customer_name", "customer_phone",
            "transaction_details",
        ]

    def get_transaction_details(self, obj):
        tx = obj.transaction
        return {
            "id": str(tx.id),
            "invoice_number": tx.invoice_number,
            "transaction_date": tx.transaction_date.isoformat() if tx.transaction_date else None,
            "status": tx.status,
            "subtotal": str(tx.subtotal),
            "discount": str(tx.discount),
            "tax": str(tx.tax),
            "total": str(tx.total),
            "payment_method": tx.payment_method,
            "loyalty_points_earned": tx.loyalty_points_earned,
            "items": self.get_items(obj),
        }

    def get_business(self, obj):
        org = obj.organization
        return {
            "name": org.name,
            "legal_name": org.legal_name,
            "city": org.city,
            "state": org.state,
            "country": org.country,
            "currency": getattr(org, "currency", "INR") or "INR",
            "gst_number": getattr(org, "gst_number", "") or "",
        }

    def get_store(self, obj):
        store = obj.transaction.store
        return {
            "name": store.name,
            "code": store.code,
            "address": store.address_line1,
            "city": store.city,
            "state": store.state,
            "postal_code": store.postal_code,
            "phone": store.phone,
        }

    def get_customer(self, obj):
        cust = obj.transaction.customer
        if not cust:
            return None
        return {
            "name": cust.full_name or "Valued Customer",
            "phone": cust.phone,
        }

    def get_items(self, obj):
        return [
            {
                "name": item.name or (item.product.name if item.product else "Item"),
                "quantity": str(item.quantity),
                "unit_price": str(item.unit_price),
                "discount": str(item.discount),
                "tax": str(item.tax),
                "total": str(item.total),
                "hsn_code": item.hsn_code,
            }
            for item in obj.transaction.items.all()
        ]

    def get_loyalty_balance(self, obj):
        cust = obj.transaction.customer
        if cust and hasattr(cust, "loyalty_account"):
            return str(cust.loyalty_account.balance)
        return None

    def get_loyalty_tier(self, obj):
        cust = obj.transaction.customer
        if not cust:
            return None
        from apps.analytics.services import LoyaltyTierService
        return LoyaltyTierService.get_customer_tier(cust)

    def get_portal_token(self, obj):
        # Security: Do not expose customer portal credentials over public invoices
        return None

    def get_smart_offer(self, obj):
        from apps.coupons.models import Coupon
        from django.utils import timezone
        coupon = Coupon.objects.filter(
            organization=obj.organization,
            is_active=True,
            expires_at__gte=timezone.now(),
        ).first()
        if coupon:
            return {
                "code": coupon.code,
                "name": coupon.name,
                "discount_type": coupon.discount_type,
                "discount_value": str(coupon.discount_value),
                "min_order": str(coupon.min_order_value),
            }
        return None

    def get_product_recommendation(self, obj):
        from apps.analytics.models import ProductAffinity
        first_item = obj.transaction.items.filter(product__isnull=False).first()
        if first_item and first_item.product:
            aff = ProductAffinity.objects.filter(
                organization=obj.organization,
                product_a=first_item.product,
            ).select_related("product_b").first()
            if aff:
                return {
                    "product_name": aff.product_b.name,
                    "unit_price": str(aff.product_b.unit_price),
                    "reason": f"Frequently bought with {first_item.product.name}",
                }
        return None




class InvoiceListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    store_name = serializers.CharField(source="transaction.store.name", read_only=True)
    transaction_date = serializers.DateTimeField(source="transaction.transaction_date", read_only=True)
    subtotal = serializers.DecimalField(source="transaction.subtotal", max_digits=12, decimal_places=2, read_only=True)
    discount = serializers.DecimalField(source="transaction.discount", max_digits=12, decimal_places=2, read_only=True)
    tax = serializers.DecimalField(source="transaction.tax", max_digits=12, decimal_places=2, read_only=True)
    total = serializers.DecimalField(source="transaction.total", max_digits=12, decimal_places=2, read_only=True)
    payment_status = serializers.CharField(source="transaction.payment_status", read_only=True)
    payment_method = serializers.CharField(source="transaction.payment_method", read_only=True)
    origin_quotation_id = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id", "invoice_number", "invoice_type", "template_format",
            "pdf_url", "web_url", "is_viewed", "viewed_at", "created_at",
            "customer_name", "customer_phone", "store_name", "transaction_date",
            "subtotal", "discount", "tax", "total",
            "payment_status", "payment_method", "origin_quotation_id",
        ]

    def get_customer_name(self, obj):
        if not obj.transaction:
            return "Walk-in Customer"
        if obj.transaction.customer:
            return obj.transaction.customer.full_name or "Customer"
        return "Walk-in Customer"

    def get_customer_phone(self, obj):
        if not obj.transaction or not obj.transaction.customer:
            return ""
        return obj.transaction.customer.phone or ""

    def get_origin_quotation_id(self, obj):
        if hasattr(obj, "origin_quotation") and obj.origin_quotation:
            return str(obj.origin_quotation.id)
        return None


class QuotationItemSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import QuotationItem
        model = QuotationItem
        fields = [
            "id", "product", "name", "quantity", "unit_price",
            "discount", "tax_rate", "tax", "total", "hsn_code", "unit",
        ]


class QuotationSerializer(serializers.ModelSerializer):
    items = QuotationItemSerializer(many=True, required=False)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    store_name = serializers.CharField(source="store.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    converted_invoice_number = serializers.SerializerMethodField()

    class Meta:
        from .models import Quotation
        model = Quotation
        fields = [
            "id", "quotation_number", "customer", "customer_name", "customer_phone",
            "customer_email", "store", "store_name", "quotation_date", "valid_until",
            "status", "subtotal", "discount", "tax", "total", "notes",
            "terms_and_conditions", "converted_invoice", "converted_invoice_number",
            "converted_at", "created_by_name", "items", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "quotation_number", "converted_invoice", "converted_at",
            "created_at", "updated_at",
        ]

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.full_name or "Customer"
        return obj.customer_name or "Walk-in Customer"

    def get_customer_phone(self, obj):
        if obj.customer:
            return obj.customer.phone or ""
        return obj.customer_phone or ""

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else "Staff"

    def get_converted_invoice_number(self, obj):
        return obj.converted_invoice.invoice_number if obj.converted_invoice else None


class QuotationListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    store_name = serializers.CharField(source="store.name", read_only=True)
    items_count = serializers.SerializerMethodField()
    converted_invoice_number = serializers.SerializerMethodField()

    class Meta:
        from .models import Quotation
        model = Quotation
        fields = [
            "id", "quotation_number", "customer_name", "customer_phone",
            "store_name", "quotation_date", "valid_until", "status",
            "subtotal", "discount", "tax", "total", "items_count",
            "converted_invoice", "converted_invoice_number", "created_at",
        ]

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.full_name or "Customer"
        return obj.customer_name or "Walk-in Customer"

    def get_customer_phone(self, obj):
        if obj.customer:
            return obj.customer.phone or ""
        return obj.customer_phone or ""

    def get_items_count(self, obj):
        return obj.items.count()

    def get_converted_invoice_number(self, obj):
        return obj.converted_invoice.invoice_number if obj.converted_invoice else None
