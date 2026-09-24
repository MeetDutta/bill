from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import AISegmentation
from tests.factories import CustomerFactory, OrganizationFactory, UserFactory


class AITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory()
        self.user = UserFactory(organization=self.org, role="org_admin")
        self.client.force_authenticate(user=self.user)

    def test_generate_campaign_content(self):
        response = self.client.post("/api/v1/ai/generate-content/", {
            "campaign_type": "promotional",
            "target_audience": "all customers",
            "product_name": "Summer Collection",
            "brand_name": "MyStore",
            "language": "en",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("content", response.data)

    def test_generate_customer_insights(self):
        customer = CustomerFactory(organization=self.org)
        response = self.client.post(f"/api/v1/ai/insights/generate/{customer.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("insights", response.data)

    def test_generate_segmentation(self):
        for i in range(5):
            CustomerFactory(organization=self.org, total_spend=1000 * (i + 1))

        response = self.client.post("/api/v1/ai/segments/generate/", {
            "segment_name": "High Value",
            "rules": {"min_total_spend": 3000},
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["customer_count"], 3)

    def test_segments_list(self):
        response = self.client.get("/api/v1/ai/segments/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
