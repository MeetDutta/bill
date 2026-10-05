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
        cust = obj.transaction.customer
        return cust.portal_token if cust else None

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
    class Meta:
        model = Invoice
        fields = ["id", "invoice_number", "is_viewed", "viewed_at", "created_at"]
