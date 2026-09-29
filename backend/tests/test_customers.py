from decimal import Decimal
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.customers.models import Customer
from tests.factories import OrganizationFactory, UserFactory, CustomerFactory


class CustomerTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory()
        self.user = UserFactory(organization=self.org, role="org_admin")
        self.client.force_authenticate(user=self.user)

    def test_create_customer_successfully_and_auto_generate_id(self):
        response = self.client.post("/api/v1/customers/", {
            "first_name": "Meet",
            "last_name": "Dutta",
            "phone": "8010858983",
            "email": "meetdutta001@gmail.com",
            "city": "Pune",
            "segment": "new",
            "whatsapp_opt_in": True,
            "marketing_consent": True,
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data
        self.assertEqual(data["first_name"], "Meet")
        self.assertEqual(data["last_name"], "Dutta")
        self.assertEqual(data["phone"], "8010858983")
        self.assertEqual(data["city"], "Pune")
        self.assertTrue(data["customer_id"].startswith("CUS-"))

        # Verify DB entry
        customer = Customer.objects.get(phone="8010858983", organization=self.org)
        self.assertEqual(customer.customer_id, data["customer_id"])
        self.assertEqual(customer.city, "Pune")
        self.assertTrue(customer.whatsapp_opt_in)
        self.assertTrue(customer.marketing_consent)

    def test_duplicate_phone_rejected_in_same_org(self):
        # Create initial customer
        CustomerFactory(organization=self.org, phone="8010858983")

        response = self.client.post("/api/v1/customers/", {
            "first_name": "Meet",
            "last_name": "Duplicate",
            "phone": "8010858983",
            "email": "another@gmail.com",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)
        phone_err = str(response.data["phone"])
        self.assertTrue("already exists" in phone_err or "Customer with this phone number already exists" in phone_err)

    def test_invalid_email_rejected(self):
        response = self.client.post("/api/v1/customers/", {
            "first_name": "Test",
            "last_name": "User",
            "phone": "9998887776",
            "email": "not-an-email",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_missing_required_phone_rejected(self):
        response = self.client.post("/api/v1/customers/", {
            "first_name": "NoPhone",
            "last_name": "User",
            "email": "nophone@test.com",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)

    def test_organization_isolation(self):
        other_org = OrganizationFactory()
        other_user = UserFactory(organization=other_org, role="org_admin")
        
        # Org 1 customer
        cust1 = CustomerFactory(organization=self.org, phone="9111111111", first_name="Org1Customer")

        # Org 2 client
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)

        # Org 2 list should not contain cust1
        response = other_client.get("/api/v1/customers/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", [])
        self.assertFalse(any(c["id"] == str(cust1.id) for c in results))

        # Org 2 can register same phone in their own org (org-scoped uniqueness)
        create_res = other_client.post("/api/v1/customers/", {
            "first_name": "Org2Customer",
            "phone": "9111111111",
        }, format="json")
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
