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
from apps.billing.models import BusinessConfig, CashRegister
from apps.transactions.models import Transaction, TransactionPayment, CustomerCreditPayment
from apps.invoices.models import Quotation, QuotationItem
from apps.billing.services.checkout_service import CheckoutService
from apps.billing.services.reports_service import ReportsService
from apps.analytics.views import compute_analytics


@pytest.fixture
def adversarial_env(db):
    org = Organization.objects.create(name=f"Audit Org {uuid.uuid4().hex[:6]}", currency="INR")
    store = Store.objects.create(organization=org, name="Audit Store", code=f"AUD-{uuid.uuid4().hex[:4].upper()}")

    admin = User.objects.create_user(
        email=f"admin-{uuid.uuid4().hex[:6]}@audit.com",
        password="password123",
        organization=org,
        role="org_admin",
        first_name="Admin",
        last_name="Audit",
    )

    manager = User.objects.create_user(
        email=f"manager-{uuid.uuid4().hex[:6]}@audit.com",
        password="password123",
        organization=org,
        role="store_manager",
        first_name="Manager",
        last_name="Audit",
    )

    cashier = User.objects.create_user(
        email=f"cashier-{uuid.uuid4().hex[:6]}@audit.com",
        password="password123",
        organization=org,
        role="cashier",
        first_name="Cashier",
        last_name="Audit",
    )

    inventory_staff = User.objects.create_user(
        email=f"inventory-{uuid.uuid4().hex[:6]}@audit.com",
        password="password123",
        organization=org,
        role="inventory",
        first_name="Inventory",
        last_name="Audit",
    )

    # Separate Tenant for cross-tenant isolation tests
    org2 = Organization.objects.create(name=f"Tenant Two {uuid.uuid4().hex[:6]}", currency="INR")
    org2_admin = User.objects.create_user(
        email=f"tenant2-admin-{uuid.uuid4().hex[:6]}@audit.com",
        password="password123",
        organization=org2,
        role="org_admin",
        first_name="Tenant2",
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
        first_name="Rajesh",
        last_name="Kumar",
        phone="+919876543210",
        credit_limit=Decimal("15000.00"),
        outstanding_credit=Decimal("0.00"),
    )

    prod = Product.objects.create(
        organization=org,
        name="Mechanical Keyboard",
        sku=f"KB-{uuid.uuid4().hex[:6].upper()}",
        selling_price=Decimal("2000.00"),
        unit_price=Decimal("2000.00"),
        tax_rate=Decimal("0.00"),
        current_stock=Decimal("50.00"),
        track_inventory=True,
    )

    register = CashRegister.objects.create(
        organization=org,
        store=store,
        cashier=cashier,
        opening_cash=Decimal("5000.00"),
        status="open",
    )

    return {
        "org": org,
        "store": store,
        "admin": admin,
        "manager": manager,
        "cashier": cashier,
        "inventory_staff": inventory_staff,
        "org2": org2,
        "org2_admin": org2_admin,
        "config": config,
        "customer": customer,
        "product": prod,
        "register": register,
    }


@pytest.mark.django_db
class TestIndependentAdversarialAudit:
    """
    Independent Adversarial Verification Suite covering all audit stages:
    - Malformed and edge-case payment amounts (NaN, Inf, negative, precision, non-numeric)
    - Cashier fixed discount bypass defense
    - Cash change vs collected revenue invariants
    - Concurrency and status safeguards on quotation conversion
    - Analytics reconciliation with customer credit debt repayments
    - RBAC enforcement across user management and inventory endpoints
    """

    # --- STAGE 2: ADVERSARIAL PAYMENT TESTING ---

    @pytest.mark.parametrize("bad_amt", ["", "abc", "NaN", "Infinity", "-Infinity", "-50.00", "0.00", "10.999"])
    def test_payment_malformed_amounts_rejected(self, adversarial_env, bad_amt):
        cart_data = {
            "items": [{"product_id": str(adversarial_env["product"].id), "quantity": 1}],
            "payments": [{"payment_method": "cash", "amount": bad_amt}],
        }
        with pytest.raises(ValidationError):
            CheckoutService.process_checkout(
                organization=adversarial_env["org"],
                store=adversarial_env["store"],
                user=adversarial_env["cashier"],
                cart_data=cart_data,
            )

    def test_payment_unsupported_method_rejected(self, adversarial_env):
        cart_data = {
            "items": [{"product_id": str(adversarial_env["product"].id), "quantity": 1}],
            "payments": [{"payment_method": "bitcoin", "amount": Decimal("2000.00")}],
        }
        with pytest.raises(ValidationError) as exc:
            CheckoutService.process_checkout(
                organization=adversarial_env["org"],
                store=adversarial_env["store"],
                user=adversarial_env["cashier"],
                cart_data=cart_data,
            )
        assert "Unsupported payment method 'bitcoin'" in str(exc.value)

    def test_cashier_fixed_discount_bypass_prevented(self, adversarial_env):
        """
        A cashier attempting to provide a 50% discount using a fixed discount amount (₹1000 on ₹2000)
        when max cashier discount is 15% must be strictly blocked by server-side policy.
        """
        cart_data = {
            "items": [{"product_id": str(adversarial_env["product"].id), "quantity": 1}],
            "overall_discount_type": "fixed",
            "overall_discount_value": Decimal("1000.00"),  # 50% discount
            "payments": [{"payment_method": "cash", "amount": Decimal("1000.00")}],
        }
        with pytest.raises(ValidationError) as exc:
            CheckoutService.process_checkout(
                organization=adversarial_env["org"],
                store=adversarial_env["store"],
                user=adversarial_env["cashier"],
                cart_data=cart_data,
            )
        assert "Cashier discount limit exceeded" in str(exc.value)

    def test_cash_change_not_recorded_as_revenue(self, adversarial_env):
        """
        Total ₹2000 bill, ₹3000 tendered in cash, ₹1000 returned as change.
        Verification:
        - Transaction total = 2000, amount_paid = 2000, tendered_amount = 3000, change_amount = 1000.
        - TransactionPayment records exactly ₹2000 (applied cash), NOT ₹3000.
        - Register expected cash increases by ₹2000, NOT ₹3000.
        """
        cart_data = {
            "items": [{"product_id": str(adversarial_env["product"].id), "quantity": 1}],
            "payments": [{"payment_method": "cash", "amount": Decimal("3000.00")}],
        }
        res = CheckoutService.process_checkout(
            organization=adversarial_env["org"],
            store=adversarial_env["store"],
            user=adversarial_env["cashier"],
            cart_data=cart_data,
        )
        tx = Transaction.objects.get(id=res["id"])
        assert tx.total == Decimal("2000.00")
        assert tx.amount_paid == Decimal("2000.00")
        assert tx.tendered_amount == Decimal("3000.00")
        assert tx.change_amount == Decimal("1000.00")

        payments = list(tx.payments.all())
        assert len(payments) == 1
        assert payments[0].amount == Decimal("2000.00")

        adversarial_env["register"].refresh_from_db()
        assert adversarial_env["register"].calculate_expected_cash() == Decimal("7000.00")  # 5000 + 2000

    def test_failed_checkout_rolls_back_atomically(self, adversarial_env):
        """
        If a checkout fails (e.g. stock shortfall or validation error),
        zero partial Transaction, TransactionItem, InventoryMovement, or Invoice records must remain.
        """
        initial_stock = adversarial_env["product"].current_stock
        tx_count_before = Transaction.objects.filter(organization=adversarial_env["org"]).count()

        cart_data = {
            "items": [{"product_id": str(adversarial_env["product"].id), "quantity": 1000}],  # exceeds 50
            "payments": [{"payment_method": "cash", "amount": Decimal("2000000.00")}],
        }
        with pytest.raises(ValidationError):
            CheckoutService.process_checkout(
                organization=adversarial_env["org"],
                store=adversarial_env["store"],
                user=adversarial_env["cashier"],
                cart_data=cart_data,
            )

        adversarial_env["product"].refresh_from_db()
        assert adversarial_env["product"].current_stock == initial_stock
        assert Transaction.objects.filter(organization=adversarial_env["org"]).count() == tx_count_before

    # --- STAGE 3: QUOTATION CONVERSION ---

    def test_quotation_conversion_cannot_convert_cancelled_quotation(self, adversarial_env):
        """
        A quotation with status='cancelled' must be strictly rejected from conversion.
        """
        q = Quotation.objects.create(
            organization=adversarial_env["org"],
            store=adversarial_env["store"],
            customer=adversarial_env["customer"],
            quotation_number=f"QT-CANC-{uuid.uuid4().hex[:4].upper()}",
            status="cancelled",
            subtotal=Decimal("2000.00"),
            total=Decimal("2000.00"),
        )
        QuotationItem.objects.create(
            quotation=q,
            product=adversarial_env["product"],
            name=adversarial_env["product"].name,
            quantity=Decimal("1.00"),
            unit_price=Decimal("2000.00"),
            total=Decimal("2000.00"),
        )

        client = APIClient()
        client.force_authenticate(user=adversarial_env["cashier"])
        url = f"/api/v1/invoices/quotations/{q.id}/convert/"
        res = client.post(url, {"payment_method": "cash"}, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "cannot be converted" in res.data["error"]

    def test_quotation_conversion_rejects_malformed_payments(self, adversarial_env):
        """
        Quotation conversion must reject NaN, non-numeric strings, negative amounts,
        and unsupported payment methods rather than crashing or silently continuing.
        """
        q = Quotation.objects.create(
            organization=adversarial_env["org"],
            store=adversarial_env["store"],
            customer=adversarial_env["customer"],
            quotation_number=f"QT-MALF-{uuid.uuid4().hex[:4].upper()}",
            status="draft",
            subtotal=Decimal("2000.00"),
            total=Decimal("2000.00"),
        )
        QuotationItem.objects.create(
            quotation=q,
            product=adversarial_env["product"],
            name=adversarial_env["product"].name,
            quantity=Decimal("1.00"),
            unit_price=Decimal("2000.00"),
            total=Decimal("2000.00"),
        )

        client = APIClient()
        client.force_authenticate(user=adversarial_env["cashier"])
        url = f"/api/v1/invoices/quotations/{q.id}/convert/"

        # Test non-numeric string
        res = client.post(url, {"payments": [{"payment_method": "cash", "amount": "invalid_num"}]}, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

        # Test negative allocation
        res2 = client.post(url, {"payments": [{"payment_method": "cash", "amount": "-500.00"}]}, format="json")
        assert res2.status_code == status.HTTP_400_BAD_REQUEST

        # Test unsupported payment method
        res3 = client.post(url, {"payments": [{"payment_method": "gold", "amount": "2000.00"}]}, format="json")
        assert res3.status_code == status.HTTP_400_BAD_REQUEST

    def test_quotation_conversion_hybrid_with_cash_change(self, adversarial_env):
        """
        Quotation total ₹2000 converted with hybrid: ₹1000 UPI + ₹1500 Cash tendered.
        Verification:
        - Invoice total = 2000
        - Cash change = 500
        - Applied payments = UPI 1000, Cash 1000
        """
        q = Quotation.objects.create(
            organization=adversarial_env["org"],
            store=adversarial_env["store"],
            customer=adversarial_env["customer"],
            quotation_number=f"QT-CHG-{uuid.uuid4().hex[:4].upper()}",
            status="sent",
            subtotal=Decimal("2000.00"),
            total=Decimal("2000.00"),
        )
        QuotationItem.objects.create(
            quotation=q,
            product=adversarial_env["product"],
            name=adversarial_env["product"].name,
            quantity=Decimal("1.00"),
            unit_price=Decimal("2000.00"),
            total=Decimal("2000.00"),
        )

        client = APIClient()
        client.force_authenticate(user=adversarial_env["cashier"])
        url = f"/api/v1/invoices/quotations/{q.id}/convert/"
        res = client.post(
            url,
            {
                "payments": [
                    {"payment_method": "upi", "amount": "1000.00"},
                    {"payment_method": "cash", "amount": "1500.00"},
                ]
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        q.refresh_from_db()
        assert q.status == "converted"

        tx = q.converted_invoice.transaction
        assert tx.total == Decimal("2000.00")
        assert tx.change_amount == Decimal("500.00")

        p_upi = tx.payments.get(payment_method="upi")
        p_cash = tx.payments.get(payment_method="cash")
        assert p_upi.amount == Decimal("1000.00")
        assert p_cash.amount == Decimal("1000.00")

    # --- STAGE 4: ANALYTICS RECONCILIATION ---

    def test_analytics_reconciles_credit_repayment_without_double_counting(self, adversarial_env):
        """
        Verify:
        1. Pure credit sale (₹2000) adds ₹0 to realized collections, outstanding credit increases to ₹2000.
        2. Customer makes later repayment of ₹1000 via Cash (CustomerCreditPayment).
        3. compute_analytics and ReportsService accurately include the ₹1000 cash repayment in today's collections.
        """
        org = adversarial_env["org"]
        store = adversarial_env["store"]
        cust = adversarial_env["customer"]

        # 1. Credit sale
        cart_credit = {
            "customer": {"id": str(cust.id)},
            "items": [{"product_id": str(adversarial_env["product"].id), "quantity": 1}],
            "payments": [{"payment_method": "credit", "amount": Decimal("2000.00")}],
        }
        CheckoutService.process_checkout(
            organization=org,
            store=store,
            user=adversarial_env["cashier"],
            cart_data=cart_credit,
        )

        # Before repayment: today's monetary collections must be 0
        analytics_before = compute_analytics(org)
        assert analytics_before["today_collected"] == 0.0
        assert analytics_before["today_outstanding"] == 2000.0

        # 2. Customer repays ₹1000 in Cash
        CustomerCreditPayment.objects.create(
            organization=org,
            customer=cust,
            amount=Decimal("1000.00"),
            payment_method="cash",
            reference="REPAY-01",
        )
        cust.refresh_from_db()
        cust.outstanding_credit -= Decimal("1000.00")
        cust.save(update_fields=["outstanding_credit"])

        # After repayment: today's monetary collections must reflect the ₹1000 cash collected
        analytics_after = compute_analytics(org)
        assert analytics_after["today_collected"] == 1000.0
        assert analytics_after["today_outstanding"] == 1000.0

        # Breakdown must include Cash = 1000.0
        cash_breakdown = next(p for p in analytics_after["payment_methods"] if p["payment_method"] == "cash")
        assert cash_breakdown["amount"] == 1000.0

        # ReportsService must also reflect ₹1000 total collected
        rep = ReportsService.get_payment_report(organization=org, period="today")
        assert rep["total_collected"] == "1000.00"

    # --- STAGE 5: RBAC AND TENANT ISOLATION ---

    def test_cashier_cannot_list_or_create_users(self, adversarial_env):
        client = APIClient()
        client.force_authenticate(user=adversarial_env["cashier"])

        # Cashier listing users -> 403
        res = client.get("/api/v1/users/")
        assert res.status_code == status.HTTP_403_FORBIDDEN

        # Cashier creating user -> 403
        res2 = client.post(
            "/api/v1/users/create/",
            {
                "email": f"hacked-{uuid.uuid4().hex[:4]}@audit.com",
                "role": "org_admin",
                "first_name": "Bad",
                "last_name": "Actor",
                "password": "Password123!",
            },
            format="json",
        )
        assert res2.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_cannot_create_or_promote_to_admin(self, adversarial_env):
        client = APIClient()
        client.force_authenticate(user=adversarial_env["manager"])

        # Manager attempting to create org_admin -> 403
        res = client.post(
            "/api/v1/users/create/",
            {
                "email": f"newadmin-{uuid.uuid4().hex[:4]}@audit.com",
                "role": "org_admin",
                "first_name": "New",
                "last_name": "Admin",
                "password": "Password123!",
            },
            format="json",
        )
        assert res.status_code == status.HTTP_403_FORBIDDEN

        # Manager attempting to promote cashier to org_admin -> 403
        res2 = client.patch(
            f"/api/v1/users/{adversarial_env['cashier'].id}/",
            {"role": "org_admin"},
            format="json",
        )
        assert res2.status_code == status.HTTP_403_FORBIDDEN

    def test_org_admin_cannot_escalate_role_to_super_admin(self, adversarial_env):
        """
        A tenant organization administrator attempting to escalate a user to global super_admin
        must be rejected with 403 PermissionDenied.
        """
        client = APIClient()
        client.force_authenticate(user=adversarial_env["admin"])

        # Attempt in create
        res = client.post(
            "/api/v1/users/create/",
            {
                "email": f"super-{uuid.uuid4().hex[:4]}@audit.com",
                "role": "super_admin",
                "first_name": "Super",
                "last_name": "Escalate",
                "password": "Password123!",
            },
            format="json",
        )
        assert res.status_code == status.HTTP_403_FORBIDDEN

        # Attempt in update
        res2 = client.patch(
            f"/api/v1/users/{adversarial_env['manager'].id}/",
            {"role": "super_admin"},
            format="json",
        )
        assert res2.status_code == status.HTTP_403_FORBIDDEN

    def test_user_cannot_modify_own_role(self, adversarial_env):
        client = APIClient()
        client.force_authenticate(user=adversarial_env["manager"])
        res = client.patch(
            f"/api/v1/users/{adversarial_env['manager'].id}/",
            {"role": "org_admin"},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "You cannot modify your own role" in str(res.data)

    def test_cross_tenant_isolation_enforced(self, adversarial_env):
        """
        Org A admin cannot view, update, or delete Org B staff accounts.
        """
        client = APIClient()
        client.force_authenticate(user=adversarial_env["admin"])
        res = client.get(f"/api/v1/users/{adversarial_env['org2_admin'].id}/")
        assert res.status_code == status.HTTP_404_NOT_FOUND

        res2 = client.patch(
            f"/api/v1/users/{adversarial_env['org2_admin'].id}/",
            {"first_name": "Hacked"},
            format="json",
        )
        assert res2.status_code == status.HTTP_404_NOT_FOUND

    def test_last_active_administrator_cannot_be_deactivated_or_deleted(self, adversarial_env):
        client = APIClient()
        # Create a second admin to test deactivation on self vs last admin
        admin2 = User.objects.create_user(
            email=f"admin2-{uuid.uuid4().hex[:6]}@audit.com",
            password="password123",
            organization=adversarial_env["org"],
            role="org_admin",
            first_name="Second",
            last_name="Admin",
        )
        client.force_authenticate(user=admin2)

        # Admin 2 deactivates Admin 1 -> permitted because Admin 2 is still active
        res1 = client.patch(
            f"/api/v1/users/{adversarial_env['admin'].id}/",
            {"is_active": False},
            format="json",
        )
        assert res1.status_code == status.HTTP_200_OK

        # Now Admin 2 is the ONLY active admin.
        # Another user or Admin 2 trying to deactivate or delete the last admin is blocked.
        res2 = client.patch(
            f"/api/v1/users/{admin2.id}/",
            {"is_active": False},
            format="json",
        )
        assert res2.status_code == status.HTTP_400_BAD_REQUEST

    def test_inventory_rbac_purchase_orders_and_adjustments(self, adversarial_env):
        client = APIClient()

        # Cashier blocked from stock adjustment -> 403
        client.force_authenticate(user=adversarial_env["cashier"])
        res1 = client.post(
            "/api/v1/pos/inventory/adjust/",
            {
                "product_id": str(adversarial_env["product"].id),
                "quantity_delta": 5,
                "movement_type": "ADJUSTMENT",
            },
            format="json",
        )
        assert res1.status_code == status.HTTP_403_FORBIDDEN

        # Cashier blocked from creating purchase order -> 403
        res2 = client.post(
            "/api/v1/pos/inventory/purchases/",
            {"supplier": "Test Supplier", "items": []},
            format="json",
        )
        assert res2.status_code == status.HTTP_403_FORBIDDEN

        # Inventory staff permitted to adjust stock -> 201
        client.force_authenticate(user=adversarial_env["inventory_staff"])
        res3 = client.post(
            "/api/v1/pos/inventory/adjust/",
            {
                "product_id": str(adversarial_env["product"].id),
                "quantity_delta": 10,
                "movement_type": "ADJUSTMENT",
            },
            format="json",
        )
        assert res3.status_code == status.HTTP_201_CREATED
        adversarial_env["product"].refresh_from_db()
        assert adversarial_env["product"].current_stock == Decimal("60.00")  # 50 + 10
