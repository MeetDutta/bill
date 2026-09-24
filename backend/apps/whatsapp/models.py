from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class WhatsAppConfig(UUIDModel, TenantModel, TimeStampedModel):
    business_account_id = models.CharField(max_length=100)
    phone_number_id = models.CharField(max_length=100)
    access_token = models.TextField()
    webhook_verify_token = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "WhatsApp configurations"

    def __str__(self):
        return f"WhatsApp Config - {self.phone_number_id}"


class WhatsAppTemplate(UUIDModel, TenantModel, TimeStampedModel):
    template_id = models.CharField(max_length=100)
    name = models.CharField(max_length=255)
    language = models.CharField(max_length=10, default="en")
    category = models.CharField(
        max_length=50,
        choices=[("marketing", "Marketing"), ("utility", "Utility"), ("authentication", "Authentication")],
    )
    status = models.CharField(
        max_length=20,
        choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")],
        default="pending",
    )
    components = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class WhatsAppMessage(UUIDModel, TenantModel, TimeStampedModel):
    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("processing", "Processing"),
        ("sent", "Sent"),
        ("delivered", "Delivered"),
        ("read", "Read"),
        ("failed", "Failed"),
    ]

    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="whatsapp_messages",
    )
    phone_number = models.CharField(max_length=20)
    message_type = models.CharField(
        max_length=20,
        choices=[("template", "Template"), ("text", "Text"), ("image", "Image"), ("document", "Document")],
    )
    template = models.ForeignKey(
        WhatsAppTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    content = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    provider_message_id = models.CharField(max_length=100, blank=True, db_index=True)
    external_id = models.CharField(max_length=100, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(blank=True)
    retry_count = models.PositiveIntegerField(default=0)
    campaign = models.ForeignKey(
        "campaigns.Campaign",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="whatsapp_messages",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["provider_message_id"]),
        ]

    def __str__(self):
        return f"{self.phone_number} - {self.status}"
