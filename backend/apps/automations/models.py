from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class Automation(UUIDModel, TenantModel, TimeStampedModel):
    TRIGGER_CHOICES = [
        ("purchase_completed", "Purchase Completed"),
        ("new_customer", "New Customer"),
        ("customer_birthday", "Customer Birthday"),
        ("customer_anniversary", "Customer Anniversary"),
        ("inactive_customer", "Inactive Customer"),
        ("coupon_expiry_reminder", "Coupon Expiry Reminder"),
        ("loyalty_expiry_reminder", "Loyalty Expiry Reminder"),
        ("review_request", "Review Request"),
    ]
    ACTION_CHOICES = [
        ("send_whatsapp", "Send WhatsApp Message"),
        ("send_email", "Send Email"),
        ("create_coupon", "Create Coupon"),
        ("award_loyalty", "Award Loyalty Points"),
        ("update_segment", "Update Customer Segment"),
    ]

    name = models.CharField(max_length=255)
    trigger = models.CharField(max_length=50, choices=TRIGGER_CHOICES)
    conditions = models.JSONField(default=dict, blank=True)
    delay_hours = models.PositiveIntegerField(default=0)
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    action_config = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    execution_count = models.PositiveIntegerField(default=0)
    last_executed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.trigger} -> {self.action})"


class AutomationExecution(UUIDModel, TenantModel, TimeStampedModel):
    automation = models.ForeignKey(
        Automation,
        on_delete=models.CASCADE,
        related_name="executions",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="automation_executions",
    )
    status = models.CharField(
        max_length=20,
        choices=[("pending", "Pending"), ("completed", "Completed"), ("failed", "Failed")],
        default="pending",
    )
    trigger_data = models.JSONField(default=dict, blank=True)
    result_data = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    executed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.automation.name} - {self.customer}"
