from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class Integration(UUIDModel, TenantModel, TimeStampedModel):
    INTEGRATION_TYPE_CHOICES = [
        ("custom_pos", "Custom POS"),
        ("tally", "Tally"),
        ("busy", "Busy"),
        ("shopify", "Shopify"),
        ("woocommerce", "WooCommerce"),
        ("other", "Other"),
    ]

    name = models.CharField(max_length=255)
    integration_type = models.CharField(max_length=30, choices=INTEGRATION_TYPE_CHOICES)
    api_key = models.CharField(max_length=255)
    api_secret = models.CharField(max_length=255, blank=True)
    webhook_url = models.URLField(blank=True)
    config = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.integration_type})"


class IntegrationLog(UUIDModel, TenantModel, TimeStampedModel):
    integration = models.ForeignKey(
        Integration,
        on_delete=models.CASCADE,
        related_name="logs",
    )
    event_type = models.CharField(max_length=50)
    payload = models.JSONField(default=dict, blank=True)
    response = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=20,
        choices=[("success", "Success"), ("error", "Error")],
    )
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.integration.name} - {self.event_type}"
