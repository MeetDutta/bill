from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from tests.factories import CustomerFactory, OrganizationFactory, StoreFactory, UserFactory


class TenantIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org_a = OrganizationFactory(name="Org A")
        self.org_b = OrganizationFactory(name="Org B")

        self.user_a = UserFactory(organization=self.org_a, role="org_admin")
        self.user_b = UserFactory(organization=self.org_b, role="org_admin")

        self.store_a = StoreFactory(organization=self.org_a, code="STRA")
        self.store_b = StoreFactory(organization=self.org_b, code="STRB")

        self.customer_a = CustomerFactory(organization=self.org_a, phone="1111111111")
        self.customer_b = CustomerFactory(organization=self.org_b, phone="2222222222")

    def test_org_a_cannot_see_org_b_customers(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get("/api/v1/customers/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [c["id"] for c in response.data.get("results", [])]
        self.assertNotIn(str(self.customer_b.id), ids)

    def test_org_b_cannot_see_org_a_customers(self):
        self.client.force_authenticate(user=self.user_b)
        response = self.client.get("/api/v1/customers/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [c["id"] for c in response.data.get("results", [])]
        self.assertNotIn(str(self.customer_a.id), ids)

    def test_org_a_cannot_see_org_b_stores(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get("/api/v1/stores/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [s["id"] for s in response.data.get("results", [])]
        self.assertNotIn(str(self.store_b.id), ids)

    def test_org_b_cannot_see_org_b_users(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [u["id"] for u in response.data.get("results", [])]
        self.assertNotIn(str(self.user_b.id), ids)

    def test_org_a_cannot_update_org_b_customer(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.patch(
            f"/api/v1/customers/{self.customer_b.id}/",
            {"first_name": "Hacked"},
            format="json",
        )
        self.assertIn(response.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_org_a_cannot_delete_org_b_store(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.delete(f"/api/v1/stores/{self.store_b.id}/")
        self.assertIn(response.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_unauthenticated_cannot_access(self):
        response = self.client.get("/api/v1/customers/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
