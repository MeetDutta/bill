from decimal import Decimal

from django.db.models import Avg, Count, Sum
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardPagination

from .models import CustomerInsight, AIContentGeneration, AISegmentation
from .serializers import (
    AICustomerInsightSerializer,
    AIContentGenerationSerializer,
    AISegmentationSerializer,
    CustomerSegmentationSerializer,
    GenerateCampaignContentSerializer,
)


class GenerateCampaignContentView(APIView):
    def post(self, request):
        serializer = GenerateCampaignContentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        campaign_templates = {
            "promotional": {
                "en": "Special offer just for you! {product_name} at an exclusive price. Don't miss out - limited time only!",
                "hi": "आपके लिए विशेष ऑफर! {product_name} पर एक्सक्लूसिव प्राइस। समय सीमित है!",
            },
            "new_customer": {
                "en": "Welcome to {brand_name}! Here's 15% off your first purchase. Use code WELCOME15.",
                "hi": "{brand_name} में आपका स्वागत है! पहली खरीदारी पर 15% की छूट। कोड WELCOME15 उपयोग करें।",
            },
            "win_back": {
                "en": "We miss you! Come back and enjoy 20% off with code COMEBACK20.",
                "hi": "हम आपको याद कर रहे हैं! वापस आएं और COMEBACK20 कोड से 20% छूट का आनंद लें।",
            },
            "birthday": {
                "en": "Happy Birthday {customer_name}! 🎂 Here's a special gift - 25% off on your next order!",
                "hi": "जन्मदिन मुबारक {customer_name}! 🎂 यह एक विशेष उपहार है - अगले ऑर्डर पर 25% छूट!",
            },
            "festival": {
                "en": "Happy {festival_name}! Celebrate with our festive collection. Flat 30% off!",
                "hi": "{festival_name} की शुभकामनाएं! हमारे त्योहारी कलेक्शन के साथ मनाएं। 30% की छूट!",
            },
        }

        campaign_type = data["campaign_type"]
        language = data["language"]
        templates = campaign_templates.get(campaign_type, campaign_templates["promotional"])
        template = templates.get(language, templates["en"])

        product = data.get("product_name", "our products")
        brand = data.get("brand_name", "our store")
        content = template.format(
            product_name=product,
            brand_name=brand,
            customer_name="Customer",
            festival_name="Festival",
        )

        generation = AIContentGeneration.objects.create(
            organization=request.user.organization,
            content_type="campaign_message",
            prompt=f"Generate {campaign_type} message for {data['target_audience']}",
            generated_content=content,
            parameters=data,
            model_used="template-v1",
            tokens_used=0,
            status="completed",
        )

        return Response({
            "id": str(generation.id),
            "content": content,
            "campaign_type": campaign_type,
            "language": language,
        })


class CustomerInsightsView(generics.ListAPIView):
    serializer_class = AICustomerInsightSerializer
    pagination_class = StandardPagination
    filterset_fields = ["insight_type"]

    def get_queryset(self):
        return CustomerInsight.objects.filter(
            organization=self.request.user.organization
        ).select_related("customer")


class CustomerInsightDetailView(generics.RetrieveAPIView):
    serializer_class = AICustomerInsightSerializer

    def get_queryset(self):
        return CustomerInsight.objects.filter(
            organization=self.request.user.organization
        )


class GenerateCustomerInsightsView(APIView):
    def post(self, request, pk):
        from apps.customers.models import Customer

        try:
            customer = Customer.objects.get(
                id=pk,
                organization=request.user.organization,
            )
        except Customer.DoesNotExist:
            return Response({"error": "Customer not found"}, status=status.HTTP_404_NOT_FOUND)

        churn_score = Decimal("0")
        if customer.total_purchases > 0:
            from datetime import timedelta
            days_since = (timezone.now() - customer.last_purchase_at).days if customer.last_purchase_at else 999
            churn_score = min(100, days_since)

        ltv = customer.total_spend

        segment = "new"
        if customer.total_purchases >= 10:
            segment = "loyal"
        elif customer.total_purchases >= 5:
            segment = "returning"
        elif customer.total_purchases >= 2:
            segment = "repeat"
        elif customer.total_spend >= 5000:
            segment = "high_value"

        insights_data = [
            {
                "insight_type": "churn_risk",
                "score": churn_score,
                "data": {"days_since_last_purchase": (timezone.now() - customer.last_purchase_at).days if customer.last_purchase_at else None},
                "recommendation": "Send a win-back campaign" if churn_score > 60 else "Continue engagement",
            },
            {
                "insight_type": "lifetime_value",
                "score": min(100, ltv / 100),
                "data": {"total_spend": str(ltv), "avg_order": str(customer.average_order_value)},
                "recommendation": "VIP treatment recommended" if ltv >= 10000 else "Standard engagement",
            },
            {
                "insight_type": "segment_suggestion",
                "score": 100,
                "data": {"suggested_segment": segment},
                "recommendation": f"Customer belongs to '{segment}' segment",
            },
        ]

        created_insights = []
        for insight_data in insights_data:
            insight, _ = CustomerInsight.objects.update_or_create(
                organization=request.user.organization,
                customer=customer,
                insight_type=insight_data["insight_type"],
                defaults={
                    "score": insight_data["score"],
                    "data": insight_data["data"],
                    "recommendation": insight_data["recommendation"],
                    "model_version": "rule-v1",
                },
            )
            created_insights.append(insight)

        if segment != customer.segment:
            customer.segment = segment
            customer.save(update_fields=["segment"])

        return Response({
            "customer_id": str(customer.id),
            "insights": AICustomerInsightSerializer(created_insights, many=True).data,
        })


class AISegmentationListView(generics.ListCreateAPIView):
    serializer_class = AISegmentationSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        return AISegmentation.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class AISegmentationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AISegmentationSerializer

    def get_queryset(self):
        return AISegmentation.objects.filter(organization=self.request.user.organization)


class GenerateSegmentationView(APIView):
    def post(self, request):
        serializer = CustomerSegmentationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from apps.customers.models import Customer
        customers = Customer.objects.filter(
            organization=request.user.organization,
            is_active=True,
        )

        rules = data["rules"]
        if "min_total_spend" in rules:
            customers = customers.filter(total_spend__gte=rules["min_total_spend"])
        if "max_total_spend" in rules:
            customers = customers.filter(total_spend__lte=rules["max_total_spend"])
        if "min_purchases" in rules:
            customers = customers.filter(total_purchases__gte=rules["min_purchases"])
        if "max_purchases" in rules:
            customers = customers.filter(total_purchases__lte=rules["max_purchases"])
        if "segment" in rules:
            customers = customers.filter(segment=rules["segment"])

        count = customers.count()

        segmentation = AISegmentation.objects.create(
            organization=request.user.organization,
            name=data["segment_name"],
            rules=rules,
            customer_count=count,
            is_auto_generated=True,
            last_calculated_at=timezone.now(),
        )

        return Response({
            "id": str(segmentation.id),
            "name": segmentation.name,
            "customer_count": count,
            "rules": rules,
        })
