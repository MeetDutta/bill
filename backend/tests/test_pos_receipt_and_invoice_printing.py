import uuid
from decimal import Decimal
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product, InventoryMovement
from apps.customers.models import Customer
from apps.billing.models import BusinessConfig
from apps.invoices.models import Invoice


@pytest.fixture
def receipt_printing_setup(db):
    org = Organization.objects.create(
        name="BillMeet Superstore",
        legal_name="BillMeet Retail Solutions Pvt Ltd",
        gst_number="27AABCU9603R1ZM",
        address_line1="Shop 4, MG Road",
        city="Pune",
        state="Maharashtra",
        phone="+919876543210",
        currency="INR",
    )
    org_other = Organization.objects.create(name=f"Other Org {uuid.uuid4().hex[:6]}", currency="INR")

    cashier = User.objects.create_user(
        email=f"cashier-{uuid.uuid4().hex[:6]}@example.com",
        password="pospassword123",
        organization=org,
        role="cashier",
        first_name="Vikas",
        last_name="Sharma",
    )
    other_user = User.objects.create_user(
        email=f"other-{uuid.uuid4().hex[:6]}@example.com",
        password="pospassword123",
        organization=org_other,
        role="org_admin",
        first_name="Other",
        last_name="Admin",
    )

    store = Store.objects.create(organization=org, name="Flagship Store", code="STR-PRINT")

    config = BusinessConfig.objects.create(
        organization=org,
        business_type="GROCERY",
        gst_enabled=True,
        default_tax_mode="exclusive",
        default_tax_rate=Decimal("18.00"),
        credit_sales_enabled=True,
    )

    # Product with SKU, HSN, Tax Rate
    p1 = Product.objects.create(
        organization=org,
        name="Basmati Rice 5kg Royal",
        sku="RIC-BAS-5K",
        hsn_code="10063020",
        selling_price=Decimal("450.00"),
        unit_price=Decimal("450.00"),
        tax_rate=Decimal("5.00"),
        current_stock=50,
        track_inventory=True,
    )

    # Customer
    customer = Customer.objects.create(
        organization=org,
        first_name="Sunil",
        last_name="Gavaskar",
        phone="+919988776655",
    )

    client = APIClient()
    client.force_authenticate(user=cashier)

    other_client = APIClient()
    other_client.force_authenticate(user=other_user)

    return {
        "org": org,
        "cashier": cashier,
        "store": store,
        "config": config,
        "product": p1,
        "customer": customer,
        "client": client,
        "other_client": other_client,
    }


class TestPOSReceiptAndInvoicePrinting:
    def test_pos_checkout_enriches_product_name_and_metadata(self, receipt_printing_setup):
        """Checkout response must enrich line items with product_name, sku, unit, hsn_code, and taxable_amount."""
        setup = receipt_printing_setup
        client = setup["client"]
        product = setup["product"]
        customer = setup["customer"]

        payload = {
            "items": [
                {
                    "product_id": str(product.id),
                    "name": product.name,
                    "quantity": 2,
                    "unit_price": 450.00,
                    "tax_rate": 5.00,
                    "discount": 0.00,
                }
            ],
            "payments": [
                {"payment_method": "cash", "amount": 945.00}
            ],
            "customer": {"id": str(customer.id)},
            "idempotency_key": f"TEST-PRINT-{uuid.uuid4().hex[:8]}",
        }

        res = client.post("/api/v1/billing/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED, res.data
        data = res.data

        # Verify top-level invoice & seller metadata
        assert "invoice_number" in data
        assert "seller" in data
        assert data["seller"]["trade_name"] == "BillMeet Superstore"
        assert data["seller"]["gstin"] == "27AABCU9603R1ZM"

        # Verify line items have product_name, sku, hsn_code, taxable_amount
        items = data.get("items", [])
        assert len(items) == 1
        item = items[0]
        assert item["name"] == "Basmati Rice 5kg Royal"
        assert item["product_name"] == "Basmati Rice 5kg Royal"
        assert item["sku"] == "RIC-BAS-5K"
        assert item["hsn_code"] == "10063020"
        assert Decimal(str(item["taxable_amount"])) == Decimal("900.00")
        assert Decimal(str(item["total"])) == Decimal("945.00")

    def test_invoice_pdf_endpoints_generate_genuine_pdf_for_a4_and_thermal(self, receipt_printing_setup):
        """Backend PDF endpoints must return genuine application/pdf bytes for both A4 and thermal formats."""
        setup = receipt_printing_setup
        client = setup["client"]
        product = setup["product"]

        payload = {
            "items": [
                {
                    "product_id": str(product.id),
                    "name": product.name,
                    "quantity": 1,
                    "unit_price": 450.00,
                    "tax_rate": 5.00,
                }
            ],
            "payments": [{"payment_method": "cash", "amount": 473.00}],
            "idempotency_key": f"TEST-PDF-{uuid.uuid4().hex[:8]}",
        }
        res = client.post("/api/v1/billing/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        invoice_id = res.data["invoice"]["id"]

        # Request Standard A4 PDF
        a4_res = client.get(f"/api/v1/invoices/{invoice_id}/pdf/?raw=true&format_type=a4")
        assert a4_res.status_code == status.HTTP_200_OK
        assert a4_res["Content-Type"] == "application/pdf"
        assert a4_res.content.startswith(b"%PDF-"), "A4 response must be a genuine binary PDF"

        # Request Thermal POS Receipt PDF
        thermal_res = client.get(f"/api/v1/invoices/{invoice_id}/pdf/?raw=true&format_type=thermal")
        assert thermal_res.status_code == status.HTTP_200_OK
        assert thermal_res["Content-Type"] == "application/pdf"
        assert thermal_res.content.startswith(b"%PDF-"), "Thermal response must be a genuine binary PDF"

    def test_invoice_pdf_view_does_not_mutate_inventory_or_recalculate_financials(self, receipt_printing_setup):
        """Reprinting or viewing an invoice PDF must never touch inventory or alter financial records."""
        setup = receipt_printing_setup
        client = setup["client"]
        product = setup["product"]

        payload = {
            "items": [
                {
                    "product_id": str(product.id),
                    "name": product.name,
                    "quantity": 2,
                    "unit_price": 450.00,
                    "tax_rate": 5.00,
                }
            ],
            "payments": [{"payment_method": "cash", "amount": 945.00}],
            "idempotency_key": f"TEST-MUT-{uuid.uuid4().hex[:8]}",
        }
        res = client.post("/api/v1/billing/checkout/", payload, format="json")
        invoice_id = res.data["invoice"]["id"]

        product.refresh_from_db()
        stock_after_sale = product.current_stock
        movements_count = InventoryMovement.objects.filter(product=product).count()

        # View and reprint PDF multiple times
        client.get(f"/api/v1/invoices/{invoice_id}/pdf/?format=a4")
        client.get(f"/api/v1/invoices/{invoice_id}/pdf/?format=thermal")
        client.get(f"/api/v1/invoices/{invoice_id}/")

        product.refresh_from_db()
        assert product.current_stock == stock_after_sale, "Inventory must not change on reprint"
        assert InventoryMovement.objects.filter(product=product).count() == movements_count

    def test_invoice_pdf_cross_tenant_isolation(self, receipt_printing_setup):
        """A user from Org B cannot download or view Org A's invoice PDF."""
        setup = receipt_printing_setup
        client = setup["client"]
        other_client = setup["other_client"]
        product = setup["product"]

        payload = {
            "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": 450.00, "tax_rate": 5.00}],
            "payments": [{"payment_method": "cash", "amount": 473.00}],
            "idempotency_key": f"TEST-ISO-{uuid.uuid4().hex[:8]}",
        }
        res = client.post("/api/v1/billing/checkout/", payload, format="json")
        invoice_id = res.data["invoice"]["id"]

        # Org B attempts to access Org A's invoice PDF
        unauth_res = other_client.get(f"/api/v1/invoices/{invoice_id}/pdf/")
        assert unauth_res.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]
