from django.contrib import admin

from .models import LoyaltyAccount, LoyaltyRedemption, LoyaltyRule, LoyaltyTransaction


class LoyaltyTransactionInline(admin.TabularInline):
    model = LoyaltyTransaction
    extra = 0
    readonly_fields = ("transaction_type", "points", "balance_after", "description", "created_at")


@admin.register(LoyaltyAccount)
class LoyaltyAccountAdmin(admin.ModelAdmin):
    list_display = ("customer", "balance", "total_earned", "total_redeemed")
    search_fields = ("customer__first_name", "customer__last_name", "customer__phone")
    inlines = [LoyaltyTransactionInline]


@admin.register(LoyaltyRule)
class LoyaltyRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "rule_type", "points", "is_active")
    list_filter = ("rule_type", "is_active")


@admin.register(LoyaltyTransaction)
class LoyaltyTransactionAdmin(admin.ModelAdmin):
    list_display = ("loyalty_account", "transaction_type", "points", "balance_after", "created_at")
    list_filter = ("transaction_type",)


@admin.register(LoyaltyRedemption)
class LoyaltyRedemptionAdmin(admin.ModelAdmin):
    list_display = ("loyalty_account", "points", "status", "created_at")
    list_filter = ("status",)
