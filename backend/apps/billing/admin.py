from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "entity_type", "entity_id", "user", "organization", "created_at")
    search_fields = ("action", "entity_type", "entity_id")
    list_filter = ("action", "entity_type")
    readonly_fields = ("old_value", "new_value", "ip_address", "user_agent")
