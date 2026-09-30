from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardPagination

from .models import Coupon, CouponRedemption
from .serializers import CouponListSerializer, CouponRedemptionSerializer, CouponSerializer


class CouponListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["code", "name"]
    filterset_fields = ["discount_type", "is_active"]

    def get_queryset(self):
        return Coupon.objects.filter(organization=self.request.user.organization)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return CouponListSerializer
        return CouponSerializer

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class CouponDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CouponSerializer

    def get_queryset(self):
        return Coupon.objects.filter(organization=self.request.user.organization)


class ValidateCouponView(APIView):
    def post(self, request):
        code = request.data.get("code", "")
        order_value = Decimal(str(request.data.get("order_value", 0)))
        customer_id = request.data.get("customer_id")

        try:
            coupon = Coupon.objects.get(
                organization=request.user.organization,
                code=code.upper(),
                is_active=True,
            )
        except Coupon.DoesNotExist:
            return Response({"error": "Invalid coupon code"}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        if coupon.start_at > now:
            return Response({"error": "Coupon not yet active"}, status=status.HTTP_400_BAD_REQUEST)
        if coupon.expires_at < now:
            return Response({"error": "Coupon has expired"}, status=status.HTTP_400_BAD_REQUEST)
        if coupon.usage_limit > 0 and coupon.used_count >= coupon.usage_limit:
            return Response({"error": "Coupon usage limit reached"}, status=status.HTTP_400_BAD_REQUEST)
        if order_value < coupon.min_order_value:
            return Response(
                {"error": f"Minimum order value is ₹{coupon.min_order_value}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if customer_id and coupon.per_customer_limit > 0:
            redemptions = CouponRedemption.objects.filter(
                coupon=coupon,
                customer_id=customer_id,
            ).count()
            if redemptions >= coupon.per_customer_limit:
                return Response(
                    {"error": "Per-customer usage limit reached"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        discount = Decimal("0")
        if coupon.discount_type == "percentage":
            discount = (order_value * coupon.discount_value) / 100
            if coupon.max_discount:
                discount = min(discount, coupon.max_discount)
        else:
            discount = min(coupon.discount_value, order_value)

        return Response({
            "valid": True,
            "coupon_id": str(coupon.id),
            "code": coupon.code,
            "discount_type": coupon.discount_type,
            "discount_value": str(coupon.discount_value),
            "discount_amount": str(discount),
        })


class RedeemCouponView(APIView):
    def post(self, request):
        code = (request.data.get("code") or "").strip().upper()
        customer_id = request.data.get("customer_id")
        transaction_id = request.data.get("transaction_id")
        order_value = Decimal(str(request.data.get("order_value", 0)))

        now = timezone.now()

        with transaction.atomic():
            try:
                coupon = Coupon.objects.select_for_update().get(
                    organization=request.user.organization,
                    code=code,
                    is_active=True,
                )
            except Coupon.DoesNotExist:
                return Response({"error": "Invalid coupon code"}, status=status.HTTP_400_BAD_REQUEST)

            if coupon.start_at and coupon.start_at > now:
                return Response({"error": "Coupon not yet active"}, status=status.HTTP_400_BAD_REQUEST)
            if coupon.expires_at and coupon.expires_at < now:
                return Response({"error": "Coupon has expired"}, status=status.HTTP_400_BAD_REQUEST)
            if coupon.usage_limit > 0 and coupon.used_count >= coupon.usage_limit:
                return Response({"error": "Coupon usage limit reached"}, status=status.HTTP_400_BAD_REQUEST)
            if order_value < coupon.min_order_value:
                return Response(
                    {"error": f"Minimum order value is ₹{coupon.min_order_value}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if customer_id and coupon.per_customer_limit > 0:
                redemptions = CouponRedemption.objects.filter(
                    coupon=coupon,
                    customer_id=customer_id,
                ).count()
                if redemptions >= coupon.per_customer_limit:
                    return Response(
                        {"error": "Per-customer usage limit reached"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            discount = Decimal("0")
            if coupon.discount_type == "percentage":
                discount = (order_value * coupon.discount_value) / 100
                if coupon.max_discount:
                    discount = min(discount, coupon.max_discount)
            else:
                discount = min(coupon.discount_value, order_value)

            coupon.used_count += 1
            coupon.save(update_fields=["used_count"])

            redemption = CouponRedemption.objects.create(
                organization=request.user.organization,
                coupon=coupon,
                customer_id=customer_id,
                transaction_id=transaction_id,
                discount_amount=discount,
            )

        from apps.customers.models import CustomerTimeline
        if customer_id:
            CustomerTimeline.objects.create(
                organization=request.user.organization,
                customer_id=customer_id,
                event_type="coupon_redeemed",
                reference_id=str(redemption.id),
                metadata={"coupon_code": coupon.code, "discount": str(discount)},
            )

        return Response({
            "message": "Coupon redeemed",
            "discount_amount": str(discount),
            "redemption_id": str(redemption.id),
        })
