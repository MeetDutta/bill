from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class Transaction(UUIDModel, TenantModel, TimeStampedModel):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
        ("refunded", "Refunded"),
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
    invoice_number = models.CharField(max_length=100, db_index=True)
    transaction_date = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="completed")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=50, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)
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
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    hsn_code = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.name} x{self.quantity}"
