from django.contrib import admin

from .models import Organization


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "phone", "country", "is_active")
    search_fields = ("name", "legal_name", "email")
    list_filter = ("is_active", "country")
