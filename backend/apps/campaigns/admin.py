from django.contrib import admin

from .models import Campaign, CampaignMessage


class CampaignMessageInline(admin.TabularInline):
    model = CampaignMessage
    extra = 0
    readonly_fields = ("customer", "phone", "status", "provider_message_id", "sent_at")


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ("name", "campaign_type", "status", "total_recipients", "total_sent", "scheduled_at")
    search_fields = ("name",)
    list_filter = ("campaign_type", "status")
    inlines = [CampaignMessageInline]


@admin.register(CampaignMessage)
class CampaignMessageAdmin(admin.ModelAdmin):
    list_display = ("campaign", "customer", "phone", "status", "sent_at")
    list_filter = ("status", "campaign")
