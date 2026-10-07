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

    def test_invoice_list_and_detail_management(self):
        generate_invoice_task(str(self.tx.id))
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/api/v1/invoices/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertTrue(len(results) >= 1)
        inv_item = results[0]
        self.assertIn("invoice_number", inv_item)
        self.assertIn("total", inv_item)
        self.assertIn("customer_name", inv_item)

        # Detail view
        inv_id = inv_item["id"]
        detail_resp = self.client.get(f"/api/v1/invoices/{inv_id}/")
        self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_resp.data["invoice_number"], inv_item["invoice_number"])

    def test_quotation_creation_and_conversion_pipeline(self):
        from apps.products.models import Product
        product = Product.objects.create(
            organization=self.org,
            name="Wireless Mouse",
            selling_price=Decimal("500.00"),
            purchase_price=Decimal("300.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("20.00"),
            track_inventory=True,
        )

        self.client.force_authenticate(user=self.user)

        # 1. Create Quotation
        payload = {
            "customer_id": str(self.customer.id),
            "items": [
                {
                    "product_id": str(product.id),
                    "name": "Wireless Mouse",
                    "quantity": 2,
                    "unit_price": 500.00,
                    "discount": 50.00,
                    "tax_rate": 18.00,
                }
            ],
            "notes": "Valid for 15 days",
        }
        create_resp = self.client.post("/api/v1/quotations/", payload, format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        quote_id = create_resp.data["id"]
        self.assertEqual(create_resp.data["status"], "draft")
        self.assertIn("QT-", create_resp.data["quotation_number"])

        # 2. List Quotations
        list_resp = self.client.get("/api/v1/quotations/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)

        # 3. Convert Quotation to Invoice
        convert_resp = self.client.post(
            f"/api/v1/quotations/{quote_id}/convert/",
            {"payment_method": "upi"},
            format="json",
        )
        self.assertEqual(convert_resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("invoice_id", convert_resp.data)
        self.assertIn("invoice_number", convert_resp.data)

        # Product inventory should be deducted by 2
        product.refresh_from_db()
        self.assertEqual(product.current_stock, Decimal("18.00"))

        # 4. Check quotation status is converted
        detail_resp = self.client.get(f"/api/v1/quotations/{quote_id}/")
        self.assertEqual(detail_resp.data["status"], "converted")
        self.assertEqual(detail_resp.data["converted_invoice_number"], convert_resp.data["invoice_number"])

        # 5. Prevent duplicate conversion
        duplicate_resp = self.client.post(
            f"/api/v1/quotations/{quote_id}/convert/",
            {"payment_method": "cash"},
            format="json",
        )
        self.assertEqual(duplicate_resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_supplier_management_and_purchase_orders(self):
        from apps.products.models import Supplier, Product
        self.client.force_authenticate(user=self.user)

        # 1. Create Supplier
        sup_resp = self.client.post(
            "/api/v1/suppliers/",
            {
                "name": "Apex Electronics Ltd",
                "contact_person": "Vikram Mehta",
                "phone": "9123456780",
                "email": "apex@example.com",
                "gstin": "27AAAAA0000A1Z5",
            },
            format="json",
        )
        self.assertEqual(sup_resp.status_code, status.HTTP_201_CREATED)
        sup_id = sup_resp.data["id"]
        self.assertEqual(sup_resp.data["name"], "Apex Electronics Ltd")

        # 2. Record Purchase with this Supplier
        prod = Product.objects.create(
            organization=self.org,
            name="Mechanical Keyboard",
            selling_price=Decimal("2000.00"),
            purchase_price=Decimal("1200.00"),
            current_stock=Decimal("5.00"),
            track_inventory=True,
        )

        po_resp = self.client.post(
            "/api/v1/pos/inventory/purchases/",
            {
                "supplier_id": sup_id,
                "supplier_invoice_number": "APEX-INV-101",
                "purchase_date": "2026-10-01",
                "items": [
                    {
                        "product_id": str(prod.id),
                        "quantity": 10,
                        "purchase_price": 1200.00,
                        "tax_rate": 18.00,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(po_resp.status_code, status.HTTP_201_CREATED)

        # Stock should increase from 5 to 15
        prod.refresh_from_db()
        self.assertEqual(prod.current_stock, Decimal("15.00"))

        # Check supplier purchases list
        sup_purchases = self.client.get(f"/api/v1/suppliers/{sup_id}/purchases/")
        self.assertEqual(sup_purchases.status_code, status.HTTP_200_OK)
        results = sup_purchases.data.get("results", sup_purchases.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["supplier_name"], "Apex Electronics Ltd")
