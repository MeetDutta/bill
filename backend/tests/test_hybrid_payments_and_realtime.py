import json
import pytest
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product, InventoryMovement
from apps.customers.models import Customer
from apps.billing.models import BusinessConfig, CashRegister, RealtimeEvent
from apps.transactions.models import Transaction, TransactionPayment
from apps.billing.services.checkout_service import CheckoutService
from apps.billing.services.realtime_service import RealtimeService


@pytest.mark.django_db(transaction=True)
class TestHybridPaymentsAndRealtime:
    @pytest.fixture(autouse=True)
    def setup_entities(self):
        self.org = Organization.objects.create(name="Realtime Enterprise")
        self.store = Store.objects.create(organization=self.org, name="Flagship Store", code="STORE-01")
        self.user = User.objects.create_user(
            email="cashier@realtime.com",
            password="testpassword123",
            organization=self.org,
            role="cashier",
        )
        self.config, _ = BusinessConfig.objects.get_or_create(
            organization=self.org,
            defaults={"allow_credit_sales": True, "gst_enabled": False},
        )
        self.config.allow_credit_sales = True
        self.config.save()

        self.customer = Customer.objects.create(
            organization=self.org,
            customer_id="CUST-REALTIME",
            first_name="Ramesh",
            last_name="Gupta",
            phone="9876543210",
            credit_limit=Decimal("50000.00"),
            outstanding_credit=Decimal("0.00"),
        )

        self.prod_a = Product.objects.create(
            organization=self.org,
            name="Organic Almonds 500g",
            sku="ALMOND-500",
            barcode="890123456701",
            unit_price=Decimal("450.00"),
            cost_price=Decimal("350.00"),
            current_stock=Decimal("100.00"),
            min_stock=Decimal("10.00"),
            track_inventory=True,
        )

        self.prod_b = Product.objects.create(
            organization=self.org,
            name="Cold Pressed Coconut Oil 1L",
            sku="COCO-1L",
            barcode="890123456702",
            unit_price=Decimal("250.00"),
            cost_price=Decimal("180.00"),
            current_stock=Decimal("50.00"),
            min_stock=Decimal("5.00"),
            track_inventory=True,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_hybrid_cash_and_upi_checkout(self):
        """
        Bill total: ₹700 (1x Almonds 450 + 1x Oil 250)
        Split payment: ₹300 Cash + ₹400 UPI
        Proves that payment allocations match the exact split and sum to bill total.
        """
        cart_data = {
            "store_id": str(self.store.id),
            "customer": {"phone": self.customer.phone, "name": self.customer.full_name},
            "items": [
                {"product_id": str(self.prod_a.id), "quantity": 1, "unit_price": 450},
                {"product_id": str(self.prod_b.id), "quantity": 1, "unit_price": 250},
            ],
            "payments": [
                {"payment_method": "cash", "amount": 300},
                {"payment_method": "upi", "amount": 400, "reference": "UPI-UTR-9988"},
            ],
        }

        res = CheckoutService.process_checkout(
            organization=self.org,
            store=self.store,
            user=self.user,
            cart_data=cart_data,
        )

        assert res["total"] == "700.00"
        assert res["amount_paid"] == "700.00"
        assert res["outstanding_amount"] == "0.00"
        assert res["payment_status"] == "paid"

        tx = Transaction.objects.get(id=res["id"])
        payments = list(tx.payments.all())
        assert len(payments) == 2

        cash_pay = next(p for p in payments if p.payment_method == "cash")
        upi_pay = next(p for p in payments if p.payment_method == "upi")
        assert cash_pay.amount == Decimal("300.00")
        assert upi_pay.amount == Decimal("400.00")
        assert upi_pay.reference == "UPI-UTR-9988"

    def test_hybrid_cash_upi_and_credit_sale(self):
        """
        Bill total: ₹700
        Split: ₹200 Cash + ₹200 UPI + ₹300 Credit (Udhaar)
        Proves that payment_status is 'partial', amount_paid is ₹400,
        and customer outstanding_credit increments by ₹300.
        """
        cart_data = {
            "store_id": str(self.store.id),
            "customer": {"phone": self.customer.phone, "name": self.customer.full_name},
            "items": [
                {"product_id": str(self.prod_a.id), "quantity": 1, "unit_price": 450},
                {"product_id": str(self.prod_b.id), "quantity": 1, "unit_price": 250},
            ],
            "payments": [
                {"payment_method": "cash", "amount": 200},
                {"payment_method": "upi", "amount": 200},
                {"payment_method": "credit", "amount": 300},
            ],
        }

        res = CheckoutService.process_checkout(
            organization=self.org,
            store=self.store,
            user=self.user,
            cart_data=cart_data,
        )

        assert res["payment_status"] == "partial"
        assert res["amount_paid"] == "400.00"
        assert res["outstanding_amount"] == "300.00"

        self.customer.refresh_from_db()
        assert self.customer.outstanding_credit == Decimal("300.00")

    def test_cash_excess_tender_and_change_return(self):
        """
        Bill total: ₹450
        Cash tendered: ₹500
        Expected: change_amount = ₹50, amount_paid = ₹450,
        TransactionPayment records applied cash = ₹450 with notes,
        and cash register receives exactly ₹450 net cash.
        """
        # Open register
        register = CashRegister.objects.create(
            organization=self.org,
            store=self.store,
            cashier=self.user,
            opening_cash=Decimal("1000.00"),
            cash_sales=Decimal("0.00"),
            status="open",
        )

        cart_data = {
            "store_id": str(self.store.id),
            "items": [
                {"product_id": str(self.prod_a.id), "quantity": 1, "unit_price": 450},
            ],
            "payments": [
                {"payment_method": "cash", "amount": 500},
            ],
        }

        res = CheckoutService.process_checkout(
            organization=self.org,
            store=self.store,
            user=self.user,
            cart_data=cart_data,
        )

        assert res["total"] == "450.00"
        assert res["amount_paid"] == "450.00"
        assert res["tendered_amount"] == "500.00"
        assert res["change_amount"] == "50.00"

        tx = Transaction.objects.get(id=res["id"])
        assert tx.tendered_amount == Decimal("500.00")
        assert tx.change_amount == Decimal("50.00")

        # Applied payment is ₹450
        pay = tx.payments.first()
        assert pay.amount == Decimal("450.00")
        assert "Change: ₹50" in pay.notes

        # Register reflects net cash increase of ₹450
        register.refresh_from_db()
        assert register.cash_sales == Decimal("450.00")

    def test_electronic_overpayment_rejected(self):
        """
        Bill total: ₹450
        UPI tendered: ₹500
        Should raise ValidationError because change cannot be returned for electronic overpayment.
        """
        cart_data = {
            "items": [{"product_id": str(self.prod_a.id), "quantity": 1, "unit_price": 450}],
            "payments": [{"payment_method": "upi", "amount": 500}],
        }
        with pytest.raises(Exception) as excinfo:
            CheckoutService.process_checkout(
                organization=self.org,
                store=self.store,
                user=self.user,
                cart_data=cart_data,
            )
        assert "Overpayment of ₹50.00 is only permitted in Cash" in str(excinfo.value)

    def test_external_transaction_ingest_deducts_inventory(self):
        """
        External transaction ingestion with product matching:
        Verifies that stock is deducted atomically and InventoryMovement(movement_type='SALE') is recorded.
        """
        initial_stock = self.prod_a.current_stock
        payload = {
            "store_id": self.store.code,
            "external_transaction_id": "EXT-INGEST-9001",
            "invoice_number": "INV-EXT-9001",
            "transaction_date": timezone.now().isoformat(),
            "subtotal": "900.00",
            "discount": "0.00",
            "tax": "0.00",
            "total": "900.00",
            "payment_method": "cash",
            "items": [
                {
                    "external_product_id": self.prod_a.sku,
                    "name": self.prod_a.name,
                    "quantity": "2.00",
                    "unit_price": "450.00",
                    "total": "900.00",
                }
            ],
        }

        resp = self.client.post("/api/v1/transactions/ingest/", payload, format="json")
        assert resp.status_code == status.HTTP_201_CREATED

        self.prod_a.refresh_from_db()
        assert self.prod_a.current_stock == initial_stock - Decimal("2.00")

        # Verify InventoryMovement exists
        movement = InventoryMovement.objects.filter(
            organization=self.org,
            product=self.prod_a,
            movement_type="SALE",
            reference_id=resp.data["id"],
        ).first()
        assert movement is not None
        assert movement.quantity == Decimal("-2.00")
        assert movement.previous_stock == initial_stock
        assert movement.new_stock == initial_stock - Decimal("2.00")

    def test_realtime_event_publishing_and_tenant_isolation(self):
        """
        Verifies that events are published and scoped strictly by organization.
        """
        # Publish event for self.org
        RealtimeService.publish_event(
            organization=self.org,
            store=self.store,
            event_type="stock_adjusted",
            payload={"product_id": str(self.prod_a.id), "new_stock": "95.00"},
        )

        # Another tenant
        other_org = Organization.objects.create(name="Competitor Inc")
        RealtimeService.publish_event(
            organization=other_org,
            event_type="stock_adjusted",
            payload={"product_id": "other-id", "new_stock": "10.00"},
        )

        # Query recent events endpoint for self.user
        resp = self.client.get("/api/v1/pos/realtime/recent/")
        assert resp.status_code == status.HTTP_200_OK

        events = resp.data
        assert any(e["event_type"] == "stock_adjusted" for e in events)
        # Verify no cross-tenant events leaked
        assert all(e.get("payload", {}).get("product_id") != "other-id" for e in events)

    def test_concurrent_checkout_on_last_unit_prevents_overselling(self):
        """
        Concurrency invariant: Product has exactly 1 unit of stock.
        Two threads attempt to checkout 1 unit simultaneously.
        select_for_update guarantees exactly one succeeds and one is rejected.
        Stock cannot become negative.
        """
        import concurrent.futures
        from django.db import connection

        limited_prod = Product.objects.create(
            organization=self.org,
            name="Limited Edition Watch",
            sku="WATCH-001",
            unit_price=Decimal("5000.00"),
            current_stock=Decimal("1.00"),
            track_inventory=True,
        )

        cart_data = {
            "store_id": str(self.store.id),
            "items": [{"product_id": str(limited_prod.id), "quantity": 1, "unit_price": 5000}],
            "payments": [{"payment_method": "cash", "amount": 5000}],
        }

        results = []

        def _do_checkout(worker_id):
            connection.close()  # Ensure separate DB connection per thread
            try:
                res = CheckoutService.process_checkout(
                    organization=self.org,
                    store=self.store,
                    user=self.user,
                    cart_data=cart_data,
                    idempotency_key=f"worker-{worker_id}",
                )
                return ("success", res)
            except Exception as e:
                return ("error", str(e))

        import time
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(_do_checkout, 1)
            time.sleep(0.05)
            f2 = executor.submit(_do_checkout, 2)
            results = [f1.result(), f2.result()]

        print("CONCURRENCY RESULTS:", results)
        statuses = [r[0] for r in results]
        assert "success" in statuses
        assert "error" in statuses

        error_res = next(r for r in results if r[0] == "error")
        assert (
            "Insufficient stock" in error_res[1]
            or "locked" in error_res[1]
        )

        limited_prod.refresh_from_db()
        assert limited_prod.current_stock == Decimal("0.00")

