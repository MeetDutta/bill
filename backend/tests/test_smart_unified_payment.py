import uuid
from decimal import Decimal
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product
from apps.customers.models import Customer
from apps.billing.models import BusinessConfig, CashRegister
from apps.billing.services.reports_service import ReportsService
from apps.transactions.models import Transaction, TransactionPayment
from apps.invoices.models import Invoice
from apps.invoices.pdf import generate_invoice_pdf_bytes


@pytest.fixture
def smart_pay_env(db):
    org = Organization.objects.create(
        name=f"SmartPay Org {uuid.uuid4().hex[:6]}",
        currency="INR",
        gst_number="27ABCDE1234F1Z5",
    )
    user = User.objects.create_user(
        email=f"cashier-sp-{uuid.uuid4().hex[:6]}@example.com",
        password="testpassword123",
        organization=org,
        role="cashier",
        first_name="Kiran",
        last_name="Joshi",
    )
    admin = User.objects.create_user(
        email=f"admin-sp-{uuid.uuid4().hex[:6]}@example.com",
        password="testpassword123",
        organization=org,
        role="org_admin",
        first_name="Admin",
        last_name="User",
    )
    store = Store.objects.create(
        organization=org,
        name="Main Branch",
        code=f"STR-{uuid.uuid4().hex[:4].upper()}",
        state="Maharashtra",
    )
    BusinessConfig.objects.create(
        organization=org,
        business_type="RETAIL",
        gst_enabled=True,
        default_tax_mode="exclusive",
        default_tax_rate=Decimal("0.00"),
        credit_sales_enabled=True,
        allow_negative_stock=False,
    )
    register = CashRegister.objects.create(
        organization=org,
        store=store,
        cashier=user,
        opening_cash=Decimal("1000.00"),
        expected_cash=Decimal("1000.00"),
        status="open",
    )
    # Tax-exempt simple item of ₹500 and ₹1000 so math stays crisp in test scenarios
    p500 = Product.objects.create(
        organization=org,
        external_id=f"P500-{uuid.uuid4().hex[:6]}",
        name="Test Item 500",
        sku=f"SKU500-{uuid.uuid4().hex[:4]}",
        unit_price=Decimal("500.00"),
        cost_price=Decimal("300.00"),
        tax_rate=Decimal("0.00"),
        current_stock=Decimal("100.00"),
        track_inventory=True,
    )
    customer = Customer.objects.create(
        organization=org,
        customer_id=f"CUST-{uuid.uuid4().hex[:5].upper()}",
        first_name="Meera",
        last_name="Kapoor",
        phone="9820012345",
        address_line1="42 Marine Drive",
        city="Mumbai",
        state="Maharashtra",
        postal_code="400020",
        credit_limit=Decimal("5000.00"),
        outstanding_credit=Decimal("0.00"),
        is_walk_in=False,
    )

    cashier_client = APIClient()
    cashier_client.force_authenticate(user=user)

    admin_client = APIClient()
    admin_client.force_authenticate(user=admin)

    return {
        "org": org,
        "store": store,
        "user": user,
        "admin": admin,
        "register": register,
        "p500": p500,
        "customer": customer,
        "client": cashier_client,
        "admin_client": admin_client,
    }


@pytest.mark.django_db
class TestSmartUnifiedPaymentSystem:
    CHECKOUT_URL = "/api/v1/pos/checkout/"

    def test_single_payment_modes_persist_cleanly(self, smart_pay_env):
        client = smart_pay_env["client"]
        store = smart_pay_env["store"]
        p500 = smart_pay_env["p500"]

        # ₹1,000 single UPI checkout
        res = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "is_walk_in": True,
                "items": [{"product_id": str(p500.id), "quantity": 2, "unit_price": "500.00"}],
                "payments": [{"payment_method": "upi", "amount": "1000.00", "reference": "UTR-990011"}],
                "idempotency_key": f"sp-single-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert data["payment_method"] == "upi"
        assert data["payment_status"] == "paid"
        assert Decimal(str(data["total"])) == Decimal("1000.00")
        assert Decimal(str(data["amount_paid"])) == Decimal("1000.00")
        assert Decimal(str(data["change_amount"])) == Decimal("0.00")

        tx = Transaction.objects.get(id=data["transaction_id"])
        assert tx.payments.count() == 1
        assert tx.payments.first().payment_method == "upi"
        assert tx.payments.first().reference == "UTR-990011"

    def test_two_way_and_three_way_unified_split_checkout(self, smart_pay_env):
        client = smart_pay_env["client"]
        store = smart_pay_env["store"]
        p500 = smart_pay_env["p500"]

        # 3 units @ 500 = ₹1,500 paid via Cash ₹500 + UPI ₹700 + Card ₹300
        res = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "is_walk_in": True,
                "items": [{"product_id": str(p500.id), "quantity": 3, "unit_price": "500.00"}],
                "payments": [
                    {"payment_method": "cash", "amount": "500.00"},
                    {"payment_method": "upi", "amount": "700.00", "reference": "UPI-SP-1"},
                    {"payment_method": "card", "amount": "300.00", "reference": "CARD-SP-2"},
                ],
                "idempotency_key": f"sp-3way-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert data["payment_method"] == "split"
        assert data["payment_status"] == "paid"
        assert Decimal(str(data["amount_paid"])) == Decimal("1500.00")

        tx = Transaction.objects.get(id=data["transaction_id"])
        allocs = {p.payment_method: p.amount for p in tx.payments.all()}
        assert allocs == {
            "cash": Decimal("500.00"),
            "upi": Decimal("700.00"),
            "card": Decimal("300.00"),
        }

        # Verify A4 and Thermal PDFs render split payment details without error
        inv = Invoice.objects.get(transaction=tx)
        a4_bytes = generate_invoice_pdf_bytes(inv, format_type="a4")
        thermal_bytes = generate_invoice_pdf_bytes(inv, format_type="thermal")
        assert a4_bytes[:4] == b"%PDF"
        assert thermal_bytes[:4] == b"%PDF"

    def test_cash_overpayment_change_accounting_and_register_integrity(self, smart_pay_env):
        client = smart_pay_env["client"]
        admin_client = smart_pay_env["admin_client"]
        store = smart_pay_env["store"]
        register = smart_pay_env["register"]
        p500 = smart_pay_env["p500"]

        # Bill = ₹1,000, Customer gives ₹1,200 Cash -> Change = ₹200
        res = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "is_walk_in": True,
                "items": [{"product_id": str(p500.id), "quantity": 2, "unit_price": "500.00"}],
                "payments": [{"payment_method": "cash", "amount": "1200.00"}],
                "idempotency_key": f"sp-cash-over-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert Decimal(str(data["total"])) == Decimal("1000.00")
        assert Decimal(str(data["amount_paid"])) == Decimal("1000.00")
        assert Decimal(str(data["tendered_amount"])) == Decimal("1200.00")
        assert Decimal(str(data["change_amount"])) == Decimal("200.00")

        # Applied TransactionPayment must equal net revenue ₹1,000.00 (NOT ₹1,200.00!)
        tx = Transaction.objects.get(id=data["transaction_id"])
        cash_pay = TransactionPayment.objects.get(transaction=tx, payment_method="cash")
        assert cash_pay.amount == Decimal("1000.00")

        # Open cash register cash_sales must increment by ₹1,000.00 net of change
        register.refresh_from_db()
        assert register.cash_sales == Decimal("1000.00")
        assert register.calculate_expected_cash() == Decimal("2000.00")

        # PDF generation works cleanly with cash change
        inv = Invoice.objects.get(transaction=tx)
        assert generate_invoice_pdf_bytes(inv, format_type="a4")[:4] == b"%PDF"
        assert generate_invoice_pdf_bytes(inv, format_type="thermal")[:4] == b"%PDF"

        # Dashboard analytics must show ₹1,000.00 sales & ₹1,000.00 cash collection (not ₹1,200.00)
        analytics_res = admin_client.get("/api/v1/analytics/dashboard/")
        assert analytics_res.status_code == status.HTTP_200_OK
        analytics = analytics_res.json()
        cash_row = next(m for m in analytics["payment_methods"] if m["payment_method"] == "cash")
        assert Decimal(str(cash_row["total"])) == Decimal("1000.00")

    def test_split_with_cash_change_and_electronic_overpayment_guard(self, smart_pay_env):
        client = smart_pay_env["client"]
        store = smart_pay_env["store"]
        p500 = smart_pay_env["p500"]

        # Reject digital-only overpayment (UPI ₹1,200 on ₹1,000 bill)
        bad_upi = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "is_walk_in": True,
                "items": [{"product_id": str(p500.id), "quantity": 2, "unit_price": "500.00"}],
                "payments": [{"payment_method": "upi", "amount": "1200.00"}],
                "idempotency_key": f"sp-bad-upi-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert bad_upi.status_code == status.HTTP_400_BAD_REQUEST

        # Reject combined digital overpayment even with small cash if electronic portion exceeds total
        bad_mix = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "is_walk_in": True,
                "items": [{"product_id": str(p500.id), "quantity": 2, "unit_price": "500.00"}],
                "payments": [
                    {"payment_method": "upi", "amount": "1100.00"},
                    {"payment_method": "cash", "amount": "50.00"},
                ],
                "idempotency_key": f"sp-bad-mix-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert bad_mix.status_code == status.HTTP_400_BAD_REQUEST

        # Allow split where UPI = ₹600 + Cash tendered = ₹500 on ₹1,000 bill -> Cash applied ₹400, Change ₹100
        good_split = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "is_walk_in": True,
                "items": [{"product_id": str(p500.id), "quantity": 2, "unit_price": "500.00"}],
                "payments": [
                    {"payment_method": "upi", "amount": "600.00"},
                    {"payment_method": "cash", "amount": "500.00"},
                ],
                "idempotency_key": f"sp-good-mix-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert good_split.status_code == status.HTTP_201_CREATED
        d = good_split.json()
        assert Decimal(str(d["change_amount"])) == Decimal("100.00")
        assert Decimal(str(d["amount_paid"])) == Decimal("1000.00")
        tx = Transaction.objects.get(id=d["transaction_id"])
        allocs = {p.payment_method: p.amount for p in tx.payments.all()}
        assert allocs == {"upi": Decimal("600.00"), "cash": Decimal("400.00")}

    def test_credit_split_and_analytics_report_totals(self, smart_pay_env):
        client = smart_pay_env["client"]
        admin_client = smart_pay_env["admin_client"]
        org = smart_pay_env["org"]
        store = smart_pay_env["store"]
        p500 = smart_pay_env["p500"]
        cust = smart_pay_env["customer"]

        # Bill = ₹1,000 -> Cash ₹400 + Credit ₹600 on registered customer
        res = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "is_walk_in": False,
                "customer": {"id": str(cust.id), "phone": cust.phone, "name": cust.full_name},
                "items": [{"product_id": str(p500.id), "quantity": 2, "unit_price": "500.00"}],
                "payments": [
                    {"payment_method": "cash", "amount": "400.00"},
                    {"payment_method": "credit", "amount": "600.00"},
                ],
                "idempotency_key": f"sp-credit-split-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert data["payment_status"] == "partial"
        assert Decimal(str(data["amount_paid"])) == Decimal("400.00")
        assert Decimal(str(data["outstanding_amount"])) == Decimal("600.00")

        cust.refresh_from_db()
        assert cust.outstanding_credit == Decimal("600.00")

        # Also add a UPI+Card split sale ₹500 (UPI ₹300 + Card ₹200)
        res2 = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "is_walk_in": True,
                "items": [{"product_id": str(p500.id), "quantity": 1, "unit_price": "500.00"}],
                "payments": [
                    {"payment_method": "upi", "amount": "300.00"},
                    {"payment_method": "card", "amount": "200.00"},
                ],
                "idempotency_key": f"sp-upi-card-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert res2.status_code == status.HTTP_201_CREATED

        # Check ReportsService payment breakdown and split sales filter by method
        payment_report = ReportsService.get_payment_report(org, store_id=str(store.id), period="today")
        by_method = {row["method"]: Decimal(row["total"]) for row in payment_report["breakdown"]}
        assert by_method["cash"] == Decimal("400.00")
        assert by_method["upi"] == Decimal("300.00")
        assert by_method["card"] == Decimal("200.00")
        assert Decimal(payment_report["total_collected"]) == Decimal("900.00")

        # Filter sales report by 'upi' MUST include the split UPI+Card bill
        upi_sales_report = ReportsService.get_sales_report(
            org, store_id=str(store.id), period="today", payment_method="upi"
        )
        assert upi_sales_report["summary"]["bill_count"] == 1
        assert Decimal(upi_sales_report["summary"]["total_sales"]) == Decimal("500.00")

        # Staff overview percentages exclude credit so percentages sum <= 100% cleanly
        staff_res = client.get("/api/v1/billing/staff/overview/")
        assert staff_res.status_code == status.HTTP_200_OK
        staff_methods = staff_res.json()["payment_methods"]
        assert all(m["payment_method"] != "credit" for m in staff_methods)

        # Admin analytics matches collected totals
        dash_res = admin_client.get("/api/v1/analytics/dashboard/")
        assert dash_res.status_code == status.HTTP_200_OK
        dash_methods = {m["payment_method"]: Decimal(str(m["total"])) for m in dash_res.json()["payment_methods"]}
        assert dash_methods["cash"] == Decimal("400.00")
        assert dash_methods["upi"] == Decimal("300.00")
        assert dash_methods["card"] == Decimal("200.00")
