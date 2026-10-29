from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class Notification(UUIDModel, TenantModel, TimeStampedModel):
    NOTIFICATION_TYPE_CHOICES = [
        ("in_app", "In-App"),
        ("whatsapp", "WhatsApp"),
        ("email", "Email"),
        ("sms", "SMS"),
    ]

    CATEGORY_CHOICES = [
        ("inventory", "Inventory"),
        ("sales", "Sales"),
        ("payments", "Payments"),
        ("invoices", "Invoices & Quotations"),
        ("system", "System & Security"),
    ]

    SEVERITY_CHOICES = [
        ("critical", "Critical"),
        ("warning", "Warning"),
        ("info", "Info"),
        ("success", "Success"),
    ]

    AUDIENCE_CHOICES = [
        ("all", "All"),
        ("admin", "Admin Only"),
        ("staff", "Staff Only"),
        ("user", "Specific User"),
    ]

    user = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="notifications",
        null=True,
        blank=True,
    )
    notification_type = models.CharField(
        max_length=20,
        choices=NOTIFICATION_TYPE_CHOICES,
        default="in_app",
    )
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default="system",
        db_index=True,
    )
    severity = models.CharField(
        max_length=20,
        choices=SEVERITY_CHOICES,
        default="info",
        db_index=True,
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    data = models.JSONField(default=dict, blank=True)

    # Entity Association
    related_entity_type = models.CharField(max_length=50, blank=True, db_index=True)
    related_entity_id = models.CharField(max_length=100, blank=True, db_index=True)
    audience = models.CharField(
        max_length=20,
        choices=AUDIENCE_CHOICES,
        default="all",
        db_index=True,
    )

    # Idempotency and episode deduplication key
    dedup_key = models.CharField(max_length=255, blank=True, db_index=True)

    # Read / Dismiss / Resolution state
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    is_dismissed = models.BooleanField(default=False, db_index=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "is_read", "is_dismissed"]),
            models.Index(fields=["organization", "category", "created_at"]),
            models.Index(fields=["organization", "dedup_key"]),
            models.Index(fields=["organization", "severity", "is_dismissed"]),
        ]

    def __str__(self):
        return f"[{self.severity.upper()}] {self.title} ({self.category})"
