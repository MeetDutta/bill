from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class Customer(UUIDModel, TenantModel, TimeStampedModel):
    customer_id = models.CharField(max_length=50, db_index=True, blank=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=20, db_index=True)
    email = models.EmailField(blank=True, db_index=True)
    date_of_birth = models.DateField(null=True, blank=True)
    anniversary_date = models.DateField(null=True, blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    tags = models.JSONField(default=list, blank=True)
    preferred_store = models.ForeignKey(
        "stores.Store",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="preferred_customers",
    )
    source = models.CharField(
        max_length=50,
        choices=[
            ("pos", "POS Import"),
            ("api", "API Import"),
            ("manual", "Manual Entry"),
            ("web", "Web Portal"),
        ],
        default="pos",
    )
    total_purchases = models.PositiveIntegerField(default=0)
    total_spend = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    average_order_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    last_purchase_at = models.DateTimeField(null=True, blank=True)
    segment = models.CharField(max_length=50, blank=True, db_index=True)
    marketing_consent = models.BooleanField(default=True)
    whatsapp_opt_in = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    is_walk_in = models.BooleanField(default=False)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True)
    outstanding_credit = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True)
    portal_token = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = [("organization", "phone")]
        indexes = [
            models.Index(fields=["organization", "segment"]),
            models.Index(fields=["organization", "last_purchase_at"]),
            models.Index(fields=["organization", "total_spend"]),
            models.Index(fields=["organization", "outstanding_credit"]),
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name} <{self.phone}>"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def save(self, *args, **kwargs):
        import secrets
        if not self.customer_id:
            while True:
                candidate_id = f"CUS-{secrets.token_hex(5).upper()}"
                if not Customer.objects.filter(customer_id=candidate_id).exists():
                    self.customer_id = candidate_id
                    break
        if not self.portal_token:
            while True:
                candidate_token = secrets.token_urlsafe(24)
                if not Customer.objects.filter(portal_token=candidate_token).exists():
                    self.portal_token = candidate_token
                    break
        super().save(*args, **kwargs)

    def update_stats(self, amount):
        from decimal import Decimal, ROUND_HALF_UP
        from django.utils import timezone
        self.total_purchases += 1
        self.total_spend += Decimal(str(amount or 0))
        if self.total_purchases > 0:
            self.average_order_value = (self.total_spend / Decimal(self.total_purchases)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        else:
            self.average_order_value = Decimal("0.00")
        self.last_purchase_at = timezone.now()
        self.save(update_fields=["total_purchases", "total_spend", "average_order_value", "last_purchase_at"])


class CustomerTimeline(UUIDModel, TenantModel, TimeStampedModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="timeline",
    )
    event_type = models.CharField(
        max_length=50,
        choices=[
            ("created", "Customer Created"),
            ("purchase", "Purchase"),
            ("bill_sent", "Bill Sent"),
            ("loyalty_earned", "Loyalty Earned"),
            ("coupon_received", "Coupon Received"),
            ("campaign_received", "Campaign Received"),
            ("coupon_redeemed", "Coupon Redeemed"),
            ("feedback", "Feedback"),
            ("referral", "Referral"),
            ("repeat_purchase", "Repeat Purchase"),
            ("credit_sale", "Credit Sale"),
            ("credit_payment", "Credit Payment"),
            ("sale_return", "Sale Return"),
        ],
        db_index=True,
    )
    reference_id = models.CharField(max_length=100, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Customer timelines"

    def __str__(self):
        return f"{self.customer} - {self.event_type}"
