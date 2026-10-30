import uuid
import threading
import time
from decimal import Decimal
import pytest
import xml.etree.ElementTree as ET
from django.utils import timezone
from django.db import connection, transaction
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product, ProductCategory, InventoryMovement, PurchaseOrder, PurchaseOrderItem
from apps.customers.models import Customer
from apps.billing.models import BusinessConfig, CashRegister
from apps.transactions.models import Transaction, TransactionItem, TransactionPayment, SalesReturn
from apps.invoices.models import Invoice, Quotation, QuotationItem
from apps.billing.services.checkout_service import CheckoutService
from apps.billing.services.cart_engine import CartEngine
from apps.billing.services.tally_export_service import TallyExportService
from apps.notifications.models import Notification
from apps.notifications.services import NotificationService


@pytest.fixture
def adversarial_suite_setup(db):
    org_a = Organization.objects.create(
        name="Apex Alpha Retail",
        legal_name="Apex Alpha Retail Private Limited",
        gst_number="27ABCDE1234F1Z5",
        state="Maharashtra",
    )
    store_a = Store.objects.create(
        organization=org_a,
        name="Alpha Store Mumbai",
        code="ALP-01",
        state="Maharashtra",
        status="active",
    )
    admin_a = User.objects.create_user(
        email="admin.alpha@apex.local",
        password="Password@123",
        organization=org_a,
        role="org_admin",
        first_name="Admin",
        last_name="Alpha",
    )
    cashier_a = User.objects.create_user(
        email="cashier.alpha@apex.local",
        password="Password@123",
        organization=org_a,
        role="cashier",
        first_name="Cashier",
        last_name="Alpha",
    )
    config_a = BusinessConfig.objects.create(
        organization=org_a,
        business_type="RETAIL",
        gst_enabled=True,
        tax_mode="exclusive",
        default_tax_rate=Decimal("18.00"),
        allow_credit_sales=True,
        default_credit_limit=Decimal("50000.00"),
        max_discount_cashier=Decimal("15.00"),
        allow_negative_stock=False,
        low_stock_threshold=Decimal("5.00"),
        invoice_prefix="APX-",
    )
    cat_a = ProductCategory.objects.create(organization=org_a, name="Electronics")
    prod_a = Product.objects.create(
        organization=org_a,
        category=cat_a,
        name="Wireless Bluetooth Headset",
        sku="WLS-001",
        selling_price=Decimal("1000.00"),
        unit_price=Decimal("1000.00"),
        cost_price=Decimal("600.00"),
        tax_rate=Decimal("18.00"),
        current_stock=Decimal("50.00"),
        baseline_stock=Decimal("50.00"),
        min_stock=Decimal("10.00"),
        track_inventory=True,
        is_active=True,
    )
    customer_a = Customer.objects.create(
        organization=org_a,
        first_name="Rohan",
        last_name="Verma",
        phone="9820011222",
        state="Maharashtra",
        gstin="27AABCR1234D1ZP",
        credit_limit=Decimal("10000.00"),
    )

    # Competitor Org B for tenant boundary attacks
    org_b = Organization.objects.create(
        name="Beta Retailers",
        legal_name="Beta Retail Private Limited",
        gst_number="24BCDEF5678G2Z6",
        state="Gujarat",
    )
    store_b = Store.objects.create(
        organization=org_b,
        name="Beta Ahmedabad Store",
        code="BET-01",
        state="Gujarat",
        status="active",
    )
    admin_b = User.objects.create_user(
        email="admin.beta@beta.local",
        password="Password@123",
        organization=org_b,
        role="org_admin",
        first_name="Admin",
        last_name="Beta",
    )
    prod_b = Product.objects.create(
        organization=org_b,
        name="Beta Secret Smartphone",
        sku="BETA-PHONE",
        selling_price=Decimal("20000.00"),
        unit_price=Decimal("20000.00"),
        tax_rate=Decimal("18.00"),
        current_stock=Decimal("10.00"),
        track_inventory=True,
        is_active=True,
    )

    return {
        "org_a": org_a,
        "store_a": store_a,
        "admin_a": admin_a,
        "cashier_a": cashier_a,
        "config_a": config_a,
        "prod_a": prod_a,
        "customer_a": customer_a,
        "org_b": org_b,
        "store_b": store_b,
        "admin_b": admin_b,
        "prod_b": prod_b,
    }


@pytest.mark.django_db(transaction=True)
class TestAdversarialPOSAndBilling:
    """Module A: Adversarial Checkout and Billing Engine"""

    def test_concurrent_checkout_competing_for_final_unit_prevents_overselling(self, adversarial_suite_setup):
        """Two concurrent checkouts compete for 1 remaining unit: exactly 1 succeeds, 1 rejected."""
        prod = adversarial_suite_setup["prod_a"]
        org = adversarial_suite_setup["org_a"]
        store = adversarial_suite_setup["store_a"]
        admin = adversarial_suite_setup["admin_a"]

        prod.current_stock = Decimal("1.00")
        prod.save(update_fields=["current_stock"])

        results = []
        errors = []

        def do_checkout(thread_id):
            connection.close()
            try:
                res = CheckoutService.process_checkout(
                    organization=org,
                    store=store,
                    user=admin,
                    cart_data={
                        "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 1000.00, "name": prod.name}],
                        "payments": [{"payment_method": "cash", "amount": 1180.00}],
                    },
                )
                results.append(res)
            except Exception as e:
                errors.append(str(e))
            finally:
                connection.close()

        t1 = threading.Thread(target=do_checkout, args=(1,))
        t2 = threading.Thread(target=do_checkout, args=(2,))
        t1.start()
        time.sleep(0.05)
        t2.start()
        t1.join()
        t2.join()

        prod.refresh_from_db()
        # Exactly one checkout must succeed, remaining stock must be 0, never negative
        assert len(results) == 1, f"Expected exactly 1 success, got {len(results)}"
        assert len(errors) == 1, f"Expected exactly 1 failure, got {len(errors)}"
        assert prod.current_stock == Decimal("0.00")

    def test_idempotent_duplicate_checkout_submission(self, adversarial_suite_setup):
        """Submitting the exact same checkout payload with identical idempotency key returns identical sale."""
        org = adversarial_suite_setup["org_a"]
        store = adversarial_suite_setup["store_a"]
        admin = adversarial_suite_setup["admin_a"]
        prod = adversarial_suite_setup["prod_a"]

        initial_stock = prod.current_stock
        client = APIClient()
        client.force_authenticate(user=admin)
        idemp = f"IDEMP-{uuid.uuid4().hex}"

        payload = {
            "idempotency_key": idemp,
            "store_id": str(store.id),
            "items": [{"product_id": str(prod.id), "quantity": 2, "unit_price": 1000.00, "name": prod.name}],
            "payments": [{"payment_method": "cash", "amount": 2360.00}],
            "subtotal": 2000.00,
            "tax": 360.00,
            "total": 2360.00,
        }

        res1 = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res1.status_code == status.HTTP_201_CREATED

        # Resubmit identical request
        res2 = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res2.status_code == status.HTTP_201_CREATED
        assert res1.data["id"] == res2.data["id"]
        assert res1.data["invoice_number"] == res2.data["invoice_number"]

        prod.refresh_from_db()
        # Stock deducted exactly once (2 units), NOT 4
        assert prod.current_stock == initial_stock - Decimal("2.00")

    def test_negative_quantity_rejected(self, adversarial_suite_setup):
        """Negative item quantity in checkout must be rejected."""
        store = adversarial_suite_setup["store_a"]
        admin = adversarial_suite_setup["admin_a"]
        prod = adversarial_suite_setup["prod_a"]

        client = APIClient()
        client.force_authenticate(user=admin)
        payload = {
            "store_id": str(store.id),
            "items": [{"product_id": str(prod.id), "quantity": -5, "unit_price": 1000.00}],
            "payments": [{"payment_method": "cash", "amount": 1000.00}],
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_excessive_cashier_discount_rejected(self, adversarial_suite_setup):
        """Cashier attempting a discount beyond business limit (15%) must be rejected."""
        store = adversarial_suite_setup["store_a"]
        cashier = adversarial_suite_setup["cashier_a"]
        prod = adversarial_suite_setup["prod_a"]

        client = APIClient()
        client.force_authenticate(user=cashier)
        # 25% discount > 15% allowed
        payload = {
            "store_id": str(store.id),
            "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 1000.00, "discount": 250.00}],
            "payments": [{"payment_method": "cash", "amount": 750.00}],
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "discount" in str(res.data).lower()

    def test_electronic_overpayment_rejected(self, adversarial_suite_setup):
        """Electronic payments (UPI/Card) exceeding the invoice amount must be rejected."""
        store = adversarial_suite_setup["store_a"]
        admin = adversarial_suite_setup["admin_a"]
        prod = adversarial_suite_setup["prod_a"]

        client = APIClient()
        client.force_authenticate(user=admin)
        # Total is 1180, but client tries to allocate 1500 on UPI
        payload = {
            "store_id": str(store.id),
            "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 1000.00}],
            "payments": [{"payment_method": "upi", "amount": 1500.00, "reference": "UPI123"}],
            "total": 1180.00,
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_checkout_inactive_product_rejected(self, adversarial_suite_setup):
        """Checkout with deactivated product is blocked."""
        store = adversarial_suite_setup["store_a"]
        admin = adversarial_suite_setup["admin_a"]
        prod = adversarial_suite_setup["prod_a"]

        prod.is_active = False
        prod.save(update_fields=["is_active"])

        client = APIClient()
        client.force_authenticate(user=admin)
        payload = {
            "store_id": str(store.id),
            "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 1000.00}],
            "payments": [{"payment_method": "cash", "amount": 1180.00}],
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestAdversarialMultiTenantAndRBAC:
    """Module E & F: Multi-Tenant Security Boundaries & Role-Based Access Control"""

    def test_tenant_a_cannot_read_tenant_b_invoices(self, adversarial_suite_setup):
        """Tenant A admin cannot access Tenant B's invoices."""
        org_b = adversarial_suite_setup["org_b"]
        store_b = adversarial_suite_setup["store_b"]
        admin_b = adversarial_suite_setup["admin_b"]
        admin_a = adversarial_suite_setup["admin_a"]

        # Create invoice in Tenant B
        tx_b = Transaction.objects.create(
            organization=org_b,
            store=store_b,
            invoice_number="INV-BETA-001",
            transaction_date=timezone.now(),
            total=Decimal("5000.00"),
            amount_paid=Decimal("5000.00"),
            payment_status="paid",
        )
        inv_b = Invoice.objects.create(
            organization=org_b,
            transaction=tx_b,
            invoice_number=tx_b.invoice_number,
            secure_token=uuid.uuid4().hex,
        )

        client = APIClient()
        client.force_authenticate(user=admin_a)

        # 1. List endpoint: Tenant B invoice must not appear
        res_list = client.get("/api/v1/invoices/")
        assert res_list.status_code == status.HTTP_200_OK
        ids = [inv["id"] for inv in res_list.data.get("results", [])]
        assert str(inv_b.id) not in ids

        # 2. Detail endpoint: Accessing directly must return 404
        res_detail = client.get(f"/api/v1/invoices/{inv_b.id}/")
        assert res_detail.status_code == status.HTTP_404_NOT_FOUND

    def test_tenant_a_cannot_modify_tenant_b_products(self, adversarial_suite_setup):
        """Tenant A admin cannot edit Tenant B's product catalog."""
        prod_b = adversarial_suite_setup["prod_b"]
        admin_a = adversarial_suite_setup["admin_a"]

        client = APIClient()
        client.force_authenticate(user=admin_a)
        res = client.patch(
            f"/api/v1/products/{prod_b.id}/",
            {"name": "Hacked Product Name"},
            format="json",
        )
        assert res.status_code in [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN]
        prod_b.refresh_from_db()
        assert prod_b.name == "Beta Secret Smartphone"

    def test_cashier_cannot_modify_business_configuration(self, adversarial_suite_setup):
        """Cashier attempting to update business config is rejected with 403 Forbidden."""
        cashier = adversarial_suite_setup["cashier_a"]
        client = APIClient()
        client.force_authenticate(user=cashier)

        res = client.post("/api/v1/pos/config/", {"max_cashier_discount_percent": 99.00}, format="json")
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_payload_organization_tampering_ignored(self, adversarial_suite_setup):
        """Attempting to inject a different organization ID in payload is safely disregarded."""
        org_b = adversarial_suite_setup["org_b"]
        admin_a = adversarial_suite_setup["admin_a"]

        client = APIClient()
        client.force_authenticate(user=admin_a)
        # Try creating customer with Tenant B's organization ID
        res = client.post(
            "/api/v1/customers/",
            {
                "first_name": "Infiltrator",
                "phone": "9998887771",
                "organization": str(org_b.id),
                "organization_id": str(org_b.id),
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        cust_id = res.data["id"]
        created_cust = Customer.objects.get(id=cust_id)
        # Must be bound to Tenant A (the authenticated user's organization), NOT Tenant B
        assert created_cust.organization_id == admin_a.organization_id
        assert created_cust.organization_id != org_b.id

    def test_cashier_sale_attribution_is_authoritative(self, adversarial_suite_setup):
        """Checkout by cashier stamps cashier identity authoritatively and ignores payload tampering."""
        store = adversarial_suite_setup["store_a"]
        cashier = adversarial_suite_setup["cashier_a"]
        admin = adversarial_suite_setup["admin_a"]
        prod = adversarial_suite_setup["prod_a"]

        client = APIClient()
        client.force_authenticate(user=cashier)

        # Cashier tries to attribute sale to Admin
        payload = {
            "store_id": str(store.id),
            "cashier_id": str(admin.id),
            "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 1000.00}],
            "payments": [{"payment_method": "cash", "amount": 1180.00}],
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        tx = Transaction.objects.get(id=res.data["transaction_id"])
        # Must be attributed to cashier, NOT admin
        assert tx.cashier_id == cashier.id


@pytest.mark.django_db
class TestAdversarialInventoryAndStockThresholds:
    """Module B: Inventory Integrity & Low-Stock Baseline Calculation"""

    def test_inventory_movement_audit_trail_created_on_sale(self, adversarial_suite_setup):
        """Every sale deduction creates an immutable InventoryMovement record."""
        store = adversarial_suite_setup["store_a"]
        admin = adversarial_suite_setup["admin_a"]
        prod = adversarial_suite_setup["prod_a"]
        org = adversarial_suite_setup["org_a"]

        initial_movements = InventoryMovement.objects.filter(product=prod).count()
        client = APIClient()
        client.force_authenticate(user=admin)
        payload = {
            "store_id": str(store.id),
            "items": [{"product_id": str(prod.id), "quantity": 3, "unit_price": 1000.00}],
            "payments": [{"payment_method": "cash", "amount": 3540.00}],
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED

        movements = InventoryMovement.objects.filter(product=prod).order_by("-created_at")
        assert movements.count() == initial_movements + 1
        latest = movements.first()
        assert latest.movement_type in ["SALE", "OUT"]
        assert latest.quantity == Decimal("-3.00") or abs(latest.quantity) == Decimal("3.00")

    def test_intelligent_low_stock_baseline_and_severity_progression(self, adversarial_suite_setup):
        """Tests that depletion below 25% triggers warning and below 10% triggers critical alerts."""
        org = adversarial_suite_setup["org_a"]
        store = adversarial_suite_setup["store_a"]
        admin = adversarial_suite_setup["admin_a"]

        # Product with baseline stock = 100
        prod = Product.objects.create(
            organization=org,
            name="Test Inventory Stock Alert Item",
            sku="STK-ALERT-01",
            selling_price=Decimal("100.00"),
            unit_price=Decimal("100.00"),
            current_stock=Decimal("100.00"),
            baseline_stock=Decimal("100.00"),
            track_inventory=True,
            is_active=True,
        )

        # Baseline is 100.
        # Deplete to 25 (<= 25%): triggers Low Stock Warning
        prod.current_stock = Decimal("25.00")
        prod.save(update_fields=["current_stock"])
        notif_warn = NotificationService.evaluate_product_low_stock(prod)
        assert notif_warn is not None
        assert notif_warn.severity == "warning"
        assert notif_warn.category == "inventory"

        # Deplete further to 15 (<= 20%): escalates to Critical alert
        prod.current_stock = Decimal("15.00")
        prod.save(update_fields=["current_stock"])
        notif_crit = NotificationService.evaluate_product_low_stock(prod)
        assert notif_crit is not None
        assert notif_crit.severity == "critical"

        # Restock to 80 (>= 30% hysteresis threshold): alert resolves cleanly
        prod.current_stock = Decimal("80.00")
        prod.save(update_fields=["current_stock"])
        res_rec = NotificationService.evaluate_product_low_stock(prod)
        assert res_rec is None
        notif_crit.refresh_from_db()
        assert notif_crit.resolved_at is not None


@pytest.mark.django_db
class TestAdversarialTaxAndTallyExport:
    """Module C & D: GST Bifurcation & Tally Double-Entry XML Validation"""

    def test_intra_state_gst_bifurcation_cgst_sgst(self, adversarial_suite_setup):
        """Intra-state transaction in Maharashtra splits tax 50/50 into CGST and SGST."""
        org = adversarial_suite_setup["org_a"]
        store = adversarial_suite_setup["store_a"]
        admin = adversarial_suite_setup["admin_a"]
        cust = adversarial_suite_setup["customer_a"]
        prod = adversarial_suite_setup["prod_a"]

        client = APIClient()
        client.force_authenticate(user=admin)
        payload = {
            "store_id": str(store.id),
            "customer_id": str(cust.id),
            "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 1000.00, "name": prod.name}],
            "payments": [{"payment_method": "cash", "amount": 1180.00}],
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED

        tx = Transaction.objects.get(id=res.data["transaction_id"])
        item = tx.items.first()
        # 18% on 1000 = 180 total tax -> CGST 90, SGST 90, IGST 0
        assert item.cgst_amount == Decimal("90.00")
        assert item.sgst_amount == Decimal("90.00")
        assert item.igst_amount == Decimal("0.00")

    def test_inter_state_gst_igst(self, adversarial_suite_setup):
        """Inter-state customer in Gujarat buying from Maharashtra seller incurs 100% IGST."""
        org = adversarial_suite_setup["org_a"]
        store = adversarial_suite_setup["store_a"]
        admin = adversarial_suite_setup["admin_a"]
        prod = adversarial_suite_setup["prod_a"]

        inter_cust = Customer.objects.create(
            organization=org,
            first_name="Jayesh",
            last_name="Patel",
            phone="9898011223",
            state="Gujarat",
            gstin="24AAACP1234F1Z8",
        )

        client = APIClient()
        client.force_authenticate(user=admin)
        payload = {
            "store_id": str(store.id),
            "customer_id": str(inter_cust.id),
            "is_interstate": True,
            "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 1000.00, "name": prod.name}],
            "payments": [{"payment_method": "upi", "amount": 1180.00, "reference": "UPI9988"}],
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED

        tx = Transaction.objects.get(id=res.data["transaction_id"])
        item = tx.items.first()
        assert item.igst_amount == Decimal("180.00")
        assert item.cgst_amount == Decimal("0.00")
        assert item.sgst_amount == Decimal("0.00")

    def test_tally_xml_voucher_double_entry_zero_sum_balance(self, adversarial_suite_setup):
        """Every generated Tally voucher enforces zero-sum rule (Debit + Credit = 0.00)."""
        org = adversarial_suite_setup["org_a"]
        store = adversarial_suite_setup["store_a"]
        admin = adversarial_suite_setup["admin_a"]
        prod = adversarial_suite_setup["prod_a"]
        cust = adversarial_suite_setup["customer_a"]

        # Create a settled transaction with items and payments
        tx = Transaction.objects.create(
            organization=org,
            store=store,
            customer=cust,
            cashier=admin,
            invoice_number="INV-TALLY-AUDIT-001",
            transaction_date=timezone.now(),
            subtotal=Decimal("1000.00"),
            discount=Decimal("0.00"),
            tax=Decimal("180.00"),
            total=Decimal("1180.00"),
            amount_paid=Decimal("1180.00"),
            payment_status="paid",
            status="completed",
        )
        TransactionItem.objects.create(
            transaction=tx,
            product=prod,
            name=prod.name,
            quantity=Decimal("1.00"),
            unit_price=Decimal("1000.00"),
            discount=Decimal("0.00"),
            tax=Decimal("180.00"),
            tax_rate=Decimal("18.00"),
            cgst_amount=Decimal("90.00"),
            sgst_amount=Decimal("90.00"),
            igst_amount=Decimal("0.00"),
            total=Decimal("1180.00"),
            hsn_code="8528",
        )
        TransactionPayment.objects.create(
            organization=org,
            transaction=tx,
            payment_method="bank_transfer",
            amount=Decimal("1180.00"),
            reference="NEFT-TALLY-01",
        )

        xml_str, filename, preview = TallyExportService.generate_tally_xml(
            organization=org,
            user=admin,
            include_previously_exported=True,
        )
        assert xml_str.startswith("<?xml")
        root = ET.fromstring(xml_str.encode("utf-8"))

        vouchers = root.findall(".//VOUCHER")
        assert len(vouchers) > 0, "Expected at least one Tally voucher in export"

        for vch in vouchers:
            vch_type = vch.attrib.get("VCHTYPE")
            amounts = [Decimal(node.text) for node in vch.findall(".//ALLLEDGERENTRIES.LIST/AMOUNT")]
            vch_balance = sum(amounts)
            assert vch_balance == Decimal("0.00"), f"Voucher {vch_type} unbalanced: sum is {vch_balance}"
