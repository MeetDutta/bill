from django.contrib import admin

from .models import Plan, Subscription, SubscriptionUsage


class SubscriptionUsageInline(admin.TabularInline):
    model = SubscriptionUsage
    extra = 0


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("name", "tier", "price_monthly", "price_yearly", "max_stores", "is_active")
    list_filter = ("tier", "is_active")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("organization", "plan", "status", "start_date", "end_date")
    list_filter = ("status", "plan")
    inlines = [SubscriptionUsageInline]
