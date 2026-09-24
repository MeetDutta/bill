from rest_framework import serializers

from .models import CampaignAnalytics, CustomerAnalytics, DailySalesReport


class DailySalesReportSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source="store.name", read_only=True)

    class Meta:
        model = DailySalesReport
        fields = [
            "id", "date", "store", "store_name", "total_revenue",
            "total_transactions", "total_items_sold", "average_order_value",
            "new_customers", "returning_customers",
            "total_loyalty_earned", "total_loyalty_redeemed",
        ]
        read_only_fields = ["id"]


class CustomerAnalyticsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAnalytics
        fields = [
            "id", "date", "total_customers", "new_customers",
            "active_customers", "inactive_customers", "vip_customers",
            "average_lifetime_value",
        ]
        read_only_fields = ["id"]


class CampaignAnalyticsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampaignAnalytics
        fields = [
            "id", "date", "total_campaigns", "total_messages_sent",
            "total_delivered", "total_read", "total_failed",
            "total_coupons_redeemed", "total_coupon_discount",
        ]
        read_only_fields = ["id"]


class DashboardSerializer(serializers.Serializer):
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_transactions = serializers.IntegerField()
    total_customers = serializers.IntegerField()
    new_customers_today = serializers.IntegerField()
    active_campaigns = serializers.IntegerField()
    total_loyalty_points = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_coupons_redeemed = serializers.IntegerField()
