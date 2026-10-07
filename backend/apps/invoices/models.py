from django.db import models
from django.utils import timezone

from common.models import TenantModel, TimeStampedModel, UUIDModel


class Invoice(UUIDModel, TenantModel, TimeStampedModel):
    transaction = models.OneToOneField(
        "transactions.Transaction",
        on_delete=models.CASCADE,
        related_name="invoice",
    )
    invoice_number = models.CharField(max_length=100, unique=True, db_index=True)
    pdf_url = models.URLField(blank=True)
    web_url = models.URLField(blank=True)
    secure_token = models.CharField(max_length=100, unique=True, db_index=True)
    is_viewed = models.BooleanField(default=False)
    viewed_at = models.DateTimeField(null=True, blank=True)
    invoice_type = models.CharField(
        max_length=50,
        choices=[
            ("gst", "GST Tax Invoice"),
            ("non_gst", "Standard Bill / Non-GST"),
            ("thermal", "Thermal Receipt"),
            ("credit_memo", "Credit Note / Return"),
        ],
        default="gst",
    )
    template_format = models.CharField(
        max_length=50,
        choices=[
            ("a4", "A4 Standard"),
            ("thermal_80mm", "80mm Thermal"),
            ("thermal_58mm", "58mm Thermal"),
        ],
        default="a4",
    )
    terms_and_conditions = models.TextField(blank=True)
    custom_notes = models.TextField(blank=True)
    qr_code_data = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Invoice {self.invoice_number}"


class Quotation(UUIDModel, TenantModel, TimeStampedModel):
    """
    Sales Quotation / Estimate document. Can be accepted and converted into an Invoice.
    """
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("sent", "Sent to Customer"),
        ("accepted", "Accepted"),
        ("rejected", "Rejected"),
        ("expired", "Expired"),
        ("converted", "Converted to Invoice"),
    ]

    quotation_number = models.CharField(max_length=100, db_index=True)
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
    )
    customer_name = models.CharField(max_length=255, blank=True)
    customer_phone = models.CharField(max_length=50, blank=True)
    customer_email = models.EmailField(blank=True)
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
    )
    quotation_date = models.DateField(default=timezone.now)
    valid_until = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    notes = models.TextField(blank=True)
    terms_and_conditions = models.TextField(blank=True)

    converted_invoice = models.OneToOneField(
        Invoice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="origin_quotation",
    )
    converted_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-quotation_date", "-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["organization", "quotation_number"]),
        ]

    def __str__(self):
        name = self.customer.full_name if self.customer else (self.customer_name or "Walk-in")
        return f"Quote #{self.quotation_number} - {name} (₹{self.total})"


class QuotationItem(UUIDModel, TimeStampedModel):
    quotation = models.ForeignKey(
        Quotation,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotation_items",
    )
    name = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    hsn_code = models.CharField(max_length=50, blank=True)
    unit = models.CharField(max_length=50, blank=True, default="pcs")

    def __str__(self):
        return f"{self.name} x {self.quantity}"
