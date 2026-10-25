import uuid
from decimal import Decimal
import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product, InventoryMovement
from apps.customers.models import Customer
from apps.billing.models import BusinessConfig
from apps.transactions.models import Transaction, TransactionPayment
from apps.invoices.models import Invoice, Quotation, QuotationItem
from apps.billing.services.checkout_service import CheckoutService
from apps.invoices.pdf import generate_invoice_pdf_bytes, generate_invoice_pdf


@pytest.fixture
def v3_env(db):
    org_a = Organization.objects.create(name=f"V3 Org A {uuid.uuid4().hex[:6]}", currency="INR", gst_number="27AABCV1234F1Z5")
    store_a = Store.objects.create(organization=org_a, name="Store A", code=f"STA-{uuid.uuid4().hex[:4].upper()}")

    org_b = Organization.objects.create(name=f"V3 Org B {uuid.uuid4().hex[:6]}", currency="INR")
    store_b = Store.objects.create(organization=org_b, name="Store B", code=f"STB-{uuid.uuid4().hex[:4].upper()}")

    admin_a = User.objects.create_user(
        email=f"admin-{uuid.uuid4().hex[:6]}@v3.com",
        password="password123",
        organization=org_a,
        role="org_admin",
        first_name="Admin",
        last_name="One",
    )

    cashier_a1 = User.objects.create_user(
        email=f"cashier1-{uuid.uuid4().hex[:6]}@v3.com",
        password="password123",
        organization=org_a,
        role="cashier",
        first_name="Ravi",
        last_name="Kumar",
    )

    cashier_a2 = User.objects.create_user(
        email=f"cashier2-{uuid.uuid4().hex[:6]}@v3.com",
        password="password123",
        organization=org_a,
        role="cashier",
        first_name="Pooja",
        last_name="Sharma",
    )

    cashier_b = User.objects.create_user(
        email=f"cashierb-{uuid.uuid4().hex[:6]}@v3b.com",
        password="password123",
        organization=org_b,
        role="cashier",
        first_name="External",
        last_name="User",
    )

    prod1 = Product.objects.create(
        organization=org_a,
        name="Basmati Rice 5kg",
        sku="RICE-05",
        selling_price=Decimal("450.00"),
        purchase_price=Decimal("350.00"),
        current_stock=Decimal("100.00"),
        track_inventory=True,
        tax_rate=Decimal("5.00"),
    )

    prod2 = Product.objects.create(
        organization=org_a,
        name="Sunflower Oil 1L",
        sku="OIL-01",
        selling_price=Decimal("150.00"),
        purchase_price=Decimal("120.00"),
        current_stock=Decimal("50.00"),
        track_inventory=True,
        tax_rate=Decimal("5.00"),
    )

    customer_a = Customer.objects.create(
        organization=org_a,
        first_name="Amit",
        last_name="Patel",
        phone="9876543210",
        credit_limit=Decimal("5000.00"),
    )

    client = APIClient()

    return {
        "org_a": org_a,
        "store_a": store_a,
        "org_b": org_b,
        "store_b": store_b,
        "admin_a": admin_a,
        "cashier_a1": cashier_a1,
        "cashier_a2": cashier_a2,
        "cashier_b": cashier_b,
        "prod1": prod1,
        "prod2": prod2,
        "customer_a": customer_a,
        "client": client,
    }


# ============================================================================
# MODULE 1 TESTS: STAFF DASHBOARD & ROLE-PROTECTED ACCESS
# ============================================================================

def test_staff_dashboard_overview_scoped_to_authenticated_creator(v3_env):
    """Staff dashboard reflects only transactions created by the authenticated cashier."""
    client = v3_env["client"]
    cashier1 = v3_env["cashier_a1"]
    cashier2 = v3_env["cashier_a2"]
    org = v3_env["org_a"]
    store = v3_env["store_a"]
    prod = v3_env["prod1"]

    # Cashier 1 performs a sale
    cart1 = {
        "items": [{"product_id": str(prod.id), "quantity": 2, "unit_price": 450.00}],
        "payments": [{"payment_method": "cash", "amount": 945.00}],
    }
    res1 = CheckoutService.process_checkout(org, store, cashier1, cart1)
    assert res1["payment_status"] == "paid"

    # Authenticate as Cashier 1
    client.force_authenticate(user=cashier1)
    resp1 = client.get("/api/v1/billing/staff/overview/")
    assert resp1.status_code == status.HTTP_200_OK
    data1 = resp1.json()
    assert data1["staff"]["id"] == str(cashier1.id)
    assert data1["metrics"]["today_bills_count"] == 1
    assert data1["metrics"]["today_sales"] == 945.00
    assert data1["metrics"]["today_collected"] == 945.00
    assert len(data1["recent_bills"]) == 1

    # Authenticate as Cashier 2: Must see 0 sales
    client.force_authenticate(user=cashier2)
    resp2 = client.get("/api/v1/billing/staff/overview/")
    assert resp2.status_code == status.HTTP_200_OK
    data2 = resp2.json()
    assert data2["staff"]["id"] == str(cashier2.id)
    assert data2["metrics"]["today_bills_count"] == 0
    assert data2["metrics"]["today_sales"] == 0.00
    assert data2["metrics"]["today_collected"] == 0.00
    assert len(data2["recent_bills"]) == 0


def test_staff_invoices_and_pdf_cross_access_rejection(v3_env):
    """A cashier cannot access another cashier's restricted invoices or PDFs."""
    client = v3_env["client"]
    cashier1 = v3_env["cashier_a1"]
    cashier2 = v3_env["cashier_a2"]
    org = v3_env["org_a"]
    store = v3_env["store_a"]
    prod = v3_env["prod1"]

    # Cashier 1 generates an invoice
    cart = {
        "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 450.00}],
        "payments": [{"payment_method": "upi", "amount": 473.00}],
    }
    tx_data = CheckoutService.process_checkout(org, store, cashier1, cart)
    invoice_id = tx_data["invoice"]["id"]

    # Cashier 1 can access own invoice PDF
    client.force_authenticate(user=cashier1)
    resp_owner = client.get(f"/api/v1/invoices/{invoice_id}/pdf/?download=true")
    assert resp_owner.status_code == status.HTTP_200_OK
    assert resp_owner["Content-Type"] == "application/pdf"
    assert resp_owner.content.startswith(b"%PDF-")

    # Cashier 2 attempts to access Cashier 1's invoice PDF: REJECTED with 403 Forbidden
    client.force_authenticate(user=cashier2)
    resp_cross = client.get(f"/api/v1/invoices/{invoice_id}/pdf/?download=true")
    assert resp_cross.status_code == status.HTTP_403_FORBIDDEN

    # Cashier 2 lists staff invoices: Cashier 1's invoice must NOT appear
    resp_list = client.get("/api/v1/billing/staff/invoices/")
    assert resp_list.status_code == status.HTTP_200_OK
    resp_data = resp_list.json()
    items = resp_data.get("results", resp_data) if isinstance(resp_data, dict) else resp_data
    invoice_numbers = [inv["invoice_number"] for inv in items]
    assert tx_data["invoice_number"] not in invoice_numbers


def test_inactive_staff_account_access_rejected(v3_env):
    """Inactive staff accounts cannot access staff dashboard or billing endpoints."""
    client = v3_env["client"]
    cashier = v3_env["cashier_a1"]
    cashier.is_active = False
    cashier.save(update_fields=["is_active"])

    client.force_authenticate(user=cashier)
    resp = client.get("/api/v1/billing/staff/overview/")
    assert resp.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]


def test_staff_cannot_escalate_role_or_create_privileged_accounts(v3_env):
    """Staff cannot modify their own role or create privileged accounts."""
    client = v3_env["client"]
    cashier = v3_env["cashier_a1"]
    client.force_authenticate(user=cashier)

    # Attempt to self-escalate role
    patch_resp = client.patch(f"/api/v1/users/{cashier.id}/", {"role": "org_admin"})
    assert patch_resp.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN]

    # Attempt to create an admin account
    create_resp = client.post("/api/v1/users/create/", {
        "email": "hacker@test.com",
        "first_name": "Hacker",
        "role": "org_admin",
        "password": "password123",
    })
    assert create_resp.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]


# ============================================================================
# MODULE 2 TESTS: ADMIN-WIDE SALES & STAFF ATTRIBUTION
# ============================================================================

def test_admin_staff_sales_breakdown_server_side_aggregation(v3_env):
    """Admin staff breakdown aggregates sales, collections, credit, and handles legacy transactions."""
    client = v3_env["client"]
    admin = v3_env["admin_a"]
    cashier1 = v3_env["cashier_a1"]
    cashier2 = v3_env["cashier_a2"]
    org = v3_env["org_a"]
    store = v3_env["store_a"]
    prod = v3_env["prod1"]
    customer = v3_env["customer_a"]

    # 1. Sale by Cashier 1: Paid in Full (₹945)
    CheckoutService.process_checkout(
        org, store, cashier1,
        {"items": [{"product_id": str(prod.id), "quantity": 2, "unit_price": 450.00}],
         "payments": [{"payment_method": "cash", "amount": 945.00}]}
    )

    # 2. Sale by Cashier 2: Split Cash + Credit (₹472.50 cash, ₹472.50 credit)
    CheckoutService.process_checkout(
        org, store, cashier2,
        {"items": [{"product_id": str(prod.id), "quantity": 2, "unit_price": 450.00}],
         "customer_id": str(customer.id),
         "payments": [
             {"payment_method": "cash", "amount": 472.50},
             {"payment_method": "credit", "amount": 472.50},
         ]}
    )

    # 3. Legacy transaction with no cashier
    tx_legacy = Transaction.objects.create(
        organization=org,
        store=store,
        customer=customer,
        cashier=None,
        invoice_number="LEGACY-001",
        transaction_date=timezone.now(),
        subtotal=Decimal("300.00"),
        discount=Decimal("0.00"),
        tax=Decimal("15.00"),
        total=Decimal("315.00"),
        payment_method="cash",
        payment_status="paid",
        amount_paid=Decimal("315.00"),
        status="completed",
    )
    TransactionPayment.objects.create(
        organization=org,
        transaction=tx_legacy,
        payment_method="cash",
        amount=Decimal("315.00"),
        status="success",
    )

    # Admin requests staff sales breakdown
    client.force_authenticate(user=admin)
    resp = client.get("/api/v1/billing/admin/staff-sales/")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()

    summary = data["summary"]
    assert summary["completed_sales"] == 3
    assert Decimal(str(summary["gross_sales"])) == Decimal("2205.00")
    assert Decimal(str(summary["collected_amount"])) == Decimal("1732.50")
    assert Decimal(str(summary["outstanding_credit"])) == Decimal("472.50")

    breakdown = data["staff_breakdown"]
    names = [b["name"] for b in breakdown]
    assert "Ravi Kumar" in names
    assert "Pooja Sharma" in names
    assert "Unknown / Legacy" in names

    # CSV Export verification
    csv_resp = client.get("/api/v1/billing/admin/staff-sales/?export=csv")
    assert csv_resp.status_code == status.HTTP_200_OK
    assert "text/csv" in csv_resp["Content-Type"]
    assert b"Staff Name,Role,Completed Sales" in csv_resp.content

    # Cashier cannot access organization-wide breakdown
    client.force_authenticate(user=cashier1)
    forbidden_resp = client.get("/api/v1/billing/admin/staff-sales/")
    assert forbidden_resp.status_code == status.HTTP_403_FORBIDDEN


# ============================================================================
# MODULE 3 TESTS: PROFESSIONAL INVOICE PDF STREAMING & VERIFICATION
# ============================================================================

def test_invoice_pdf_pure_binary_generation_and_headers(v3_env):
    """PDF generation produces genuine %PDF- bytes without HTML fallbacks."""
    cashier = v3_env["cashier_a1"]
    org = v3_env["org_a"]
    store = v3_env["store_a"]
    prod = v3_env["prod1"]

    tx_data = CheckoutService.process_checkout(
        org, store, cashier,
        {"items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 450.00}],
         "payments": [{"payment_method": "cash", "amount": 473.00}]}
    )
    invoice = Invoice.objects.get(id=tx_data["invoice"]["id"])

    # Test pure binary generation
    pdf_bytes = generate_invoice_pdf_bytes(invoice, format_type="a4")
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 1000

    # Test thermal receipt binary generation
    thermal_bytes = generate_invoice_pdf_bytes(invoice, format_type="thermal")
    assert thermal_bytes.startswith(b"%PDF-")
    assert len(thermal_bytes) > 500

    # Test disk file generation returns a .pdf URL, never .html
    pdf_url = generate_invoice_pdf(invoice, format_type="a4")
    assert pdf_url.endswith(".pdf")
    assert not pdf_url.endswith(".html")


# ============================================================================
# MODULE 4 TESTS: QUOTATION PRICING & DIRECT CONVERSION WITH SPLIT PAYMENT
# ============================================================================

def test_quotation_authoritative_price_and_split_payment_conversion(v3_env):
    """Quotation respects selling price, does not deduct stock on draft, and deducts on conversion."""
    client = v3_env["client"]
    cashier = v3_env["cashier_a1"]
    org = v3_env["org_a"]
    prod = v3_env["prod1"]
    customer = v3_env["customer_a"]

    stock_initial = prod.current_stock

    client.force_authenticate(user=cashier)

    # 1. Create Quotation with manually edited price (₹420 instead of default ₹450)
    q_data = {
        "customer_id": str(customer.id),
        "valid_until": (timezone.now() + timezone.timedelta(days=15)).strftime("%Y-%m-%d"),
        "items": [{
            "product_id": str(prod.id),
            "quantity": 2,
            "unit_price": 420.00,
            "tax_rate": 5,
        }],
    }
    q_resp = client.post("/api/v1/quotations/", q_data, format="json")
    assert q_resp.status_code == status.HTTP_201_CREATED
    q_id = q_resp.json()["id"]

    # Stock must NOT be decremented on quotation creation
    prod.refresh_from_db()
    assert prod.current_stock == stock_initial

    # 2. Convert Quotation with Split Payment (Cash ₹400 + UPI ₹482)
    # Total: 2 * 420 = 840 + 5% tax (42) = 882.00
    conv_data = {
        "payments": [
            {"payment_method": "cash", "amount": 400.00},
            {"payment_method": "upi", "amount": 482.00},
        ]
    }
    conv_resp = client.post(f"/api/v1/quotations/{q_id}/convert/", conv_data, format="json")
    assert conv_resp.status_code == status.HTTP_201_CREATED
    conv_json = conv_resp.json()
    assert "invoice_id" in conv_json

    # Stock must now be decremented by exactly 2
    prod.refresh_from_db()
    assert prod.current_stock == stock_initial - Decimal("2.00")

    # Quotation status must be converted
    q_obj = Quotation.objects.get(id=q_id)
    assert q_obj.status == "converted"
    assert q_obj.converted_invoice is not None

    # Duplicate conversion must be rejected
    dup_resp = client.post(f"/api/v1/quotations/{q_id}/convert/", conv_data, format="json")
    assert dup_resp.status_code == status.HTTP_400_BAD_REQUEST
