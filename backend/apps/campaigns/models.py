from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class Campaign(UUIDModel, TenantModel, TimeStampedModel):
    CAMPAIGN_TYPE_CHOICES = [
        ("promotional", "Promotional"),
        ("new_customer", "New Customer"),
        ("win_back", "Win-back"),
        ("birthday", "Birthday"),
        ("anniversary", "Anniversary"),
        ("festival", "Festival"),
        ("loyalty_reminder", "Loyalty Reminder"),
        ("coupon_reminder", "Coupon Reminder"),
        ("review_request", "Review Request"),
    ]
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("scheduled", "Scheduled"),
        ("sending", "Sending"),
        ("sent", "Sent"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    name = models.CharField(max_length=255)
    campaign_type = models.CharField(max_length=30, choices=CAMPAIGN_TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    segment_rules = models.JSONField(default=dict, blank=True)
    whatsapp_template_id = models.CharField(max_length=100, blank=True)
    message_content = models.TextField(blank=True)
    media_url = models.URLField(blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    total_recipients = models.PositiveIntegerField(default=0)
    total_sent = models.PositiveIntegerField(default=0)
    total_delivered = models.PositiveIntegerField(default=0)
    total_read = models.PositiveIntegerField(default=0)
    total_failed = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.campaign_type})"


class CampaignMessage(UUIDModel, TenantModel, TimeStampedModel):
    MESSAGE_STATUS_CHOICES = [
        ("queued", "Queued"),
        ("processing", "Processing"),
        ("sent", "Sent"),
        ("delivered", "Delivered"),
        ("read", "Read"),
        ("failed", "Failed"),
    ]

    campaign = models.ForeignKey(
        Campaign,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="campaign_messages",
    )
    phone = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=MESSAGE_STATUS_CHOICES, default="queued")
    provider_message_id = models.CharField(max_length=100, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(blank=True)
    retry_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.campaign.name} -> {self.customer}"
