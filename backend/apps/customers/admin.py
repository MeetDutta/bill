from django.contrib import admin

from .models import Customer, CustomerTimeline


class CustomerTimelineInline(admin.TabularInline):
    model = CustomerTimeline
    extra = 0
    readonly_fields = ("event_type", "reference_id", "metadata", "created_at")


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("first_name", "last_name", "phone", "organization", "total_purchases", "total_spend", "segment")
    search_fields = ("first_name", "last_name", "phone", "email")
    list_filter = ("segment", "is_active", "whatsapp_opt_in")
    inlines = [CustomerTimelineInline]
