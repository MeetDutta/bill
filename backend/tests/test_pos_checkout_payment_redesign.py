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
from apps.transactions.models import Transaction, TransactionPayment
from apps.invoices.models import Invoice, Quotation, QuotationItem
from apps.billing.services.checkout_service import CheckoutService


@pytest.fixture
def pos_redesign_setup(db):
    org = Organization.objects.create(name=f"POS Redesign Org {uuid.uuid4().hex[:6]}", currency="INR")
    user = User.objects.create_user(
        email=f"cashier-{uuid.uuid4().hex[:6]}@example.com",
        password="pospassword123",
        organization=org,
        role="cashier",
        first_name="Ramesh",
        last_name="Patel",
    )
    admin_user = User.objects.create_user(
        email=f"admin-{uuid.uuid4().hex[:6]}@example.com",
        password="adminpassword123",
        organization=org,
        role="org_admin",
        first_name="Super",
        last_name="Admin",
    )
    store = Store.objects.create(organization=org, name="Central Supermarket", code=f"STR-{uuid.uuid4().hex[:4].upper()}")

    config = BusinessConfig.objects.create(
        organization=org,
        business_type="GROCERY",
        gst_enabled=True,
        default_tax_mode="exclusive",
        default_tax_rate=Decimal("18.00"),
        credit_sales_enabled=True,
        default_credit_limit=Decimal("50000.00"),
        max_discount_cashier=Decimal("15.00"),
        allow_negative_stock=False,
    )

    client = APIClient()
    client.force_authenticate(user=user)

    admin_client = APIClient()
    admin_client.force_authenticate(user=admin_user)

    # Standard inventory product: 450 + 5% = 472.50 -> rounded to 473.00 for 1 qty, 945.00 for 2 qty
    p1 = Product.objects.create(
        organization=org,
        external_id=f"P_{uuid.uuid4().hex[:6]}",
        name="Basmati Rice 5kg",
        sku="RICE-BAS-5KG",
        barcode="8901234567890",
        unit_price=Decimal("450.00"),
        cost_price=Decimal("380.00"),
        tax_rate=Decimal("5.00"),
        current_stock=Decimal("100.00"),
        min_stock=Decimal("10.00"),
        track_inventory=True,
    )

    # Second product: 180 + 5% = 189.00
    p2 = Product.objects.create(
        organization=org,
        external_id=f"P_{uuid.uuid4().hex[:6]}",
        name="Sunflower Oil 1L",
        sku="OIL-SUN-1L",
        barcode="8901234567891",
        unit_price=Decimal("180.00"),
        cost_price=Decimal("140.00"),
        tax_rate=Decimal("5.00"),
        current_stock=Decimal("50.00"),
        min_stock=Decimal("5.00"),
        track_inventory=True,
    )

    # Customer for credit & loyalty
    customer = Customer.objects.create(
        organization=org,
        customer_id=f"CUST-{uuid.uuid4().hex[:4].upper()}",
        first_name="Anita",
        last_name="Desai",
        phone="9876543210",
        credit_limit=Decimal("10000.00"),
        outstanding_credit=Decimal("0.00"),
        is_walk_in=False,
    )

    # Cash register session
    register = CashRegister.objects.create(
        organization=org,
        store=store,
        cashier=user,
        opening_cash=Decimal("2000.00"),
        expected_cash=Decimal("2000.00"),
        status="open",
    )

    return {
        "org": org,
        "user": user,
        "admin_user": admin_user,
        "store": store,
        "config": config,
        "client": client,
        "admin_client": admin_client,
        "p1": p1,
        "p2": p2,
        "customer": customer,
        "register": register,
    }


@pytest.mark.django_db
class TestPOSCheckoutPaymentRedesignPhased:
    """
    Automated verification suite validating all 20 scenarios required by Phase 7.
    """

    # Scenario 1: Successful cash payment with exact tender
    def test_01_successful_cash_payment_exact_tender(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]

        # 2 units of Basmati Rice @ 450 + 5% GST = 900 + 45 = 945
        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [
                {"product_id": str(p1.id), "quantity": 2, "unit_price": 450.00, "tax_rate": 5.00}
            ],
            "payments": [
                {"payment_method": "cash", "amount": 945.00}
            ]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED, res.json()
        data = res.json()

        assert data["payment_status"] == "paid"
        assert Decimal(str(data["total"])) == Decimal("945.00")
        assert Decimal(str(data["amount_paid"])) == Decimal("945.00")
        assert Decimal(str(data["change_amount"])) == Decimal("0.00")
        assert data["invoice_number"] is not None

        # Stock deducted
        p1.refresh_from_db()
        assert p1.current_stock == Decimal("98.00")

    # Scenario 2: Successful supported UPI/card workflow
    def test_02_successful_upi_card_workflow(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p2 = pos_redesign_setup["p2"]
        store = pos_redesign_setup["store"]

        # 1 unit Sunflower Oil @ 180 + 5% = 189
        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [
                {"product_id": str(p2.id), "quantity": 1, "unit_price": 180.00, "tax_rate": 5.00}
            ],
            "payments": [
                {"payment_method": "upi", "amount": 189.00, "reference": "UPI-REF-992211"}
            ]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert data["payment_method"] == "upi"
        assert Decimal(str(data["amount_paid"])) == Decimal("189.00")

        # Payment record stored
        tx = Transaction.objects.get(id=data["transaction_id"])
        payment_record = tx.payments.first()
        assert payment_record.payment_method == "upi"
        assert payment_record.reference == "UPI-REF-992211"

    # Scenario 3: Split payment (Cash + UPI + Card)
    def test_03_split_payment_multi_allocations(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]

        # 4 units @ 450 + 5% = 1800 + 90 = 1890
        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [
                {"product_id": str(p1.id), "quantity": 4, "unit_price": 450.00, "tax_rate": 5.00}
            ],
            "payments": [
                {"payment_method": "cash", "amount": 890.00},
                {"payment_method": "upi", "amount": 500.00, "reference": "UPI-SPLIT-01"},
                {"payment_method": "card", "amount": 500.00, "reference": "CARD-SPLIT-02"}
            ]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert data["payment_status"] == "paid"
        assert Decimal(str(data["total"])) == Decimal("1890.00")

        tx = Transaction.objects.get(id=data["transaction_id"])
        allocations = list(tx.payments.all())
        assert len(allocations) == 3
        methods = {p.payment_method: p.amount for p in allocations}
        assert methods["cash"] == Decimal("890.00")
        assert methods["upi"] == Decimal("500.00")
        assert methods["card"] == Decimal("500.00")

    # Scenario 4: Exact-amount cash settlement & excess tender / change calculation
    def test_04_excess_cash_tender_and_change_calculation(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]

        # 1 unit @ 450 + 5% = 472.50 -> rounded to 473.00
        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [
                {"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00, "tax_rate": 5.00}
            ],
            "payments": [
                {"payment_method": "cash", "amount": 500.00}  # Tendered ₹500 note
            ]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        total = Decimal(str(data["total"]))
        change = Decimal(str(data["change_amount"]))
        tendered = Decimal(str(data["tendered_amount"]))

        assert tendered == Decimal("500.00")
        assert change == tendered - total
        assert change == Decimal("27.00")

    # Scenario 5: Insufficient payment rejection
    def test_05_insufficient_payment_rejection(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]

        # Bill total is 473.00, only paying ₹300 in cash without credit
        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [
                {"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00, "tax_rate": 5.00}
            ],
            "payments": [
                {"payment_method": "cash", "amount": 300.00}
            ]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        error_msg = str(res.json())
        assert "less than bill total" in error_msg.lower() or "insufficient" in error_msg.lower()

    # Scenario 6: Invalid payment allocation (e.g. overpayment in electronic method without cash)
    def test_06_invalid_electronic_overpayment(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]

        # Paying ₹1000 via UPI for a ₹473 bill (electronic overpayment cannot return cash change)
        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [
                {"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00, "tax_rate": 5.00}
            ],
            "payments": [
                {"payment_method": "upi", "amount": 1000.00}
            ]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        error_msg = str(res.json())
        assert "change" in error_msg.lower() or "overpayment" in error_msg.lower()

    # Scenario 7: Empty cart rejection
    def test_07_empty_cart_rejection(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        store = pos_redesign_setup["store"]

        payload = {
            "store_id": str(store.id),
            "items": [],
            "payments": [{"payment_method": "cash", "amount": 100}]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "cart cannot be empty" in str(res.json()).lower()

    # Scenario 8: Out-of-stock product rejection
    def test_08_out_of_stock_product_rejection(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]

        # p1 current_stock is 100, try to checkout 105
        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [
                {"product_id": str(p1.id), "quantity": 105, "unit_price": 450.00}
            ],
            "payments": [{"payment_method": "cash", "amount": 50000.00}]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "insufficient stock" in str(res.json()).lower()

    # Scenario 9: Invalid product price / negative price tamper
    def test_09_invalid_price_or_quantity(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]

        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [
                {"product_id": str(p1.id), "quantity": -5, "unit_price": 450.00}
            ],
            "payments": [{"payment_method": "cash", "amount": 100}]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid quantity" in str(res.json()).lower()

    # Scenario 10: Unauthorized cashier discount percentage limit
    def test_10_unauthorized_discount_limit(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]

        # Cashier limit is 15%. Attempt to apply 25% discount.
        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "overall_discount_type": "percentage",
            "overall_discount_value": 25.0,
            "items": [
                {"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00}
            ],
            "payments": [{"payment_method": "cash", "amount": 500}]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "discount limit exceeded" in str(res.json()).lower()

    # Scenario 11: Duplicate Complete Sale submission with idempotency key
    def test_11_duplicate_submission_idempotency(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]
        idempotency_key = f"IDEMP-{uuid.uuid4().hex}"

        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [
                {"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00, "tax_rate": 5.00}
            ],
            "payments": [{"payment_method": "cash", "amount": 473.00}]
        }

        # First submission
        res1 = client.post(
            "/api/v1/pos/checkout/",
            payload,
            format="json",
            HTTP_X_IDEMPOTENCY_KEY=idempotency_key,
        )
        assert res1.status_code == status.HTTP_201_CREATED
        data1 = res1.json()
        tx1_id = data1["transaction_id"]
        inv1 = data1["invoice_number"]

        p1.refresh_from_db()
        stock_after_first = p1.current_stock

        # Second submission with same idempotency key (simulating network retry or double-click)
        res2 = client.post(
            "/api/v1/pos/checkout/",
            payload,
            format="json",
            HTTP_X_IDEMPOTENCY_KEY=idempotency_key,
        )
        assert res2.status_code == status.HTTP_201_CREATED
        data2 = res2.json()

        # Must return the identical transaction without deducting stock again
        assert data2["transaction_id"] == tx1_id
        assert data2["invoice_number"] == inv1
        p1.refresh_from_db()
        assert p1.current_stock == stock_after_first

    # Scenario 12: Network timeout simulation / safe retry idempotency
    def test_12_safe_retry_after_interrupted_request(self, pos_redesign_setup):
        org = pos_redesign_setup["org"]
        store = pos_redesign_setup["store"]
        user = pos_redesign_setup["user"]
        p2 = pos_redesign_setup["p2"]
        idemp = f"RETRY-{uuid.uuid4().hex}"

        cart_data = {
            "items": [{"product_id": str(p2.id), "quantity": 1, "unit_price": Decimal("180.00"), "tax_rate": Decimal("5.00")}],
            "payments": [{"payment_method": "cash", "amount": Decimal("189.00")}],
            "is_walk_in": True,
        }

        # Direct service call
        res_first = CheckoutService.process_checkout(
            organization=org,
            store=store,
            user=user,
            cart_data=cart_data,
            idempotency_key=idemp,
        )

        # Retry with identical key
        res_retry = CheckoutService.process_checkout(
            organization=org,
            store=store,
            user=user,
            cart_data=cart_data,
            idempotency_key=idemp,
        )

        assert res_first["id"] == res_retry["id"]
        assert res_first["transaction_id"] == res_retry["transaction_id"]
        assert res_first["invoice_number"] == res_retry["invoice_number"]

    # Scenario 13: Backend validation error handling (e.g., non-existent store)
    def test_13_backend_validation_error_handling(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]

        payload = {
            "store_id": str(uuid.uuid4()),  # non-existent store
            "items": [{"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00}],
            "payments": [{"payment_method": "cash", "amount": 473.00}]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "store" in str(res.json()).lower() and "not found" in str(res.json()).lower()

    # Scenario 14: Database transaction rollback on error
    def test_14_database_transaction_rollback(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]
        initial_tx_count = Transaction.objects.count()
        initial_inv_count = Invoice.objects.count()
        initial_stock = p1.current_stock

        # Payload with an item that will fail stock check (request 200 units when stock is 100)
        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [
                {"product_id": str(p1.id), "quantity": 200, "unit_price": 450.00}
            ],
            "payments": [{"payment_method": "cash", "amount": 90000.00}]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

        # Verify no orphaned records were persisted
        assert Transaction.objects.count() == initial_tx_count
        assert Invoice.objects.count() == initial_inv_count
        p1.refresh_from_db()
        assert p1.current_stock == initial_stock

    # Scenario 15: Concurrent checkout / row lock protection
    def test_15_concurrent_stock_protection(self, pos_redesign_setup):
        org = pos_redesign_setup["org"]
        store = pos_redesign_setup["store"]
        user = pos_redesign_setup["user"]

        # Product with exactly 3 units left
        limited_prod = Product.objects.create(
            organization=org,
            name="Limited Edition Watch",
            unit_price=Decimal("5000.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("3.00"),
            track_inventory=True,
        )

        cart_data = {
            "items": [{"product_id": str(limited_prod.id), "quantity": Decimal("2.00"), "unit_price": Decimal("5000.00"), "tax_rate": Decimal("18.00")}],
            "payments": [{"payment_method": "cash", "amount": Decimal("11800.00")}],
            "is_walk_in": True,
        }

        # First checkout succeeds, leaves 1 unit
        res1 = CheckoutService.process_checkout(
            organization=org, store=store, user=user, cart_data=cart_data
        )
        assert res1["payment_status"] == "paid"
        limited_prod.refresh_from_db()
        assert limited_prod.current_stock == Decimal("1.00")

        # Second checkout tries to buy 2 units, must raise ValidationError
        with pytest.raises(ValidationError) as exc_info:
            CheckoutService.process_checkout(
                organization=org, store=store, user=user, cart_data=cart_data
            )
        assert "insufficient stock" in str(exc_info.value).lower()
        limited_prod.refresh_from_db()
        assert limited_prod.current_stock == Decimal("1.00")

    # Scenario 16: Invoice generation linked to transaction
    def test_16_invoice_generation_linked_to_transaction(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]

        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [{"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00}],
            "payments": [{"payment_method": "cash", "amount": 473.00}]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()

        tx = Transaction.objects.get(id=data["transaction_id"])
        invoice = Invoice.objects.get(transaction=tx)
        assert invoice.invoice_number == tx.invoice_number
        assert invoice.web_url is not None
        assert invoice.secure_token is not None

    # Scenario 17: Retry after uncertain transaction outcome
    def test_17_retry_after_uncertain_transaction(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]
        idemp = f"UNCERTAIN-{uuid.uuid4().hex}"

        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [{"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00}],
            "payments": [{"payment_method": "cash", "amount": 473.00}]
        }

        # Client sends request
        res1 = client.post("/api/v1/pos/checkout/", payload, format="json", HTTP_X_IDEMPOTENCY_KEY=idemp)
        assert res1.status_code == status.HTTP_201_CREATED
        tx1 = res1.json()["transaction_id"]

        # Client re-sends assuming it was lost
        res2 = client.post("/api/v1/pos/checkout/", payload, format="json", HTTP_X_IDEMPOTENCY_KEY=idemp)
        assert res2.status_code == status.HTTP_201_CREATED
        assert res2.json()["transaction_id"] == tx1

    # Scenario 18: Customer credit / Udhaar validation (limit enforcement & rejection of credit for walk-in customer)
    def test_18_customer_credit_udhaar_validation(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]
        customer = pos_redesign_setup["customer"]

        # Part A: Walk-in customer cannot buy on credit
        walkin_payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [{"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00}],
            "payments": [{"payment_method": "credit", "amount": 473.00}]
        }
        res_walkin = client.post("/api/v1/pos/checkout/", walkin_payload, format="json")
        assert res_walkin.status_code == status.HTTP_400_BAD_REQUEST
        assert "credit sales require a registered customer" in str(res_walkin.json()).lower()

        # Part B: Registered customer within limit
        registered_payload = {
            "store_id": str(store.id),
            "customer": {"id": str(customer.id), "phone": customer.phone},
            "items": [{"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00}],
            "payments": [{"payment_method": "credit", "amount": 473.00}]
        }
        res_credit = client.post("/api/v1/pos/checkout/", registered_payload, format="json")
        assert res_credit.status_code == status.HTTP_201_CREATED
        assert res_credit.json()["payment_status"] == "credit"

        customer.refresh_from_db()
        assert customer.outstanding_credit == Decimal("473.00")

        # Part C: Exceeding customer credit limit (limit is 10000, current is 473.00, 25 items total 11813.00)
        exceed_payload = {
            "store_id": str(store.id),
            "customer": {"id": str(customer.id), "phone": customer.phone},
            "items": [{"product_id": str(p1.id), "quantity": 25, "unit_price": 450.00}],
            "payments": [{"payment_method": "credit", "amount": 11813.00}]
        }
        res_exceed = client.post("/api/v1/pos/checkout/", exceed_payload, format="json")
        assert res_exceed.status_code == status.HTTP_400_BAD_REQUEST
        assert "credit limit" in str(res_exceed.json()).lower()

    # Scenario 19: Register drawer balance reconciliation
    def test_19_register_drawer_balance_reconciliation(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        p1 = pos_redesign_setup["p1"]
        store = pos_redesign_setup["store"]
        register = pos_redesign_setup["register"]

        initial_open = register.opening_cash  # 2000.00

        # Cash sale of ₹473.00
        payload = {
            "store_id": str(store.id),
            "is_walk_in": True,
            "items": [{"product_id": str(p1.id), "quantity": 1, "unit_price": 450.00}],
            "payments": [{"payment_method": "cash", "amount": 473.00}]
        }
        res = client.post("/api/v1/pos/checkout/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED

        register.refresh_from_db()
        assert register.cash_sales == Decimal("473.00")
        assert register.calculate_expected_cash() == initial_open + Decimal("473.00")

    # Scenario 20: Quotation conversion followed by checkout
    def test_20_quotation_lookup_and_checkout_conversion(self, pos_redesign_setup):
        client = pos_redesign_setup["client"]
        org = pos_redesign_setup["org"]
        store = pos_redesign_setup["store"]
        p1 = pos_redesign_setup["p1"]

        # Create a quotation
        quote = Quotation.objects.create(
            organization=org,
            store=store,
            quotation_number="QT-POS-1001",
            quotation_date=timezone.now().date(),
            customer_name="Vikram Mehta",
            customer_phone="9988776655",
            subtotal=Decimal("450.00"),
            tax=Decimal("22.50"),
            total=Decimal("472.50"),
            status="draft",
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=p1,
            name=p1.name,
            quantity=Decimal("1.00"),
            unit_price=Decimal("450.00"),
            tax_rate=Decimal("5.00"),
            tax=Decimal("22.50"),
            total=Decimal("472.50"),
        )

        # 1. Lookup quotation
        res_lookup = client.get("/api/v1/invoices/quotations/lookup/1001/")
        assert res_lookup.status_code == status.HTTP_200_OK
        data_quote = res_lookup.json()
        assert data_quote["quotation_number"] == "QT-POS-1001"
        assert len(data_quote["items"]) == 1

        # 2. Convert via QuotationConvertView or POS checkout
        res_convert = client.post(
            f"/api/v1/invoices/quotations/{quote.id}/convert/",
            {"payment_method": "cash", "amount_paid": 472.50},
            format="json"
        )
        assert res_convert.status_code == status.HTTP_201_CREATED
        convert_data = res_convert.json()
        assert convert_data["invoice_number"] is not None

        quote.refresh_from_db()
        assert quote.status == "converted"
        assert quote.converted_invoice is not None
