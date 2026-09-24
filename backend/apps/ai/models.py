from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class AIContentGeneration(UUIDModel, TenantModel, TimeStampedModel):
    CONTENT_TYPE_CHOICES = [
        ("campaign_message", "Campaign Message"),
        ("coupon_description", "Coupon Description"),
        ("review_reply", "Review Reply"),
        ("whatsapp_template", "WhatsApp Template"),
    ]

    content_type = models.CharField(max_length=30, choices=CONTENT_TYPE_CHOICES)
    prompt = models.TextField()
    generated_content = models.TextField(blank=True)
    parameters = models.JSONField(default=dict, blank=True)
    model_used = models.CharField(max_length=100, blank=True)
    tokens_used = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=[("pending", "Pending"), ("completed", "Completed"), ("failed", "Failed")],
        default="pending",
    )
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.content_type} - {self.status}"


class CustomerInsight(UUIDModel, TenantModel, TimeStampedModel):
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="insights",
    )
    insight_type = models.CharField(
        max_length=50,
        choices=[
            ("churn_risk", "Churn Risk"),
            ("lifetime_value", "Lifetime Value"),
            ("purchase_prediction", "Purchase Prediction"),
            ("product_affinity", "Product Affinity"),
            ("segment_suggestion", "Segment Suggestion"),
        ],
    )
    score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    data = models.JSONField(default=dict, blank=True)
    recommendation = models.TextField(blank=True)
    model_version = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = [("customer", "insight_type")]

    def __str__(self):
        return f"{self.customer} - {self.insight_type}"


class AISegmentation(UUIDModel, TenantModel, TimeStampedModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    rules = models.JSONField(default=dict)
    customer_count = models.PositiveIntegerField(default=0)
    is_auto_generated = models.BooleanField(default=False)
    last_calculated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name
