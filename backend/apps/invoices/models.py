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
    invoice_type = models.CharField(
        max_length=50,
        choices=[
            ("gst", "GST Tax Invoice"),
            ("non_gst", "Standard Bill / Non-GST"),
            ("thermal", "Thermal Receipt"),
            ("credit_memo", "Credit Note / Return"),
        ],
        default="gst",
    )
    template_format = models.CharField(
        max_length=50,
        choices=[
            ("a4", "A4 Standard"),
            ("thermal_80mm", "80mm Thermal"),
            ("thermal_58mm", "58mm Thermal"),
        ],
        default="a4",
    )
    terms_and_conditions = models.TextField(blank=True)
    custom_notes = models.TextField(blank=True)
    qr_code_data = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Invoice {self.invoice_number}"
