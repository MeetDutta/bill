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
            "items": [{"name": "Item", "quantity": 1, "unit_price": 100, "discount": 0, "tax": 0, "total": 100}],
            "subtotal": 100, "discount": 0, "tax": 0, "total": 100,
        }
        response = self.client.post("/api/v1/transactions/ingest/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_request_rejected(self):
        unauth_client = APIClient()
        payload = {
            "store_id": "STR001",
            "invoice_number": "INV-UNAUTH",
            "transaction_date": "2026-08-12T14:00:00Z",
            "items": [{"name": "Item", "quantity": 1, "unit_price": 100, "discount": 0, "tax": 0, "total": 100}],
            "subtotal": 100, "discount": 0, "tax": 0, "total": 100,
        }
        response = unauth_client.post("/api/v1/transactions/ingest/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_api_key_authentication_successful(self):
        from apps.integrations.models import Integration
        Integration.objects.create(
            organization=self.org,
            name="POS Integration",
            integration_type="custom_pos",
            api_key="POS_SECRET_API_KEY_123",
            is_active=True,
        )

        api_client = APIClient()
        api_client.credentials(HTTP_X_API_KEY="POS_SECRET_API_KEY_123")

        payload = {
            "store_id": "STR001",
            "invoice_number": f"INV-{uuid.uuid4().hex[:6].upper()}",
            "transaction_date": "2026-08-12T14:00:00Z",
            "customer": {"name": "API Key Customer", "phone": "9123456789"},
            "items": [{"name": "Item", "quantity": 2, "unit_price": 150, "discount": 0, "tax": 54, "total": 354}],
            "subtotal": 300, "discount": 0, "tax": 54, "total": 354,
        }
        response = api_client.post("/api/v1/transactions/ingest/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_financial_validation_mismatch_rejected(self):
        # Grand total is 500 but subtotal (100) + tax (18) = 118
        payload = {
            "store_id": "STR001",
            "invoice_number": "INV-TAMPER",
            "transaction_date": "2026-08-12T14:00:00Z",
            "items": [{"name": "Item", "quantity": 1, "unit_price": 100, "discount": 0, "tax": 18, "total": 118}],
            "subtotal": 100, "discount": 0, "tax": 18, "total": 500,
        }
        response = self.client.post("/api/v1/transactions/ingest/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("total", response.data)

    def test_multiple_transactions_with_blank_external_id_allowed(self):
        # Verify that multiple transactions without external_transaction_id do NOT crash or collide
        payload1 = {
            "store_id": "STR001",
            "invoice_number": f"INV-BLANK-1-{uuid.uuid4().hex[:4]}",
            "transaction_date": "2026-08-12T14:00:00Z",
            "customer": {"name": "Walkin 1", "phone": "9999900001"},
            "items": [{"name": "Item", "quantity": 1, "unit_price": 100, "discount": 0, "tax": 0, "total": 100}],
            "subtotal": 100, "discount": 0, "tax": 0, "total": 100,
            "external_transaction_id": "",
        }
        res1 = self.client.post("/api/v1/transactions/ingest/", payload1, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        payload2 = {
            "store_id": "STR001",
            "invoice_number": f"INV-BLANK-2-{uuid.uuid4().hex[:4]}",
            "transaction_date": "2026-08-12T14:05:00Z",
            "customer": {"name": "Walkin 2", "phone": "9999900002"},
            "items": [{"name": "Item", "quantity": 1, "unit_price": 100, "discount": 0, "tax": 0, "total": 100}],
            "subtotal": 100, "discount": 0, "tax": 0, "total": 100,
            "external_transaction_id": "",
        }
        res2 = self.client.post("/api/v1/transactions/ingest/", payload2, format="json")
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(res1.data["id"], res2.data["id"])
