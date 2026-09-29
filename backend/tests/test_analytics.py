from decimal import Decimal
from django.utils import timezone
from datetime import timedelta
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.analytics.models import CampaignAnalytics, CustomerAnalytics, DailySalesReport
from tests.factories import (
    OrganizationFactory,
    UserFactory,
    CustomerFactory,
    StoreFactory,
    TransactionFactory,
)


class AnalyticsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory()
        self.user = UserFactory(organization=self.org, role="org_admin")
        self.client.force_authenticate(user=self.user)

    def test_dashboard_empty(self):
        response = self.client.get("/api/v1/analytics/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("total_revenue", response.data)
        self.assertIn("total_customers", response.data)
        self.assertIn("revenue_trend", response.data)
        self.assertIn("customer_growth", response.data)
        self.assertFalse(response.data["has_revenue_data"])
        self.assertFalse(response.data["has_customer_data"])

    def test_revenue_trend_with_data(self):
        store = StoreFactory(organization=self.org)
        cust = CustomerFactory(organization=self.org)
        TransactionFactory(
            organization=self.org,
            store=store,
            customer=cust,
            total=Decimal("1500.00"),
            status="completed",
        )

        response = self.client.get("/api/v1/analytics/revenue-trend/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("trend", response.data)
        self.assertTrue(response.data["has_data"])
        self.assertGreater(len(response.data["trend"]), 0)

    def test_customer_growth_with_data(self):
        CustomerFactory(organization=self.org)
        CustomerFactory(organization=self.org)

        response = self.client.get("/api/v1/analytics/customer-growth/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("growth", response.data)
        self.assertTrue(response.data["has_data"])
        self.assertGreater(len(response.data["growth"]), 0)

    def test_organization_filtering_analytics(self):
        other_org = OrganizationFactory()
        other_store = StoreFactory(organization=other_org)
        other_cust = CustomerFactory(organization=other_org)
        
        # Org B transaction and customer
        TransactionFactory(
            organization=other_org,
            store=other_store,
            customer=other_cust,
            total=Decimal("50000.00"),
            status="completed",
        )

        # Org A should see 0 revenue
        response = self.client.get("/api/v1/analytics/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(response.data["total_revenue"])), Decimal("0"))
        self.assertEqual(response.data["total_customers"], 0)
        self.assertFalse(response.data["has_revenue_data"])
        self.assertFalse(response.data["has_customer_data"])

    def test_sales_report_list(self):
        response = self.client.get("/api/v1/analytics/sales/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_customer_analytics_list(self):
        response = self.client.get("/api/v1/analytics/customers/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_campaign_analytics_list(self):
        response = self.client.get("/api/v1/analytics/campaigns/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
