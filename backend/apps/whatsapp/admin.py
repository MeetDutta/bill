from django.contrib import admin

from .models import WhatsAppConfig, WhatsAppMessage, WhatsAppTemplate


@admin.register(WhatsAppConfig)
class WhatsAppConfigAdmin(admin.ModelAdmin):
    list_display = ("phone_number_id", "business_account_id", "is_active")
    list_filter = ("is_active",)


@admin.register(WhatsAppTemplate)
class WhatsAppTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "template_id", "language", "category", "status")
    list_filter = ("category", "status", "language")


@admin.register(WhatsAppMessage)
class WhatsAppMessageAdmin(admin.ModelAdmin):
    list_display = ("phone_number", "message_type", "status", "sent_at", "delivered_at")
    list_filter = ("status", "message_type")
    search_fields = ("phone_number", "provider_message_id")
