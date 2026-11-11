import uuid
from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.billing.models import BusinessConfig
from apps.billing.services.reports_service import ReportsService
from apps.customers.models import Customer
from apps.invoices.models import Invoice
from apps.invoices.pdf import generate_invoice_pdf_bytes
from apps.organizations.models import Organization
from apps.products.models import Product
from apps.stores.models import Store
from apps.transactions.models import Transaction, TransactionItem, TransactionPayment
from apps.users.models import User


@pytest.fixture
def pos_flow_setup(db):
    org = Organization.objects.create(
        name=f"POS Editable Price Org {uuid.uuid4().hex[:6]}",
        currency="INR",
    )
    admin_user = User.objects.create_user(
        email=f"pos-admin-{uuid.uuid4().hex[:6]}@example.com",
        password="adminpassword123",
        organization=org,
        role="org_admin",
        first_name="Owner",
        last_name="Admin",
    )
    staff_user = User.objects.create_user(
        email=f"pos-staff-{uuid.uuid4().hex[:6]}@example.com",
        password="staffpassword123",
        organization=org,
        role="cashier",
        first_name="Asha",
        last_name="Verma",
    )
    store = Store.objects.create(
        organization=org,
        name="Main Counter",
        code=f"CNT-{uuid.uuid4().hex[:4].upper()}",
    )
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

    shirt = Product.objects.create(
        organization=org,
        external_id=f"SKU-{uuid.uuid4().hex[:6]}",
        name="Oxford Shirt",
        sku="OXF-SHIRT-M",
        unit_price=Decimal("500.00"),
        cost_price=Decimal("300.00"),
        tax_rate=Decimal("5.00"),
        current_stock=Decimal("40.00"),
        min_stock=Decimal("2.00"),
        track_inventory=True,
    )
    shoes = Product.objects.create(
        organization=org,
        external_id=f"SKU-{uuid.uuid4().hex[:6]}",
        name="Leather Loafers",
        sku="LOAF-42",
        unit_price=Decimal("1200.00"),
        cost_price=Decimal("700.00"),
        tax_rate=Decimal("12.00"),
        current_stock=Decimal("25.00"),
        min_stock=Decimal("2.00"),
        track_inventory=True,
    )

    customer = Customer.objects.create(
        organization=org,
        customer_id=f"CUST-{uuid.uuid4().hex[:4].upper()}",
        first_name="Rohan",
        last_name="Mehta",
        phone="9876543210",
        email="rohan@example.com",
        credit_limit=Decimal("20000.00"),
        outstanding_credit=Decimal("0.00"),
        is_walk_in=False,
    )
    walk_in = Customer.objects.create(
        organization=org,
        customer_id=f"WALK-{uuid.uuid4().hex[:4].upper()}",
        first_name="Walk-in",
        last_name="Customer",
        is_walk_in=True,
    )

    return {
        "org": org,
        "admin_user": admin_user,
        "staff_user": staff_user,
        "store": store,
        "config": config,
        "admin_client": admin_client,
        "staff_client": staff_client,
        "shirt": shirt,
        "shoes": shoes,
        "customer": customer,
        "walk_in": walk_in,
    }


@pytest.mark.django_db
class TestPOSEditablePriceAndPaymentFlow:
    CALCULATE_URL = "/api/v1/pos/cart/calculate/"
    CHECKOUT_URL = "/api/v1/pos/checkout/"
    HELD_CARTS_URL = "/api/v1/pos/held-carts/"

    def test_calculate_default_quantity_and_edited_unit_price_gst_modes(self, pos_flow_setup):
        client = pos_flow_setup["admin_client"]
        shirt = pos_flow_setup["shirt"]
        shoes = pos_flow_setup["shoes"]

        # 1) Default price calculation when unit_price is omitted
        resp_default = client.post(
            self.CALCULATE_URL,
            {
                "items": [{"product_id": str(shirt.id), "quantity": 2}],
                "gst_enabled": True,
                "tax_mode": "exclusive",
            },
            format="json",
        )
        assert resp_default.status_code == status.HTTP_200_OK
        assert Decimal(str(resp_default.data["subtotal"])) == Decimal("1000.00")
        assert Decimal(str(resp_default.data["tax"])) == Decimal("50.00")
        assert Decimal(str(resp_default.data["grand_total"])) == Decimal("1050.00")
        assert Decimal(str(resp_default.data["items"][0]["unit_price"])) == Decimal("500.00")

        # 2) Edited unit price (higher and lower) + discount recomputes GST & totals
        resp_edited = client.post(
            self.CALCULATE_URL,
            {
                "items": [
                    {
                        "product_id": str(shirt.id),
                        "quantity": 2,
                        "unit_price": "650.00",
                        "discount": "100.00",
                    },
                    {
                        "product_id": str(shoes.id),
                        "quantity": 1,
                        "unit_price": "900.00",
                    },
                ],
                "overall_discount_type": "fixed",
                "overall_discount_value": "50.00",
                "gst_enabled": True,
                "tax_mode": "exclusive",
            },
            format="json",
        )
        assert resp_edited.status_code == status.HTTP_200_OK
        assert Decimal(str(resp_edited.data["subtotal"])) == Decimal("2200.00")
        assert Decimal(str(resp_edited.data["total_discount"])) == Decimal("150.00")
        assert Decimal(str(resp_edited.data["taxable_amount"])) == Decimal("2100.00")
        assert Decimal(str(resp_edited.data["tax"])) > Decimal("0.00")
        assert Decimal(str(resp_edited.data["items"][0]["unit_price"])) == Decimal("650.00")
        assert Decimal(str(resp_edited.data["items"][1]["unit_price"])) == Decimal("900.00")

        # 3) Tax-inclusive mode (configured via BusinessConfig) with edited unit price and Rs 0 promotional override
        config = pos_flow_setup["config"]
        config.default_tax_mode = "inclusive"
        config.save(update_fields=["default_tax_mode"])
        resp_inc = client.post(
            self.CALCULATE_URL,
            {
                "items": [
                    {"product_id": str(shirt.id), "quantity": 1, "unit_price": "525.00"},
                    {"product_id": str(shoes.id), "quantity": 1, "unit_price": "0"},
                ],
                "gst_enabled": True,
                "tax_mode": "inclusive",
                "is_tax_inclusive": True,
            },
            format="json",
        )
        assert resp_inc.status_code == status.HTTP_200_OK
        assert Decimal(str(resp_inc.data["grand_total"])) == Decimal("525.00")
        assert Decimal(str(resp_inc.data["tax"])) == Decimal("25.00")
        assert Decimal(str(resp_inc.data["items"][1]["unit_price"])) == Decimal("0.00")

        # Master product catalog prices never mutated
        shirt.refresh_from_db()
        shoes.refresh_from_db()
        assert shirt.unit_price == Decimal("500.00")
        assert shoes.unit_price == Decimal("1200.00")

    @pytest.mark.parametrize(
        "bad_payload",
        [
            {"items": [{"product_id": "SHIRT", "quantity": 1, "unit_price": "-10.00"}]},
            {"items": [{"product_id": "SHIRT", "quantity": 1, "unit_price": "invalid"}]},
            {"items": [{"product_id": "SHIRT", "quantity": 1, "unit_price": "NaN"}]},
            {"items": [{"product_id": "SHIRT", "quantity": 0, "unit_price": "100.00"}]},
            {"items": [{"product_id": "SHIRT", "quantity": 1, "unit_price": "100.00", "discount": "-5"}]},
            {
                "items": [{"product_id": "SHIRT", "quantity": 1, "unit_price": "100.00"}],
                "overall_discount_type": "fixed",
                "overall_discount_value": "-25",
            },
        ],
    )
    def test_reject_invalid_and_negative_prices_or_values(self, pos_flow_setup, bad_payload):
        client = pos_flow_setup["admin_client"]
        shirt = pos_flow_setup["shirt"]
        store = pos_flow_setup["store"]

        payload = {
            **bad_payload,
            "items": [
                {**item, "product_id": str(shirt.id)} for item in bad_payload["items"]
            ],
        }
        calc_resp = client.post(self.CALCULATE_URL, payload, format="json")
        assert calc_resp.status_code == status.HTTP_400_BAD_REQUEST

        checkout_payload = {
            **payload,
            "store_id": str(store.id),
            "payments": [{"payment_method": "cash", "amount": "100.00"}],
        }
        checkout_resp = client.post(self.CHECKOUT_URL, checkout_payload, format="json")
        assert checkout_resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_checkout_edited_price_flows_to_transaction_invoice_pdf_stock_and_reports(self, pos_flow_setup):
        client = pos_flow_setup["admin_client"]
        org = pos_flow_setup["org"]
        store = pos_flow_setup["store"]
        shirt = pos_flow_setup["shirt"]
        customer = pos_flow_setup["customer"]

        calc = client.post(
            self.CALCULATE_URL,
            {
                "items": [{"product_id": str(shirt.id), "quantity": 3, "unit_price": "420.00"}],
                "gst_enabled": True,
                "tax_mode": "exclusive",
            },
            format="json",
        )
        assert calc.status_code == status.HTTP_200_OK
        grand_total = Decimal(str(calc.data["grand_total"]))
        assert grand_total == Decimal("1323.00")  # 3 * 420 = 1260 + 5% GST (63) = 1323.00

        # Cash checkout with excess tender -> change returned
        resp = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "customer_id": str(customer.id),
                "items": [{"product_id": str(shirt.id), "quantity": 3, "unit_price": "420.00"}],
                "payments": [{"payment_method": "cash", "amount": "1500.00"}],
                "tax_mode": "exclusive",
                "idempotency_key": f"cash-edit-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        tx_id = resp.data["transaction_id"]
        inv_id = resp.data["invoice_id"]
        assert resp.data["items"][0]["unit_price"] == "420.00"
        assert resp.data["items"][0]["original_unit_price"] == "500.00"

        tx = Transaction.objects.get(id=tx_id)
        assert tx.total == Decimal("1323.00")
        assert tx.change_amount == Decimal("177.00")
        tx_item = TransactionItem.objects.get(transaction=tx)
        assert tx_item.unit_price == Decimal("420.00")
        assert tx_item.attributes.get("original_unit_price") == "500.00"

        # Master catalog untouched & inventory deducted
        shirt.refresh_from_db()
        assert shirt.unit_price == Decimal("500.00")
        assert shirt.current_stock == Decimal("37.00")

        # Invoice Detail API + PDF download + Public view reflect edited unit price
        inv_resp = client.get(f"/api/v1/invoices/{inv_id}/")
        assert inv_resp.status_code == status.HTTP_200_OK
        inv_items = inv_resp.data["transaction_details"]["items"]
        assert Decimal(str(inv_items[0]["unit_price"])) == Decimal("420.00")

        pdf_resp = client.get(f"/api/v1/invoices/{inv_id}/pdf/?download=true")
        assert pdf_resp.status_code == status.HTTP_200_OK
        assert pdf_resp["Content-Type"] == "application/pdf"
        assert pdf_resp.content[:4] == b"%PDF"

        public_resp = client.get(f"/api/v1/invoices/view/{resp.data['invoice']['secure_token']}/")
        assert public_resp.status_code == status.HTTP_200_OK
        assert Decimal(str(public_resp.data["items"][0]["unit_price"])) == Decimal("420.00")

        invoice_obj = Invoice.objects.get(id=inv_id)
        pdf_bytes = generate_invoice_pdf_bytes(invoice_obj)
        assert pdf_bytes[:4] == b"%PDF"

        # Sales report reflects billed amount rather than master catalog price
        report = ReportsService.get_sales_report(org, store_id=str(store.id), period="today")
        assert Decimal(report["summary"]["total_sales"]) == Decimal("1323.00")

    @pytest.mark.parametrize("method", ["upi", "card", "netbanking", "cheque", "wallet"])
    def test_checkout_single_direct_payment_methods(self, pos_flow_setup, method):
        client = pos_flow_setup["admin_client"]
        store = pos_flow_setup["store"]
        shirt = pos_flow_setup["shirt"]

        # Edited unit price 400 + 5% GST = 420.00
        resp = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "items": [{"product_id": str(shirt.id), "quantity": 1, "unit_price": "400.00"}],
                "payments": [{"payment_method": method, "amount": "420.00"}],
                "tax_mode": "exclusive",
                "idempotency_key": f"pay-{method}-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        tx = Transaction.objects.get(id=resp.data["transaction_id"])
        assert tx.payment_method == method
        assert tx.total == Decimal("420.00")
        assert tx.payment_status == "paid"

    def test_checkout_credit_sale_guards_and_balance_update(self, pos_flow_setup):
        client = pos_flow_setup["admin_client"]
        store = pos_flow_setup["store"]
        shirt = pos_flow_setup["shirt"]
        customer = pos_flow_setup["customer"]
        walk_in = pos_flow_setup["walk_in"]
        config = pos_flow_setup["config"]

        # Walk-in credit sale must be rejected
        resp_walkin = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "customer_id": str(walk_in.id),
                "items": [{"product_id": str(shirt.id), "quantity": 1, "unit_price": "400.00"}],
                "payments": [{"payment_method": "credit", "amount": "420.00"}],
                "tax_mode": "exclusive",
                "idempotency_key": f"credit-walkin-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp_walkin.status_code == status.HTTP_400_BAD_REQUEST

        # Registered customer succeeds when enabled
        resp_cust = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "customer_id": str(customer.id),
                "items": [{"product_id": str(shirt.id), "quantity": 1, "unit_price": "400.00"}],
                "payments": [{"payment_method": "credit", "amount": "420.00"}],
                "tax_mode": "exclusive",
                "idempotency_key": f"credit-ok-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp_cust.status_code == status.HTTP_201_CREATED
        customer.refresh_from_db()
        assert customer.outstanding_credit == Decimal("420.00")

        # Disabled credit config blocks credit checkout
        config.credit_sales_enabled = False
        config.save(update_fields=["credit_sales_enabled"])
        resp_disabled = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "customer_id": str(customer.id),
                "items": [{"product_id": str(shirt.id), "quantity": 1, "unit_price": "400.00"}],
                "payments": [{"payment_method": "credit", "amount": "420.00"}],
                "tax_mode": "exclusive",
                "idempotency_key": f"credit-off-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp_disabled.status_code == status.HTTP_400_BAD_REQUEST

    def test_checkout_hybrid_split_payment_and_validation_rules(self, pos_flow_setup):
        client = pos_flow_setup["admin_client"]
        store = pos_flow_setup["store"]
        shoes = pos_flow_setup["shoes"]

        # Edited unit_price 1000 + 12% GST = 1120.00
        # Electronic overpayment rejected
        resp_overpay = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "items": [{"product_id": str(shoes.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [
                    {"payment_method": "upi", "amount": "700.00"},
                    {"payment_method": "card", "amount": "500.00"},
                ],
                "tax_mode": "exclusive",
                "idempotency_key": f"split-over-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp_overpay.status_code == status.HTTP_400_BAD_REQUEST

        # Underpayment without allow_partial rejected
        resp_underpay = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "items": [{"product_id": str(shoes.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [
                    {"payment_method": "cash", "amount": "500.00"},
                    {"payment_method": "upi", "amount": "300.00"},
                ],
                "tax_mode": "exclusive",
                "idempotency_key": f"split-under-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp_underpay.status_code == status.HTTP_400_BAD_REQUEST

        # Valid 3-way split: Cash + UPI + Card
        resp_split = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "items": [{"product_id": str(shoes.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [
                    {"payment_method": "cash", "amount": "320.00"},
                    {"payment_method": "upi", "amount": "500.00"},
                    {"payment_method": "card", "amount": "300.00"},
                ],
                "tax_mode": "exclusive",
                "idempotency_key": f"split-ok-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp_split.status_code == status.HTTP_201_CREATED
        tx = Transaction.objects.get(id=resp_split.data["transaction_id"])
        assert len(resp_split.data["payments"]) == 3
        allocs = TransactionPayment.objects.filter(transaction=tx)
        assert allocs.count() == 3
        alloc_map = {a.payment_method: a.amount for a in allocs}
        assert alloc_map == {
            "cash": Decimal("320.00"),
            "upi": Decimal("500.00"),
            "card": Decimal("300.00"),
        }
        assert sum(a.amount for a in allocs) == Decimal("1120.00")

    def test_checkout_zero_price_item_does_not_fallback_to_catalog_price(self, pos_flow_setup):
        client = pos_flow_setup["admin_client"]
        store = pos_flow_setup["store"]
        shirt = pos_flow_setup["shirt"]
        shoes = pos_flow_setup["shoes"]

        # Empty payments must be rejected cleanly
        resp_empty_pay = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "items": [{"product_id": str(shirt.id), "quantity": 1, "unit_price": 0}],
                "payments": [],
            },
            format="json",
        )
        assert resp_empty_pay.status_code == status.HTTP_400_BAD_REQUEST

        # Freebie item (unit_price=0) alongside paid item keeps Rs 0 instead of 500
        resp_mix = client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "items": [
                    {"product_id": str(shirt.id), "quantity": 1, "unit_price": 0},
                    {"product_id": str(shoes.id), "quantity": 1, "unit_price": "1000.00"},
                ],
                "payments": [{"payment_method": "cash", "amount": "1120.00"}],
                "tax_mode": "exclusive",
                "idempotency_key": f"free-line-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp_mix.status_code == status.HTTP_201_CREATED
        tx = Transaction.objects.get(id=resp_mix.data["transaction_id"])
        assert tx.total == Decimal("1120.00")
        free_item = TransactionItem.objects.get(transaction=tx, product=shirt)
        assert free_item.unit_price == Decimal("0.00")
        assert free_item.attributes.get("original_unit_price") == "500.00"

    def test_checkout_idempotency_with_edited_price(self, pos_flow_setup):
        client = pos_flow_setup["admin_client"]
        store = pos_flow_setup["store"]
        shirt = pos_flow_setup["shirt"]
        initial_stock = shirt.current_stock

        idem_key = f"idem-edit-{uuid.uuid4().hex}"
        payload = {
            "store_id": str(store.id),
            "items": [{"product_id": str(shirt.id), "quantity": 2, "unit_price": "400.00"}],
            "payments": [{"payment_method": "upi", "amount": "840.00"}],
            "tax_mode": "exclusive",
            "idempotency_key": idem_key,
        }
        r1 = client.post(self.CHECKOUT_URL, payload, format="json")
        r2 = client.post(self.CHECKOUT_URL, payload, format="json")

        assert r1.status_code == status.HTTP_201_CREATED
        assert r2.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
        assert r1.data["transaction_id"] == r2.data["transaction_id"]
        assert Transaction.objects.filter(external_transaction_id=idem_key).count() == 1

        shirt.refresh_from_db()
        assert shirt.current_stock == initial_stock - Decimal("2.00")

    def test_staff_cashier_attribution_and_discount_limit(self, pos_flow_setup):
        staff_client = pos_flow_setup["staff_client"]
        staff_user = pos_flow_setup["staff_user"]
        store = pos_flow_setup["store"]
        shirt = pos_flow_setup["shirt"]

        # Exceeding cashier 20% discount cap relative to edited price (400 -> discount 150 = 37.5%)
        resp_over_disc = staff_client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "items": [
                    {
                        "product_id": str(shirt.id),
                        "quantity": 1,
                        "unit_price": "400.00",
                        "discount": "150.00",
                    }
                ],
                "payments": [{"payment_method": "cash", "amount": "300.00"}],
                "tax_mode": "exclusive",
                "idempotency_key": f"staff-disc-over-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp_over_disc.status_code == status.HTTP_400_BAD_REQUEST

        # Within cashier discount cap -> succeeds with staff attribution
        resp_ok = staff_client.post(
            self.CHECKOUT_URL,
            {
                "store_id": str(store.id),
                "items": [{"product_id": str(shirt.id), "quantity": 1, "unit_price": "400.00"}],
                "payments": [{"payment_method": "upi", "amount": "420.00"}],
                "tax_mode": "exclusive",
                "idempotency_key": f"staff-ok-{uuid.uuid4().hex}",
            },
            format="json",
        )
        assert resp_ok.status_code == status.HTTP_201_CREATED
        tx = Transaction.objects.get(id=resp_ok.data["transaction_id"])
        assert tx.cashier == staff_user

    def test_held_cart_preserves_custom_unit_price(self, pos_flow_setup):
        client = pos_flow_setup["admin_client"]
        shirt = pos_flow_setup["shirt"]

        save_resp = client.post(
            self.HELD_CARTS_URL,
            {
                "hold_reference": "Edited Price Hold",
                "cart_data": {
                    "items": [
                        {
                            "product_id": str(shirt.id),
                            "name": shirt.name,
                            "sku": shirt.sku,
                            "unit_price": 425.0,
                            "original_unit_price": 500.0,
                            "quantity": 2,
                            "discount": 0,
                            "tax_rate": 5.0,
                        }
                    ]
                },
            },
            format="json",
        )
        assert save_resp.status_code == status.HTTP_201_CREATED
        held_id = str(save_resp.data["id"])

        list_resp = client.get(self.HELD_CARTS_URL)
        assert list_resp.status_code == status.HTTP_200_OK
        held_list = list_resp.data.get("results", list_resp.data) if isinstance(list_resp.data, dict) else list_resp.data
        held = next(c for c in held_list if str(c["id"]) == held_id)
        assert held["cart_data"]["items"][0]["unit_price"] == 425.0
        assert held["cart_data"]["items"][0]["original_unit_price"] == 500.0
