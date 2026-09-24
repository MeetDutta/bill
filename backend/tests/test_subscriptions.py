from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from tests.factories import OrganizationFactory, UserFactory


class SubscriptionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory()
        self.user = UserFactory(organization=self.org, role="org_admin")
        self.client.force_authenticate(user=self.user)

    def test_plans_list(self):
        from apps.subscriptions.models import Plan
        Plan.objects.create(
            name="Starter",
            tier="starter",
            price_monthly=999,
            price_yearly=9999,
            max_stores=2,
            max_users=5,
            max_customers=5000,
            max_whatsapp_messages=5000,
            max_campaigns=50,
        )
        response = self.client.get("/api/v1/subscriptions/plans/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_subscription(self):
        from apps.subscriptions.models import Plan
        plan = Plan.objects.create(
            name="Professional",
            tier="professional",
            price_monthly=2999,
            price_yearly=29999,
            max_stores=5,
            max_users=15,
            max_customers=25000,
            max_whatsapp_messages=25000,
            max_campaigns=200,
        )
        response = self.client.post("/api/v1/subscriptions/create/", {
            "plan_id": str(plan.id),
            "billing_cycle": "monthly",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "trialing")

    def test_usage_summary(self):
        from apps.subscriptions.models import Plan, Subscription
        plan = Plan.objects.create(
            name="Starter",
            tier="starter",
            price_monthly=999,
            price_yearly=9999,
            max_stores=2,
            max_users=5,
            max_customers=5000,
            max_whatsapp_messages=5000,
            max_campaigns=50,
        )
        Subscription.objects.create(
            organization=self.org,
            plan=plan,
            status="active",
            billing_cycle="monthly",
            start_date="2026-08-01",
        )
        response = self.client.get("/api/v1/subscriptions/usage/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("usage", response.data)
