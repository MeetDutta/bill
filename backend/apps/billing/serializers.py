from decimal import Decimal
from rest_framework import serializers
from apps.billing.models import BusinessConfig, HeldCart
from apps.billing.business_types import BUSINESS_TYPES
from apps.products.models import Product, InventoryMovement, PurchaseOrder, PurchaseOrderItem


class BusinessConfigSerializer(serializers.ModelSerializer):
    business_type_display = serializers.CharField(source="get_business_type_display", read_only=True)
    schema = serializers.SerializerMethodField()
    gstin = serializers.CharField(required=False, allow_blank=True)
    trade_name = serializers.CharField(required=False, allow_blank=True)
    business_name = serializers.CharField(required=False, allow_blank=True)
    legal_name = serializers.CharField(required=False, allow_blank=True)
    address_line1 = serializers.CharField(required=False, allow_blank=True)
    address_line2 = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)
    district = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(required=False, allow_blank=True)
    state_code = serializers.CharField(required=False, allow_blank=True)
    postal_code = serializers.CharField(required=False, allow_blank=True)
    pincode = serializers.CharField(required=False, allow_blank=True)
    country = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    alternate_phone = serializers.CharField(required=False, allow_blank=True)
    email = serializers.CharField(required=False, allow_blank=True)
    website = serializers.CharField(required=False, allow_blank=True)
    pan_number = serializers.CharField(required=False, allow_blank=True)
    gst_registration_type = serializers.CharField(required=False, allow_blank=True)
    tagline = serializers.CharField(required=False, allow_blank=True)
    paper_size = serializers.CharField(required=False, default="a4")
    invoice_template = serializers.CharField(required=False, default="classic_gst")
    logo_position = serializers.CharField(required=False, default="left")
    gst_invoice_title = serializers.CharField(required=False, allow_blank=True)
    regular_invoice_title = serializers.CharField(required=False, allow_blank=True)
    default_invoice_notes = serializers.CharField(required=False, allow_blank=True)
    invoice_elements = serializers.JSONField(required=False)
    tax_mode = serializers.CharField(source="default_tax_mode", required=False)
    allow_credit_sales = serializers.BooleanField(source="credit_sales_enabled", required=False)
    max_cashier_discount_percent = serializers.DecimalField(source="max_discount_cashier", max_digits=5, decimal_places=2, required=False)
    default_invoice_format = serializers.CharField(source="invoice_format", required=False)
    invoice_terms_and_conditions = serializers.CharField(source="terms_and_conditions", required=False, allow_blank=True)
    auto_send_digital_bill = serializers.BooleanField(source="auto_send_whatsapp", required=False)
    auto_print_bill = serializers.BooleanField(source="auto_print", required=False)
    logo = serializers.ImageField(required=False, allow_null=True)
    logo_url = serializers.SerializerMethodField()
    signature_url = serializers.SerializerMethodField()
    remove_logo = serializers.BooleanField(required=False, default=False)
    remove_signature = serializers.BooleanField(required=False, default=False)

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
            "business_name",
            "legal_name",
            "tagline",
            "logo",
            "logo_url",
            "remove_logo",
            "address_line1",
            "address_line2",
            "city",
            "district",
            "state",
            "state_code",
            "postal_code",
            "pincode",
            "country",
            "phone",
            "alternate_phone",
            "email",
            "website",
            "pan_number",
            "gst_registration_type",
            "paper_size",
            "invoice_template",
            "logo_position",
            "gst_invoice_title",
            "regular_invoice_title",
            "default_invoice_notes",
            "invoice_elements",
            "allow_credit_sales",
            "default_credit_limit",
            "default_invoice_format",
            "invoice_prefix",
            "invoice_terms_and_conditions",
            "invoice_footer",
            "bank_name",
            "bank_account_name",
            "bank_account_number",
            "bank_ifsc_code",
            "bank_branch",
            "bank_upi_id",
            "authorized_signatory_name",
            "signature_image",
            "signature_url",
            "remove_signature",
            "allow_negative_stock",
            "max_cashier_discount_percent",
            "require_customer",
            "auto_print_bill",
            "auto_send_digital_bill",
            "low_stock_threshold",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at", "logo_url", "signature_url"]

    def get_logo_url(self, instance):
        if instance.organization and instance.organization.logo:
            try:
                return instance.organization.logo.url
            except Exception:
                return None
        return None

    def get_signature_url(self, instance):
        if instance.signature_image:
            try:
                return instance.signature_image.url
            except Exception:
                return None
        return None

    def validate_logo(self, value):
        if value:
            # Check maximum size 2MB
            if value.size > 2 * 1024 * 1024:
                raise serializers.ValidationError("Logo image file size must not exceed 2MB.")
            # Check content type if available
            if hasattr(value, "content_type") and value.content_type:
                allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
                if value.content_type.lower() not in allowed_types:
                    raise serializers.ValidationError("Logo must be a valid PNG, JPG, or WEBP image.")
        return value

    def validate_signature_image(self, value):
        if value:
            # Check maximum size 1MB
            if value.size > 1 * 1024 * 1024:
                raise serializers.ValidationError("Signature image file size must not exceed 1MB.")
            if hasattr(value, "content_type") and value.content_type:
                allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
                if value.content_type.lower() not in allowed_types:
                    raise serializers.ValidationError("Signature must be a valid PNG, JPG, or WEBP image.")
        return value

    def validate_invoice_elements(self, value):
        if isinstance(value, str):
            import json
            try:
                value = json.loads(value)
            except Exception:
                raise serializers.ValidationError("Invalid JSON for invoice_elements.")
        if not isinstance(value, dict):
            raise serializers.ValidationError("invoice_elements must be a JSON object.")
        return value

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        org = instance.organization
        if org:
            ret["gstin"] = org.gst_number or ""
            ret["trade_name"] = org.name or ""
            ret["business_name"] = org.name or ""
            ret["legal_name"] = org.legal_name or org.name or ""
            ret["email"] = org.email or ""
            ret["phone"] = org.phone or ""
            ret["address_line1"] = org.address_line1 or ""
            ret["address_line2"] = org.address_line2 or ""
            ret["city"] = org.city or ""
            ret["state"] = org.state or ""
            ret["postal_code"] = org.postal_code or ""
            ret["pincode"] = org.postal_code or ""
            ret["country"] = org.country or "India"
            ret["pan_number"] = org.pan_number or ""
            try:
                ret["logo_url"] = org.logo.url if org.logo else None
            except Exception:
                ret["logo_url"] = None
        else:
            ret["gstin"] = ""
            ret["trade_name"] = ""
            ret["business_name"] = ""
            ret["legal_name"] = ""
            ret["email"] = ""
            ret["phone"] = ""
            ret["address_line1"] = ""
            ret["address_line2"] = ""
            ret["city"] = ""
            ret["state"] = ""
            ret["postal_code"] = ""
            ret["pincode"] = ""
            ret["country"] = "India"
            ret["pan_number"] = ""
            ret["logo_url"] = None

        try:
            ret["signature_url"] = instance.signature_image.url if instance.signature_image else None
        except Exception:
            ret["signature_url"] = None

        # Resolve state code if missing
        if not ret.get("state_code") and ret.get("state"):
            from apps.invoices.gst_utils import resolve_state_code
            ret["state_code"] = resolve_state_code(ret["state"], ret.get("gstin", ""))

        return ret

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

    def update(self, instance, validated_data):
        trade_name = validated_data.pop("trade_name", None)
        business_name = validated_data.pop("business_name", None)
        legal_name = validated_data.pop("legal_name", None)
        gstin = validated_data.pop("gstin", None)
        address_line1 = validated_data.pop("address_line1", None)
        address_line2 = validated_data.pop("address_line2", None)
        city = validated_data.pop("city", None)
        state = validated_data.pop("state", None)
        postal_code = validated_data.pop("postal_code", None)
        pincode = validated_data.pop("pincode", None)
        country = validated_data.pop("country", None)
        phone = validated_data.pop("phone", None)
        email = validated_data.pop("email", None)
        pan_number = validated_data.pop("pan_number", None)
        logo = validated_data.pop("logo", None)
        remove_logo = validated_data.pop("remove_logo", False)
        remove_signature = validated_data.pop("remove_signature", False)

        # Fallback to initial_data if not validated
        if hasattr(self, "initial_data"):
            init = self.initial_data
            if business_name is None:
                business_name = init.get("business_name")
            if trade_name is None:
                trade_name = init.get("trade_name") or business_name
            if legal_name is None:
                legal_name = init.get("legal_name")
            if gstin is None:
                gstin = init.get("gstin")
            if address_line1 is None:
                address_line1 = init.get("address_line1")
            if address_line2 is None:
                address_line2 = init.get("address_line2")
            if city is None:
                city = init.get("city")
            if state is None:
                state = init.get("state")
            if postal_code is None:
                postal_code = init.get("postal_code") or init.get("pincode")
            if country is None:
                country = init.get("country")
            if phone is None:
                phone = init.get("phone")
            if email is None:
                email = init.get("email")
            if pan_number is None:
                pan_number = init.get("pan_number")
            if remove_logo is False and init.get("remove_logo") in [True, "true", "True", "1"]:
                remove_logo = True
            if remove_signature is False and init.get("remove_signature") in [True, "true", "True", "1"]:
                remove_signature = True

        name_to_set = trade_name or business_name

        if instance.organization:
            org = instance.organization
            org_fields = []

            if name_to_set is not None and str(name_to_set).strip():
                org.name = str(name_to_set).strip()
                org_fields.append("name")

            if legal_name is not None and str(legal_name).strip():
                org.legal_name = str(legal_name).strip()
                org_fields.append("legal_name")
            elif name_to_set is not None and not org.legal_name:
                org.legal_name = str(name_to_set).strip()
                org_fields.append("legal_name")

            if gstin is not None:
                org.gst_number = str(gstin).strip().upper()
                org_fields.append("gst_number")

            if address_line1 is not None:
                org.address_line1 = str(address_line1).strip()
                org_fields.append("address_line1")

            if address_line2 is not None:
                org.address_line2 = str(address_line2).strip()
                org_fields.append("address_line2")

            if city is not None:
                org.city = str(city).strip()
                org_fields.append("city")

            if state is not None:
                org.state = str(state).strip()
                org_fields.append("state")

            effective_pin = postal_code or pincode
            if effective_pin is not None:
                org.postal_code = str(effective_pin).strip()
                org_fields.append("postal_code")

            if country is not None:
                org.country = str(country).strip()
                org_fields.append("country")

            if phone is not None:
                org.phone = str(phone).strip()
                org_fields.append("phone")

            if email is not None:
                org.email = str(email).strip()
                org_fields.append("email")

            if pan_number is not None:
                org.pan_number = str(pan_number).strip().upper()
                org_fields.append("pan_number")

            if remove_logo:
                if org.logo:
                    try:
                        org.logo.delete(save=False)
                    except Exception:
                        pass
                    org.logo = None
                    org_fields.append("logo")
            elif logo is not None:
                org.logo = logo
                org_fields.append("logo")

            if org_fields:
                org.save(update_fields=list(set(org_fields)))

                from apps.stores.models import Store
                p_store = Store.objects.filter(organization=org).first()
                if not p_store:
                    Store.objects.create(
                        organization=org,
                        name=f"{str(name_to_set or org.name).strip()} Main Store",
                        code="STR-MAIN",
                        status="active",
                        address_line1=org.address_line1,
                        city=org.city,
                        state=org.state,
                        postal_code=org.postal_code,
                        phone=org.phone,
                    )
                elif name_to_set and str(name_to_set).strip():
                    p_store.name = f"{str(name_to_set).strip()} Main Store"
                    store_fields = ["name"]
                    if org.address_line1:
                        p_store.address_line1 = org.address_line1
                        store_fields.append("address_line1")
                    if org.city:
                        p_store.city = org.city
                        store_fields.append("city")
                    if org.state:
                        p_store.state = org.state
                        store_fields.append("state")
                    if org.postal_code:
                        p_store.postal_code = org.postal_code
                        store_fields.append("postal_code")
                    if org.phone:
                        p_store.phone = org.phone
                        store_fields.append("phone")
                    p_store.save(update_fields=list(set(store_fields)))

        # Handle signature removal or update
        if remove_signature:
            if instance.signature_image:
                try:
                    instance.signature_image.delete(save=False)
                except Exception:
                    pass
                instance.signature_image = None
                instance.save(update_fields=["signature_image"])

        # Auto-resolve state_code if not provided
        if not validated_data.get("state_code") and (state or getattr(instance.organization, "state", None)):
            eff_state = state or getattr(instance.organization, "state", "")
            eff_gst = gstin or getattr(instance.organization, "gst_number", "")
            from apps.invoices.gst_utils import resolve_state_code
            validated_data["state_code"] = resolve_state_code(eff_state, eff_gst)

        return super().update(instance, validated_data)

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
    category_name = serializers.CharField(source="category.name", read_only=True, default="General")

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "barcode",
            "qr_code",
            "category",
            "category_name",
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
    baseline_stock = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
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
            "expected_delivery",
            "due_date",
            "total_amount",
            "paid_amount",
            "outstanding_amount",
            "payment_status",
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


class SupplierPaymentSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    po_number = serializers.CharField(source="purchase_order.po_number", read_only=True, default="")
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        from apps.products.models import SupplierPayment
        model = SupplierPayment
        fields = [
            "id",
            "supplier",
            "supplier_name",
            "purchase_order",
            "po_number",
            "amount",
            "payment_method",
            "payment_date",
            "reference",
            "notes",
            "created_by_name",
            "created_at",
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else "Staff"

