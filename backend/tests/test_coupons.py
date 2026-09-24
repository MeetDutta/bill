from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.coupons.models import Coupon, CouponRedemption
from tests.factories import CouponFactory, CustomerFactory, OrganizationFactory, UserFactory


class CouponTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory()
        self.user = UserFactory(organization=self.org, role="org_admin")
        self.client.force_authenticate(user=self.user)

    def test_create_coupon(self):
        response = self.client.post("/api/v1/coupons/", {
            "code": "SAVE20",
            "name": "20% Off",
            "discount_type": "percentage",
            "discount_value": "20",
            "min_order_value": "500",
            "start_at": "2026-08-01T00:00:00Z",
            "expires_at": "2026-12-31T23:59:59Z",
            "usage_limit": 100,
            "per_customer_limit": 1,
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Coupon.objects.filter(code="SAVE20").exists())

    def test_validate_coupon(self):
        coupon = CouponFactory(
            organization=self.org,
            code="TEST10",
            discount_type="percentage",
            discount_value=Decimal("10"),
            min_order_value=Decimal("100"),
        )

        response = self.client.post("/api/v1/coupons/validate/", {
            "code": "TEST10",
            "order_value": "500",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["valid"])
        self.assertEqual(response.data["discount_amount"], "50.00")

    def test_validate_coupon_min_order(self):
        coupon = CouponFactory(
            organization=self.org,
            code="MIN100",
            min_order_value=Decimal("500"),
        )

        response = self.client.post("/api/v1/coupons/validate/", {
            "code": "MIN100",
            "order_value": "100",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_redeem_coupon(self):
        customer = CustomerFactory(organization=self.org)
        coupon = CouponFactory(
            organization=self.org,
            code="DISC10",
            discount_type="percentage",
            discount_value=Decimal("10"),
            min_order_value=Decimal("100"),
        )

        response = self.client.post("/api/v1/coupons/redeem/", {
            "code": "DISC10",
            "customer_id": str(customer.id),
            "order_value": "1000",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["discount_amount"], "100.00")

        coupon.refresh_from_db()
        self.assertEqual(coupon.used_count, 1)
        self.assertTrue(CouponRedemption.objects.filter(coupon=coupon, customer=customer).exists())

    def test_fixed_discount_coupon(self):
        coupon = CouponFactory(
            organization=self.org,
            code="FLAT50",
            discount_type="fixed",
            discount_value=Decimal("50"),
            min_order_value=Decimal("200"),
        )

        response = self.client.post("/api/v1/coupons/validate/", {
            "code": "FLAT50",
            "order_value": "1000",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["discount_amount"], "50.00")
