from decimal import Decimal
from django.db import models
from common.models import TenantModel, TimeStampedModel, UUIDModel


class Transaction(UUIDModel, TenantModel, TimeStampedModel):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
        ("refunded", "Refunded"),
    ]

    PAYMENT_STATUS_CHOICES = [
        ("paid", "Fully Paid"),
        ("partial", "Partially Paid"),
        ("credit", "Credit / Unpaid"),
    ]

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    cashier = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="processed_transactions",
    )
    invoice_number = models.CharField(max_length=100, db_index=True)
    transaction_date = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="completed")
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default="paid")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    round_off = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    outstanding_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    due_date = models.DateField(null=True, blank=True)
    payment_method = models.CharField(max_length=50, blank=True)  # Primary payment mode or 'split'
    payment_reference = models.CharField(max_length=100, blank=True)
    tax_breakup = models.JSONField(default=dict, blank=True)  # {"taxable_amount": ..., "cgst": ..., "sgst": ..., "igst": ...}
    is_return = models.BooleanField(default=False)
    original_transaction = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="returns",
    )
    external_source = models.CharField(max_length=50, blank=True, db_index=True)
    external_transaction_id = models.CharField(max_length=100, blank=True, db_index=True)
    notes = models.TextField(blank=True)
    loyalty_points_earned = models.PositiveIntegerField(default=0)
    loyalty_points_redeemed = models.PositiveIntegerField(default=0)
    bill_sent = models.BooleanField(default=False)
    bill_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-transaction_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "external_transaction_id"],
                condition=~models.Q(external_transaction_id=""),
                name="unique_org_non_empty_external_tx",
            )
        ]
        indexes = [
            models.Index(fields=["organization", "transaction_date"]),
            models.Index(fields=["organization", "store", "transaction_date"]),
            models.Index(fields=["customer", "transaction_date"]),
            models.Index(fields=["invoice_number"]),
            models.Index(fields=["organization", "payment_status"]),
        ]

    def __str__(self):
        return f"{self.invoice_number} - ₹{self.total}"

    @property
    def item_count(self):
        return self.items.count()


class TransactionItem(UUIDModel, TimeStampedModel):
    transaction = models.ForeignKey(
        Transaction,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transaction_items",
    )
    external_product_id = models.CharField(max_length=100, blank=True)
    name = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    cgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    sgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    igst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2)
    hsn_code = models.CharField(max_length=20, blank=True)
    attributes = models.JSONField(default=dict, blank=True)  # Business-specific item attributes (e.g. gross weight for jewellery, size for clothing)
    returned_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.name} x{self.quantity}"

    @property
    def remaining_returnable_quantity(self):
        return max(Decimal("0.00"), self.quantity - self.returned_quantity)


class TransactionPayment(UUIDModel, TenantModel, TimeStampedModel):
    """
    Individual payment record supporting split payments (e.g. Cash + UPI).
    """
    transaction = models.ForeignKey(
        Transaction,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    payment_method = models.CharField(max_length=50)  # cash, upi, card, bank_transfer, credit, other
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reference = models.CharField(max_length=100, blank=True)  # UPI UTR, Card Auth Code, etc.
    status = models.CharField(max_length=20, default="success")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.payment_method.upper()}: ₹{self.amount} for {self.transaction.invoice_number}"


class SalesReturn(UUIDModel, TenantModel, TimeStampedModel):
    """
    Sales return and refund record linked to the original transaction.
    """
    return_number = models.CharField(max_length=100, db_index=True)
    original_transaction = models.ForeignKey(
        Transaction,
        on_delete=models.CASCADE,
        related_name="sales_returns",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales_returns",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="sales_returns",
    )
    total_refund_amount = models.DecimalField(max_digits=12, decimal_places=2)
    refund_method = models.CharField(max_length=50, default="cash")  # cash, upi, store_credit, original_payment
    status = models.CharField(max_length=20, default="completed")  # completed, pending, rejected
    reason = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-created_at"]

    def __init__(self, *args, **kwargs):
        if "notes" in kwargs and "reason" not in kwargs:
            kwargs["reason"] = kwargs.pop("notes")
        super().__init__(*args, **kwargs)

    @property
    def notes(self):
        return self.reason

    @notes.setter
    def notes(self, val):
        self.reason = val

    def __str__(self):
        return f"Return {self.return_number} (Ref: {self.original_transaction.invoice_number}) - ₹{self.total_refund_amount}"


class SalesReturnItem(UUIDModel, TimeStampedModel):
    sales_return = models.ForeignKey(
        SalesReturn,
        on_delete=models.CASCADE,
        related_name="items",
    )
    transaction_item = models.ForeignKey(
        TransactionItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="return_records",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.CASCADE,
        related_name="return_items",
    )
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255, blank=True)
    restock_inventory = models.BooleanField(default=True)

    def __str__(self):
        return f"Returned {self.product.name} x {self.quantity}"


class CustomerCreditPayment(UUIDModel, TenantModel, TimeStampedModel):
    """
    Receipt for payments made toward outstanding customer credit/udhaar.
    """
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="credit_payments",
    )
    transaction = models.ForeignKey(
        Transaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_settlements",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=50, default="cash")  # cash, upi, bank_transfer, card, other
    reference = models.CharField(max_length=100, blank=True)
    received_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Credit Payment ₹{self.amount} by {self.customer.full_name}"
