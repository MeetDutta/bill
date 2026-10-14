import pytest
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product, InventoryMovement
from apps.customers.models import Customer
from apps.billing.models import BusinessConfig, CashRegister
from apps.transactions.models import Transaction, TransactionItem, TransactionPayment
from apps.invoices.models import Invoice
from apps.reports.services.health_service import SystemHealthService
from apps.reports.services.financial_reconciliation import FinancialReconciliationService
from apps.reports.services.inventory_reconciliation import InventoryReconciliationService
from apps.reports.services.backup_service import BackupService
from apps.reports.services.alert_service import OperationalAlertService
from apps.reports.services.daily_closing import DailyBusinessClosingService


@pytest.mark.django_db
class TestControlledPilotOperations:
    @pytest.fixture(autouse=True)
    def setup_fixtures(self):
        self.org = Organization.objects.create(name="Pilot Supermarket Corp")
        self.store = Store.objects.create(organization=self.org, name="Pilot Flagship Store", code="PILOT-01")
        self.user = User.objects.create_user(
            email="manager@pilot.com",
            password="PilotPassword123!",
            organization=self.org,
            role="store_manager",
        )
        self.config = BusinessConfig.objects.create(
            organization=self.org,
            allow_negative_stock=False,
            credit_sales_enabled=True,
            is_pilot_mode=True,
        )
        self.client = APIClient()

    # 1. Health Endpoints & Diagnostics
    def test_public_health_liveness_and_readiness(self):
        resp_live = self.client.get("/health/liveness/")
        assert resp_live.status_code == 200
        assert resp_live.json()["status"] == "healthy"

        resp_ready = self.client.get("/health/readiness/")
        assert resp_ready.status_code == 200
        assert resp_ready.json()["status"] == "healthy"

    def test_system_health_authenticated_diagnostics(self):
        # Unauthenticated request must be rejected
        resp_unauth = self.client.get("/api/v1/health/system/")
        assert resp_unauth.status_code == 401

        # Authenticated request
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/v1/health/system/")
        assert resp.status_code == 200
        data = resp.json()
        assert "overall_status" in data
        assert "indicators" in data
        assert len(data["indicators"]) >= 10
        assert data["pilot_mode"]["active"] is True

        ind_ids = [ind["id"] for ind in data["indicators"]]
        assert "postgresql" in ind_ids
        assert "migrations" in ind_ids
        assert "backup" in ind_ids
        assert "storage" in ind_ids

    # 2. Financial Reconciliation Tests
    def test_financial_reconciliation_clean_dataset(self):
        # Create a completely balanced transaction
        p = Product.objects.create(organization=self.org, name="Pilot Milk", unit_price=Decimal("50.00"), sku="MILK-1")
        tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            cashier=self.user,
            transaction_date=timezone.now(),
            total=Decimal("100.00"),
            amount_paid=Decimal("100.00"),
            invoice_number="INV-PILOT-001",
            status="completed",
        )
        TransactionItem.objects.create(
            transaction=tx,
            product=p,
            name=p.name,
            quantity=Decimal("2.00"),
            unit_price=Decimal("50.00"),
            total=Decimal("100.00"),
        )
        TransactionPayment.objects.create(
            organization=self.org,
            transaction=tx,
            payment_method="cash",
            amount=Decimal("100.00"),
            status="success",
        )
        Invoice.objects.create(
            organization=self.org,
            transaction=tx,
            invoice_number="INV-PILOT-001",
            secure_token="token123",
        )

        res = FinancialReconciliationService.run_reconciliation(organization=self.org, emit_alerts=False)
        assert res["status"] == "clean"
        assert res["discrepancies_count"] == 0

    def test_financial_reconciliation_detects_item_mismatch(self):
        p = Product.objects.create(organization=self.org, name="Pilot Bread", unit_price=Decimal("40.00"), sku="BREAD-1")
        # Tampered total (total 100, but items sum to 80)
        tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            cashier=self.user,
            transaction_date=timezone.now(),
            total=Decimal("100.00"),
            amount_paid=Decimal("100.00"),
            invoice_number="INV-PILOT-002",
            status="completed",
        )
        TransactionItem.objects.create(
            transaction=tx,
            product=p,
            name=p.name,
            quantity=Decimal("2.00"),
            unit_price=Decimal("40.00"),  # sum 80
            total=Decimal("80.00"),
        )
        TransactionPayment.objects.create(
            organization=self.org,
            transaction=tx,
            payment_method="upi",
            amount=Decimal("100.00"),
            status="success",
        )

        res = FinancialReconciliationService.run_reconciliation(organization=self.org, emit_alerts=False)
        assert res["status"] == "discrepancies_detected"
        mismatches = [d for d in res["discrepancies"] if d["check_type"] == "LINE_ITEMS_TOTAL_MISMATCH"]
        assert len(mismatches) == 1
        assert mismatches[0]["severity"] == "CRITICAL"
        assert mismatches[0]["invoice_number"] == "INV-PILOT-002"

    def test_financial_reconciliation_detects_payment_drift(self):
        p = Product.objects.create(organization=self.org, name="Pilot Butter", unit_price=Decimal("60.00"), sku="BUTTER-1")
        tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            cashier=self.user,
            transaction_date=timezone.now(),
            total=Decimal("60.00"),
            amount_paid=Decimal("60.00"),
            invoice_number="INV-PILOT-003",
            status="completed",
        )
        TransactionItem.objects.create(
            transaction=tx,
            product=p,
            name=p.name,
            quantity=Decimal("1.00"),
            unit_price=Decimal("60.00"),
            total=Decimal("60.00"),
        )
        # Payment only records ₹40, leaving ₹20 unexplained gap
        TransactionPayment.objects.create(
            organization=self.org,
            transaction=tx,
            payment_method="card",
            amount=Decimal("40.00"),
            status="success",
        )

        res = FinancialReconciliationService.run_reconciliation(organization=self.org, emit_alerts=False)
        payment_discs = [d for d in res["discrepancies"] if d["check_type"] == "PAYMENT_ALLOCATION_MISMATCH"]
        assert len(payment_discs) >= 1
        assert payment_discs[0]["severity"] == "CRITICAL"

    # 3. Inventory Reconciliation Tests
    def test_inventory_reconciliation_clean_dataset(self):
        prod = Product.objects.create(
            organization=self.org,
            name="Apple Juice",
            sku="JUICE-01",
            unit_price=Decimal("20.00"),
            current_stock=Decimal("18.00"),
            track_inventory=True,
        )
        # Opening stock 20, sale of 2 -> 18
        InventoryMovement.objects.create(
            organization=self.org,
            product=prod,
            movement_type="OPENING_STOCK",
            quantity=Decimal("0.00"),
            previous_stock=Decimal("20.00"),
            new_stock=Decimal("20.00"),
        )
        InventoryMovement.objects.create(
            organization=self.org,
            product=prod,
            movement_type="SALE",
            quantity=Decimal("-2.00"),
            previous_stock=Decimal("20.00"),
            new_stock=Decimal("18.00"),
        )

        res = InventoryReconciliationService.run_reconciliation(organization=self.org, emit_alerts=False)
        assert res["status"] == "clean"
        assert res["discrepancies_count"] == 0

    def test_inventory_reconciliation_detects_stock_drift(self):
        prod = Product.objects.create(
            organization=self.org,
            name="Orange Juice",
            sku="JUICE-02",
            unit_price=Decimal("25.00"),
            current_stock=Decimal("15.00"),  # Drifted from ledger
            track_inventory=True,
        )
        # Movement says stock should be 18
        InventoryMovement.objects.create(
            organization=self.org,
            product=prod,
            movement_type="OPENING_STOCK",
            quantity=Decimal("0.00"),
            previous_stock=Decimal("20.00"),
            new_stock=Decimal("20.00"),
        )
        InventoryMovement.objects.create(
            organization=self.org,
            product=prod,
            movement_type="SALE",
            quantity=Decimal("-2.00"),
            previous_stock=Decimal("20.00"),
            new_stock=Decimal("18.00"),
        )

        res = InventoryReconciliationService.run_reconciliation(organization=self.org, emit_alerts=False)
        assert res["status"] == "discrepancies_detected"
        drift = [d for d in res["discrepancies"] if d["check_type"] == "STOCK_LEDGER_MISMATCH"]
        assert len(drift) == 1
        assert drift[0]["sku"] == "JUICE-02"
        assert drift[0]["expected_value"] == "18.00"
        assert drift[0]["actual_value"] == "15.00"

    def test_inventory_reconciliation_detects_prohibited_negative_stock(self):
        prod = Product.objects.create(
            organization=self.org,
            name="Expired Soda",
            sku="SODA-NEG",
            unit_price=Decimal("30.00"),
            current_stock=Decimal("-5.00"),
            track_inventory=True,
        )
        res = InventoryReconciliationService.run_reconciliation(organization=self.org, emit_alerts=False)
        neg_discs = [d for d in res["discrepancies"] if d["check_type"] == "NEGATIVE_STOCK_PROHIBITED"]
        assert len(neg_discs) == 1
        assert neg_discs[0]["severity"] == "CRITICAL"

    # 4. Operational Alert Deduplication
    def test_operational_alert_deduplication(self):
        # Emit alert 1
        a1 = OperationalAlertService.emit_alert(
            organization=self.org,
            alert_type="CHECKOUT_FAILURE",
            severity="CRITICAL",
            title="Payment gateway timeout",
            description="Timeout contacting UPI switch",
            entity_type="transaction",
            entity_id="TX-FAIL-999",
            dedup_window_minutes=15,
        )

        # Emit alert 2 with same entity within 15 min
        a2 = OperationalAlertService.emit_alert(
            organization=self.org,
            alert_type="CHECKOUT_FAILURE",
            severity="CRITICAL",
            title="Payment gateway timeout",
            description="Second timeout retry",
            entity_type="transaction",
            entity_id="TX-FAIL-999",
            dedup_window_minutes=15,
        )

        # Must reuse the same alert instance without creating a second record
        assert a1.id == a2.id
        assert a2.description == "Second timeout retry"

    # 5. Backup Service Status
    def test_backup_status_recording(self):
        BackupService.record_backup(
            filename="unit_test_backup.dump",
            size_bytes=102400,
            status="success",
        )
        BackupService.record_restoration_drill(
            backup_filename="unit_test_backup.dump",
            duration_seconds=0.85,
            status="verified",
            verified_counts={"transactions": 5, "invoices": 5},
        )
        status = BackupService.get_backup_status(organization=self.org)
        assert status["health"] == "healthy"
        assert status["last_backup"]["filename"] == "unit_test_backup.dump"
        assert status["last_verified_restoration"]["status"] == "verified"

    # 6. Daily Closing Report & Finalization
    def test_daily_business_closing_report_and_finalization(self):
        reg = CashRegister.objects.create(
            organization=self.org,
            store=self.store,
            cashier=self.user,
            opening_cash=Decimal("5000.00"),
            cash_sales=Decimal("1200.00"),
            status="open",
        )

        report = DailyBusinessClosingService.get_daily_closing_report(
            organization=self.org,
            store=self.store,
        )
        assert report["cash_drawer_reconciliation"]["register_status"] == "open"
        assert report["cash_drawer_reconciliation"]["opening_cash"] == 5000.0
        assert report["cash_drawer_reconciliation"]["expected_closing_cash"] == 6200.0

        # Finalize closing with actual cash ₹6,200 (₹0 difference)
        fin = DailyBusinessClosingService.finalize_daily_closing(
            organization=self.org,
            user=self.user,
            actual_counted_cash=Decimal("6200.00"),
            notes="End of shift counted cleanly",
            store=self.store,
        )
        assert fin["status"] == "closed"
        assert fin["expected_cash"] == 6200.0
        assert fin["actual_cash"] == 6200.0
        assert fin["difference"] == 0.0

        reg.refresh_from_db()
        assert reg.status == "closed"
        assert reg.difference == Decimal("0.00")

    # 7. CSV Export Views
    def test_reconciliation_csv_exports(self):
        self.client.force_authenticate(user=self.user)

        resp_fin = self.client.get("/api/v1/reports/reconciliation/financial/export/")
        assert resp_fin.status_code == 200
        assert resp_fin["Content-Type"] == "text/csv"
        assert "Check Type" in resp_fin.content.decode()

        resp_inv = self.client.get("/api/v1/reports/reconciliation/inventory/export/")
        assert resp_inv.status_code == 200
        assert resp_inv["Content-Type"] == "text/csv"
        assert "Check Type" in resp_inv.content.decode()
