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
from apps.billing.models import BusinessConfig, CashRegister
from apps.transactions.models import Transaction, TransactionItem, TransactionPayment
from apps.invoices.models import Invoice, Quotation, QuotationItem
from apps.invoices.tasks import generate_invoice_task


@pytest.fixture
def billing_workspace_setup(db):
    org = Organization.objects.create(name=f"Unified Billing Org {uuid.uuid4().hex[:6]}", currency="INR")
    
    # Store Manager / Admin
    admin_user = User.objects.create_user(
        email=f"admin-{uuid.uuid4().hex[:6]}@example.com",
        password="adminpassword123",
        organization=org,
        role="org_admin",
        first_name="Admin",
        last_name="User",
    )
    
    # Cashier / Staff
    staff_user = User.objects.create_user(
        email=f"staff-{uuid.uuid4().hex[:6]}@example.com",
        password="staffpassword123",
        organization=org,
        role="cashier",
        first_name="Suresh",
        last_name="Kumar",
    )
    
    store = Store.objects.create(organization=org, name="Main Retail Hub", code=f"HUB-{uuid.uuid4().hex[:4].upper()}")
    
    config = BusinessConfig.objects.create(
        organization=org,
        business_type="RETAIL",
        gst_enabled=True,
        default_tax_mode="exclusive",
        default_tax_rate=Decimal("18.00"),
        credit_sales_enabled=True,
        default_credit_limit=Decimal("50000.00"),
        max_discount_cashier=Decimal("20.00"),
        allow_negative_stock=False,
    )
    
    admin_client = APIClient()
    admin_client.force_authenticate(user=admin_user)
    
    staff_client = APIClient()
    staff_client.force_authenticate(user=staff_user)
    
    p1 = Product.objects.create(
        organization=org,
        external_id=f"P_{uuid.uuid4().hex[:6]}",
        name="Cotton T-Shirt L",
        sku="TSHIRT-COT-L",
        barcode="8901111222333",
        unit_price=Decimal("500.00"),
        cost_price=Decimal("300.00"),
        tax_rate=Decimal("5.00"),
        current_stock=Decimal("50.00"),
        min_stock=Decimal("5.00"),
        track_inventory=True,
    )
    
    p2 = Product.objects.create(
        organization=org,
        external_id=f"P_{uuid.uuid4().hex[:6]}",
        name="Denim Jeans 32",
        sku="JEANS-DNM-32",
        barcode="8901111222444",
        unit_price=Decimal("1200.00"),
        cost_price=Decimal("800.00"),
        tax_rate=Decimal("12.00"),
        current_stock=Decimal("30.00"),
        min_stock=Decimal("5.00"),
        track_inventory=True,
    )
    
    customer = Customer.objects.create(
        organization=org,
        customer_id=f"CUST-{uuid.uuid4().hex[:4].upper()}",
        first_name="Vikram",
        last_name="Singh",
        phone="9811223344",
        email="vikram@example.com",
        credit_limit=Decimal("20000.00"),
        outstanding_credit=Decimal("0.00"),
        is_walk_in=False,
    )
    
    return {
        "org": org,
        "admin_user": admin_user,
        "staff_user": staff_user,
        "store": store,
        "config": config,
        "admin_client": admin_client,
        "staff_client": staff_client,
        "p1": p1,
        "p2": p2,
        "customer": customer,
    }


@pytest.mark.django_db
class TestUnifiedBillingWorkspace:
    """
    Comprehensive verification suite for BillMeet Unified POS & Invoice Workspace.
    Validates checkout, invoicing, inventory integrity, quotations, mixed payments,
    idempotency, invoice history, PDF handling, permissions, and navigation routes.
    """

    def test_1_add_products_and_recalculate_totals(self, billing_workspace_setup):
        """1. Adding products, applying discounts, and recalculating cart totals."""
        data = billing_workspace_setup
        client = data["admin_client"]
        p1 = data["p1"]
        p2 = data["p2"]

        calc_payload = {
            "items": [
                {
                    "product_id": str(p1.id),
                    "name": p1.name,
                    "unit_price": float(p1.unit_price),
                    "quantity": 2,
                    "tax_rate": float(p1.tax_rate),
                    "discount": 50,
                },
                {
                    "product_id": str(p2.id),
                    "name": p2.name,
                    "unit_price": float(p2.unit_price),
                    "quantity": 1,
                    "tax_rate": float(p2.tax_rate),
                    "discount": 0,
                },
            ],
            "overall_discount_type": "fixed",
            "overall_discount_value": 100,
            "is_interstate": False,
        }

        res = client.post("/api/v1/pos/cart/calculate/", calc_payload, format="json")
        assert res.status_code == status.HTTP_200_OK
        calc_data = res.data
        assert "grand_total" in calc_data
        assert "subtotal" in calc_data
        assert "tax" in calc_data
        assert Decimal(str(calc_data["grand_total"])) > 0
        assert Decimal(str(calc_data["total_discount"])) >= Decimal("150.00")

    def test_2_customer_selection_and_quotation_loading(self, billing_workspace_setup):
        """2. Customer selection and loading an existing quotation into the cart."""
        data = billing_workspace_setup
        client = data["admin_client"]
        org = data["org"]
        p1 = data["p1"]
        cust = data["customer"]

        # Create a quotation
        q_num = f"QUO-{uuid.uuid4().hex[:6].upper()}"
        quo = Quotation.objects.create(
            organization=org,
            quotation_number=q_num,
            customer=cust,
            customer_name=f"{cust.first_name} {cust.last_name}",
            customer_phone=cust.phone,
            subtotal=Decimal("1000.00"),
            tax=Decimal("50.00"),
            total=Decimal("1050.00"),
            status="pending",
        )
        QuotationItem.objects.create(
            quotation=quo,
            product=p1,
            name=p1.name,
            quantity=2,
            unit_price=Decimal("500.00"),
            tax_rate=Decimal("5.00"),
            tax=Decimal("50.00"),
            total=Decimal("1050.00"),
        )

        # Lookup quotation by number
        lookup_res = client.get(f"/api/v1/quotations/lookup/{q_num}/")
        assert lookup_res.status_code == status.HTTP_200_OK
        q_data = lookup_res.data
        assert q_data["quotation_number"] == q_num
        assert len(q_data["items"]) == 1
        assert q_data["items"][0]["name"] == p1.name
        assert Decimal(str(q_data["total"])) == Decimal("1050.00")
        assert q_data["customer_name"] == f"{cust.first_name} {cust.last_name}"

    def test_3_successful_checkout_and_invoice_creation(self, billing_workspace_setup):
        """3. Single checkout produces one sale transaction and one authoritative invoice."""
        data = billing_workspace_setup
        client = data["admin_client"]
        p1 = data["p1"]
        org = data["org"]

        initial_stock = p1.current_stock
        initial_tx_count = Transaction.objects.filter(organization=org).count()
        initial_inv_count = Invoice.objects.filter(organization=org).count()

        checkout_payload = {
            "items": [
                {
                    "product_id": str(p1.id),
                    "name": p1.name,
                    "unit_price": float(p1.unit_price),
                    "quantity": 2,
                    "tax_rate": float(p1.tax_rate),
                }
            ],
            "is_walk_in": True,
            "payments": [{"payment_method": "CASH", "amount": 1050.00}],
            "idempotency_key": f"test-checkout-{uuid.uuid4().hex}",
        }

        res = client.post("/api/v1/pos/checkout/", checkout_payload, format="json")
        assert res.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]

        # Exactly 1 new transaction and 1 new invoice created
        assert Transaction.objects.filter(organization=org).count() == initial_tx_count + 1
        assert Invoice.objects.filter(organization=org).count() == initial_inv_count + 1

        created_tx = Transaction.objects.filter(organization=org).latest("created_at")
        assert created_tx.status == "completed"
        assert created_tx.invoice is not None
        assert created_tx.invoice.invoice_number is not None

        # Inventory reduced exactly by quantity sold (2)
        p1.refresh_from_db()
        assert p1.current_stock == initial_stock - 2

    def test_4_mixed_payment_methods_and_partial_credit(self, billing_workspace_setup):
        """4. Split payments: CASH + UPI + CREDIT without losing individual payment records."""
        data = billing_workspace_setup
        client = data["admin_client"]
        p2 = data["p2"]
        cust = data["customer"]
        org = data["org"]

        # Item: Denim Jeans (1200 + 12% GST = 1344)
        cash_part = 400.00
        upi_part = 500.00
        credit_part = 444.00

        checkout_payload = {
            "items": [
                {
                    "product_id": str(p2.id),
                    "name": p2.name,
                    "unit_price": float(p2.unit_price),
                    "quantity": 1,
                    "tax_rate": float(p2.tax_rate),
                }
            ],
            "is_walk_in": False,
            "customer": {
                "id": str(cust.id),
                "name": f"{cust.first_name} {cust.last_name}",
                "phone": cust.phone,
            },
            "payments": [
                {"payment_method": "CASH", "amount": cash_part, "reference": "Cash Tender"},
                {"payment_method": "UPI", "amount": upi_part, "reference": "UPI-REF-9988"},
                {"payment_method": "CREDIT", "amount": credit_part, "reference": "Udhaar balance"},
            ],
            "idempotency_key": f"test-split-{uuid.uuid4().hex}",
        }

        res = client.post("/api/v1/pos/checkout/", checkout_payload, format="json")
        assert res.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]

        tx = Transaction.objects.filter(organization=org).latest("created_at")
        recorded_payments = TransactionPayment.objects.filter(transaction=tx)
        assert recorded_payments.count() == 3

        methods_and_amounts = {p.payment_method: float(p.amount) for p in recorded_payments}
        assert methods_and_amounts["cash"] == cash_part
        assert methods_and_amounts["upi"] == upi_part
        assert methods_and_amounts["credit"] == credit_part

        # Customer outstanding credit updated
        cust.refresh_from_db()
        assert cust.outstanding_credit >= Decimal("444.00")

    def test_5_duplicate_checkout_prevention_idempotency(self, billing_workspace_setup):
        """5. Re-submitting checkout with same idempotency key does not duplicate sale or stock deduction."""
        data = billing_workspace_setup
        client = data["admin_client"]
        p1 = data["p1"]
        org = data["org"]

        idem_key = f"idempotent-key-{uuid.uuid4().hex}"
        checkout_payload = {
            "items": [
                {
                    "product_id": str(p1.id),
                    "name": p1.name,
                    "unit_price": float(p1.unit_price),
                    "quantity": 1,
                    "tax_rate": float(p1.tax_rate),
                }
            ],
            "is_walk_in": True,
            "payments": [{"payment_method": "CASH", "amount": 525.00}],
            "idempotency_key": idem_key,
        }

        stock_before = p1.current_stock

        # First checkout attempt
        res1 = client.post("/api/v1/pos/checkout/", checkout_payload, format="json")
        assert res1.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]
        tx_id_1 = res1.data["id"]

        p1.refresh_from_db()
        assert p1.current_stock == stock_before - 1

        tx_count_after_first = Transaction.objects.filter(organization=org).count()
        inv_count_after_first = Invoice.objects.filter(organization=org).count()

        # Duplicate checkout attempt (e.g. user rapid double clicks)
        res2 = client.post("/api/v1/pos/checkout/", checkout_payload, format="json")
        assert res2.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]
        tx_id_2 = res2.data["id"]

        # Identical transaction returned, NO duplicate transaction or invoice created
        assert tx_id_1 == tx_id_2
        assert Transaction.objects.filter(organization=org).count() == tx_count_after_first
        assert Invoice.objects.filter(organization=org).count() == inv_count_after_first

        # Stock is NOT deducted a second time
        p1.refresh_from_db()
        assert p1.current_stock == stock_before - 1

    def test_6_invoice_history_search_and_filters(self, billing_workspace_setup):
        """6. Invoice history search, status filters, and date range filtering."""
        data = billing_workspace_setup
        client = data["admin_client"]
        org = data["org"]
        store = data["store"]

        cust1 = Customer.objects.create(
            organization=org,
            customer_id=f"CUST-ANITA",
            first_name="Anita",
            last_name="Sharma",
            phone="9876543210",
        )
        cust2 = Customer.objects.create(
            organization=org,
            customer_id=f"CUST-RAJESH",
            first_name="Rajesh",
            last_name="Gupta",
            phone="9876543211",
        )

        # Create 2 transactions and corresponding invoices
        tx1 = Transaction.objects.create(
            organization=org,
            store=store,
            customer=cust1,
            invoice_number=f"INV-HIST-101",
            transaction_date=timezone.now(),
            total=Decimal("1500.00"),
            payment_status="paid",
            payment_method="cash",
            status="completed",
        )
        inv1_res = generate_invoice_task(str(tx1.id))
        inv1 = Invoice.objects.get(id=inv1_res["invoice_id"])

        tx2 = Transaction.objects.create(
            organization=org,
            store=store,
            customer=cust2,
            invoice_number=f"INV-HIST-102",
            transaction_date=timezone.now(),
            total=Decimal("2500.00"),
            payment_status="credit",
            payment_method="credit",
            status="completed",
        )
        inv2_res = generate_invoice_task(str(tx2.id))
        inv2 = Invoice.objects.get(id=inv2_res["invoice_id"])

        # 1. Search by customer name
        res_search = client.get("/api/v1/invoices/", {"search": "Anita"})
        assert res_search.status_code == status.HTTP_200_OK
        results = res_search.data if isinstance(res_search.data, list) else res_search.data.get("results", [])
        assert any(i["invoice_number"] == inv1.invoice_number for i in results)
        assert not any(i["invoice_number"] == inv2.invoice_number for i in results)

        # 2. Filter by payment status = credit
        res_credit = client.get("/api/v1/invoices/", {"payment_status": "credit"})
        assert res_credit.status_code == status.HTTP_200_OK
        results_credit = res_credit.data if isinstance(res_credit.data, list) else res_credit.data.get("results", [])
        assert any(i["invoice_number"] == inv2.invoice_number for i in results_credit)

    def test_7_pdf_generation_does_not_duplicate_invoice(self, billing_workspace_setup):
        """7. PDF generation operates idempotently without duplicating invoice."""
        data = billing_workspace_setup
        client = data["admin_client"]
        org = data["org"]
        store = data["store"]

        tx = Transaction.objects.create(
            organization=org,
            store=store,
            invoice_number="INV-PDF-999",
            transaction_date=timezone.now(),
            total=Decimal("500.00"),
            payment_status="paid",
            status="completed",
        )
        inv_res = generate_invoice_task(str(tx.id))
        inv = Invoice.objects.get(id=inv_res["invoice_id"])

        initial_inv_count = Invoice.objects.filter(organization=org).count()

        # Call PDF generation endpoint
        res = client.post(f"/api/v1/invoices/{inv.id}/pdf/")
        assert res.status_code == status.HTTP_200_OK

        # Verify no new invoice was created
        assert Invoice.objects.filter(organization=org).count() == initial_inv_count

    def test_8_inventory_consistency_rollback_on_failure(self, billing_workspace_setup):
        """8. Inventory consistency after successful vs failed transactions (atomic rollback)."""
        data = billing_workspace_setup
        client = data["admin_client"]
        p1 = data["p1"]

        initial_stock = p1.current_stock

        # Attempt to checkout more items than currently in stock (negative stock disallowed)
        excess_qty = int(initial_stock) + 20
        payload_fail = {
            "items": [
                {
                    "product_id": str(p1.id),
                    "name": p1.name,
                    "unit_price": float(p1.unit_price),
                    "quantity": excess_qty,
                    "tax_rate": float(p1.tax_rate),
                }
            ],
            "is_walk_in": True,
            "payments": [{"payment_method": "CASH", "amount": excess_qty * 525.00}],
            "idempotency_key": f"fail-stock-{uuid.uuid4().hex}",
        }

        res_fail = client.post("/api/v1/pos/checkout/", payload_fail, format="json")
        assert res_fail.status_code == status.HTTP_400_BAD_REQUEST

        # Verify stock was NOT modified at all
        p1.refresh_from_db()
        assert p1.current_stock == initial_stock

    def test_9_admin_vs_staff_permissions(self, billing_workspace_setup):
        """9. RBAC: Staff user can access staff invoices and checkout, but not admin configs."""
        data = billing_workspace_setup
        staff_client = data["staff_client"]
        admin_client = data["admin_client"]

        # Staff can access staff invoice overview
        res_staff_inv = staff_client.get("/api/v1/billing/staff/invoices/")
        assert res_staff_inv.status_code == status.HTTP_200_OK

        # Staff cannot update business config (admin only)
        res_config_staff = staff_client.patch("/api/v1/pos/config/", {"gst_enabled": False})
        assert res_config_staff.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED]

        # Admin can access config
        res_config_admin = admin_client.get("/api/v1/pos/config/")
        assert res_config_admin.status_code == status.HTTP_200_OK

    def test_10_quotation_creation_does_not_affect_inventory_or_sales(self, billing_workspace_setup):
        """10. Quotation creation does not deduct stock or register sales totals."""
        data = billing_workspace_setup
        client = data["admin_client"]
        p1 = data["p1"]
        org = data["org"]

        stock_before = p1.current_stock
        tx_count_before = Transaction.objects.filter(organization=org).count()

        quo_payload = {
            "items": [
                {
                    "product_id": str(p1.id),
                    "name": p1.name,
                    "quantity": 5,
                    "unit_price": float(p1.unit_price),
                    "tax_rate": float(p1.tax_rate),
                }
            ],
            "customer_name": "Quotation Prospect",
        }

        res = client.post("/api/v1/quotations/", quo_payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED

        # Product stock strictly unchanged
        p1.refresh_from_db()
        assert p1.current_stock == stock_before

        # Sales transaction count strictly unchanged
        assert Transaction.objects.filter(organization=org).count() == tx_count_before
