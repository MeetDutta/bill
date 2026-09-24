from decimal import Decimal

from django.db import transaction
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardPagination

from .models import LoyaltyAccount, LoyaltyRedemption, LoyaltyRule, LoyaltyTransaction
from .serializers import (
    LoyaltyAccountSerializer,
    LoyaltyRedemptionSerializer,
    LoyaltyRuleSerializer,
    LoyaltyTransactionSerializer,
    RedeemPointsSerializer,
)


class LoyaltyAccountListView(generics.ListAPIView):
    serializer_class = LoyaltyAccountSerializer
    pagination_class = StandardPagination
    search_fields = ["customer__first_name", "customer__last_name", "customer__phone"]

    def get_queryset(self):
        return LoyaltyAccount.objects.filter(
            organization=self.request.user.organization
        ).select_related("customer")


class LoyaltyAccountDetailView(generics.RetrieveAPIView):
    serializer_class = LoyaltyAccountSerializer

    def get_queryset(self):
        return LoyaltyAccount.objects.filter(organization=self.request.user.organization)


class LoyaltyRuleListView(generics.ListCreateAPIView):
    serializer_class = LoyaltyRuleSerializer
    pagination_class = StandardPagination
    filterset_fields = ["rule_type", "is_active"]

    def get_queryset(self):
        return LoyaltyRule.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class LoyaltyRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = LoyaltyRuleSerializer

    def get_queryset(self):
        return LoyaltyRule.objects.filter(organization=self.request.user.organization)


class LoyaltyTransactionListView(generics.ListAPIView):
    serializer_class = LoyaltyTransactionSerializer
    pagination_class = StandardPagination
    filterset_fields = ["transaction_type"]

    def get_queryset(self):
        return LoyaltyTransaction.objects.filter(
            organization=self.request.user.organization
        ).select_related("loyalty_account__customer")


class RedeemPointsView(APIView):
    def post(self, request):
        serializer = RedeemPointsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        org = request.user.organization

        try:
            account = LoyaltyAccount.objects.select_related("customer").get(
                organization=org,
                customer_id=data["customer_id"],
            )
        except LoyaltyAccount.DoesNotExist:
            return Response({"error": "Loyalty account not found"}, status=status.HTTP_404_NOT_FOUND)

        points = Decimal(str(data["points"]))
        if account.balance < points:
            return Response(
                {"error": "Insufficient points", "balance": str(account.balance)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            balance_after = account.balance - points
            account.balance = balance_after
            account.total_redeemed += points
            account.save(update_fields=["balance", "total_redeemed", "updated_at"])

            redemption = LoyaltyRedemption.objects.create(
                organization=org,
                loyalty_account=account,
                transaction_id=data.get("transaction_id"),
                points=points,
            )

            LoyaltyTransaction.objects.create(
                organization=org,
                loyalty_account=account,
                transaction_type="redeem",
                points=-points,
                balance_after=balance_after,
                reference_type="redemption",
                reference_id=str(redemption.id),
                description=f"Redeemed {points} points",
            )

        from apps.customers.models import CustomerTimeline
        CustomerTimeline.objects.create(
            organization=org,
            customer=account.customer,
            event_type="coupon_redeemed",
            reference_id=str(redemption.id),
            metadata={"points_redeemed": str(points)},
        )

        return Response({
            "message": "Points redeemed successfully",
            "points_redeemed": str(points),
            "new_balance": str(balance_after),
        })
