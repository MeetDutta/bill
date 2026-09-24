from django.contrib import admin

from .models import Coupon, CouponRedemption


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "discount_type", "discount_value", "usage_limit", "used_count", "is_active")
    search_fields = ("code", "name")
    list_filter = ("discount_type", "is_active")


@admin.register(CouponRedemption)
class CouponRedemptionAdmin(admin.ModelAdmin):
    list_display = ("coupon", "customer", "discount_amount", "created_at")
    list_filter = ("coupon",)
