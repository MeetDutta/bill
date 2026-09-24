from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardPagination

from .models import EntitlementService, Plan, Subscription, SubscriptionUsage
from .serializers import (
    CreateSubscriptionSerializer,
    PlanSerializer,
    SubscriptionListSerializer,
    SubscriptionSerializer,
    SubscriptionUsageSerializer,
)


class PlanListView(generics.ListAPIView):
    serializer_class = PlanSerializer
    pagination_class = StandardPagination
    permission_classes = []
    filterset_fields = ["tier"]

    def get_queryset(self):
        return Plan.objects.filter(is_active=True, is_public=True)


class PlanDetailView(generics.RetrieveAPIView):
    serializer_class = PlanSerializer
    permission_classes = []

    def get_queryset(self):
        return Plan.objects.filter(is_active=True, is_public=True)


class SubscriptionListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination

    def get_queryset(self):
        return Subscription.objects.filter(
            organization=self.request.user.organization
        ).select_related("plan")

    def get_serializer_class(self):
        if self.request.method == "GET":
            return SubscriptionListSerializer
        return SubscriptionSerializer

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class SubscriptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SubscriptionSerializer

    def get_queryset(self):
        return Subscription.objects.filter(
            organization=self.request.user.organization
        ).select_related("plan")


class CreateSubscriptionView(APIView):
    def post(self, request):
        serializer = CreateSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            plan = Plan.objects.get(id=data["plan_id"], is_active=True)
        except Plan.DoesNotExist:
            return Response({"error": "Invalid plan"}, status=status.HTTP_400_BAD_REQUEST)

        org = request.user.organization
        existing = Subscription.objects.filter(
            organization=org,
            status__in=["active", "trialing"],
        ).first()
        if existing:
            return Response(
                {"error": "Organization already has an active subscription"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.now().date()
        trial_end = today + timedelta(days=14)

        subscription = Subscription.objects.create(
            organization=org,
            plan=plan,
            status="trialing",
            billing_cycle=data["billing_cycle"],
            start_date=today,
            trial_end_date=trial_end,
            payment_method=data.get("payment_method", ""),
        )

        return Response(
            SubscriptionSerializer(subscription).data,
            status=status.HTTP_201_CREATED,
        )


class CancelSubscriptionView(APIView):
    def post(self, request, pk):
        try:
            subscription = Subscription.objects.get(
                id=pk,
                organization=request.user.organization,
                status__in=["active", "trialing"],
            )
        except Subscription.DoesNotExist:
            return Response({"error": "Subscription not found"}, status=status.HTTP_404_NOT_FOUND)

        subscription.status = "cancelled"
        subscription.cancelled_at = timezone.now()
        subscription.cancel_reason = request.data.get("reason", "")
        subscription.save(update_fields=["status", "cancelled_at", "cancel_reason"])

        return Response({"message": "Subscription cancelled"})


class UsageListView(generics.ListAPIView):
    serializer_class = SubscriptionUsageSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        subscription = Subscription.objects.filter(
            organization=self.request.user.organization,
            status__in=["active", "trialing"],
        ).first()
        if not subscription:
            return SubscriptionUsage.objects.none()
        return SubscriptionUsage.objects.filter(subscription=subscription)


class UsageSummaryView(APIView):
    def get(self, request):
        summary = EntitlementService.get_usage_summary(request.user.organization)
        if not summary:
            return Response({"error": "No active subscription"}, status=status.HTTP_404_NOT_FOUND)
        return Response(summary)


class CheckEntitlementView(APIView):
    def get(self, request):
        metric = request.query_params.get("metric", "")
        if not metric:
            return Response({"error": "metric parameter required"}, status=status.HTTP_400_BAD_REQUEST)

        result = EntitlementService.check_entitlement(request.user.organization, metric)
        return Response(result)
