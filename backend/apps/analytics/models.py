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


class CustomerRFMProfile(UUIDModel, TenantModel, TimeStampedModel):
    customer = models.OneToOneField(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="rfm_profile",
    )
    recency_days = models.PositiveIntegerField(default=0)
    frequency_count = models.PositiveIntegerField(default=0)
    monetary_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    r_score = models.PositiveSmallIntegerField(default=1)
    f_score = models.PositiveSmallIntegerField(default=1)
    m_score = models.PositiveSmallIntegerField(default=1)
    rfm_score = models.CharField(max_length=10, default="111", db_index=True)
    segment = models.CharField(max_length=50, default="New Customers", db_index=True)
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-calculated_at"]
        indexes = [
            models.Index(fields=["organization", "segment"]),
            models.Index(fields=["organization", "rfm_score"]),
        ]

    def __str__(self):
        return f"{self.customer} - {self.segment} ({self.rfm_score})"


class CustomerHealthProfile(UUIDModel, TenantModel, TimeStampedModel):
    STATUS_CHOICES = [
        ("EXCELLENT", "Excellent"),
        ("HEALTHY", "Healthy"),
        ("STABLE", "Stable"),
        ("AT_RISK", "At Risk"),
        ("CRITICAL", "Critical"),
    ]

    customer = models.OneToOneField(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="health_profile",
    )
    health_score = models.PositiveSmallIntegerField(default=50)
    health_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="STABLE", db_index=True)
    risk_factors = models.JSONField(default=list, blank=True)
    positive_factors = models.JSONField(default=list, blank=True)
    recommended_action = models.CharField(max_length=100, blank=True)
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-health_score"]
        indexes = [
            models.Index(fields=["organization", "health_status"]),
            models.Index(fields=["organization", "health_score"]),
        ]

    def __str__(self):
        return f"{self.customer} - {self.health_score}/100 ({self.health_status})"


class ChurnPrediction(UUIDModel, TenantModel, TimeStampedModel):
    RISK_CHOICES = [
        ("LOW", "Low"),
        ("MEDIUM", "Medium"),
        ("HIGH", "High"),
        ("CRITICAL", "Critical"),
    ]

    customer = models.OneToOneField(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="churn_prediction",
    )
    churn_probability = models.DecimalField(max_digits=5, decimal_places=4, default=0.0)
    churn_risk = models.CharField(max_length=20, choices=RISK_CHOICES, default="LOW", db_index=True)
    prediction_reason = models.TextField(blank=True)
    risk_factors = models.JSONField(default=list, blank=True)
    recommended_action = models.CharField(max_length=100, blank=True)
    predicted_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-churn_probability"]
        indexes = [
            models.Index(fields=["organization", "churn_risk"]),
            models.Index(fields=["organization", "churn_probability"]),
        ]

    def __str__(self):
        return f"{self.customer} - Churn Risk: {self.churn_risk} ({self.churn_probability:.1%})"


class ProductAffinity(UUIDModel, TenantModel, TimeStampedModel):
    product_a = models.ForeignKey(
        "products.Product",
        on_delete=models.CASCADE,
        related_name="affinities_from",
    )
    product_b = models.ForeignKey(
        "products.Product",
        on_delete=models.CASCADE,
        related_name="affinities_to",
    )
    co_occurrence_count = models.PositiveIntegerField(default=0)
    affinity_score = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    confidence = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    lift = models.DecimalField(max_digits=8, decimal_places=2, default=1.0)
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-affinity_score"]
        unique_together = [("organization", "product_a", "product_b")]
        indexes = [
            models.Index(fields=["organization", "product_a"]),
            models.Index(fields=["organization", "affinity_score"]),
        ]

    def __str__(self):
        return f"{self.product_a} + {self.product_b} ({self.affinity_score}%)"


class ProductBundle(UUIDModel, TenantModel, TimeStampedModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    products = models.ManyToManyField("products.Product", related_name="bundles")
    original_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bundle_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    affinity_score = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    is_published = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} - ₹{self.bundle_price} (was ₹{self.original_price})"


class BusinessAlert(UUIDModel, TenantModel, TimeStampedModel):
    SEVERITY_CHOICES = [
        ("INFO", "Info"),
        ("WARNING", "Warning"),
        ("CRITICAL", "Critical"),
    ]

    alert_type = models.CharField(max_length=100, db_index=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default="WARNING")
    title = models.CharField(max_length=255)
    description = models.TextField()
    entity_type = models.CharField(max_length=50, blank=True)
    entity_id = models.CharField(max_length=100, blank=True)
    recommended_action = models.CharField(max_length=255, blank=True)
    is_acknowledged = models.BooleanField(default=False)
    is_dismissed = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "severity", "is_dismissed"]),
            models.Index(fields=["organization", "created_at"]),
        ]

    def __str__(self):
        return f"[{self.severity}] {self.title}"


class BusinessHealthSnapshot(UUIDModel, TenantModel, TimeStampedModel):
    date = models.DateField(db_index=True)
    overall_score = models.PositiveSmallIntegerField(default=75)
    sales_growth_score = models.PositiveSmallIntegerField(default=75)
    retention_score = models.PositiveSmallIntegerField(default=75)
    loyalty_score = models.PositiveSmallIntegerField(default=75)
    marketing_score = models.PositiveSmallIntegerField(default=75)
    product_performance_score = models.PositiveSmallIntegerField(default=75)
    weakest_area = models.CharField(max_length=100, default="Customer Retention")
    metrics_data = models.JSONField(default=dict, blank=True)
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "date")]
        indexes = [
            models.Index(fields=["organization", "date"]),
        ]

    def __str__(self):
        return f"Health {self.date}: {self.overall_score}/100"
