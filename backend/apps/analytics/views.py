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


# ============================================================================
# RFM INTELLIGENCE VIEWS
# ============================================================================
class RFMDistributionView(APIView):
    def get(self, request):
        from .services import RFMAnalysisService
        data = RFMAnalysisService.get_segment_distribution(request.user.organization)
        return Response(data)


class RFMSummaryView(APIView):
    def get(self, request):
        from .services import RFMAnalysisService
        data = RFMAnalysisService.get_rfm_summary(request.user.organization)
        return Response(data)


class RFMCustomersView(APIView):
    def get(self, request):
        from .models import CustomerRFMProfile
        from .services import RFMAnalysisService
        from .serializers import CustomerRFMProfileSerializer

        org = request.user.organization
        segment = request.query_params.get("segment")

        # Ensure profiles exist
        if not CustomerRFMProfile.objects.filter(organization=org).exists():
            RFMAnalysisService.sync_organization_rfm(org)

        qs = CustomerRFMProfile.objects.filter(organization=org).select_related("customer")
        if segment:
            qs = qs.filter(segment__iexact=segment.strip())

        search = request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(customer__first_name__icontains=search)
                | Q(customer__last_name__icontains=search)
                | Q(customer__phone__icontains=search)
            )

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = CustomerRFMProfileSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class CustomerRFMDetailView(APIView):
    def get(self, request, pk):
        from apps.customers.models import Customer
        from .services import RFMAnalysisService

        try:
            customer = Customer.objects.get(id=pk, organization=request.user.organization)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=404)

        data = RFMAnalysisService.calculate_customer_rfm(customer)
        return Response(data)


# ============================================================================
# CUSTOMER HEALTH & CHURN & NEXT BEST ACTION VIEWS
# ============================================================================
class CustomerHealthDetailView(APIView):
    def get(self, request, pk):
        from apps.customers.models import Customer
        from .services import CustomerHealthService

        try:
            customer = Customer.objects.get(id=pk, organization=request.user.organization)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=404)

        health = CustomerHealthService.calculate_health(customer)
        return Response(health)


class CustomerChurnDetailView(APIView):
    def get(self, request, pk):
        from apps.customers.models import Customer
        from .services import ChurnPredictionService

        try:
            customer = Customer.objects.get(id=pk, organization=request.user.organization)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=404)

        churn = ChurnPredictionService.predict_churn(customer)
        return Response(churn)


class AtRiskCustomersListView(APIView):
    def get(self, request):
        from .services import ChurnPredictionService
        limit = int(request.query_params.get("limit", 20))
        data = ChurnPredictionService.get_at_risk_customers(request.user.organization, limit=limit)
        return Response(data)


class CustomerNextActionView(APIView):
    def get(self, request, pk):
        from apps.customers.models import Customer
        from .services import NextBestActionService

        try:
            customer = Customer.objects.get(id=pk, organization=request.user.organization)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=404)

        action = NextBestActionService.determine_next_action(customer)
        return Response(action)


class CustomerOfferRecommendationView(APIView):
    def get(self, request, pk):
        from apps.customers.models import Customer
        from .services import OfferRecommendationService

        try:
            customer = Customer.objects.get(id=pk, organization=request.user.organization)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=404)

        offer = OfferRecommendationService.recommend_offer(customer)
        return Response(offer)


class CreateRecommendedOfferView(APIView):
    def post(self, request, pk):
        from apps.customers.models import Customer
        from .services import OfferRecommendationService

        try:
            customer = Customer.objects.get(id=pk, organization=request.user.organization)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=404)

        offer_data = request.data or OfferRecommendationService.recommend_offer(customer)
        coupon = OfferRecommendationService.create_approved_coupon(customer, offer_data)

        return Response({
            "message": "Custom offer created successfully.",
            "coupon": {
                "id": str(coupon.id),
                "code": coupon.code,
                "name": coupon.name,
                "discount_type": coupon.discount_type,
                "discount_value": str(coupon.discount_value),
                "min_order_value": str(coupon.min_order_value),
                "expires_at": coupon.expires_at.isoformat(),
            },
        }, status=201)


# ============================================================================
# PRODUCT INTELLIGENCE & BUNDLES VIEWS
# ============================================================================
class ProductIntelligenceListView(APIView):
    def get(self, request):
        from .services import ProductIntelligenceService
        data = ProductIntelligenceService.get_product_analytics(request.user.organization)
        return Response(data)


class ProductAffinityListView(APIView):
    def get(self, request):
        from .services import ProductIntelligenceService
        data = ProductIntelligenceService.calculate_affinities(request.user.organization)
        return Response(data)


class ProductBundleListView(APIView):
    def get(self, request):
        from .services import SmartBundleService
        data = SmartBundleService.get_bundle_recommendations(request.user.organization)
        return Response(data)


# ============================================================================
# CAMPAIGN ROI VIEWS
# ============================================================================
class CampaignROISummaryView(APIView):
    def get(self, request):
        from .services import CampaignROIService
        data = CampaignROIService.get_all_campaigns_roi(request.user.organization)
        return Response(data)


class CampaignROIDetailView(APIView):
    def get(self, request, pk):
        from apps.campaigns.models import Campaign
        from .services import CampaignROIService

        try:
            campaign = Campaign.objects.get(id=pk, organization=request.user.organization)
        except Campaign.DoesNotExist:
            return Response({"detail": "Campaign not found."}, status=404)

        data = CampaignROIService.calculate_campaign_roi(campaign)
        return Response(data)


# ============================================================================
# BUSINESS HEALTH & RETENTION & COHORTS VIEWS
# ============================================================================
class BusinessHealthView(APIView):
    def get(self, request):
        from .services import BusinessHealthService
        data = BusinessHealthService.calculate_health(request.user.organization)
        return Response(data)


class CustomerRetentionMetricsView(APIView):
    def get(self, request):
        from apps.customers.models import Customer
        from apps.transactions.models import Transaction

        org = request.user.organization
        now = timezone.now()
        total_customers = Customer.objects.filter(organization=org, is_active=True).count()
        repeat_customers = Customer.objects.filter(organization=org, is_active=True, total_purchases__gte=2).count()
        single_purchase_customers = Customer.objects.filter(organization=org, is_active=True, total_purchases=1).count()
        active_customers = Customer.objects.filter(
            organization=org,
            is_active=True,
            last_purchase_at__gte=now - timedelta(days=60),
        ).count()

        repeat_rate = round((repeat_customers / max(1, total_customers)) * 100, 1)
        retention_rate = round((active_customers / max(1, total_customers)) * 100, 1)
        churn_rate = round(100.0 - retention_rate, 1)

        # Average Order Value
        completed_txs = Transaction.objects.filter(organization=org, status="completed")
        tx_agg = completed_txs.aggregate(total_rev=Sum("total"), tx_cnt=Count("id"))
        total_revenue = float(tx_agg["total_rev"] or 0)
        total_orders = tx_agg["tx_cnt"] or 0
        aov = round(total_revenue / max(1, total_orders), 2)
        revenue_per_customer = round(total_revenue / max(1, total_customers), 2)

        return Response({
            "total_customers": total_customers,
            "repeat_customers": repeat_customers,
            "single_purchase_customers": single_purchase_customers,
            "active_customers": active_customers,
            "repeat_purchase_rate": f"{repeat_rate}%",
            "repeat_purchase_rate_numeric": repeat_rate,
            "retention_rate": f"{retention_rate}%",
            "retention_rate_numeric": retention_rate,
            "churn_rate": f"{churn_rate}%",
            "churn_rate_numeric": churn_rate,
            "average_order_value": aov,
            "revenue_per_customer": revenue_per_customer,
            "lifetime_value": revenue_per_customer,
            "has_data": total_customers > 0,
        })


class CohortRetentionView(APIView):
    def get(self, request):
        from apps.customers.models import Customer
        from apps.transactions.models import Transaction

        org = request.user.organization
        now = timezone.now()

        # Build 6 monthly cohorts
        cohorts = []
        for month_offset in range(5, -1, -1):
            target_date = (now - timedelta(days=month_offset * 30)).date().replace(day=1)
            next_month = (target_date + timedelta(days=32)).replace(day=1)

            cohort_customers = Customer.objects.filter(
                organization=org,
                created_at__date__gte=target_date,
                created_at__date__lt=next_month,
            )
            size = cohort_customers.count()
            cohort_name = target_date.strftime("%b %Y")

            if size == 0:
                cohorts.append({
                    "cohort": cohort_name,
                    "size": 0,
                    "retention_percentages": ["N/A"] * 6,
                })
                continue

            customer_ids = list(cohort_customers.values_list("id", flat=True))
            retention_row = [100.0]  # Month 0 is 100%

            for follow_up in range(1, 6):
                period_start = target_date + timedelta(days=follow_up * 30)
                period_end = period_start + timedelta(days=30)
                if period_start > now.date():
                    retention_row.append("—")
                else:
                    active_count = (
                        Transaction.objects.filter(
                            organization=org,
                            customer_id__in=customer_ids,
                            status="completed",
                            transaction_date__date__gte=period_start,
                            transaction_date__date__lt=period_end,
                        )
                        .values("customer_id")
                        .distinct()
                        .count()
                    )
                    pct = round((active_count / size) * 100, 1)
                    retention_row.append(pct)

            cohorts.append({
                "cohort": cohort_name,
                "size": size,
                "retention_percentages": retention_row,
            })

        return Response({
            "intervals": ["Month 0", "Month 1", "Month 2", "Month 3", "Month 4", "Month 5"],
            "cohorts": cohorts,
        })


# ============================================================================
# BUSINESS ALERTS & ANOMALY DETECTION VIEWS
# ============================================================================
class BusinessAlertsListView(APIView):
    def get(self, request):
        from .models import BusinessAlert
        from .services import AnomalyDetectionService
        from .serializers import BusinessAlertSerializer

        org = request.user.organization
        # Scan for real-time anomalies
        AnomalyDetectionService.scan_anomalies(org)

        alerts = BusinessAlert.objects.filter(organization=org, is_dismissed=False).order_by("-created_at")
        serializer = BusinessAlertSerializer(alerts, many=True)
        return Response(serializer.data)


class BusinessAlertAcknowledgeView(APIView):
    def post(self, request, pk):
        from .models import BusinessAlert
        try:
            alert = BusinessAlert.objects.get(id=pk, organization=request.user.organization)
            alert.is_acknowledged = True
            alert.save(update_fields=["is_acknowledged"])
            return Response({"message": "Alert acknowledged."})
        except BusinessAlert.DoesNotExist:
            return Response({"detail": "Alert not found."}, status=404)


class BusinessAlertDismissView(APIView):
    def post(self, request, pk):
        from .models import BusinessAlert
        try:
            alert = BusinessAlert.objects.get(id=pk, organization=request.user.organization)
            alert.is_dismissed = True
            alert.save(update_fields=["is_dismissed"])
            return Response({"message": "Alert dismissed."})
        except BusinessAlert.DoesNotExist:
            return Response({"detail": "Alert not found."}, status=404)


# ============================================================================
# MULTI-STORE INTELLIGENCE & STAFF PERFORMANCE
# ============================================================================
class StoreComparisonView(APIView):
    def get(self, request):
        from apps.stores.models import Store
        from apps.transactions.models import Transaction

        org = request.user.organization
        stores = Store.objects.filter(organization=org)
        now = timezone.now()
        p30_start = now - timedelta(days=30)

        results = []
        for s in stores:
            txs = Transaction.objects.filter(
                organization=org,
                store=s,
                status="completed",
                transaction_date__gte=p30_start,
            )
            agg = txs.aggregate(rev=Sum("total"), count=Count("id"))
            rev = float(agg["rev"] or 0)
            count = agg["count"] or 0
            cust_count = txs.values("customer").distinct().count()
            aov = round(rev / max(1, count), 2)

            results.append({
                "store_id": str(s.id),
                "store_name": s.name,
                "store_code": s.code,
                "city": s.city,
                "revenue": rev,
                "transactions": count,
                "customers_served": cust_count,
                "average_order_value": aov,
            })

        results.sort(key=lambda x: -x["revenue"])
        return Response(results)


class StaffPerformanceView(APIView):
    def get(self, request):
        from apps.users.models import User
        from apps.transactions.models import Transaction

        org = request.user.organization
        now = timezone.now()
        p30_start = now - timedelta(days=30)

        users = User.objects.filter(organization=org)
        results = []

        for u in users:
            # Check transactions completed
            txs = Transaction.objects.filter(
                organization=org,
                status="completed",
                transaction_date__gte=p30_start,
            )
            # In existing schema, transactions are store-attributed; if created_by exists on user:
            rev = float(txs.aggregate(s=Sum("total"))["s"] or 0)
            cnt = txs.count()

            results.append({
                "user_id": str(u.id),
                "name": u.get_full_name() or u.email.split("@")[0],
                "role": u.role,
                "revenue_generated": rev,
                "transactions_count": cnt,
                "average_order_value": round(rev / max(1, cnt), 2),
            })

        return Response(results)


# ============================================================================
# CUSTOMER MINI PORTAL (Public, Token-Based, Highly Secure)
# ============================================================================
class CustomerPortalPublicView(APIView):
    permission_classes = []  # Token authenticated public customer endpoint

    def get(self, request, token):
        from apps.customers.models import Customer
        from apps.transactions.models import Transaction
        from apps.coupons.models import Coupon
        from .services import LoyaltyTierService, CustomerHealthService

        customer = (
            Customer.objects.filter(portal_token=token)
            .select_related("organization")
            .first()
        )
        if not customer:
            # Fallback: check if token belongs to an Invoice secure_token
            from apps.invoices.models import Invoice
            inv = Invoice.objects.filter(secure_token=token).select_related("transaction__customer").first()
            if inv and inv.transaction and inv.transaction.customer:
                customer = inv.transaction.customer
            else:
                return Response({"detail": "Invalid or expired customer portal link."}, status=404)

        org = customer.organization
        tier_info = LoyaltyTierService.get_customer_tier(customer)
        unlocked_achs = LoyaltyTierService.check_and_unlock_achievements(customer)

        # Recent transactions
        recent_txs = Transaction.objects.filter(
            organization=org,
            customer=customer,
            status="completed",
        ).order_by("-transaction_date")[:5]

        # Active coupons available
        now = timezone.now()
        available_coupons = Coupon.objects.filter(
            organization=org,
            is_active=True,
            expires_at__gte=now,
        )[:4]

        # All customer achievements
        achievements_list = [
            {
                "code": ca.achievement.code,
                "title": ca.achievement.title,
                "description": ca.achievement.description,
                "badge_tier": ca.achievement.badge_tier,
                "unlocked_at": ca.unlocked_at.strftime("%d %b %Y"),
            }
            for ca in customer.achievements.select_related("achievement")
        ]

        return Response({
            "customer": {
                "name": customer.full_name,
                "phone": customer.phone,
                "member_since": customer.created_at.strftime("%B %Y"),
            },
            "business": {
                "name": org.name,
                "city": org.city,
            },
            "loyalty": tier_info,
            "achievements": achievements_list,
            "recent_orders": [
                {
                    "invoice_number": t.invoice_number,
                    "date": t.transaction_date.strftime("%d %b %Y"),
                    "total": str(t.total),
                    "points_earned": t.loyalty_points_earned,
                }
                for t in recent_txs
            ],
            "available_rewards": [
                {
                    "code": c.code,
                    "title": c.name,
                    "description": c.description,
                    "discount_value": str(c.discount_value),
                    "discount_type": c.discount_type,
                    "min_order": str(c.min_order_value),
                    "expires_at": c.expires_at.strftime("%d %b %Y"),
                }
                for c in available_coupons
            ],
        })


# ============================================================================
# AI BUSINESS COPILOT VIEW
# ============================================================================
class AICopilotQueryView(APIView):
    def post(self, request):
        from .services import AIBusinessCopilotService

        question = request.data.get("question", "").strip()
        if not question:
            return Response({"detail": "Question is required."}, status=400)

        response_data = AIBusinessCopilotService.answer_query(request.user.organization, question)
        return Response(response_data)

