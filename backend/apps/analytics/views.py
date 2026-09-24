from django.db.models import Sum
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


class DashboardView(APIView):
    def get(self, request):
        org = request.user.organization

        from apps.transactions.models import Transaction
        from apps.customers.models import Customer
        from apps.campaigns.models import Campaign
        from apps.loyalty.models import LoyaltyAccount
        from apps.coupons.models import CouponRedemption

        today = timezone.now().date()
        month_start = today.replace(day=1)

        tx_stats = Transaction.objects.filter(
            organization=org,
            transaction_date__date__gte=month_start,
            status="completed",
        ).aggregate(
            total_revenue=Sum("total"),
            total_transactions=Sum("id", output_field=None),
        )

        customer_stats = Customer.objects.filter(
            organization=org,
            is_active=True,
        ).aggregate(
            total=Sum("id", output_field=None),
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

        return Response({
            "total_revenue": str(tx_stats.get("total_revenue") or 0),
            "total_transactions": Transaction.objects.filter(
                organization=org,
                transaction_date__date__gte=month_start,
                status="completed",
            ).count(),
            "total_customers": Customer.objects.filter(
                organization=org,
                is_active=True,
            ).count(),
            "new_customers_today": new_today,
            "active_campaigns": active_campaigns,
            "total_loyalty_points": str(loyalty_stats.get("total_points") or 0),
            "total_coupons_redeemed": coupons_redeemed,
        })
