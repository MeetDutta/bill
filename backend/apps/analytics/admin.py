from django.contrib import admin

from .models import CampaignAnalytics, CustomerAnalytics, DailySalesReport


@admin.register(DailySalesReport)
class DailySalesReportAdmin(admin.ModelAdmin):
    list_display = ("date", "store", "total_revenue", "total_transactions", "average_order_value")
    list_filter = ("date", "store")


@admin.register(CustomerAnalytics)
class CustomerAnalyticsAdmin(admin.ModelAdmin):
    list_display = ("date", "total_customers", "new_customers", "active_customers")
    list_filter = ("date",)


@admin.register(CampaignAnalytics)
class CampaignAnalyticsAdmin(admin.ModelAdmin):
    list_display = ("date", "total_campaigns", "total_messages_sent", "total_delivered")
    list_filter = ("date",)
