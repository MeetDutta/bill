from decimal import Decimal
from django.db import models
from common.models import TenantModel, TimeStampedModel, UUIDModel


class AuditLog(UUIDModel, TenantModel, TimeStampedModel):
    user = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=100, db_index=True)
    entity_type = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=100, blank=True)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "action"]),
            models.Index(fields=["entity_type", "entity_id"]),
        ]

    def __str__(self):
        return f"{self.action} - {self.entity_type} by {self.user}"


class BusinessConfig(UUIDModel, TenantModel, TimeStampedModel):
    """
    Universal Business Configuration:
    Controls business type (Retail, Hardware, Jewellery, Auto Spares, etc.),
    tax modes, invoice layout, discount ceilings, and stock rules.
    """
    BUSINESS_TYPES = [
        ("RETAIL", "Retail Store"),
        ("HARDWARE", "Hardware & Sanitary"),
        ("JEWELLERY", "Jewellery & Gems"),
        ("AUTO_SPARES", "Auto Spare Parts"),
        ("ELECTRONICS", "Consumer Electronics"),
        ("GROCERY", "Grocery & Supermarket"),
        ("CLOTHING", "Clothing & Apparel"),
        ("FURNITURE", "Furniture & Home"),
        ("ELECTRICAL", "Electrical Equipment"),
        ("MOBILE_COMPUTER", "Mobile & Computer Shop"),
        ("GENERAL", "General Store"),
        ("OTHER", "Other Configurable Business"),
    ]

    TAX_MODES = [
        ("exclusive", "Tax Exclusive (Added at checkout)"),
        ("inclusive", "Tax Inclusive (Included in product price)"),
    ]

    INVOICE_FORMATS = [
        ("a4", "A4 Standard"),
        ("thermal_80mm", "Thermal 80mm POS"),
        ("thermal_58mm", "Thermal 58mm Compact"),
    ]

    business_type = models.CharField(max_length=50, choices=BUSINESS_TYPES, default="RETAIL")
    gst_enabled = models.BooleanField(default=True)
    default_tax_mode = models.CharField(max_length=20, choices=TAX_MODES, default="exclusive")
    default_tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("18.00"))
    invoice_prefix = models.CharField(max_length=20, default="INV")
    invoice_format = models.CharField(max_length=20, choices=INVOICE_FORMATS, default="a4")
    allow_negative_stock = models.BooleanField(default=False)
    low_stock_threshold = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("5.00"))
    credit_sales_enabled = models.BooleanField(default=True)
    default_credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("50000.00"))
    max_discount_cashier = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("10.00"))
    max_discount_manager = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("30.00"))
    custom_product_fields = models.JSONField(default=list, blank=True)
    terms_and_conditions = models.TextField(blank=True, default="Goods once sold will be accepted for return/exchange within 7 days with original receipt.")
    invoice_footer = models.TextField(blank=True, default="Thank you for your business! Visit again.")
    auto_print = models.BooleanField(default=False)
    auto_send_whatsapp = models.BooleanField(default=False)
    require_customer = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Business Configuration"
        verbose_name_plural = "Business Configurations"

    def __str__(self):
        return f"{self.organization.name} - {self.get_business_type_display()}"

    @property
    def tax_mode(self):
        return self.default_tax_mode

    @tax_mode.setter
    def tax_mode(self, val):
        self.default_tax_mode = val

    @property
    def allow_credit_sales(self):
        return self.credit_sales_enabled

    @allow_credit_sales.setter
    def allow_credit_sales(self, val):
        self.credit_sales_enabled = val

    @property
    def max_cashier_discount_percent(self):
        return self.max_discount_cashier

    @property
    def default_invoice_format(self):
        return self.invoice_format

    @property
    def invoice_terms_and_conditions(self):
        return self.terms_and_conditions

    @property
    def auto_send_digital_bill(self):
        return self.auto_send_whatsapp

    @property
    def auto_print_bill(self):
        return self.auto_print


class HeldCart(UUIDModel, TenantModel, TimeStampedModel):
    """
    Temporary or held customer shopping cart on POS.
    Allows cashiers to hold a cart, attend to another customer, and resume later.
    """
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="held_carts",
    )
    cashier = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="held_carts",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="held_carts",
    )
    reference = models.CharField(max_length=150, default="Held Cart")
    cart_data = models.JSONField(default=list)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
    is_held = models.BooleanField(default=True)  # True = Held Cart, False = Saved Draft

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"HeldCart {self.reference} ({self.store.name}) - ₹{self.total}"

    @property
    def hold_reference(self):
        return self.reference

    @hold_reference.setter
    def hold_reference(self, val):
        self.reference = val

    @property
    def customer_name(self):
        return getattr(self, "_customer_name", (self.customer.full_name if self.customer else ""))

    @customer_name.setter
    def customer_name(self, val):
        self._customer_name = val

    @property
    def customer_phone(self):
        return getattr(self, "_customer_phone", (self.customer.phone if self.customer else ""))

    @customer_phone.setter
    def customer_phone(self, val):
        self._customer_phone = val

    @property
    def item_count(self):
        if isinstance(self.cart_data, dict):
            return len(self.cart_data.get("items", []))
        elif isinstance(self.cart_data, list):
            return len(self.cart_data)
        return 0


class CashRegister(UUIDModel, TenantModel, TimeStampedModel):
    """
    POS Cash Register session for day opening / day close reconciliation.
    """
    STATUS_CHOICES = [
        ("open", "Open"),
        ("closed", "Closed"),
    ]

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="cash_registers",
    )
    cashier = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="cash_registers",
    )
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    opening_cash = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    cash_sales = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    cash_refunds = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    cash_deposits = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    cash_withdrawals = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    expected_cash = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    actual_cash = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    difference = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-opened_at"]

    def __str__(self):
        return f"Register {self.store.name} ({self.status}) - Opened by {self.cashier}"

    @property
    def opening_balance(self):
        return self.opening_cash

    @opening_balance.setter
    def opening_balance(self, val):
        self.opening_cash = val

    @property
    def total_cash_sales(self):
        return self.cash_sales

    @property
    def total_cash_refunds(self):
        return self.cash_refunds

    @property
    def cash_added(self):
        return self.cash_deposits

    @cash_added.setter
    def cash_added(self, val):
        self.cash_deposits = val

    @property
    def cash_withdrawn(self):
        return self.cash_withdrawals

    @cash_withdrawn.setter
    def cash_withdrawn(self, val):
        self.cash_withdrawals = val

    @property
    def opened_by(self):
        return self.cashier

    @property
    def closed_by(self):
        return self.cashier

    def record_sale(self, amount: Decimal):
        self.cash_sales += amount
        self.save(update_fields=["cash_sales"])

    def record_refund(self, amount: Decimal):
        self.cash_refunds += amount
        self.save(update_fields=["cash_refunds"])

    def calculate_expected_cash(self) -> Decimal:
        actual_open = self.opening_cash or Decimal("0.00")
        actual_sales = self.cash_sales or Decimal("0.00")
        actual_refunds = self.cash_refunds or Decimal("0.00")
        actual_dep = self.cash_deposits or Decimal("0.00")
        actual_with = self.cash_withdrawals or Decimal("0.00")
        return actual_open + actual_sales - actual_refunds + actual_dep - actual_with

    def close_register(self, actual_cash: Decimal, closed_by_user=None, notes: str = ""):
        from django.utils import timezone
        self.actual_cash = actual_cash
        self.expected_cash = self.calculate_expected_cash()
        self.difference = self.actual_cash - self.expected_cash
        self.status = "closed"
        self.closed_at = timezone.now()
        if notes:
            self.notes = f"{self.notes}\nClosing Notes: {notes}".strip()
        self.save(update_fields=["actual_cash", "expected_cash", "difference", "status", "closed_at", "notes"])

