from django.contrib import admin

from .models import Transaction, TransactionItem


class TransactionItemInline(admin.TabularInline):
    model = TransactionItem
    extra = 0
    readonly_fields = ("product", "name", "quantity", "unit_price", "discount", "tax", "total")


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("invoice_number", "store", "customer", "total", "payment_method", "status", "transaction_date")
    search_fields = ("invoice_number", "external_transaction_id")
    list_filter = ("status", "payment_method", "store")
    inlines = [TransactionItemInline]
    date_hierarchy = "transaction_date"
