from django.contrib import admin

from .models import Integration, IntegrationLog


@admin.register(Integration)
class IntegrationAdmin(admin.ModelAdmin):
    list_display = ("name", "integration_type", "is_active", "last_sync_at")
    list_filter = ("integration_type", "is_active")


@admin.register(IntegrationLog)
class IntegrationLogAdmin(admin.ModelAdmin):
    list_display = ("integration", "event_type", "status", "created_at")
    list_filter = ("status", "integration")
