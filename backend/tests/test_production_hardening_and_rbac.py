import uuid
from decimal import Decimal
import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product, InventoryMovement
from apps.customers.models import Customer
from apps.billing.models import BusinessConfig
from apps.transactions.models import Transaction, TransactionPayment
from apps.invoices.models import Quotation, QuotationItem
from apps.billing.services.checkout_service import CheckoutService
from apps.analytics.views import compute_analytics


@pytest.fixture
def rbac_and_hardening_setup(db):
    org = Organization.objects.create(name=f"Hardened Org {uuid.uuid4().hex[:6]}", currency="INR")
    store = Store.objects.create(organization=org, name="Flagship Store", code=f"STR-{uuid.uuid4().hex[:4].upper()}")

    admin = User.objects.create_user(
        email=f"admin-{uuid.uuid4().hex[:6]}@example.com",
        password="adminpassword123",
        organization=org,
        role="org_admin",
        first_name="Admin",
        last_name="Owner",
    )

    manager = User.objects.create_user(
        email=f"manager-{uuid.uuid4().hex[:6]}@example.com",
        password="managerpassword123",
        organization=org,
        role="store_manager",
        first_name="Store",
        last_name="Manager",
    )

    cashier = User.objects.create_user(
        email=f"cashier-{uuid.uuid4().hex[:6]}@example.com",
        password="cashierpassword123",
        organization=org,
        role="cashier",
        first_name="Front",
        last_name="Cashier",
    )

    inventory_staff = User.objects.create_user(
        email=f"inventory-{uuid.uuid4().hex[:6]}@example.com",
        password="inventorypassword123",
        organization=org,
        role="inventory",
        first_name="Warehouse",
        last_name="Keeper",
    )

    # Secondary organization for tenant isolation tests
    org2 = Organization.objects.create(name=f"Tenant Two {uuid.uuid4().hex[:6]}", currency="INR")
    org2_admin = User.objects.create_user(
        email=f"org2-admin-{uuid.uuid4().hex[:6]}@example.com",
        password="org2password123",
        organization=org2,
        role="org_admin",
        first_name="Org2",
        last_name="Admin",
    )

    config = BusinessConfig.objects.create(
        organization=org,
        business_type="RETAIL",
        gst_enabled=True,
        tax_mode="exclusive",
        default_tax_rate=Decimal("18.00"),
        allow_credit_sales=True,
        default_credit_limit=Decimal("50000.00"),
        max_discount_cashier=Decimal("15.00"),
        allow_negative_stock=False,
    )

    customer = Customer.objects.create(
        organization=org,
        first_name="Sanjay",
        last_name="Gupta",
        phone="+919876500001",
        credit_limit=Decimal("10000.00"),
        outstanding_credit=Decimal("0.00"),
    )

    prod = Product.objects.create(
        organization=org,
        name="Premium Wireless Keyboard",
        sku=f"SKU-{uuid.uuid4().hex[:6].upper()}",
        selling_price=Decimal("1000.00"),
        unit_price=Decimal("1000.00"),
        tax_rate=Decimal("0.00"),
        current_stock=Decimal("50.00"),
        track_inventory=True,
    )

    admin_client = APIClient()
    admin_client.force_authenticate(user=admin)

    manager_client = APIClient()
    manager_client.force_authenticate(user=manager)

    cashier_client = APIClient()
    cashier_client.force_authenticate(user=cashier)

    inventory_client = APIClient()
    inventory_client.force_authenticate(user=inventory_staff)

    org2_client = APIClient()
    org2_client.force_authenticate(user=org2_admin)

    return {
        "org": org,
        "store": store,
        "admin": admin,
        "manager": manager,
        "cashier": cashier,
        "inventory_staff": inventory_staff,
        "customer": customer,
        "prod": prod,
        "config": config,
        "admin_client": admin_client,
        "manager_client": manager_client,
        "cashier_client": cashier_client,
        "inventory_client": inventory_client,
        "org2_admin": org2_admin,
        "org2_client": org2_client,
    }


class TestProductionHardeningAndRBAC:
    """
    Adversarial and production verification test suite covering:
    1. Payment method validation, negative amounts, precision, split payments & partial settlements.
    2. Quotation conversion with split payments and stock immutability before conversion.
    3. Server-side RBAC, privilege escalation prevention, self-deactivation & last-admin safeguards.
    4. Inventory adjustment permissions.
    5. Real-time dashboard money collection aggregation without double counting or credit conflation.
    """

    # --- 1. PAYMENT VALIDATION & SETTLEMENT RULES ---

    def test_payment_negative_amount_rejected(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        cart_data = {
            "items": [{"product_id": str(ctx["prod"].id), "quantity": 1}],
            "payments": [{"payment_method": "cash", "amount": -500}],
        }
        with pytest.raises(ValidationError) as exc:
            CheckoutService.process_checkout(
                organization=ctx["org"], store=ctx["store"], user=ctx["cashier"], cart_data=cart_data
            )
        assert "greater than zero" in str(exc.value).lower()

    def test_payment_invalid_precision_rejected(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        cart_data = {
            "items": [{"product_id": str(ctx["prod"].id), "quantity": 1}],
            "payments": [{"payment_method": "cash", "amount": "1000.5555"}],
        }
        with pytest.raises(ValidationError) as exc:
            CheckoutService.process_checkout(
                organization=ctx["org"], store=ctx["store"], user=ctx["cashier"], cart_data=cart_data
            )
        assert "precision" in str(exc.value).lower()

    def test_payment_unsupported_method_rejected(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        cart_data = {
            "items": [{"product_id": str(ctx["prod"].id), "quantity": 1}],
            "payments": [{"payment_method": "bitcoin", "amount": 1000}],
        }
        with pytest.raises(ValidationError) as exc:
            CheckoutService.process_checkout(
                organization=ctx["org"], store=ctx["store"], user=ctx["cashier"], cart_data=cart_data
            )
        assert "unsupported payment method" in str(exc.value).lower()

    def test_payment_hybrid_three_way_split(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        cart_data = {
            "items": [{"product_id": str(ctx["prod"].id), "quantity": 1}],
            "payments": [
                {"payment_method": "cash", "amount": 500},
                {"payment_method": "upi", "amount": 300, "reference": "UPI-REF-001"},
                {"payment_method": "card", "amount": 200, "reference": "CARD-REF-002"},
            ],
        }
        res = CheckoutService.process_checkout(
            organization=ctx["org"], store=ctx["store"], user=ctx["cashier"], cart_data=cart_data
        )
        assert res["total"] == "1000.00"
        assert res["amount_paid"] == "1000.00"
        assert res["payment_status"] == "paid"

        tx = Transaction.objects.get(id=res["id"])
        payments = list(tx.payments.all())
        assert len(payments) == 3
        methods = {p.payment_method: p.amount for p in payments}
        assert methods["cash"] == Decimal("500.00")
        assert methods["upi"] == Decimal("300.00")
        assert methods["card"] == Decimal("200.00")

    def test_payment_explicit_partial_payment_allocates_credit(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        cart_data = {
            "items": [{"product_id": str(ctx["prod"].id), "quantity": 1}],
            "customer": {"id": str(ctx["customer"].id), "phone": ctx["customer"].phone},
            "payments": [{"payment_method": "cash", "amount": 400}],
            "allow_partial": True,
        }
        res = CheckoutService.process_checkout(
            organization=ctx["org"], store=ctx["store"], user=ctx["cashier"], cart_data=cart_data
        )
        assert res["payment_status"] == "partial"
        assert res["amount_paid"] == "400.00"
        assert res["outstanding_amount"] == "600.00"

        ctx["customer"].refresh_from_db()
        assert ctx["customer"].outstanding_credit == Decimal("600.00")

    # --- 2. QUOTATION CONVERSION & STOCK IMMUTABILITY ---

    def test_quotation_creation_and_viewing_never_touches_stock(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        initial_stock = ctx["prod"].current_stock

        # Create quotation
        q_res = ctx["cashier_client"].post(
            "/api/v1/invoices/quotations/",
            {
                "customer_id": str(ctx["customer"].id),
                "items": [{"product_id": str(ctx["prod"].id), "quantity": 5, "unit_price": 1000}],
            },
            format="json",
        )
        assert q_res.status_code == status.HTTP_201_CREATED
        quote_id = q_res.json()["id"]

        # View / Lookup quotation
        detail_res = ctx["cashier_client"].get(f"/api/v1/invoices/quotations/{quote_id}/")
        assert detail_res.status_code == status.HTTP_200_OK

        ctx["prod"].refresh_from_db()
        assert ctx["prod"].current_stock == initial_stock, "Quotation creation or viewing must never decrement inventory!"

    def test_quotation_conversion_with_split_payments(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        initial_stock = ctx["prod"].current_stock

        q_res = ctx["cashier_client"].post(
            "/api/v1/invoices/quotations/",
            {
                "customer_id": str(ctx["customer"].id),
                "items": [{"product_id": str(ctx["prod"].id), "quantity": 2, "unit_price": 1000}],
            },
            format="json",
        )
        quote_id = q_res.json()["id"]

        # Convert using Split Payments (₹1200 Cash + ₹800 UPI)
        conv_res = ctx["cashier_client"].post(
            f"/api/v1/invoices/quotations/{quote_id}/convert/",
            {
                "payments": [
                    {"payment_method": "cash", "amount": 1200},
                    {"payment_method": "upi", "amount": 800, "reference": "UPI-QT-999"},
                ]
            },
            format="json",
        )
        assert conv_res.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
        data = conv_res.json()
        assert data["invoice_number"] is not None

        # Verify stock decremented once by 2
        ctx["prod"].refresh_from_db()
        assert ctx["prod"].current_stock == initial_stock - Decimal("2.00")

        # Verify payments recorded
        tx = Transaction.objects.get(invoice_number=data["invoice_number"])
        assert tx.payments.count() == 2

        # Verify duplicate conversion is rejected
        dup_res = ctx["cashier_client"].post(
            f"/api/v1/invoices/quotations/{quote_id}/convert/",
            {"payment_method": "cash"},
            format="json",
        )
        assert dup_res.status_code == status.HTTP_400_BAD_REQUEST

    # --- 3. SERVER-SIDE RBAC & SAFEGUARDS ---

    def test_admin_can_create_staff_accounts(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        payload = {
            "first_name": "Deepak",
            "last_name": "Kumar",
            "email": f"deepak-{uuid.uuid4().hex[:6]}@example.com",
            "role": "cashier",
            "password": "securepassword123",
            "is_active": True,
        }
        res = ctx["admin_client"].post("/api/v1/users/create/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        assert res.json()["role"] == "cashier"

    def test_cashier_cannot_create_staff_account(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        payload = {
            "first_name": "Hacker",
            "email": f"hacker-{uuid.uuid4().hex[:6]}@example.com",
            "role": "cashier",
            "password": "securepassword123",
        }
        res = ctx["cashier_client"].post("/api/v1/users/create/", payload, format="json")
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_cashier_cannot_list_staff_directory(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        res = ctx["cashier_client"].get("/api/v1/users/")
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_cannot_create_admin_account(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        payload = {
            "first_name": "Escalated",
            "email": f"admin-target-{uuid.uuid4().hex[:6]}@example.com",
            "role": "org_admin",
            "password": "securepassword123",
        }
        res = ctx["manager_client"].post("/api/v1/users/create/", payload, format="json")
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_cannot_promote_user_to_admin(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        res = ctx["manager_client"].patch(
            f"/api/v1/users/{ctx['cashier'].id}/",
            {"role": "org_admin"},
            format="json",
        )
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_user_cannot_modify_own_role(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        res = ctx["admin_client"].patch(
            f"/api/v1/users/{ctx['admin'].id}/",
            {"role": "store_manager"},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "cannot modify your own role" in str(res.json()).lower()

    def test_user_cannot_deactivate_own_account(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        res = ctx["admin_client"].patch(
            f"/api/v1/users/{ctx['admin'].id}/",
            {"is_active": False},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "cannot deactivate your own account" in str(res.json()).lower()

    def test_cannot_deactivate_or_delete_last_active_administrator(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        # Create a second admin to test deactivation of the other, but not when alone
        admin2 = User.objects.create_user(
            email=f"admin2-{uuid.uuid4().hex[:6]}@example.com",
            password="adminpassword123",
            organization=ctx["org"],
            role="org_admin",
            first_name="Admin2",
        )

        # Deactivate admin2 (now admin1 is the sole remaining active admin)
        res_deact2 = ctx["admin_client"].patch(f"/api/v1/users/{admin2.id}/", {"is_active": False}, format="json")
        assert res_deact2.status_code == status.HTTP_200_OK

        # Try to delete admin2 -> works because admin1 is still active
        # Try to deactivate admin1 through any client or api -> blocked
        # Re-activate admin2 so admin2 can try to deactivate admin1
        ctx["admin_client"].patch(f"/api/v1/users/{admin2.id}/", {"is_active": True}, format="json")
        admin2_client = APIClient()
        admin2_client.force_authenticate(user=admin2)

        # Admin2 deactivates admin1
        res = admin2_client.patch(f"/api/v1/users/{ctx['admin'].id}/", {"is_active": False}, format="json")
        assert res.status_code == status.HTTP_200_OK

        # Now admin2 is the sole remaining active admin. Attempting to deactivate admin2 must fail:
        # (even if attempted, it's blocked by both self-deactivation and last active admin check)
        admin2_self_del = admin2_client.delete(f"/api/v1/users/{admin2.id}/")
        assert admin2_self_del.status_code == status.HTTP_400_BAD_REQUEST

    def test_tenant_isolation_cannot_access_other_org_staff(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        # Org2 admin attempts to access Org1 cashier details
        res = ctx["org2_client"].get(f"/api/v1/users/{ctx['cashier'].id}/")
        assert res.status_code == status.HTTP_404_NOT_FOUND

    # --- 4. INVENTORY ADJUSTMENT RBAC ---

    def test_cashier_cannot_adjust_stock(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        res = ctx["cashier_client"].post(
            "/api/v1/pos/inventory/adjust/",
            {"product_id": str(ctx["prod"].id), "quantity_delta": 10},
            format="json",
        )
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_inventory_staff_can_adjust_stock(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        res = ctx["inventory_client"].post(
            "/api/v1/pos/inventory/adjust/",
            {"product_id": str(ctx["prod"].id), "quantity_delta": 5, "notes": "Physical audit count"},
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        ctx["prod"].refresh_from_db()
        assert ctx["prod"].current_stock == Decimal("55.00")

    # --- 5. DASHBOARD REALTIME MONEY COLLECTIONS ACCURACY ---

    def test_dashboard_separates_cash_digital_collections_from_credit(self, rbac_and_hardening_setup):
        ctx = rbac_and_hardening_setup
        org = ctx["org"]
        store = ctx["store"]

        # Sale 1: ₹500 Cash + ₹300 UPI
        CheckoutService.process_checkout(
            organization=org,
            store=store,
            user=ctx["cashier"],
            cart_data={
                "items": [{"product_id": str(ctx["prod"].id), "quantity": 1, "unit_price": 800}],
                "payments": [
                    {"payment_method": "cash", "amount": 500},
                    {"payment_method": "upi", "amount": 300},
                ],
            },
        )

        # Sale 2: ₹1000 Pure Credit sale
        CheckoutService.process_checkout(
            organization=org,
            store=store,
            user=ctx["cashier"],
            cart_data={
                "items": [{"product_id": str(ctx["prod"].id), "quantity": 1, "unit_price": 1000}],
                "customer": {"id": str(ctx["customer"].id), "phone": ctx["customer"].phone},
                "payments": [{"payment_method": "credit", "amount": 1000}],
            },
        )

        analytics = compute_analytics(org)

        # Gross sales includes both sales = 800 + 1000 = 1800
        assert analytics["today"]["gross_sales"] == 1800.0

        # Money collected today MUST ONLY be 500 (cash) + 300 (upi) = 800, NOT 1800!
        assert analytics["today"]["amount_collected"] == 800.0
        assert analytics["today_collected"] == 800.0

        # Payment methods breakdown must reflect exact cash and upi allocations
        breakdown = {p["payment_method"].lower(): p["total"] for p in analytics["payment_methods"]}
        assert breakdown["cash"] == 500.0
        assert breakdown["upi"] == 300.0
        assert "credit" not in breakdown, "Credit must be reported as customer dues, not collected money!"
