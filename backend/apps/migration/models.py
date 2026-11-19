from django.db import models
from common.models import TenantModel, TimeStampedModel, UUIDModel


class POSMigrationJob(UUIDModel, TenantModel, TimeStampedModel):
    ENTITY_CHOICES = [
        ("products", "Products & Inventory"),
        ("customers", "Customers"),
        ("categories", "Product Categories"),
        ("opening_stock", "Opening Stock"),
        ("suppliers", "Suppliers"),
        ("invoices", "Historical Invoices"),
    ]
    STATUS_CHOICES = [
        ("uploaded", "Uploaded"),
        ("validated", "Validated"),
        ("importing", "Importing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("rolled_back", "Rolled Back"),
    ]
    DUPLICATE_STRATEGIES = [
        ("skip", "Skip Duplicates"),
        ("update", "Update Existing"),
        ("error", "Fail On Duplicate"),
    ]

    user = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pos_migration_jobs",
    )
    file_name = models.CharField(max_length=255)
    entity_type = models.CharField(max_length=50, choices=ENTITY_CHOICES, default="products")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="uploaded")
    duplicate_strategy = models.CharField(max_length=20, choices=DUPLICATE_STRATEGIES, default="skip")

    raw_headers = models.JSONField(default=list, blank=True)
    sample_rows = models.JSONField(default=list, blank=True)
    file_content = models.TextField(blank=True, help_text="Raw or stored CSV payload for staged execution")
    column_mapping = models.JSONField(default=dict, blank=True)

    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    invalid_rows = models.PositiveIntegerField(default=0)
    duplicate_rows = models.PositiveIntegerField(default=0)
    new_items_count = models.PositiveIntegerField(default=0)

    imported_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)

    validation_errors = models.JSONField(default=list, blank=True)
    import_report = models.JSONField(default=dict, blank=True)
    created_records = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "POS Migration Job"
        verbose_name_plural = "POS Migration Jobs"

    def __str__(self):
        return f"Migration Job {self.id} ({self.entity_type}) - {self.status}"
