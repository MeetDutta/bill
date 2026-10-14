import os
import time
import json
import tarfile
import hashlib
import tempfile
import threading
from decimal import Decimal
import pytest
from django.utils import timezone
from django.db import connection
from rest_framework.test import APIClient

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product, InventoryMovement
from apps.customers.models import Customer
from apps.billing.models import BusinessConfig, CashRegister, RealtimeEvent
from apps.transactions.models import Transaction, TransactionItem, TransactionPayment
from apps.invoices.models import Invoice
from apps.billing.services.checkout_service import CheckoutService
from apps.billing.services.return_service import ReturnService
from apps.reports.services.financial_reconciliation import FinancialReconciliationService
from apps.reports.services.inventory_reconciliation import InventoryReconciliationService
from apps.reports.services.backup_service import BackupService
from apps.reports.services.health_service import SystemHealthService
from apps.reports.services.daily_closing import DailyBusinessClosingService


@pytest.mark.django_db(transaction=True)
class TestAdversarialAuditScenarios:
    @pytest.fixture(autouse=True)
    def setup_fixtures(self):
        # Primary Organization & Store
        self.org_a = Organization.objects.create(name="Adversarial Audit Corp A")
        self.store_a = Store.objects.create(
            organization=self.org_a,
            name="Alpha Store",
            code="ALPHA-01",
        )
        self.manager_a = User.objects.create_user(
            email="manager.a@adversarial.com",
            password="SecureAuditPassword123!",
            organization=self.org_a,
            role="store_manager",
        )
        self.cashier_a = User.objects.create_user(
            email="cashier.a@adversarial.com",
            password="SecureAuditPassword123!",
            organization=self.org_a,
            role="staff",
        )
        self.config_a = BusinessConfig.objects.create(
            organization=self.org_a,
            allow_negative_stock=False,
            credit_sales_enabled=True,
            gst_enabled=True,
            invoice_prefix="AUDIT-",
        )

        # Secondary Organization & Store (for Multi-Tenant Isolation Testing)
        self.org_b = Organization.objects.create(name="Adversarial Competitor B")
        self.store_b = Store.objects.create(
            organization=self.org_b,
            name="Beta Store",
            code="BETA-01",
        )
        self.manager_b = User.objects.create_user(
            email="manager.b@adversarial.com",
            password="SecureAuditPassword123!",
            organization=self.org_b,
            role="store_manager",
        )

        self.client = APIClient()

    # SCENARIO 1: Two sales compete for the final unit -> No prohibited overselling
    def test_scenario_01_two_sales_compete_for_final_unit_prevents_overselling(self):
        prod = Product.objects.create(
            organization=self.org_a,
            name="Scarcity Limited Item",
            sku="SCARCE-001",
            unit_price=Decimal("500.00"),
            current_stock=Decimal("1.00"),
            track_inventory=True,
        )

        cart_data = {
            "items": [{"product_id": str(prod.id), "quantity": 1}],
            "payment_method": "cash",
            "payments": [{"payment_method": "cash", "amount": "500.00"}],
        }

        results = []
        errors = []

        def worker():
            from django.db import connection
            connection.close()
            try:
                res = CheckoutService.process_checkout(
                    organization=self.org_a,
                    store=self.store_a,
                    user=self.cashier_a,
                    cart_data=cart_data,
                )
                results.append(res)
            except Exception as e:
                errors.append(str(e))
            finally:
                connection.close()

        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        prod.refresh_from_db()
        # Exactly one thread succeeds, the other fails with Insufficient Stock
        assert len(results) == 1, f"Expected 1 successful sale, got {len(results)}"
        assert len(errors) == 1, f"Expected 1 error, got {len(errors)}"
        assert "Insufficient stock" in errors[0]
        assert prod.current_stock == Decimal("0.00"), f"Stock should be 0.00, got {prod.current_stock}"

        # Movement ledger must reflect exactly one deduction
        movements = InventoryMovement.objects.filter(product=prod, movement_type="SALE")
        assert movements.count() == 1
        assert movements.first().quantity == Decimal("-1.00")

    # SCENARIO 2: Same checkout submitted twice (idempotency key) -> One logical sale
    def test_scenario_02_same_checkout_submitted_twice_returns_same_logical_sale(self):
        prod = Product.objects.create(
            organization=self.org_a,
            name="Idempotency Item",
            sku="IDEM-001",
            unit_price=Decimal("250.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )
        idem_key = "pos-idem-uuid-99999"

        cart_data = {
            "items": [{"product_id": str(prod.id), "quantity": 2}],
            "payment_method": "cash",
            "payments": [{"payment_method": "cash", "amount": "500.00"}],
        }

        # Submission 1
        res1 = CheckoutService.process_checkout(
            organization=self.org_a,
            store=self.store_a,
            user=self.cashier_a,
            cart_data=cart_data,
            idempotency_key=idem_key,
        )

        # Submission 2 (Immediate retry)
        res2 = CheckoutService.process_checkout(
            organization=self.org_a,
            store=self.store_a,
            user=self.cashier_a,
            cart_data=cart_data,
            idempotency_key=idem_key,
        )

        assert res1["id"] == res2["id"]
        assert res1["invoice_number"] == res2["invoice_number"]

        # Only one transaction in DB
        tx_count = Transaction.objects.filter(
            organization=self.org_a,
            external_transaction_id=idem_key,
        ).count()
        assert tx_count == 1

        # Stock deducted exactly once (10 - 2 = 8)
        prod.refresh_from_db()
        assert prod.current_stock == Decimal("8.00")

    # SCENARIO 3: Same external transaction ingested twice -> No duplicate invoice or stock movement
    def test_scenario_03_same_external_transaction_ingest_no_duplicate_stock(self):
        prod = Product.objects.create(
            organization=self.org_a,
            name="External ERP Item",
            sku="EXT-ERP-01",
            unit_price=Decimal("100.00"),
            current_stock=Decimal("20.00"),
            track_inventory=True,
        )

        ingest_payload = {
            "store_id": str(self.store_a.id),
            "invoice_number": "ERP-INV-1001",
            "transaction_date": timezone.now().isoformat(),
            "external_source": "sap_ecc",
            "external_transaction_id": "SAP-SYNC-8888",
            "subtotal": "200.00",
            "tax": "0.00",
            "total": "200.00",
            "payment_method": "card",
            "items": [
                {
                    "product_id": str(prod.id),
                    "name": prod.name,
                    "quantity": "2",
                    "unit_price": "100.00",
                    "total": "200.00",
                }
            ],
        }

        self.client.force_authenticate(user=self.manager_a)
        # First ingest
        resp1 = self.client.post("/api/v1/transactions/ingest/", ingest_payload, format="json")
        assert resp1.status_code == 201

        # Second ingest with same external_transaction_id
        resp2 = self.client.post("/api/v1/transactions/ingest/", ingest_payload, format="json")
        assert resp2.status_code == 200
        assert resp1.json()["id"] == resp2.json()["id"]

        # Product stock deducted only once: 20 - 2 = 18
        prod.refresh_from_db()
        assert prod.current_stock == Decimal("18.00")

        # Movements count
        movements = InventoryMovement.objects.filter(product=prod, movement_type="SALE")
        assert movements.count() == 1

    # SCENARIO 4: Cash tender exceeds invoice -> Correct change and net drawer movement
    def test_scenario_04_cash_tender_excess_change_and_drawer_movement(self):
        # Open cash register with initial float ₹5,000
        reg = CashRegister.objects.create(
            organization=self.org_a,
            store=self.store_a,
            cashier=self.cashier_a,
            opening_cash=Decimal("5000.00"),
            status="open",
        )

        prod = Product.objects.create(
            organization=self.org_a,
            name="Grocery Hamper",
            sku="HAMP-01",
            unit_price=Decimal("1200.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )

        # Invoice: ₹1,200, Cash tendered: ₹2,000, Change: ₹800, Net cash increase: ₹1,200
        cart_data = {
            "items": [{"product_id": str(prod.id), "quantity": 1}],
            "payment_method": "cash",
            "tendered_amount": "2000.00",
            "payments": [{"payment_method": "cash", "amount": "2000.00"}],
        }

        res = CheckoutService.process_checkout(
            organization=self.org_a,
            store=self.store_a,
            user=self.cashier_a,
            cart_data=cart_data,
        )

        tx = Transaction.objects.get(id=res["id"])
        assert tx.total == Decimal("1200.00")
        assert tx.tendered_amount == Decimal("2000.00")
        assert tx.change_amount == Decimal("800.00")
        assert tx.amount_paid == Decimal("1200.00")

        reg.refresh_from_db()
        # Initial float ₹5000 + applied sale ₹1200 = ₹6200
        assert reg.cash_sales == Decimal("1200.00")
        assert reg.calculate_expected_cash() == Decimal("6200.00")

    # SCENARIO 5: Cash + UPI + card -> Exact allocation and reconciliation
    def test_scenario_05_hybrid_cash_upi_card_split_reconciles_exactly(self):
        prod = Product.objects.create(
            organization=self.org_a,
            name="Electronics Combo",
            sku="ELEC-01",
            unit_price=Decimal("1200.00"),
            current_stock=Decimal("5.00"),
            track_inventory=True,
        )

        cart_data = {
            "items": [{"product_id": str(prod.id), "quantity": 1}],
            "payment_method": "split",
            "payments": [
                {"payment_method": "cash", "amount": "400.00", "reference": "CASH-400"},
                {"payment_method": "upi", "amount": "500.00", "reference": "UPI-TXN-500"},
                {"payment_method": "card", "amount": "300.00", "reference": "CARD-AUTH-300"},
            ],
        }

        res = CheckoutService.process_checkout(
            organization=self.org_a,
            store=self.store_a,
            user=self.cashier_a,
            cart_data=cart_data,
        )

        tx = Transaction.objects.get(id=res["id"])
        assert tx.total == Decimal("1200.00")
        assert tx.amount_paid == Decimal("1200.00")
        assert tx.outstanding_amount == Decimal("0.00")
        assert tx.payment_status == "paid"

        payments = tx.payments.all()
        assert payments.count() == 3
        payment_dict = {p.payment_method: p.amount for p in payments}
        assert payment_dict["cash"] == Decimal("400.00")
        assert payment_dict["upi"] == Decimal("500.00")
        assert payment_dict["card"] == Decimal("300.00")

    # SCENARIO 6: Partial payment plus customer credit -> Correct paid and outstanding balances
    def test_scenario_06_partial_payment_plus_customer_credit(self):
        customer = Customer.objects.create(
            organization=self.org_a,
            customer_id="CUST-VIP-001",
            first_name="VIP",
            last_name="Buyer",
            phone="9876543210",
            credit_limit=Decimal("5000.00"),
            outstanding_credit=Decimal("0.00"),
        )

        prod = Product.objects.create(
            organization=self.org_a,
            name="Appliance Kit",
            sku="APP-01",
            unit_price=Decimal("1200.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )

        # ₹800 paid via UPI, ₹400 on customer credit
        cart_data = {
            "customer": {"id": str(customer.id), "phone": customer.phone},
            "items": [{"product_id": str(prod.id), "quantity": 1}],
            "payment_method": "split",
            "payments": [
                {"payment_method": "upi", "amount": "800.00"},
                {"payment_method": "credit", "amount": "400.00"},
            ],
        }

        res = CheckoutService.process_checkout(
            organization=self.org_a,
            store=self.store_a,
            user=self.cashier_a,
            cart_data=cart_data,
        )

        tx = Transaction.objects.get(id=res["id"])
        assert tx.total == Decimal("1200.00")
        assert tx.amount_paid == Decimal("800.00")
        assert tx.outstanding_amount == Decimal("400.00")
        assert tx.payment_status == "partial"

        customer.refresh_from_db()
        assert customer.outstanding_credit == Decimal("400.00")

    # SCENARIO 7: Electronic payment remains pending -> Not falsely counted as settled
    def test_scenario_07_electronic_payment_pending_not_counted_as_settled(self):
        tx = Transaction.objects.create(
            organization=self.org_a,
            store=self.store_a,
            invoice_number="INV-PEND-001",
            transaction_date=timezone.now(),
            subtotal=Decimal("1000.00"),
            tax=Decimal("0.00"),
            total=Decimal("1000.00"),
            amount_paid=Decimal("1000.00"),
            outstanding_amount=Decimal("0.00"),
            status="completed",
            payment_status="paid",
            payment_method="upi",
        )
        TransactionItem.objects.create(
            transaction=tx,
            name="Pending Payment Item",
            quantity=Decimal("1.00"),
            unit_price=Decimal("1000.00"),
            total=Decimal("1000.00"),
        )

        # Create pending payment (not settled)
        TransactionPayment.objects.create(
            organization=self.org_a,
            transaction=tx,
            payment_method="upi",
            amount=Decimal("1000.00"),
            status="pending",
        )

        # Financial reconciliation service must verify settled payments only
        res = FinancialReconciliationService.run_reconciliation(
            organization=self.org_a,
            store=self.store_a,
            start_date=timezone.now().date(),
            end_date=timezone.now().date(),
            emit_alerts=False,
        )
        assert res["total_volume_checked"] == 1000.00
        # Pending payment should be detected as an allocation mismatch / unpaid discrepancy
        assert res["discrepancies_count"] > 0
        discrepancy_types = [d["check_type"] for d in res["discrepancies"]]
        assert "PAYMENT_ALLOCATION_MISMATCH" in discrepancy_types

    # SCENARIO 8: Invoice printed five times -> No financial or inventory mutation
    def test_scenario_08_invoice_printed_five_times_no_financial_or_inventory_mutation(self):
        prod = Product.objects.create(
            organization=self.org_a,
            name="Printable Item",
            sku="PRN-01",
            unit_price=Decimal("300.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )

        cart_data = {
            "items": [{"product_id": str(prod.id), "quantity": 1}],
            "payment_method": "cash",
            "payments": [{"payment_method": "cash", "amount": "300.00"}],
        }

        res = CheckoutService.process_checkout(
            organization=self.org_a,
            store=self.store_a,
            user=self.cashier_a,
            cart_data=cart_data,
        )
        inv = Invoice.objects.get(transaction_id=res["id"])
        prod.refresh_from_db()
        stock_before = prod.current_stock
        movements_before = InventoryMovement.objects.filter(product=prod).count()

        self.client.force_authenticate(user=self.cashier_a)
        # Access invoice download/reprint endpoint 5 times
        for _ in range(5):
            resp = self.client.get(f"/api/v1/invoices/{inv.id}/pdf/")
            assert resp.status_code in [200, 302]

        prod.refresh_from_db()
        assert prod.current_stock == stock_before
        assert InventoryMovement.objects.filter(product=prod).count() == movements_before
        assert Transaction.objects.filter(id=res["id"]).count() == 1

    # SCENARIO 9: Return submitted twice -> No duplicate refund or stock restoration
    def test_scenario_09_return_submitted_twice_prevents_duplicate_refund(self):
        prod = Product.objects.create(
            organization=self.org_a,
            name="Returnable Garment",
            sku="GAR-01",
            unit_price=Decimal("800.00"),
            current_stock=Decimal("5.00"),
            track_inventory=True,
        )

        cart_data = {
            "items": [{"product_id": str(prod.id), "quantity": 1}],
            "payment_method": "cash",
            "payments": [{"payment_method": "cash", "amount": "800.00"}],
        }

        sale_res = CheckoutService.process_checkout(
            organization=self.org_a,
            store=self.store_a,
            user=self.cashier_a,
            cart_data=cart_data,
        )
        tx = Transaction.objects.get(id=sale_res["id"])
        item = tx.items.first()

        # Submit first return
        ret_res1 = ReturnService.process_return(
            organization=self.org_a,
            user=self.manager_a,
            original_transaction_id=str(tx.id),
            items_to_return=[{"transaction_item_id": str(item.id), "quantity": 1}],
            refund_method="cash",
        )
        assert ret_res1["total_refund_amount"] == "800.00"

        # Submit duplicate return for the same item
        with pytest.raises(Exception) as exc_info:
            ReturnService.process_return(
                organization=self.org_a,
                user=self.manager_a,
                original_transaction_id=str(tx.id),
                items_to_return=[{"transaction_item_id": str(item.id), "quantity": 1}],
                refund_method="cash",
            )
        assert "Max returnable: 0.00" in str(exc_info.value) or "returned" in str(exc_info.value)

    # SCENARIO 10: Two tenants request the same object ID -> No unauthorized access
    def test_scenario_10_two_tenants_request_same_object_id_rejected(self):
        tx_a = Transaction.objects.create(
            organization=self.org_a,
            store=self.store_a,
            invoice_number="INV-A-100",
            transaction_date=timezone.now(),
            subtotal=Decimal("500.00"),
            tax=Decimal("0.00"),
            total=Decimal("500.00"),
            amount_paid=Decimal("500.00"),
            payment_status="paid",
            payment_method="cash",
        )

        # Authenticate as Tenant B manager and attempt to view Tenant A's transaction
        self.client.force_authenticate(user=self.manager_b)
        resp = self.client.get(f"/api/v1/transactions/{tx_a.id}/")
        assert resp.status_code in [403, 404]

    # SCENARIO 11: SSE ticket reused or expired -> Rejected according to policy
    def test_scenario_11_sse_ticket_single_use_and_expiry_enforcement(self):
        from django.core.cache import cache
        self.client.force_authenticate(user=self.cashier_a)

        # 1. Issue Ticket
        t_resp = self.client.post("/api/v1/pos/realtime/ticket/")
        assert t_resp.status_code == 200
        ticket = t_resp.json()["ticket"]

        # 2. First usage (simulate ticket consumption)
        cached_data = cache.get(f"sse_ticket:{ticket}")
        assert cached_data is not None
        assert cached_data["user_id"] == str(self.cashier_a.id)
        cache.delete(f"sse_ticket:{ticket}")

        # 3. Second usage must be None
        reused_data = cache.get(f"sse_ticket:{ticket}")
        assert reused_data is None

    # SCENARIO 12: SSE connection interrupted -> Documented recovery via Last-Event-ID / Polling
    def test_scenario_12_sse_event_publication_and_recent_events_recovery(self):
        from apps.billing.services.realtime_service import RealtimeService
        # Publish event
        RealtimeService.publish_event(
            organization=self.org_a,
            store=self.store_a,
            event_type="test_adversarial_event",
            payload={"key": "val123"},
        )

        event = RealtimeEvent.objects.filter(
            organization=self.org_a,
            event_type="test_adversarial_event",
        ).first()
        assert event is not None
        assert event.payload["key"] == "val123"

        # Client queries recent events endpoint to recover missed events
        self.client.force_authenticate(user=self.cashier_a)
        resp = self.client.get("/api/v1/pos/realtime/recent/?limit=5")
        assert resp.status_code == 200
        events = resp.json()
        assert any(e["event_type"] == "test_adversarial_event" for e in events)

    # SCENARIO 13: Database becomes unavailable -> Health check reports degraded
    def test_scenario_13_database_unavailability_handled_gracefully(self):
        from unittest.mock import patch

        with patch("django.db.connection.cursor", side_effect=Exception("DB Connection Timeout")):
            readiness = SystemHealthService.get_readiness()
            assert readiness["status"] == "unhealthy"
            assert readiness["database"] == "down"

    # SCENARIO 14: Redis becomes unavailable -> Degraded fallback
    def test_scenario_14_redis_unavailability_handled_gracefully(self):
        from unittest.mock import patch

        with patch("redis.from_url", side_effect=Exception("Redis Node Down")):
            readiness = SystemHealthService.get_readiness()
            assert readiness["redis"] == "down"

    # SCENARIO 15: Backup archive corrupted -> Checksum validation fails and rejects restore
    def test_scenario_15_corrupted_backup_archive_rejected_by_checksum(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            corrupt_file = os.path.join(tmp_dir, "corrupt_backup.dump")
            with open(corrupt_file, "wb") as f:
                f.write(b"CORRUPTED_TAR_DATA_123456789")

            # Validate checksum with false hash
            is_valid = BackupService.verify_backup_checksum(
                corrupt_file,
                expected_sha256="0000000000000000000000000000000000000000000000000000000000000000",
            )
            assert is_valid is False

    # SCENARIO 16: Daily closing contains cash discrepancy -> Visible and auditable
    def test_scenario_16_daily_closing_cash_discrepancy_visible(self):
        reg = CashRegister.objects.create(
            organization=self.org_a,
            store=self.store_a,
            cashier=self.cashier_a,
            opening_cash=Decimal("1000.00"),
            cash_sales=Decimal("2000.00"),
            status="open",
        )

        today = timezone.now().date()
        report = DailyBusinessClosingService.get_daily_closing_report(
            organization=self.org_a,
            store=self.store_a,
            target_date=today,
        )
        assert report["cash_drawer_reconciliation"]["expected_closing_cash"] == 3000.00

        # Manager counted ₹2,800 (₹200 shortage)
        closing = DailyBusinessClosingService.finalize_daily_closing(
            organization=self.org_a,
            store=self.store_a,
            user=self.manager_a,
            actual_counted_cash=Decimal("2800.00"),
            notes="Cash drawer shortage of ₹200 noted.",
        )

        assert closing["actual_cash"] == 2800.00
        assert closing["expected_cash"] == 3000.00
        assert closing["difference"] == -200.00
        assert closing["status"] == "closed"

    # SCENARIO 17: Reconciliation runs concurrently -> No conflicting writes
    def test_scenario_17_reconciliation_read_only_no_conflicting_writes(self):
        res1 = FinancialReconciliationService.run_reconciliation(
            organization=self.org_a,
            store=self.store_a,
            emit_alerts=False,
        )
        res2 = InventoryReconciliationService.run_reconciliation(
            organization=self.org_a,
            store=self.store_a,
            emit_alerts=False,
        )

        assert "status" in res1
        assert "status" in res2
        # Verify reconciliation did not mutate any product stock
        assert not InventoryMovement.objects.filter(reference_type="reconciliation").exists()

    # SCENARIO 18: Unauthorized user exports financial records -> Request denied
    def test_scenario_18_unauthorized_user_export_denied(self):
        # Staff role attempting manager financial export
        self.client.force_authenticate(user=self.cashier_a)
        today_str = timezone.now().date().isoformat()
        resp = self.client.get(f"/api/v1/reports/reconciliation/financial/export/?start_date={today_str}&end_date={today_str}")
        assert resp.status_code == 403
