from django.db import models
from django.utils import timezone

from common.models import TenantModel, TimeStampedModel, UUIDModel


def build_invoice_customer_snapshot(customer=None, *, is_walk_in: bool = False) -> dict:
    """Builds immutable customer snapshot fields to persist on Invoice at checkout time."""
    if customer is None or bool(is_walk_in) or getattr(customer, "is_walk_in", False):
        return {
            "customer_id_snapshot": "",
            "customer_name_snapshot": "Walk-in Customer",
            "customer_mobile_snapshot": "",
            "customer_address_snapshot": "",
            "customer_city_snapshot": "",
            "customer_state_snapshot": "",
            "customer_pincode_snapshot": "",
            "customer_gstin_snapshot": "",
            "is_walk_in_snapshot": True,
        }
    return {
        "customer_id_snapshot": str(customer.id),
        "customer_name_snapshot": customer.full_name or "Customer",
        "customer_mobile_snapshot": customer.phone or "",
        "customer_address_snapshot": customer.address_line1 or "",
        "customer_city_snapshot": customer.city or "",
        "customer_state_snapshot": customer.state or "",
        "customer_pincode_snapshot": customer.postal_code or "",
        "customer_gstin_snapshot": getattr(customer, "gstin", "") or "",
        "is_walk_in_snapshot": False,
    }


class Invoice(UUIDModel, TenantModel, TimeStampedModel):
    transaction = models.OneToOneField(
        "transactions.Transaction",
        on_delete=models.CASCADE,
        related_name="invoice",
    )
    invoice_number = models.CharField(max_length=100, db_index=True)
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
    branding_snapshot = models.JSONField(default=dict, blank=True)

    # Immutable customer snapshot captured at invoice creation time
    customer_id_snapshot = models.CharField(max_length=64, blank=True, default="")
    customer_name_snapshot = models.CharField(max_length=255, blank=True, default="")
    customer_mobile_snapshot = models.CharField(max_length=20, blank=True, default="")
    customer_address_snapshot = models.TextField(blank=True, default="")
    customer_city_snapshot = models.CharField(max_length=100, blank=True, default="")
    customer_state_snapshot = models.CharField(max_length=100, blank=True, default="")
    customer_pincode_snapshot = models.CharField(max_length=20, blank=True, default="")
    customer_gstin_snapshot = models.CharField(max_length=50, blank=True, default="")
    is_walk_in_snapshot = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "invoice_number"],
                name="unique_org_invoice_number",
            )
        ]

    def __str__(self):
        return f"Invoice {self.invoice_number}"

    def get_customer_snapshot_dict(self) -> dict:
        """
        Returns customer details prioritizing immutable invoice snapshot fields,
        with defensive fallback to linked transaction.customer for older unmigrated rows.
        """
        from apps.customers.utils import build_customer_address

        has_snapshot = bool(
            self.is_walk_in_snapshot
            or self.customer_name_snapshot
            or self.customer_mobile_snapshot
            or self.customer_address_snapshot
            or self.customer_id_snapshot
        )
        tx_cust = self.transaction.customer if self.transaction else None

        if has_snapshot:
            is_walk_in = bool(self.is_walk_in_snapshot)
            addr = self.customer_address_snapshot or ""
            city = self.customer_city_snapshot or ""
            state = self.customer_state_snapshot or ""
            pincode = self.customer_pincode_snapshot or ""
            gstin = self.customer_gstin_snapshot or ""
            name = self.customer_name_snapshot or ("Walk-in Customer" if is_walk_in else "Customer")
            mobile = "" if is_walk_in else (self.customer_mobile_snapshot or "")
            cust_uuid = None if is_walk_in else (self.customer_id_snapshot or (str(tx_cust.id) if tx_cust else None))
        elif tx_cust:
            is_walk_in = bool(getattr(tx_cust, "is_walk_in", False))
            addr = "" if is_walk_in else (tx_cust.address_line1 or "")
            city = "" if is_walk_in else (tx_cust.city or "")
            state = "" if is_walk_in else (tx_cust.state or "")
            pincode = "" if is_walk_in else (tx_cust.postal_code or "")
            gstin = "" if is_walk_in else (getattr(tx_cust, "gstin", "") or "")
            name = "Walk-in Customer" if is_walk_in else (tx_cust.full_name or "Customer")
            mobile = "" if is_walk_in else (tx_cust.phone or "")
            cust_uuid = None if is_walk_in else str(tx_cust.id)
        else:
            is_walk_in = True
            addr = city = state = pincode = gstin = mobile = ""
            name = "Walk-in Customer"
            cust_uuid = None

        full_addr = "" if is_walk_in else build_customer_address(addr, city, state, pincode)
        return {
            "id": cust_uuid,
            "customer_id": tx_cust.customer_id if (tx_cust and not is_walk_in) else "",
            "name": name,
            "full_name": name,
            "phone": mobile,
            "mobile": mobile,
            "mobile_number": mobile,
            "address": addr,
            "address_line1": addr,
            "city": city,
            "state": state,
            "pincode": pincode,
            "postal_code": pincode,
            "gstin": gstin,
            "full_address": full_addr,
            "is_walk_in": is_walk_in,
            "outstanding_credit": str(tx_cust.outstanding_credit) if (tx_cust and not is_walk_in) else "0.00",
            "credit_limit": str(tx_cust.credit_limit) if (tx_cust and not is_walk_in) else "0.00",
        }


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
