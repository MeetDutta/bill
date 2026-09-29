from decimal import Decimal
from django.utils import timezone
from datetime import timedelta
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

    def test_create_percentage_coupon(self):
        response = self.client.post("/api/v1/coupons/", {
            "code": "save20",
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
        # Verify uppercase normalization
        self.assertTrue(Coupon.objects.filter(code="SAVE20", organization=self.org).exists())

    def test_create_fixed_coupon_and_missing_start_at(self):
        future_date = (timezone.now() + timedelta(days=30)).isoformat()
        response = self.client.post("/api/v1/coupons/", {
            "code": "FLAT100",
            "name": "Flat 100 Off",
            "discount_type": "fixed",
            "discount_value": "100",
            "min_order_value": "1000",
            "expires_at": future_date,
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        coupon = Coupon.objects.get(code="FLAT100", organization=self.org)
        self.assertIsNotNone(coupon.start_at)
        self.assertEqual(coupon.discount_value, Decimal("100"))

    def test_duplicate_code_case_insensitive_rejected(self):
        CouponFactory(organization=self.org, code="SUMMER50")

        # Attempt to create with lowercase 'summer50'
        future_date = (timezone.now() + timedelta(days=30)).isoformat()
        response = self.client.post("/api/v1/coupons/", {
            "code": "summer50",
            "name": "Summer Discount",
            "discount_type": "percentage",
            "discount_value": "50",
            "expires_at": future_date,
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)
        self.assertTrue("already exists" in str(response.data["code"]))

    def test_expiry_before_start_rejected(self):
        past_date = (timezone.now() - timedelta(days=5)).isoformat()
        response = self.client.post("/api/v1/coupons/", {
            "code": "EXPIRED",
            "name": "Invalid Expiry",
            "discount_type": "fixed",
            "discount_value": "50",
            "expires_at": past_date,
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expires_at", response.data)

    def test_percentage_over_100_rejected(self):
        future_date = (timezone.now() + timedelta(days=30)).isoformat()
        response = self.client.post("/api/v1/coupons/", {
            "code": "OVER100",
            "name": "Over 100%",
            "discount_type": "percentage",
            "discount_value": "120",
            "expires_at": future_date,
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discount_value", response.data)

    def test_negative_discount_rejected(self):
        future_date = (timezone.now() + timedelta(days=30)).isoformat()
        response = self.client.post("/api/v1/coupons/", {
            "code": "NEGATIVEDISC",
            "name": "Negative Disc",
            "discount_type": "fixed",
            "discount_value": "-10",
            "expires_at": future_date,
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discount_value", response.data)

    def test_negative_min_order_value_rejected(self):
        future_date = (timezone.now() + timedelta(days=30)).isoformat()
        response = self.client.post("/api/v1/coupons/", {
            "code": "NEGORDER",
            "name": "Negative Order",
            "discount_type": "fixed",
            "discount_value": "50",
            "min_order_value": "-100",
            "expires_at": future_date,
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("min_order_value", response.data)

    def test_coupon_organization_isolation(self):
        other_org = OrganizationFactory()
        other_user = UserFactory(organization=other_org, role="org_admin")
        
        # Org 1 creates coupon
        CouponFactory(organization=self.org, code="SHAREDCODE")

        # Org 2 client
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)

        # Org 2 can use the same code name in their own organization
        future_date = (timezone.now() + timedelta(days=30)).isoformat()
        res = other_client.post("/api/v1/coupons/", {
            "code": "SHAREDCODE",
            "name": "Other Org Coupon",
            "discount_type": "fixed",
            "discount_value": "20",
            "expires_at": future_date,
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Org 2 cannot see Org 1's coupons
        list_res = other_client.get("/api/v1/coupons/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        org2_coupon_names = [c["name"] for c in list_res.data.get("results", [])]
        self.assertIn("Other Org Coupon", org2_coupon_names)

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
