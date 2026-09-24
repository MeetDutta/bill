from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.analytics.models import CampaignAnalytics, CustomerAnalytics, DailySalesReport
from tests.factories import OrganizationFactory, UserFactory


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

    def test_sales_report_list(self):
        response = self.client.get("/api/v1/analytics/sales/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_customer_analytics_list(self):
        response = self.client.get("/api/v1/analytics/customers/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_campaign_analytics_list(self):
        response = self.client.get("/api/v1/analytics/campaigns/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
