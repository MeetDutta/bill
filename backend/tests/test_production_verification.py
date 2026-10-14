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
from apps.transactions.models import Transaction, TransactionItem, TransactionPayment
from apps.invoices.models import Invoice, Quotation, QuotationItem
from apps.billing.services.checkout_service import CheckoutService
from apps.billing.services.realtime_service import RealtimeService


@pytest.mark.django_db(transaction=True)
class TestProductionVerificationSuite:
    """
    Exhaustive stress-testing, database invariant, reconciliation,
    and security verification suite for BillMeet production readiness.
    """

    @pytest.fixture(autouse=True)
    def setup_entities(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Apex Enterprise Retail")
        self.org_b = Organization.objects.create(name="Competitor Retail Corp")

        self.store = Store.objects.create(organization=self.org, name="Downtown Superstore", code="DT-01")
        self.store_b = Store.objects.create(organization=self.org_b, name="Competitor Store", code="COMP-01")

        self.user = User.objects.create_user(
            email="manager@apexretail.com",
            password="testpassword123",
            organization=self.org,
            role="store_manager",
        )
        self.user_b = User.objects.create_user(
            email="cashier@competitor.com",
            password="testpassword123",
            organization=self.org_b,
            role="cashier",
        )
        self.client.force_authenticate(user=self.user)

        self.config, _ = BusinessConfig.objects.get_or_create(
            organization=self.org,
            defaults={"allow_credit_sales": True, "gst_enabled": True},
        )
        self.config.allow_credit_sales = True
        self.config.save()

        self.customer = Customer.objects.create(
            organization=self.org,
            customer_id="CUST-APEX-01",
            first_name="Vikram",
            last_name="Malhotra",
            phone="9876500001",
            credit_limit=Decimal("25000.00"),
            outstanding_credit=Decimal("0.00"),
        )

        self.register = CashRegister.objects.create(
            organization=self.org,
            store=self.store,
            cashier=self.user,
            opening_cash=Decimal("5000.00"),
            status="open",
        )

    # =========================================================================
    # 1. FINANCIAL RECONCILIATION & LEDGER INTEGRITY
    # =========================================================================

    def test_invoice_total_and_payment_reconciliation(self):
        """
        Verify that invoice total matches sum of line items,
        and amount paid equals sum of applied payments to exact decimal cent.
        """
        p1 = Product.objects.create(
            organization=self.org,
            name="Organic Almonds 500g",
            sku="ALM-500",
            unit_price=Decimal("450.00"),
            current_stock=Decimal("50.00"),
            track_inventory=True,
        )
        p2 = Product.objects.create(
            organization=self.org,
            name="Cold Pressed Olive Oil 1L",
            sku="OIL-1L",
            unit_price=Decimal("800.00"),
            current_stock=Decimal("30.00"),
            track_inventory=True,
        )

        cart_data = {
            "store_id": str(self.store.id),
            "customer": {"id": str(self.customer.id)},
            "items": [
                {"product_id": str(p1.id), "quantity": 2, "unit_price": 450.00},  # 900
                {"product_id": str(p2.id), "quantity": 1, "unit_price": 800.00},  # 800
            ],
            # Total = 1700. Paid: 700 Cash + 1000 UPI
            "payments": [
                {"payment_method": "cash", "amount": 700.00},
                {"payment_method": "upi", "amount": 1000.00},
            ],
        }

        res = CheckoutService.process_checkout(
            organization=self.org,
            store=self.store,
            user=self.user,
            cart_data=cart_data,
            idempotency_key="recon-check-001",
        )

        tx = Transaction.objects.get(id=res["id"])
        invoice = Invoice.objects.get(transaction=tx)

        # Invariant 1: Total equals sum of line items
        items_sum = sum(item.total for item in tx.items.all())
        assert tx.total == items_sum == Decimal("1700.00")

        # Invariant 2: Total paid equals sum of payments
        payments_sum = sum(p.amount for p in tx.payments.all())
        assert tx.amount_paid == payments_sum == Decimal("1700.00")
        assert tx.payment_status == "paid"

        # Invariant 3: Cash register updated by exact cash amount (700.00)
        self.register.refresh_from_db()
        assert self.register.calculate_expected_cash() == Decimal("5700.00")

    def test_customer_credit_ledger_reconciliation(self):
        """
        Verify that Udhaar/Credit sale increases customer debt by exact unpaid portion
        and settles correctly upon credit repayment.
        """
        prod = Product.objects.create(
            organization=self.org,
            name="Premium Cashews 1kg",
            sku="CASH-1KG",
            unit_price=Decimal("1200.00"),
            current_stock=Decimal("20.00"),
            track_inventory=True,
        )

        cart_data = {
            "store_id": str(self.store.id),
            "customer": {"id": str(self.customer.id)},
            "items": [{"product_id": str(prod.id), "quantity": 2, "unit_price": 1200.00}],  # 2400
            # 1400 cash + 1000 credit
            "payments": [
                {"payment_method": "cash", "amount": 1400.00},
                {"payment_method": "credit", "amount": 1000.00},
            ],
        }

        CheckoutService.process_checkout(
            organization=self.org,
            store=self.store,
            user=self.user,
            cart_data=cart_data,
            idempotency_key="credit-recon-001",
        )

        self.customer.refresh_from_db()
        assert self.customer.outstanding_credit == Decimal("1000.00")

        # Now customer repays 600 via UPI
        pay_url = "/api/v1/pos/credit/record-payment/"
        pay_res = self.client.post(
            pay_url,
            {
                "customer_id": str(self.customer.id),
                "amount": "600.00",
                "payment_method": "upi",
                "notes": "Partial settlement via GPay",
            },
            format="json",
        )
        assert pay_res.status_code == status.HTTP_201_CREATED

        self.customer.refresh_from_db()
        assert self.customer.outstanding_credit == Decimal("400.00")

    def test_inventory_ledger_reconciliation(self):
        """
        Verify that Product current_stock equals opening_stock + sum(InventoryMovements).
        """
        prod = Product.objects.create(
            organization=self.org,
            name="Tracked Product X",
            sku="TP-X",
            unit_price=Decimal("100.00"),
            current_stock=Decimal("100.00"),
            track_inventory=True,
        )
        opening_stock = prod.current_stock

        # 1. Sale of 15 units
        cart_data = {
            "store_id": str(self.store.id),
            "items": [{"product_id": str(prod.id), "quantity": 15, "unit_price": 100.00}],
            "payments": [{"payment_method": "cash", "amount": 1500.00}],
        }
        CheckoutService.process_checkout(
            organization=self.org,
            store=self.store,
            user=self.user,
            cart_data=cart_data,
            idempotency_key="inv-recon-001",
        )

        # 2. Manual stock adjustment: damage of 3 units
        adjust_url = "/api/v1/pos/inventory/adjust/"
        adj_res = self.client.post(
            adjust_url,
            {
                "product_id": str(prod.id),
                "quantity": -3,
                "reason": "damage",
                "notes": "Water leakage in warehouse",
            },
            format="json",
        )
        assert adj_res.status_code == status.HTTP_201_CREATED

        prod.refresh_from_db()
        movements = InventoryMovement.objects.filter(product=prod)
        movements_sum = sum(m.quantity for m in movements)

        assert prod.current_stock == opening_stock + movements_sum
        assert prod.current_stock == Decimal("82.00")

    # =========================================================================
    # 2. EXACT CASH CHANGE AND OVERPAYMENT HANDLING
    # =========================================================================

    def test_exact_1200_bill_with_2000_cash_tendered(self):
        """
        Specification requirement:
        - Invoice total: 1,200
        - Cash tendered: 2,000
        - Change returned: 800
        - Cash applied to invoice: 1,200
        - Drawer cash increase: exactly 1,200 (not 2,000)
        """
        prod = Product.objects.create(
            organization=self.org,
            name="Formal Oxford Shirt",
            sku="SHIRT-1200",
            unit_price=Decimal("1200.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )

        cart_data = {
            "store_id": str(self.store.id),
            "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 1200.00}],
            "payments": [{"payment_method": "cash", "amount": 2000.00}],
        }

        res = CheckoutService.process_checkout(
            organization=self.org,
            store=self.store,
            user=self.user,
            cart_data=cart_data,
            idempotency_key="change-spec-1200",
        )

        assert Decimal(str(res["tendered_amount"])) == Decimal("2000.00")
        assert Decimal(str(res["change_amount"])) == Decimal("800.00")
        assert Decimal(str(res["total"])) == Decimal("1200.00")

        tx = Transaction.objects.get(id=res["id"])
        assert tx.tendered_amount == Decimal("2000.00")
        assert tx.change_amount == Decimal("800.00")
        assert tx.amount_paid == Decimal("1200.00")

        # TransactionPayment record must record the applied amount (1200.00)
        payment = tx.payments.get()
        assert payment.amount == Decimal("1200.00")

        # Cash drawer must increase by exactly 1200.00
        self.register.refresh_from_db()
        assert self.register.calculate_expected_cash() == Decimal("6200.00")  # 5000 + 1200

    def test_walkin_customer_cannot_use_credit(self):
        """
        Anonymous walk-in customers are strictly forbidden from taking Credit/Udhaar.
        """
        prod = Product.objects.create(
            organization=self.org,
            name="Wireless Mouse",
            sku="MOUSE-01",
            unit_price=Decimal("800.00"),
            current_stock=Decimal("10.00"),
        )
        cart_data = {
            "store_id": str(self.store.id),
            "is_walk_in": True,
            "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 800.00}],
            "payments": [{"payment_method": "credit", "amount": 800.00}],
        }

        with pytest.raises(Exception) as excinfo:
            CheckoutService.process_checkout(
                organization=self.org,
                store=self.store,
                user=self.user,
                cart_data=cart_data,
                idempotency_key="walkin-credit-fail",
            )
        assert "Credit sales require a registered customer" in str(excinfo.value)

    def test_credit_limit_strictly_enforced(self):
        """
        Credit sales exceeding customer credit_limit are rejected.
        """
        self.customer.credit_limit = Decimal("1000.00")
        self.customer.outstanding_credit = Decimal("800.00")
        self.customer.save()

        prod = Product.objects.create(
            organization=self.org,
            name="Designer Jacket",
            sku="JKT-500",
            unit_price=Decimal("500.00"),
            current_stock=Decimal("5.00"),
        )
        cart_data = {
            "store_id": str(self.store.id),
            "customer": {"id": str(self.customer.id)},
            "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 500.00}],
            "payments": [{"payment_method": "credit", "amount": 500.00}],  # 800 + 500 = 1300 > 1000 limit
        }

        with pytest.raises(Exception) as excinfo:
            CheckoutService.process_checkout(
                organization=self.org,
                store=self.store,
                user=self.user,
                cart_data=cart_data,
                idempotency_key="credit-limit-exceeded",
            )
        assert "exceeded" in str(excinfo.value)

    # =========================================================================
    # 3. INVOICE INVARIANT TESTS (ZERO STOCK MUTATION)
    # =========================================================================

    def test_invoice_view_pdf_reprint_never_touches_inventory(self):
        """
        Verify that viewing, generating PDF, reprinting, or public-viewing an invoice
        never deducts or alters inventory stock or records movements.
        """
        prod = Product.objects.create(
            organization=self.org,
            name="Bluetooth Speaker",
            sku="SPK-BT",
            unit_price=Decimal("2500.00"),
            current_stock=Decimal("15.00"),
            track_inventory=True,
        )

        cart_data = {
            "store_id": str(self.store.id),
            "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 2500.00}],
            "payments": [{"payment_method": "cash", "amount": 2500.00}],
        }
        res = CheckoutService.process_checkout(
            organization=self.org,
            store=self.store,
            user=self.user,
            cart_data=cart_data,
            idempotency_key="inv-invariant-001",
        )

        prod.refresh_from_db()
        stock_baseline = prod.current_stock  # 14.00
        movements_baseline = InventoryMovement.objects.filter(product=prod).count()  # 1 movement

        invoice_id = res["invoice"]["id"]
        invoice = Invoice.objects.get(id=invoice_id)

        # 1. Invoice Detail View
        detail_res = self.client.get(f"/api/v1/invoices/{invoice_id}/")
        assert detail_res.status_code == status.HTTP_200_OK

        prod.refresh_from_db()
        assert prod.current_stock == stock_baseline
        assert InventoryMovement.objects.filter(product=prod).count() == movements_baseline

        # 2. Invoice PDF Generation View
        pdf_res = self.client.post(f"/api/v1/invoices/{invoice_id}/pdf/")
        assert pdf_res.status_code == status.HTTP_200_OK

        prod.refresh_from_db()
        assert prod.current_stock == stock_baseline
        assert InventoryMovement.objects.filter(product=prod).count() == movements_baseline

        # 3. Repeated PDF / Reprint call
        pdf_res2 = self.client.post(f"/api/v1/invoices/{invoice_id}/pdf/")
        assert pdf_res2.status_code == status.HTTP_200_OK

        prod.refresh_from_db()
        assert prod.current_stock == stock_baseline
        assert InventoryMovement.objects.filter(product=prod).count() == movements_baseline

        # 4. Public Invoice View with secure token
        anon_client = APIClient()
        public_res = anon_client.get(f"/api/v1/invoices/view/{invoice.secure_token}/")
        assert public_res.status_code == status.HTTP_200_OK

        prod.refresh_from_db()
        assert prod.current_stock == stock_baseline
        assert InventoryMovement.objects.filter(product=prod).count() == movements_baseline

    # =========================================================================
    # 4. EXTERNAL INGEST DETERMINISTIC MATCHING & VALIDATION
    # =========================================================================

    def test_ingest_duplicate_product_names_does_not_guess(self):
        """
        When two distinct catalog products share the exact same name,
        external ingestion must NOT guess or pick an arbitrary product to deduct.
        """
        p1 = Product.objects.create(
            organization=self.org,
            name="Cotton T-Shirt",
            sku="TSHIRT-RED-M",
            unit_price=Decimal("499.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )
        p2 = Product.objects.create(
            organization=self.org,
            name="Cotton T-Shirt",
            sku="TSHIRT-BLUE-L",
            unit_price=Decimal("499.00"),
            current_stock=Decimal("20.00"),
            track_inventory=True,
        )

        ingest_payload = {
            "invoice_number": "EXT-AMBIGUOUS-01",
            "transaction_date": timezone.now().isoformat(),
            "store_id": str(self.store.id),
            "subtotal": "499.00",
            "discount": "0.00",
            "tax": "0.00",
            "total": "499.00",
            "items": [
                {
                    "name": "Cotton T-Shirt",  # Ambiguous: 2 products share this name
                    "quantity": 1,
                    "unit_price": "499.00",
                    "total": "499.00",
                }
            ],
            "payment_method": "cash",
            "external_transaction_id": "EXT-TX-AMBIGUOUS-01",
        }

        res = self.client.post("/api/v1/transactions/ingest/", ingest_payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED

        # Neither product stock should have been arbitrarily deducted
        p1.refresh_from_db()
        p2.refresh_from_db()
        assert p1.current_stock == Decimal("10.00")
        assert p2.current_stock == Decimal("20.00")

    def test_ingest_invalid_zero_or_negative_quantity_rejected(self):
        """
        Ingestion with zero or negative item quantities is rejected with HTTP 400.
        """
        payload = {
            "invoice_number": "EXT-INVALID-QTY",
            "transaction_date": timezone.now().isoformat(),
            "store_id": str(self.store.id),
            "subtotal": "100.00",
            "tax": "0.00",
            "total": "100.00",
            "items": [
                {
                    "name": "Sample Product",
                    "quantity": -2,  # Invalid
                    "unit_price": "50.00",
                    "total": "-100.00",
                }
            ],
            "payment_method": "cash",
            "external_transaction_id": "EXT-INVALID-QTY-001",
        }
        res = self.client.post("/api/v1/transactions/ingest/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "greater than zero" in str(res.data)

    def test_duplicate_external_transaction_id_is_idempotent(self):
        """
        Posting identical external_transaction_id twice returns 200 OK
        with the existing record, without creating duplicate movements.
        """
        prod = Product.objects.create(
            organization=self.org,
            name="External Sync Item",
            sku="EXT-SYNC-01",
            unit_price=Decimal("300.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )

        payload = {
            "invoice_number": "EXT-IDEMPOTENT-001",
            "transaction_date": timezone.now().isoformat(),
            "store_id": str(self.store.id),
            "subtotal": "300.00",
            "tax": "0.00",
            "total": "300.00",
            "items": [
                {
                    "external_product_id": str(prod.id),
                    "name": "External Sync Item",
                    "quantity": 2,
                    "unit_price": "150.00",
                    "total": "300.00",
                }
            ],
            "payment_method": "upi",
            "external_transaction_id": "SHOPIFY-ORDER-9999",
        }

        # First Call
        r1 = self.client.post("/api/v1/transactions/ingest/", payload, format="json")
        assert r1.status_code == status.HTTP_201_CREATED

        prod.refresh_from_db()
        assert prod.current_stock == Decimal("8.00")
        assert InventoryMovement.objects.filter(product=prod).count() == 1

        # Second Call (Idempotent Retry)
        r2 = self.client.post("/api/v1/transactions/ingest/", payload, format="json")
        assert r2.status_code == status.HTTP_200_OK

        prod.refresh_from_db()
        # Stock must NOT be deducted again!
        assert prod.current_stock == Decimal("8.00")
        assert InventoryMovement.objects.filter(product=prod).count() == 1

    # =========================================================================
    # 5. REALTIME SSE SECURITY & STREAM TICKET VERIFICATION
    # =========================================================================

    def test_realtime_stream_ticket_and_tenant_isolation(self):
        """
        Verify:
        1. Authenticated user can request a short-lived single-use stream ticket.
        2. Connecting with the ticket authenticates the stream.
        3. Ticket cannot be reused.
        4. Cross-tenant isolation: Org B cannot stream Org A events.
        """
        # 1. Request ticket
        ticket_res = self.client.post("/api/v1/pos/realtime/ticket/")
        assert ticket_res.status_code == status.HTTP_200_OK
        ticket = ticket_res.data["ticket"]
        assert ticket.startswith("stkt_")

        # 2. Connect with ticket
        anon_client = APIClient()
        stream_res = anon_client.get(f"/api/v1/pos/realtime/stream/?ticket={ticket}")
        assert stream_res.status_code == status.HTTP_200_OK
        assert stream_res["Content-Type"] == "text/event-stream"

        # 3. Ticket is single-use: subsequent connection with same ticket is rejected
        reuse_res = anon_client.get(f"/api/v1/pos/realtime/stream/?ticket={ticket}")
        assert reuse_res.status_code == status.HTTP_401_UNAUTHORIZED

        # 4. Cross-tenant isolation: Competitor Org B user cannot view Org A events
        self.client.force_authenticate(user=self.user_b)
        recent_res = self.client.get("/api/v1/pos/realtime/recent/")
        assert recent_res.status_code == status.HTTP_200_OK
        # Org B sees 0 events from Org A
        assert len(recent_res.data) == 0

    # =========================================================================
    # 6. QUOTATION CONVERSION IDEMPOTENCY
    # =========================================================================

    def test_quotation_conversion_idempotency(self):
        """
        Converting a quotation must deduct inventory exactly once.
        Attempting to convert an already converted quotation must be rejected.
        """
        prod = Product.objects.create(
            organization=self.org,
            name="Industrial Drill",
            sku="DRL-01",
            unit_price=Decimal("4500.00"),
            current_stock=Decimal("5.00"),
            track_inventory=True,
        )

        quotation = Quotation.objects.create(
            organization=self.org,
            store=self.store,
            quotation_number="QT-TEST-001",
            status="draft",
            subtotal=Decimal("4500.00"),
            total=Decimal("4500.00"),
            created_by=self.user,
        )
        QuotationItem.objects.create(
            quotation=quotation,
            product=prod,
            name=prod.name,
            quantity=Decimal("1.00"),
            unit_price=Decimal("4500.00"),
            total=Decimal("4500.00"),
        )

        convert_url = f"/api/v1/quotations/{quotation.id}/convert/"

        # First conversion: succeeds and deducts 1 unit
        c1 = self.client.post(convert_url, {"payment_method": "cash"}, format="json")
        assert c1.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]

        prod.refresh_from_db()
        assert prod.current_stock == Decimal("4.00")

        # Second conversion attempt: quotation is already converted
        c2 = self.client.post(convert_url, {"payment_method": "cash"}, format="json")
        assert c2.status_code == status.HTTP_400_BAD_REQUEST

        prod.refresh_from_db()
        assert prod.current_stock == Decimal("4.00")  # No second deduction
