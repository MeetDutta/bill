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


class CustomerRFMProfileSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    class Meta:
        from .models import CustomerRFMProfile
        model = CustomerRFMProfile
        fields = [
            "id", "customer", "customer_name", "customer_phone",
            "recency_days", "frequency_count", "monetary_value",
            "r_score", "f_score", "m_score", "rfm_score",
            "segment", "calculated_at",
        ]


class CustomerHealthProfileSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)

    class Meta:
        from .models import CustomerHealthProfile
        model = CustomerHealthProfile
        fields = [
            "id", "customer", "customer_name",
            "health_score", "health_status", "risk_factors",
            "positive_factors", "recommended_action", "calculated_at",
        ]


class ChurnPredictionSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    class Meta:
        from .models import ChurnPrediction
        model = ChurnPrediction
        fields = [
            "id", "customer", "customer_name", "customer_phone",
            "churn_probability", "churn_risk", "prediction_reason",
            "risk_factors", "recommended_action", "predicted_at",
        ]


class ProductAffinitySerializer(serializers.ModelSerializer):
    product_a_name = serializers.CharField(source="product_a.name", read_only=True)
    product_b_name = serializers.CharField(source="product_b.name", read_only=True)
    product_a_price = serializers.DecimalField(source="product_a.unit_price", max_digits=12, decimal_places=2, read_only=True)
    product_b_price = serializers.DecimalField(source="product_b.unit_price", max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        from .models import ProductAffinity
        model = ProductAffinity
        fields = [
            "id", "product_a", "product_a_name", "product_a_price",
            "product_b", "product_b_name", "product_b_price",
            "co_occurrence_count", "affinity_score", "confidence", "lift",
            "calculated_at",
        ]


class ProductBundleSerializer(serializers.ModelSerializer):
    products_details = serializers.SerializerMethodField()

    class Meta:
        from .models import ProductBundle
        model = ProductBundle
        fields = [
            "id", "name", "description", "products", "products_details",
            "original_price", "bundle_price", "discount_percentage",
            "affinity_score", "is_published", "is_active", "created_at",
        ]

    def get_products_details(self, obj):
        return [
            {"id": str(p.id), "name": p.name, "unit_price": str(p.unit_price)}
            for p in obj.products.all()
        ]


class BusinessAlertSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import BusinessAlert
        model = BusinessAlert
        fields = [
            "id", "alert_type", "severity", "title", "description",
            "entity_type", "entity_id", "recommended_action",
            "is_acknowledged", "is_dismissed", "created_at",
        ]


class BusinessHealthSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import BusinessHealthSnapshot
        model = BusinessHealthSnapshot
        fields = [
            "id", "date", "overall_score", "sales_growth_score",
            "retention_score", "loyalty_score", "marketing_score",
            "product_performance_score", "weakest_area", "metrics_data",
            "calculated_at",
        ]

