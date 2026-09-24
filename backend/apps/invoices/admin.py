from django.contrib import admin

from .models import Invoice


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("invoice_number", "transaction", "is_viewed", "viewed_at")
    search_fields = ("invoice_number",)
    list_filter = ("is_viewed",)
