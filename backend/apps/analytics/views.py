from datetime import timedelta
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardPagination

from .models import CampaignAnalytics, CustomerAnalytics, DailySalesReport
from .serializers import CampaignAnalyticsSerializer, CustomerAnalyticsSerializer, DailySalesReportSerializer


class DailySalesReportListView(generics.ListAPIView):
    serializer_class = DailySalesReportSerializer
    pagination_class = StandardPagination
    filterset_fields = ["store"]

    def get_queryset(self):
        return DailySalesReport.objects.filter(organization=self.request.user.organization)


class CustomerAnalyticsListView(generics.ListAPIView):
    serializer_class = CustomerAnalyticsSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        return CustomerAnalytics.objects.filter(organization=self.request.user.organization)


class CampaignAnalyticsListView(generics.ListAPIView):
    serializer_class = CampaignAnalyticsSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        return CampaignAnalytics.objects.filter(organization=self.request.user.organization)


def compute_analytics(org):
    from apps.transactions.models import Transaction
    from apps.customers.models import Customer
    from apps.campaigns.models import Campaign
    from apps.loyalty.models import LoyaltyAccount
    from apps.coupons.models import CouponRedemption

    today = timezone.now().date()
    month_start = today.replace(day=1)
    days_back = 14
    start_date = today - timedelta(days=days_back - 1)

    tx_stats = Transaction.objects.filter(
        organization=org,
        transaction_date__date__gte=month_start,
        status="completed",
    ).aggregate(
        total_revenue=Sum("total"),
    )

    new_today = Customer.objects.filter(
        organization=org,
        created_at__date=today,
    ).count()

    active_campaigns = Campaign.objects.filter(
        organization=org,
        status__in=["scheduled", "sending"],
    ).count()

    loyalty_stats = LoyaltyAccount.objects.filter(
        organization=org,
    ).aggregate(
        total_points=Sum("balance"),
    )

    coupons_redeemed = CouponRedemption.objects.filter(
        organization=org,
        created_at__date__gte=month_start,
    ).count()

    # 1. Real Revenue Trend (Past 14 Days)
    tx_in_range = Transaction.objects.filter(
        organization=org,
        transaction_date__date__gte=start_date,
        transaction_date__date__lte=today,
        status="completed",
    ).values("transaction_date__date").annotate(
        day_revenue=Sum("total"),
        day_count=Count("id"),
    )
    tx_by_date = {t["transaction_date__date"]: t for t in tx_in_range}

    has_any_revenue = Transaction.objects.filter(organization=org, status="completed").exists()
    revenue_trend = []
    for i in range(days_back):
        d = start_date + timedelta(days=i)
        day_data = tx_by_date.get(d)
        rev = float(day_data["day_revenue"]) if day_data and day_data["day_revenue"] else 0.0
        cnt = int(day_data["day_count"]) if day_data and day_data["day_count"] else 0
        revenue_trend.append({
            "date": d.isoformat(),
            "formatted_date": d.strftime("%d %b"),
            "revenue": rev,
            "transactions": cnt,
        })

    # 2. Real Customer Growth (Past 14 Days)
    cust_in_range = Customer.objects.filter(
        organization=org,
        created_at__date__gte=start_date,
        created_at__date__lte=today,
    ).values("created_at__date").annotate(
        new_count=Count("id")
    )
    cust_by_date = {c["created_at__date"]: c["new_count"] for c in cust_in_range}

    total_customers_count = Customer.objects.filter(organization=org, is_active=True).count()
    has_any_customers = total_customers_count > 0

    running_total = Customer.objects.filter(
        organization=org,
        created_at__date__lt=start_date,
        is_active=True,
    ).count()

    customer_growth = []
    for i in range(days_back):
        d = start_date + timedelta(days=i)
        new_cust = cust_by_date.get(d, 0)
        running_total += new_cust
        customer_growth.append({
            "date": d.isoformat(),
            "formatted_date": d.strftime("%d %b"),
            "new_customers": new_cust,
            "total_customers": running_total,
        })

    return {
        "total_revenue": str(tx_stats.get("total_revenue") or 0),
        "total_transactions": Transaction.objects.filter(
            organization=org,
            transaction_date__date__gte=month_start,
            status="completed",
        ).count(),
        "total_customers": total_customers_count,
        "new_customers_today": new_today,
        "active_campaigns": active_campaigns,
        "total_loyalty_points": str(loyalty_stats.get("total_points") or 0),
        "total_coupons_redeemed": coupons_redeemed,
        "has_revenue_data": has_any_revenue,
        "has_customer_data": has_any_customers,
        "revenue_trend": revenue_trend,
        "customer_growth": customer_growth,
    }


class DashboardView(APIView):
    def get(self, request):
        data = compute_analytics(request.user.organization)
        return Response(data)


class RevenueTrendView(APIView):
    def get(self, request):
        data = compute_analytics(request.user.organization)
        return Response({
            "has_data": data["has_revenue_data"],
            "trend": data["revenue_trend"],
        })


class CustomerGrowthView(APIView):
    def get(self, request):
        data = compute_analytics(request.user.organization)
        return Response({
            "has_data": data["has_customer_data"],
            "growth": data["customer_growth"],
        })
