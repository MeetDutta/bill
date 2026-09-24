from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class Store(UUIDModel, TenantModel, TimeStampedModel):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, db_index=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    manager = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_stores",
    )
    status = models.CharField(
        max_length=20,
        choices=[("active", "Active"), ("inactive", "Inactive"), ("suspended", "Suspended")],
        default="active",
    )
    business_hours = models.JSONField(default=dict, blank=True)
    whatsapp_number = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["name"]
        unique_together = [("organization", "code")]

    def __str__(self):
        return f"{self.name} ({self.code})"
