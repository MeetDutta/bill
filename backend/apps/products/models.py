from decimal import Decimal
from django.db import models
from django.utils import timezone
from common.models import TenantModel, TimeStampedModel, UUIDModel


class ProductCategory(UUIDModel, TenantModel, TimeStampedModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "Product categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(UUIDModel, TenantModel, TimeStampedModel):
    external_id = models.CharField(max_length=100, db_index=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    brand = models.CharField(max_length=150, blank=True)
    sku = models.CharField(max_length=100, blank=True)
    barcode = models.CharField(max_length=100, blank=True, db_index=True)
    qr_code = models.CharField(max_length=255, blank=True)
    category = models.ForeignKey(
        ProductCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
    )
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)  # Selling price
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))  # Purchase price
    mrp = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)  # Maximum Retail Price
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))  # GST %
    hsn_code = models.CharField(max_length=20, blank=True)
    unit = models.CharField(max_length=30, default="PCS")  # PCS, KG, GM, LTR, MTR, BOX, etc.
    current_stock = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    min_stock = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    max_stock = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    supplier = models.CharField(max_length=255, blank=True)
    product_attributes = models.JSONField(default=dict, blank=True)  # Business-specific specs (metal, purity, vehicle model, size, color, etc.)
    track_inventory = models.BooleanField(default=True)
    image = models.ImageField(upload_to="products/", null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        unique_together = [("organization", "external_id")]
        indexes = [
            models.Index(fields=["organization", "barcode"]),
            models.Index(fields=["organization", "sku"]),
            models.Index(fields=["organization", "name"]),
        ]

    def __init__(self, *args, **kwargs):
        if "selling_price" in kwargs and "unit_price" not in kwargs:
            kwargs["unit_price"] = kwargs.pop("selling_price")
        if "purchase_price" in kwargs and "cost_price" not in kwargs:
            kwargs["cost_price"] = kwargs.pop("purchase_price")
        super().__init__(*args, **kwargs)

    @property
    def selling_price(self):
        return self.unit_price

    @selling_price.setter
    def selling_price(self, val):
        self.unit_price = val

    @property
    def purchase_price(self):
        return self.cost_price

    @purchase_price.setter
    def purchase_price(self, val):
        self.cost_price = val

    def save(self, *args, **kwargs):
        import secrets
        if not self.external_id:
            self.external_id = self.sku or f"PROD-{secrets.token_hex(4).upper()}"
        if "update_fields" in kwargs and kwargs["update_fields"] is not None:
            field_map = {"purchase_price": "cost_price", "selling_price": "unit_price"}
            kwargs["update_fields"] = [field_map.get(f, f) for f in kwargs["update_fields"]]
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} (₹{self.unit_price})"

    @property
    def is_low_stock(self):
        return self.track_inventory and self.current_stock <= self.min_stock


class InventoryMovement(UUIDModel, TenantModel, TimeStampedModel):
    """
    Immutable ledger of all stock changes: Sales, Purchases, Returns, Adjustments, Damage.
    """
    MOVEMENT_CHOICES = [
        ("SALE", "POS / Online Sale"),
        ("PURCHASE", "Purchase Order Stock In"),
        ("RETURN", "Customer Return Restock"),
        ("ADJUSTMENT", "Manual Stock Adjustment"),
        ("DAMAGE", "Damaged / Expired Goods"),
        ("OPENING_STOCK", "Opening Stock Entry"),
        ("TRANSFER", "Inter-Store Transfer"),
    ]

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="inventory_movements",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="inventory_movements",
    )
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_CHOICES, db_index=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)  # Negative for deductions, positive for additions
    previous_stock = models.DecimalField(max_digits=12, decimal_places=2)
    new_stock = models.DecimalField(max_digits=12, decimal_places=2)
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.CharField(max_length=100, blank=True, db_index=True)  # Invoice number, return number, PO number
    user = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "movement_type"]),
            models.Index(fields=["product", "created_at"]),
        ]

    def __str__(self):
        return f"{self.movement_type} {self.product.name}: {self.previous_stock} → {self.new_stock}"


class Supplier(UUIDModel, TenantModel, TimeStampedModel):
    name = models.CharField(max_length=255, db_index=True)
    contact_person = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    gstin = models.CharField(max_length=50, blank=True)
    pan = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    opening_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["organization", "name"]),
            models.Index(fields=["organization", "is_active"]),
        ]

    def __str__(self):
        return self.name


class PurchaseOrder(UUIDModel, TenantModel, TimeStampedModel):
    """
    Supplier purchase order & stock-in document.
    """
    STATUS_CHOICES = [
        ("received", "Received & Stocked"),
        ("ordered", "Ordered / Pending Delivery"),
        ("cancelled", "Cancelled"),
    ]

    po_number = models.CharField(max_length=100, db_index=True)
    supplier_ref = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchase_orders",
    )
    supplier_name = models.CharField(max_length=255)
    supplier_invoice = models.CharField(max_length=100, blank=True)
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="purchase_orders",
    )
    purchase_date = models.DateField(default=timezone.now)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="received")
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    def __init__(self, *args, **kwargs):
        supplier_kw = kwargs.pop("supplier", None)
        supplier_inv_kw = kwargs.pop("supplier_invoice_number", None)
        kwargs.pop("tax_amount", None)
        super().__init__(*args, **kwargs)
        if supplier_kw is not None:
            self.supplier = supplier_kw
        if supplier_inv_kw is not None:
            self.supplier_invoice_number = supplier_inv_kw

    @property
    def supplier(self):
        return self.supplier_ref.name if self.supplier_ref else self.supplier_name

    @supplier.setter
    def supplier(self, val):
        if isinstance(val, Supplier):
            self.supplier_ref = val
            self.supplier_name = val.name
        elif isinstance(val, str):
            self.supplier_name = val

    @property
    def supplier_invoice_number(self):
        return self.supplier_invoice

    @supplier_invoice_number.setter
    def supplier_invoice_number(self, val):
        self.supplier_invoice = val

    class Meta:
        ordering = ["-purchase_date", "-created_at"]

    def __str__(self):
        return f"PO #{self.po_number} - {self.supplier} (₹{self.total_amount})"


class PurchaseOrderItem(UUIDModel, TimeStampedModel):
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="purchase_items",
    )
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"
