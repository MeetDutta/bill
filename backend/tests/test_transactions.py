import uuid
from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.transactions.models import Transaction, TransactionItem
from apps.customers.models import Customer
from tests.factories import OrganizationFactory, StoreFactory, UserFactory


class TransactionIngestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory()
        self.user = UserFactory(organization=self.org, role="org_admin")
        self.store = StoreFactory(organization=self.org, code="STR001")
        self.client.force_authenticate(user=self.user)

    def test_ingest_transaction_new_customer(self):
        payload = {
            "store_id": "STR001",
            "invoice_number": f"INV{uuid.uuid4().hex[:8].upper()}",
            "transaction_date": "2026-08-12T14:00:00Z",
            "customer": {
                "name": "Test Customer",
                "phone": "9876543210",
                "email": "test@example.com",
            },
            "items": [
                {
                    "name": "Product A",
                    "quantity": 2,
                    "unit_price": 500,
                    "discount": 0,
                    "tax": 90,
                    "total": 1090,
                }
            ],
            "subtotal": 1000,
            "discount": 0,
            "tax": 90,
            "total": 1090,
            "payment_method": "UPI",
            "external_source": "TEST_POS",
            "external_transaction_id": f"TXN{uuid.uuid4().hex[:8].upper()}",
        }
        response = self.client.post("/api/v1/transactions/ingest/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)

        customer = Customer.objects.get(organization=self.org, phone="9876543210")
        self.assertEqual(customer.first_name, "Test")
        self.assertEqual(customer.total_purchases, 1)
        self.assertEqual(customer.total_spend, Decimal("1090"))

    def test_idempotent_transaction(self):
        external_id = f"TXN{uuid.uuid4().hex[:8].upper()}"
        payload = {
            "store_id": "STR001",
            "invoice_number": f"INV{uuid.uuid4().hex[:8].upper()}",
            "transaction_date": "2026-08-12T14:00:00Z",
            "customer": {"name": "Test", "phone": "9876543210"},
            "items": [{"name": "Item", "quantity": 1, "unit_price": 100, "discount": 0, "tax": 18, "total": 118}],
            "subtotal": 100,
            "discount": 0,
            "tax": 18,
            "total": 118,
            "external_transaction_id": external_id,
        }

        response1 = self.client.post("/api/v1/transactions/ingest/", payload, format="json")
        self.assertEqual(response1.status_code, status.HTTP_201_CREATED)

        payload["invoice_number"] = f"INV{uuid.uuid4().hex[:8].upper()}"
        response2 = self.client.post("/api/v1/transactions/ingest/", payload, format="json")
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        self.assertEqual(response1.data["id"], response2.data["id"])

    def test_duplicate_customer_prevented(self):
        payload1 = {
            "store_id": "STR001",
            "invoice_number": f"INV{uuid.uuid4().hex[:8].upper()}",
            "transaction_date": "2026-08-12T14:00:00Z",
            "customer": {"name": "Test User", "phone": "9876543210"},
            "items": [{"name": "Item", "quantity": 1, "unit_price": 100, "discount": 0, "tax": 18, "total": 118}],
            "subtotal": 100, "discount": 0, "tax": 18, "total": 118,
            "external_transaction_id": f"TXN{uuid.uuid4().hex[:8].upper()}",
        }
        self.client.post("/api/v1/transactions/ingest/", payload1, format="json")

        payload2 = {
            "store_id": "STR001",
            "invoice_number": f"INV{uuid.uuid4().hex[:8].upper()}",
            "transaction_date": "2026-08-12T15:00:00Z",
            "customer": {"name": "Test User Updated", "phone": "9876543210"},
            "items": [{"name": "Item", "quantity": 1, "unit_price": 200, "discount": 0, "tax": 36, "total": 236}],
            "subtotal": 200, "discount": 0, "tax": 36, "total": 236,
            "external_transaction_id": f"TXN{uuid.uuid4().hex[:8].upper()}",
        }
        self.client.post("/api/v1/transactions/ingest/", payload2, format="json")

        customer = Customer.objects.get(organization=self.org, phone="9876543210")
        self.assertEqual(customer.total_purchases, 2)

    def test_invalid_store(self):
        payload = {
            "store_id": "NONEXISTENT",
            "invoice_number": "INV001",
            "transaction_date": "2026-08-12T14:00:00Z",
            "customer": {"name": "Test", "phone": "9876543210"},
            "items": [],
            "subtotal": 0, "discount": 0, "tax": 0, "total": 0,
        }
        response = self.client.post("/api/v1/transactions/ingest/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
