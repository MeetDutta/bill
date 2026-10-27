import pytest
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient
from apps.organizations.models import Organization
from apps.users.models import User
from apps.stores.models import Store
from apps.customers.models import Customer
from apps.products.models import Product
from apps.invoices.models import Quotation, QuotationItem, Invoice
from apps.transactions.models import Transaction, TransactionPayment
from apps.billing.models import BusinessConfig


@pytest.fixture
def quotation_env(db):
    org = Organization.objects.create(name="Apex Retail Pvt Ltd", currency="INR", gst_number="27AABCU9603R1ZM")
    config = BusinessConfig.objects.create(
        organization=org,
        allow_credit_sales=True,
        allow_negative_stock=False,
        invoice_prefix="INV-TEST",
    )
    store = Store.objects.create(organization=org, name="Main Outlet", code="OUT1")

    admin_user = User.objects.create_user(
        email="admin@apex.local",
        password="password123",
        first_name="Admin",
        last_name="Owner",
        role="org_admin",
        organization=org,
    )

    staff_user = User.objects.create_user(
        email="cashier@apex.local",
        password="password123",
        first_name="Ramesh",
        last_name="Cashier",
        role="staff",
        organization=org,
    )

    customer = Customer.objects.create(
        organization=org,
        first_name="Rajesh",
        last_name="Kumar",
        phone="9820011223",
        email="rajesh@example.com",
        credit_limit=Decimal("10000.00"),
        outstanding_credit=Decimal("0.00"),
        is_walk_in=False,
    )

    product = Product.objects.create(
        organization=org,
        external_id="PRD-100",
        name="Premium Wireless Headphones",
        unit_price=Decimal("2000.00"),
        cost_price=Decimal("1400.00"),
        selling_price=Decimal("2000.00"),
        current_stock=Decimal("10.00"),
        track_inventory=True,
        tax_rate=Decimal("18.00"),
    )

    admin_client = APIClient()
    admin_client.force_authenticate(user=admin_user)

    staff_client = APIClient()
    staff_client.force_authenticate(user=staff_user)

    return {
        "org": org,
        "config": config,
        "store": store,
        "admin_user": admin_user,
        "staff_user": staff_user,
        "customer": customer,
        "product": product,
        "admin_client": admin_client,
        "staff_client": staff_client,
    }


@pytest.mark.django_db
class TestQuotationPaymentAndConversion:
    def _create_quotation(self, org, store, customer, product, qty=Decimal("1.00"), unit_price=Decimal("2000.00"), tax_rate=Decimal("18.00")):
        subtotal = unit_price * qty
        tax = (subtotal * tax_rate) / Decimal("100.00")
        total = subtotal + tax

        quote = Quotation.objects.create(
            organization=org,
            store=store,
            customer=customer,
            quotation_number=f"QT-{timezone.now().strftime('%Y%m%d%H%M%S')}-{product.id}",
            quotation_date=timezone.now().date(),
            subtotal=subtotal,
            discount=Decimal("0.00"),
            tax=tax,
            total=total,
            status="draft",
        )

        QuotationItem.objects.create(
            quotation=quote,
            product=product,
            name=product.name,
            quantity=qty,
            unit_price=unit_price,
            discount=Decimal("0.00"),
            tax_rate=tax_rate,
            tax=tax,
            total=total,
        )
        return quote

    def test_single_payment_cash_conversion(self, quotation_env):
        env = quotation_env
        quote = self._create_quotation(env["org"], env["store"], env["customer"], env["product"])

        init_stock = env["product"].current_stock
        url = f"/api/v1/invoices/quotations/{quote.id}/convert/"
        payload = {"payment_method": "cash"}

        res = env["admin_client"].post(url, payload, format="json")
        assert res.status_code == 201
        data = res.json()
        assert "invoice_id" in data
        assert "invoice_number" in data
        assert Decimal(data["total"]) == quote.total

        quote.refresh_from_db()
        assert quote.status == "converted"
        assert quote.converted_invoice is not None
        assert quote.converted_invoice.invoice_number == data["invoice_number"]

        # Inventory deduction verified
        env["product"].refresh_from_db()
        assert env["product"].current_stock == init_stock - Decimal("1.00")

    def test_split_payment_conversion(self, quotation_env):
        env = quotation_env
        quote = self._create_quotation(env["org"], env["store"], env["customer"], env["product"])

        total = quote.total  # 2360.00
        cash_part = Decimal("1000.00")
        upi_part = total - cash_part  # 1360.00

        url = f"/api/v1/invoices/quotations/{quote.id}/convert/"
        payload = {
            "payments": [
                {"payment_method": "cash", "amount": str(cash_part)},
                {"payment_method": "upi", "amount": str(upi_part), "reference": "UPI987654321"},
            ]
        }

        res = env["admin_client"].post(url, payload, format="json")
        assert res.status_code == 201

        quote.refresh_from_db()
        invoice = quote.converted_invoice
        tx = invoice.transaction

        # Check transaction payments
        tx_payments = TransactionPayment.objects.filter(transaction=tx)
        assert tx_payments.count() == 2
        methods = {p.payment_method: p.amount for p in tx_payments}
        assert methods["cash"] == cash_part
        assert methods["upi"] == upi_part
        assert tx.payment_status == "paid"

    def test_idempotent_duplicate_pay_click(self, quotation_env):
        env = quotation_env
        quote = self._create_quotation(env["org"], env["store"], env["customer"], env["product"])

        url = f"/api/v1/invoices/quotations/{quote.id}/convert/"
        payload = {"payment_method": "cash"}
        headers = {"HTTP_IDEMPOTENCY_KEY": "idemp-pay-key-99"}

        # First click with Idempotency-Key
        res1 = env["admin_client"].post(url, payload, format="json", **headers)
        assert res1.status_code == 201
        inv_id = res1.json()["invoice_id"]

        # Duplicate click with same Idempotency-Key -> returns HTTP 200 replay with existing invoice
        res2 = env["admin_client"].post(url, payload, format="json", **headers)
        assert res2.status_code == 200
        assert res2.json()["invoice_id"] == inv_id

        # Non-idempotent attempt to convert already converted quotation -> returns HTTP 400
        res3 = env["admin_client"].post(url, payload, format="json")
        assert res3.status_code == 400
        assert "already been converted" in res3.json().get("error", "").lower()

    def test_cancelled_quotation_cannot_be_converted(self, quotation_env):
        env = quotation_env
        quote = self._create_quotation(env["org"], env["store"], env["customer"], env["product"])
        quote.status = "cancelled"
        quote.save(update_fields=["status"])

        url = f"/api/v1/invoices/quotations/{quote.id}/convert/"
        res = env["admin_client"].post(url, {"payment_method": "cash"}, format="json")
        assert res.status_code == 400
        assert "Cancelled" in res.json().get("error", "")

    def test_empty_quotation_rejected(self, quotation_env):
        env = quotation_env
        quote = Quotation.objects.create(
            organization=env["org"],
            store=env["store"],
            quotation_number="QT-EMPTY-001",
            total=Decimal("0.00"),
            status="draft",
        )

        url = f"/api/v1/invoices/quotations/{quote.id}/convert/"
        res = env["admin_client"].post(url, {"payment_method": "cash"}, format="json")
        assert res.status_code == 400
        assert "no line items" in res.json().get("error", "").lower()

    def test_nonexistent_quotation_returns_404(self, quotation_env):
        env = quotation_env
        url = "/api/v1/invoices/quotations/999999/convert/"
        res = env["admin_client"].post(url, {"payment_method": "cash"}, format="json")
        assert res.status_code == 404

    def test_insufficient_stock_rollback(self, quotation_env):
        env = quotation_env
        prod = env["product"]
        prod.current_stock = Decimal("0.00")
        prod.save(update_fields=["current_stock"])

        quote = self._create_quotation(env["org"], env["store"], env["customer"], prod)

        url = f"/api/v1/invoices/quotations/{quote.id}/convert/"
        res = env["admin_client"].post(url, {"payment_method": "cash"}, format="json")
        assert res.status_code == 400
        data = res.json()
        assert "insufficient stock" in data.get("error", "").lower()

        # Atomic rollback verification
        quote.refresh_from_db()
        assert quote.status == "draft"
        assert quote.converted_invoice is None
        assert not Invoice.objects.filter(transaction__external_source="quotation", transaction__notes__contains=quote.quotation_number).exists()

    def test_safe_store_fallback_when_store_is_none(self, quotation_env):
        env = quotation_env
        # Create quote without a store
        quote = self._create_quotation(env["org"], None, env["customer"], env["product"])
        assert quote.store is None

        url = f"/api/v1/invoices/quotations/{quote.id}/convert/"
        res = env["admin_client"].post(url, {"payment_method": "cash"}, format="json")
        assert res.status_code == 201

        quote.refresh_from_db()
        assert quote.status == "converted"
        assert quote.store is not None
        assert quote.converted_invoice.transaction.store is not None

    def test_pos_checkout_with_quotation_converts_quote(self, quotation_env):
        env = quotation_env
        quote = self._create_quotation(env["org"], env["store"], env["customer"], env["product"])

        checkout_payload = {
            "store_id": str(env["store"].id),
            "quotation_number": quote.quotation_number,
            "items": [
                {
                    "product_id": str(env["product"].id),
                    "name": env["product"].name,
                    "quantity": 1,
                    "unit_price": str(env["product"].selling_price),
                    "tax_rate": "18.00",
                }
            ],
            "payments": [
                {"payment_method": "cash", "amount": str(quote.total)}
            ],
        }

        res = env["admin_client"].post("/api/v1/pos/checkout/", checkout_payload, format="json")
        assert res.status_code == 201

        quote.refresh_from_db()
        assert quote.status == "converted"
        assert quote.converted_invoice is not None


@pytest.mark.django_db
class TestStaffDashboardAndRBACVerification:
    def test_staff_overview_access(self, quotation_env):
        env = quotation_env
        res = env["staff_client"].get("/api/v1/pos/staff/overview/")
        assert res.status_code == 200
        data = res.json()
        assert data["staff"]["name"] == "Ramesh Cashier"
        assert "metrics" in data
        assert "today_sales" in data["metrics"]

    def test_staff_invoices_access(self, quotation_env):
        env = quotation_env
        res = env["staff_client"].get("/api/v1/pos/staff/invoices/")
        assert res.status_code == 200
        data = res.json()
        assert "results" in data

    def test_staff_quotations_access(self, quotation_env):
        env = quotation_env
        res = env["staff_client"].get("/api/v1/pos/staff/quotations/")
        assert res.status_code == 200
        data = res.json()
        assert "results" in data

    def test_staff_sales_profile_access(self, quotation_env):
        env = quotation_env
        res = env["staff_client"].get("/api/v1/pos/staff/sales-profile/")
        assert res.status_code == 200
        data = res.json()
        assert data["staff"]["name"] == "Ramesh Cashier"
        assert "today" in data
        assert "range_summary" in data

    def test_staff_blocked_from_admin_sales_breakdown(self, quotation_env):
        env = quotation_env
        res = env["staff_client"].get("/api/v1/pos/admin/staff-sales/")
        assert res.status_code == 403

    def test_staff_blocked_from_analytics_dashboard(self, quotation_env):
        env = quotation_env
        res = env["staff_client"].get("/api/v1/analytics/dashboard/")
        assert res.status_code == 403

    def test_staff_blocked_from_whatsapp_config(self, quotation_env):
        env = quotation_env
        res = env["staff_client"].get("/api/v1/whatsapp/config/")
        assert res.status_code == 403

    def test_tenant_isolation_staff_cannot_access_other_org_quotation(self, quotation_env):
        env = quotation_env
        # Org 2
        other_org = Organization.objects.create(name="Other Corp", currency="INR")
        other_quote = Quotation.objects.create(
            organization=other_org,
            quotation_number="QT-OTHER-999",
            total=Decimal("500.00"),
            status="draft",
        )

        # Staff of Apex tries to convert Other Corp's quotation
        url = f"/api/v1/invoices/quotations/{other_quote.id}/convert/"
        res = env["staff_client"].post(url, {"payment_method": "cash"}, format="json")
        assert res.status_code == 404
