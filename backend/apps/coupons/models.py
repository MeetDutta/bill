from django.db import models
from django.utils import timezone

from common.models import TenantModel, TimeStampedModel, UUIDModel


class Coupon(UUIDModel, TenantModel, TimeStampedModel):
    DISCOUNT_TYPE_CHOICES = [
        ("percentage", "Percentage"),
        ("fixed", "Fixed Amount"),
    ]

    code = models.CharField(max_length=50, db_index=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    discount_type = models.CharField(max_length=20, choices=DISCOUNT_TYPE_CHOICES)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    min_order_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    max_discount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    start_at = models.DateTimeField(default=timezone.now, blank=True)
    expires_at = models.DateTimeField()
    usage_limit = models.PositiveIntegerField(default=0)
    per_customer_limit = models.PositiveIntegerField(default=1)
    used_count = models.PositiveIntegerField(default=0)
    eligible_segments = models.JSONField(default=list, blank=True)
    eligible_store_ids = models.JSONField(default=list, blank=True)
    eligible_product_ids = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = [("organization", "code")]

    def save(self, *args, **kwargs):
        if self.code:
            self.code = self.code.strip().upper()
        if not self.start_at:
            self.start_at = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class CouponRedemption(UUIDModel, TenantModel, TimeStampedModel):
    coupon = models.ForeignKey(
        Coupon,
        on_delete=models.CASCADE,
        related_name="redemptions",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="coupon_redemptions",
    )
    transaction = models.ForeignKey(
        "transactions.Transaction",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.coupon.code} redeemed by {self.customer}"
