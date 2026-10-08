from decimal import Decimal
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.organizations.models import Organization
from apps.users.models import User
from apps.stores.models import Store
from apps.products.models import Product, Supplier, PurchaseOrder, InventoryMovement
from apps.customers.models import Customer
from apps.transactions.models import Transaction, TransactionPayment
from apps.billing.models import CashRegister


@pytest.fixture
def separation_setup(db):
    org = Organization.objects.create(name="Separation Test Org")
    user = User.objects.create_user(
        email="cashier@sep.com",
        password="password123",
        organization=org,
        first_name="Alice",
        last_name="Cashier",
        role="owner",
    )
    store = Store.objects.create(
        organization=org,
        name="Flagship Outlet",
        code="FO-01",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return {
        "org": org,
        "user": user,
        "store": store,
        "client": client,
    }


@pytest.mark.django_db
class TestFeatureSeparation:
    def test_purchase_order_procurement_vs_purchase_history(self, separation_setup):
        """
        Prove that a Purchase Order in draft/ordered status is NOT completed purchase history,
        does not deduct or increase stock, and only enters purchase history upon receiving.
        """
        client = separation_setup["client"]
        org = separation_setup["org"]
        store = separation_setup["store"]

        supplier = Supplier.objects.create(organization=org, name="National Electronics Supply")
        product = Product.objects.create(
            organization=org,
            name="Mechanical Keyboard",
            selling_price=Decimal("3000.00"),
            cost_price=Decimal("1500.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )

        # 1. Create a Purchase Order in 'ordered' status (procurement intent)
        po_resp = client.post(
            "/api/v1/pos/inventory/purchases/",
            {
                "supplier_id": str(supplier.id),
                "store_id": str(store.id),
                "purchase_date": "2026-10-08",
                "status": "ordered",
                "items": [
                    {
                        "product_id": str(product.id),
                        "quantity": 20,
                        "purchase_price": 1500.00,
                        "tax_rate": 18.00,
                    }
                ],
                "notes": "Procurement order for Q4 inventory",
            },
            format="json",
        )
        assert po_resp.status_code == status.HTTP_201_CREATED
        po_id = po_resp.json()["id"]

        # Stock must NOT have increased yet!
        product.refresh_from_db()
        assert product.current_stock == Decimal("10.00")

        # Must appear in Purchase Orders endpoint
        all_po_resp = client.get("/api/v1/pos/inventory/purchases/")
        assert all_po_resp.status_code == status.HTTP_200_OK
        assert any(p["id"] == po_id for p in all_po_resp.json())

        # Must NOT appear in completed Purchase History (status=received)
        hist_resp = client.get("/api/v1/pos/inventory/purchases/?status=received")
        assert hist_resp.status_code == status.HTTP_200_OK
        assert not any(p["id"] == po_id for p in hist_resp.json())

        # 2. Receive the stock (goods arrive)
        recv_resp = client.post(
            f"/api/v1/pos/inventory/purchases/{po_id}/receive/",
            {"supplier_invoice_number": "SUP-INV-5544", "notes": "Inspected and accepted"},
            format="json",
        )
        assert recv_resp.status_code == status.HTTP_200_OK
        assert recv_resp.json()["status"] == "received"

        # Stock is now updated: 10 + 20 = 30
        product.refresh_from_db()
        assert product.current_stock == Decimal("30.00")

        # Now it appears in completed Purchase History
        hist_resp_2 = client.get("/api/v1/pos/inventory/purchases/?status=received")
        assert any(p["id"] == po_id for p in hist_resp_2.json())

    def test_stock_adjustment_creates_movement_and_audit_trail(self, separation_setup):
        """
        Prove that Stock Adjustments are dedicated manual changes that record
        an InventoryMovement with before/after stock and appear in the adjustments audit log.
        """
        client = separation_setup["client"]
        org = separation_setup["org"]

        product = Product.objects.create(
            organization=org,
            name="Glass Vases",
            selling_price=Decimal("500.00"),
            current_stock=Decimal("50.00"),
            track_inventory=True,
        )

        # Record manual damage adjustment (-3)
        adj_resp = client.post(
            "/api/v1/pos/inventory/adjust/",
            {
                "product_id": str(product.id),
                "movement_type": "DAMAGE",
                "quantity": -3,
                "notes": "3 vases broken in stockroom handling",
            },
            format="json",
        )
        assert adj_resp.status_code == status.HTTP_201_CREATED
        data = adj_resp.json()
        assert data["previous_stock"] == "50.00"
        assert data["new_stock"] == "47.00"

        product.refresh_from_db()
        assert product.current_stock == Decimal("47.00")

        # Appears in manual adjustments audit log
        log_resp = client.get("/api/v1/pos/inventory/adjustments/")
        assert log_resp.status_code == status.HTTP_200_OK
        results = log_resp.json()
        assert len(results) >= 1
        assert results[0]["movement_type"] == "DAMAGE"
        assert results[0]["quantity"] == "-3.00"

    def test_payment_ledger_vs_receivables_and_payables(self, separation_setup):
        """
        Prove that Payment Ledger tracks actual financial movement (incoming/outgoing)
        while Receivables/Payables track debt balances and aging.
        """
        client = separation_setup["client"]
        org = separation_setup["org"]
        store = separation_setup["store"]

        customer = Customer.objects.create(
            organization=org,
            first_name="Rohan",
            last_name="Mehta",
            phone="9820098200",
            outstanding_credit=Decimal("0.00"),
        )
        product = Product.objects.create(
            organization=org,
            name="Cordless Drill",
            selling_price=Decimal("2000.00"),
            current_stock=Decimal("10.00"),
        )

        # 1. Credit Sale creates a receivable (outstanding debt)
        sale_resp = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "customer": {"phone": customer.phone},
                "items": [{"product_id": str(product.id), "quantity": 1}],
                "payments": [{"payment_method": "credit", "amount": 2000.00}],
            },
            format="json",
        )
        assert sale_resp.status_code == status.HTTP_201_CREATED

        # Check Receivables
        rec_resp = client.get("/api/v1/pos/finance/receivables/")
        assert rec_resp.status_code == status.HTTP_200_OK
        rec_data = rec_resp.json()
        assert any(r["customer_phone"] == "9820098200" for r in rec_data)

        # 2. Settle credit payment (₹1000 cash)
        pay_resp = client.post(
            "/api/v1/pos/credit/payment/",
            {
                "customer_id": str(customer.id),
                "amount": 1000.00,
                "payment_method": "cash",
                "notes": "Partial credit payment",
            },
            format="json",
        )
        assert pay_resp.status_code == status.HTTP_201_CREATED

        # Receivables balance updated
        rec_resp_2 = client.get("/api/v1/pos/finance/receivables/")
        matching_rec = [r for r in rec_resp_2.json() if r["customer_phone"] == "9820098200"][0]
        assert matching_rec["outstanding"] == "1000.00"

        # Appears in Payment Ledger as INCOMING payment
        ledger_resp = client.get("/api/v1/pos/finance/payments/?direction=incoming")
        assert ledger_resp.status_code == status.HTTP_200_OK
        assert any(item["amount"] == "1000.00" and item["direction"] == "incoming" for item in ledger_resp.json())

        # 3. Supplier payment creates OUTGOING record
        supplier = Supplier.objects.create(organization=org, name="Tool Masters Ltd")
        sup_pay_resp = client.post(
            "/api/v1/pos/finance/supplier-payments/",
            {
                "supplier_id": str(supplier.id),
                "amount": 4500.00,
                "payment_method": "bank_transfer",
                "reference": "NEFT12345678",
                "notes": "Monthly parts settlement",
            },
            format="json",
        )
        assert sup_pay_resp.status_code == status.HTTP_201_CREATED

        # Appears in Payment Ledger as OUTGOING payment
        out_resp = client.get("/api/v1/pos/finance/payments/?direction=outgoing")
        assert any(item["amount"] == "4500.00" and item["direction"] == "outgoing" for item in out_resp.json())

    def test_sales_report_vs_pos_register_report(self, separation_setup):
        """
        Prove that Sales Report shows business analytics while POS Register Report
        shows operational cashier drawer reconciliation and cash variance.
        """
        client = separation_setup["client"]
        org = separation_setup["org"]
        store = separation_setup["store"]
        user = separation_setup["user"]

        # 1. Create a register session
        reg = CashRegister.objects.create(
            organization=org,
            store=store,
            cashier=user,
            opening_cash=Decimal("5000.00"),
            status="open",
        )

        # 2. Make a sale
        product = Product.objects.create(
            organization=org,
            name="Bluetooth Speaker",
            selling_price=Decimal("1200.00"),
            current_stock=Decimal("10.00"),
        )
        client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "items": [{"product_id": str(product.id), "quantity": 1}],
                "payments": [{"payment_method": "cash", "amount": 1200.00}],
            },
            format="json",
        )

        # 3. Close the register with an overage (actual cash 6300 vs expected 5000 + 1200 = 6200)
        reg.cash_sales = Decimal("1200.00")
        reg.actual_cash = Decimal("6300.00")
        reg.status = "closed"
        reg.save()

        # Sales Report returns macro business metrics
        sales_resp = client.get("/api/v1/pos/reports/sales/")
        assert sales_resp.status_code == status.HTTP_200_OK
        sales_data = sales_resp.json()
        assert "summary" in sales_data
        assert "transactions" in sales_data

        # POS Register Report returns drawer reconciliation with variance
        pos_rep_resp = client.get("/api/v1/pos/reports/pos-register/")
        assert pos_rep_resp.status_code == status.HTTP_200_OK
        pos_data = pos_rep_resp.json()
        assert "registers" in pos_data
        matching = [r for r in pos_data["registers"] if r["register_id"] == str(reg.id)][0]
        assert matching["opening_balance"] == "5000.00"
        assert matching["expected_closing_cash"] == "6200.00"
        assert matching["actual_closing_cash"] == "6300.00"
        assert matching["cash_variance"] == "100.00"
