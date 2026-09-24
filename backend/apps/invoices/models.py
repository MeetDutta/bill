from django.db import models

from common.models import TenantModel, TimeStampedModel, UUIDModel


class Invoice(UUIDModel, TenantModel, TimeStampedModel):
    transaction = models.OneToOneField(
        "transactions.Transaction",
        on_delete=models.CASCADE,
        related_name="invoice",
    )
    invoice_number = models.CharField(max_length=100, unique=True, db_index=True)
    pdf_url = models.URLField(blank=True)
    web_url = models.URLField(blank=True)
    secure_token = models.CharField(max_length=100, unique=True, db_index=True)
    is_viewed = models.BooleanField(default=False)
    viewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Invoice {self.invoice_number}"
