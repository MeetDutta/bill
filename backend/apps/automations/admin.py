from django.contrib import admin

from .models import Automation, AutomationExecution


class AutomationExecutionInline(admin.TabularInline):
    model = AutomationExecution
    extra = 0
    readonly_fields = ("customer", "status", "executed_at", "error_message")


@admin.register(Automation)
class AutomationAdmin(admin.ModelAdmin):
    list_display = ("name", "trigger", "action", "is_active", "execution_count")
    list_filter = ("trigger", "action", "is_active")
    inlines = [AutomationExecutionInline]


@admin.register(AutomationExecution)
class AutomationExecutionAdmin(admin.ModelAdmin):
    list_display = ("automation", "customer", "status", "executed_at")
    list_filter = ("status", "automation")
