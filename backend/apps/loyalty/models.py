from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class LoyaltyAccount(UUIDModel, TenantModel, TimeStampedModel):
    customer = models.OneToOneField(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="loyalty_account",
    )
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_earned = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_redeemed = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_expired = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        verbose_name_plural = "Loyalty accounts"

    def __str__(self):
        return f"{self.customer} - Balance: {self.balance}"


class LoyaltyRule(UUIDModel, TenantModel, TimeStampedModel):
    RULE_TYPE_CHOICES = [
        ("earn_purchase", "Earn on Purchase"),
        ("earn_referral", "Earn on Referral"),
        ("earn_birthday", "Earn on Birthday"),
        ("redeem", "Redemption"),
        ("expiry", "Expiry"),
    ]

    name = models.CharField(max_length=255)
    rule_type = models.CharField(max_length=30, choices=RULE_TYPE_CHOICES)
    points = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    per_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    min_transaction_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    max_points_per_transaction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    expiry_days = models.PositiveIntegerField(default=365)
    is_active = models.BooleanField(default=True)
    priority = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-priority", "name"]

    def __str__(self):
        return f"{self.name} ({self.rule_type})"


class LoyaltyTransaction(UUIDModel, TenantModel, TimeStampedModel):
    TRANSACTION_TYPE_CHOICES = [
        ("earn", "Earn"),
        ("redeem", "Redeem"),
        ("expire", "Expire"),
        ("adjustment", "Adjustment"),
    ]

    loyalty_account = models.ForeignKey(
        LoyaltyAccount,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPE_CHOICES)
    points = models.DecimalField(max_digits=10, decimal_places=2)
    balance_after = models.DecimalField(max_digits=12, decimal_places=2)
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.CharField(max_length=100, blank=True)
    description = models.CharField(max_length=255, blank=True)
    rule = models.ForeignKey(
        LoyaltyRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.transaction_type} {self.points} pts - {self.loyalty_account}"


class LoyaltyRedemption(UUIDModel, TenantModel, TimeStampedModel):
    loyalty_account = models.ForeignKey(
        LoyaltyAccount,
        on_delete=models.CASCADE,
        related_name="redemptions",
    )
    transaction = models.ForeignKey(
        "transactions.Transaction",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    points = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=[("pending", "Pending"), ("completed", "Completed"), ("cancelled", "Cancelled")],
        default="completed",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Redemption {self.points} pts"
