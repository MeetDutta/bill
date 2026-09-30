import uuid
from decimal import Decimal
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.invoices.models import Invoice
from apps.invoices.tasks import generate_invoice_task
from apps.transactions.models import Transaction, TransactionItem
from tests.factories import CustomerFactory, OrganizationFactory, StoreFactory, UserFactory


class InvoicePipelineTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory()
        self.user = UserFactory(organization=self.org)
        self.store = StoreFactory(organization=self.org, code="STR100")
        self.customer = CustomerFactory(organization=self.org, phone="9876543210")

        self.tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            customer=self.customer,
            invoice_number=f"INV-{uuid.uuid4().hex[:6].upper()}",
            transaction_date="2026-09-30T12:00:00Z",
            subtotal=Decimal("1000.00"),
            discount=Decimal("100.00"),
            tax=Decimal("180.00"),
            total=Decimal("1080.00"),
            payment_method="UPI",
        )
        TransactionItem.objects.create(
            transaction=self.tx,
            name="Premium Shirt",
            quantity=Decimal("2"),
            unit_price=Decimal("500.00"),
            discount=Decimal("100.00"),
            tax=Decimal("180.00"),
            total=Decimal("1080.00"),
        )

    def test_generate_invoice_task_creates_invoice_and_secure_token(self):
        result = generate_invoice_task(str(self.tx.id))
        self.assertIn("invoice_id", result)
        self.assertIn("secure_token", result)

        invoice = Invoice.objects.get(id=result["invoice_id"])
        self.assertEqual(invoice.transaction, self.tx)
        self.assertEqual(invoice.organization, self.org)
        self.assertTrue(len(invoice.secure_token) >= 20)
        self.assertEqual(invoice.web_url, f"/bills/{invoice.secure_token}")

    def test_generate_invoice_task_is_idempotent(self):
        result1 = generate_invoice_task(str(self.tx.id))
        result2 = generate_invoice_task(str(self.tx.id))
        self.assertEqual(result1["invoice_id"], result2["invoice_id"])
        self.assertEqual(Invoice.objects.filter(transaction=self.tx).count(), 1)

    def test_public_invoice_view_accessible_without_auth(self):
        result = generate_invoice_task(str(self.tx.id))
        token = result["secure_token"]

        # Ensure unauthenticated client can retrieve public bill
        unauth_client = APIClient()
        response = unauth_client.get(f"/api/v1/invoices/view/{token}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertIn("invoice_number", data)
        self.assertIn("business", data)
        self.assertEqual(data["business"]["name"], self.org.name)
        self.assertIn("store", data)
        self.assertEqual(data["store"]["name"], self.store.name)
        self.assertIn("customer", data)
        self.assertEqual(data["customer"]["phone"], "9876543210")
        self.assertIn("items", data)
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["name"], "Premium Shirt")
        self.assertEqual(data["total"], "1080.00")
        self.assertEqual(data["payment_method"], "UPI")

        # Verify is_viewed was marked True
        invoice = Invoice.objects.get(secure_token=token)
        self.assertTrue(invoice.is_viewed)
        self.assertIsNotNone(invoice.viewed_at)

    def test_public_invoice_view_invalid_token_returns_404(self):
        unauth_client = APIClient()
        response = unauth_client.get("/api/v1/invoices/view/invalid-nonexistent-token/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
