from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class DailySalesReport(UUIDModel, TenantModel, TimeStampedModel):
    date = models.DateField(db_index=True)
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="daily_reports",
        null=True,
        blank=True,
    )
    total_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_transactions = models.PositiveIntegerField(default=0)
    total_items_sold = models.PositiveIntegerField(default=0)
    average_order_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    new_customers = models.PositiveIntegerField(default=0)
    returning_customers = models.PositiveIntegerField(default=0)
    total_loyalty_earned = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_loyalty_redeemed = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "store", "date")]

    def __str__(self):
        return f"Report {self.date} - {self.store}"


class CustomerAnalytics(UUIDModel, TenantModel, TimeStampedModel):
    date = models.DateField(db_index=True)
    total_customers = models.PositiveIntegerField(default=0)
    new_customers = models.PositiveIntegerField(default=0)
    active_customers = models.PositiveIntegerField(default=0)
    inactive_customers = models.PositiveIntegerField(default=0)
    vip_customers = models.PositiveIntegerField(default=0)
    average_lifetime_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "date")]

    def __str__(self):
        return f"Customer Analytics {self.date}"


class CampaignAnalytics(UUIDModel, TenantModel, TimeStampedModel):
    date = models.DateField(db_index=True)
    total_campaigns = models.PositiveIntegerField(default=0)
    total_messages_sent = models.PositiveIntegerField(default=0)
    total_delivered = models.PositiveIntegerField(default=0)
    total_read = models.PositiveIntegerField(default=0)
    total_failed = models.PositiveIntegerField(default=0)
    total_coupons_redeemed = models.PositiveIntegerField(default=0)
    total_coupon_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "date")]

    def __str__(self):
        return f"Campaign Analytics {self.date}"
