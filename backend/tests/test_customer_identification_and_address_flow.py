import uuid
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from django.db import IntegrityError
from rest_framework import status
from rest_framework.test import APIClient

from apps.billing.models import BusinessConfig, CashRegister
from apps.customers.models import Customer
from apps.customers.utils import normalize_phone, validate_mobile_number
from apps.invoices.models import Invoice
from apps.invoices.pdf import generate_invoice_pdf_bytes
from apps.organizations.models import Organization
from apps.products.models import InventoryMovement, Product
from apps.stores.models import Store
from apps.transactions.models import Transaction
from apps.users.models import User
from apps.whatsapp.models import WhatsAppConfig


def _mock_resp(ok=True, status_code=200, json_data=None):
    resp = Mock()
    resp.ok = ok
    resp.status_code = status_code
    resp.json.return_value = json_data if json_data is not None else {}
    return resp


@pytest.fixture
def customer_flow_env(db):
    org = Organization.objects.create(
        name=f"Pune Retail Co {uuid.uuid4().hex[:5]}",
        currency="INR",
        gst_number="27AABCP1234A1Z5",
        state="Maharashtra",
    )
    user = User.objects.create_user(
        email=f"billing-admin-{uuid.uuid4().hex[:6]}@example.com",
        password="testpassword123",
        organization=org,
        role="org_admin",
        first_name="Meet",
        last_name="Admin",
    )
    store = Store.objects.create(
        organization=org,
        name="FC Road Flagship",
        code=f"STR-{uuid.uuid4().hex[:4].upper()}",
        city="Pune",
        state="Maharashtra",
    )
    config = BusinessConfig.objects.create(
        organization=org,
        gst_enabled=True,
        default_tax_mode="exclusive",
        default_tax_rate=Decimal("18.00"),
        credit_sales_enabled=True,
        default_credit_limit=Decimal("15000.00"),
        allow_negative_stock=False,
        auto_send_whatsapp=False,
    )
    CashRegister.objects.create(
        organization=org,
        store=store,
        cashier=user,
        opening_cash=Decimal("1000.00"),
        expected_cash=Decimal("1000.00"),
        status="open",
    )
    product = Product.objects.create(
        organization=org,
        external_id=f"PROD-{uuid.uuid4().hex[:6]}",
        name="Wireless Keyboard Pro",
        sku="KB-PRO-01",
        unit_price=Decimal("1000.00"),
        cost_price=Decimal("700.00"),
        tax_rate=Decimal("18.00"),
        current_stock=Decimal("25.00"),
        min_stock=Decimal("2.00"),
        track_inventory=True,
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return {
        "org": org,
        "user": user,
        "store": store,
        "config": config,
        "product": product,
        "client": client,
    }


@pytest.mark.django_db
class TestCustomerIdentificationAndAddressFlow:
    def test_01_default_frontend_not_walkin_and_backend_rejects_ambiguous_non_walkin(self, customer_flow_env):
        # Verify frontend UnifiedBillingWorkspace defaults customerSelectionMode to "unselected" (not walk-in)
        repo_root = Path(__file__).resolve().parents[2]
        workspace_tsx = (repo_root / "frontend/components/billing/UnifiedBillingWorkspace.tsx").read_text(encoding="utf-8")
        assert 'useState<CustomerSelectionMode>("unselected")' in workspace_tsx
        assert "Continue as Walk-in Customer" in workspace_tsx

        # Backend must reject explicit is_walk_in=False when no customer or mobile is supplied
        client = customer_flow_env["client"]
        store = customer_flow_env["store"]
        product = customer_flow_env["product"]
        res = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "is_walk_in": False,
                "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [{"payment_method": "cash", "amount": "1180.00"}],
            },
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "mobile" in str(res.data).lower() or "walk-in" in str(res.data).lower()

    def test_02_existing_customer_detected_with_full_independent_address(self, customer_flow_env):
        org = customer_flow_env["org"]
        client = customer_flow_env["client"]

        cust = Customer.objects.create(
            organization=org,
            first_name="Rohan",
            last_name="Patil",
            phone="+91 93225 20275",
            address_line1="Plot 14, EON IT Park Road, Kharadi",
            city="Pune",
            state="Maharashtra",
            postal_code="411014",
            gstin="27AAACR1111A1Z2",
            credit_limit=Decimal("25000.00"),
            outstanding_credit=Decimal("1200.00"),
        )

        res = client.get(f"/api/v1/customers/by-mobile/{cust.phone}/")
        assert res.status_code == status.HTTP_200_OK
        assert res.data["exists"] is True
        c_data = res.data["customer"]
        assert c_data["id"] == str(cust.id)
        assert c_data["full_name"] == "Rohan Patil"
        assert c_data["phone"] == "9322520275"
        assert c_data["address_line1"] == "Plot 14, EON IT Park Road, Kharadi"
        assert c_data["city"] == "Pune"
        assert c_data["state"] == "Maharashtra"
        assert c_data["postal_code"] == "411014"
        assert c_data["gstin"] == "27AAACR1111A1Z2"
        assert Decimal(c_data["credit_limit"]) == Decimal("25000.00")
        assert Decimal(c_data["outstanding_credit"]) == Decimal("1200.00")

    def test_03_country_code_and_formatting_variations_match_same_customer(self, customer_flow_env):
        org = customer_flow_env["org"]
        client = customer_flow_env["client"]

        cust = Customer.objects.create(
            organization=org,
            first_name="Neha",
            last_name="Kulkarni",
            phone="9876543210",
            address_line1="Shop 8, FC Road",
            city="Pune",
            state="Maharashtra",
            postal_code="411004",
        )

        assert normalize_phone("+91 98765-43210") == "9876543210"
        assert normalize_phone("919876543210") == "9876543210"
        assert normalize_phone("09876543210") == "9876543210"

        for variant in ["+91 9876543210", "919876543210", "09876543210", "98765-43210"]:
            res = client.get(f"/api/v1/customers/by-mobile/{variant}/")
            assert res.status_code == status.HTTP_200_OK, f"Failed for {variant}: {res.data}"
            assert res.data["exists"] is True
            assert res.data["customer"]["id"] == str(cust.id)
            assert res.data["customer"]["address_line1"] == "Shop 8, FC Road"

        # Invalid/incomplete mobile rejected cleanly
        ok_bad, _, _ = validate_mobile_number("98765")
        assert ok_bad is False
        res_bad = client.get("/api/v1/customers/by-mobile/98765/")
        assert res_bad.status_code == status.HTTP_400_BAD_REQUEST

    def test_04_unknown_mobile_returns_exists_false_then_creates_with_address(self, customer_flow_env):
        client = customer_flow_env["client"]
        store = customer_flow_env["store"]
        product = customer_flow_env["product"]

        # 1. Lookup unknown mobile
        lookup = client.get("/api/v1/customers/by-mobile/9765432109/")
        assert lookup.status_code == status.HTTP_200_OK
        assert lookup.data["exists"] is False
        assert lookup.data["normalized_mobile"] == "9765432109"

        # 2. Inline creation with full_name + normalized phone + independent address
        create_res = client.post(
            "/api/v1/customers/",
            {
                "full_name": "Siddharth Deshmukh",
                "phone": "+91 97654-32109",
                "address_line1": "Flat 402, Skyview Residency, Kothrud",
                "city": "Pune",
                "state": "Maharashtra",
                "postal_code": "411038",
                "gstin": "27AAACS9999B1Z1",
            },
            format="json",
        )
        assert create_res.status_code == status.HTTP_201_CREATED, create_res.data
        created = create_res.data
        assert created["phone"] == "9765432109"
        assert created["full_name"] == "Siddharth Deshmukh"
        assert created["address_line1"] == "Flat 402, Skyview Residency, Kothrud"
        assert created["postal_code"] == "411038"

        # 3. Complete checkout bound to newly created customer
        chk = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "is_walk_in": False,
                "customer": {"id": created["id"], "phone": created["phone"]},
                "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [{"payment_method": "upi", "amount": "1180.00"}],
            },
            format="json",
        )
        assert chk.status_code == status.HTTP_201_CREATED, chk.data
        assert chk.data["customer"]["address_line1"] == "Flat 402, Skyview Residency, Kothrud"
        assert chk.data["customer"]["city"] == "Pune"
        assert chk.data["customer"]["postal_code"] == "411038"
        assert chk.data["customer"]["gstin"] == "27AAACS9999B1Z1"

    def test_05_duplicate_normalized_mobile_prevented_api_and_db_level(self, customer_flow_env):
        org = customer_flow_env["org"]
        client = customer_flow_env["client"]

        Customer.objects.create(
            organization=org,
            first_name="Existing",
            last_name="Buyer",
            phone="9988776655",
            address_line1="Old Address",
        )

        # API rejects formatted duplicate
        dup_api = client.post(
            "/api/v1/customers/",
            {
                "full_name": "Duplicate Attempt",
                "phone": "+91 99887-76655",
                "address_line1": "Attempt Addr",
            },
            format="json",
        )
        assert dup_api.status_code == status.HTTP_400_BAD_REQUEST
        assert "phone" in dup_api.data

        # DB constraint also enforces org-scoped non-empty normalized uniqueness
        with pytest.raises(IntegrityError):
            Customer.objects.create(
                organization=org,
                first_name="Raw",
                last_name="Bypass",
                phone="+919988776655",
            )

    def test_06_two_customers_keep_completely_independent_addresses_across_invoices(self, customer_flow_env):
        org = customer_flow_env["org"]
        client = customer_flow_env["client"]
        store = customer_flow_env["store"]
        product = customer_flow_env["product"]

        cust_a = Customer.objects.create(
            organization=org,
            first_name="Amit",
            last_name="Verma",
            phone="9111222333",
            address_line1="12 MG Road, Camp",
            city="Pune",
            state="Maharashtra",
            postal_code="411001",
            gstin="27AAAAA1111A1Z1",
        )
        cust_b = Customer.objects.create(
            organization=org,
            first_name="Priya",
            last_name="Nair",
            phone="9222333444",
            address_line1="88 Indiranagar 100ft Road",
            city="Bengaluru",
            state="Karnataka",
            postal_code="560038",
            gstin="29BBBBB2222B1Z2",
        )

        res_a = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "is_walk_in": False,
                "customer": {"id": str(cust_a.id), "phone": cust_a.phone},
                "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [{"payment_method": "cash", "amount": "1180.00"}],
            },
            format="json",
        )
        res_b = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "is_walk_in": False,
                "customer": {"id": str(cust_b.id), "phone": cust_b.phone},
                "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [{"payment_method": "cash", "amount": "1180.00"}],
            },
            format="json",
        )
        assert res_a.status_code == status.HTTP_201_CREATED
        assert res_b.status_code == status.HTTP_201_CREATED

        inv_a_res = client.get(f"/api/v1/invoices/{res_a.data['invoice_id']}/")
        inv_b_res = client.get(f"/api/v1/invoices/{res_b.data['invoice_id']}/")
        assert inv_a_res.status_code == 200
        assert inv_b_res.status_code == 200

        assert inv_a_res.data["customer_address"] == "12 MG Road, Camp"
        assert inv_a_res.data["customer_city"] == "Pune"
        assert inv_a_res.data["customer_pincode"] == "411001"

        assert inv_b_res.data["customer_address"] == "88 Indiranagar 100ft Road"
        assert inv_b_res.data["customer_city"] == "Bengaluru"
        assert inv_b_res.data["customer_state"] == "Karnataka"
        assert inv_b_res.data["customer_pincode"] == "560038"

    def test_07_and_08_explicit_walkin_creates_no_customer_record_or_fake_phone(self, customer_flow_env):
        org = customer_flow_env["org"]
        client = customer_flow_env["client"]
        store = customer_flow_env["store"]
        product = customer_flow_env["product"]

        before_count = Customer.objects.filter(organization=org).count()

        res = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "is_walk_in": True,
                "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [{"payment_method": "cash", "amount": "1180.00"}],
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED, res.data
        assert Customer.objects.filter(organization=org).count() == before_count
        assert not Customer.objects.filter(organization=org, phone__startswith="walkin-").exists()

        tx = Transaction.objects.get(id=res.data["transaction_id"])
        assert tx.customer is None
        inv = Invoice.objects.get(transaction=tx)
        assert inv.is_walk_in_snapshot is True
        assert inv.customer_name_snapshot == "Walk-in Customer"
        assert inv.customer_mobile_snapshot == ""
        assert res.data["is_walk_in"] is True
        assert res.data["customer"] is None

    def test_09_credit_sale_validation_walkin_rejected_registered_checked(self, customer_flow_env):
        org = customer_flow_env["org"]
        client = customer_flow_env["client"]
        store = customer_flow_env["store"]
        product = customer_flow_env["product"]

        # Walk-in cannot take credit
        res_w = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "is_walk_in": True,
                "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [{"payment_method": "credit", "amount": "1180.00"}],
            },
            format="json",
        )
        assert res_w.status_code == status.HTTP_400_BAD_REQUEST
        assert "credit" in str(res_w.data).lower()

        # Registered customer with credit limit succeeds within limit
        cust = Customer.objects.create(
            organization=org,
            first_name="Credit",
            last_name="Client",
            phone="9555666777",
            address_line1="Baner Link Road",
            city="Pune",
            credit_limit=Decimal("5000.00"),
            outstanding_credit=Decimal("0.00"),
        )
        res_ok = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "is_walk_in": False,
                "customer": {"id": str(cust.id), "phone": cust.phone},
                "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [{"payment_method": "credit", "amount": "1180.00"}],
            },
            format="json",
        )
        assert res_ok.status_code == status.HTTP_201_CREATED
        cust.refresh_from_db()
        assert cust.outstanding_credit == Decimal("1180.00")

    def test_10_invoice_snapshot_preserved_when_customer_address_edited_later(self, customer_flow_env):
        org = customer_flow_env["org"]
        client = customer_flow_env["client"]
        store = customer_flow_env["store"]
        product = customer_flow_env["product"]

        cust_a = Customer.objects.create(
            organization=org,
            first_name="Meera",
            last_name="Joshi",
            phone="9333444555",
            address_line1="Old Heritage Villa, Koregaon Park",
            city="Pune",
            state="Maharashtra",
            postal_code="411001",
        )

        # Generate Invoice 1 with Old address
        res_1 = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "is_walk_in": False,
                "customer": {"id": str(cust_a.id), "phone": cust_a.phone},
                "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": "1000.00"}],
                "payments": [{"payment_method": "cash", "amount": "1180.00"}],
            },
            format="json",
        )
        assert res_1.status_code == status.HTTP_201_CREATED
        inv_1 = Invoice.objects.get(id=res_1.data["invoice_id"])

        # Later edit Customer A's address via PATCH
        patch_res = client.patch(
            f"/api/v1/customers/{cust_a.id}/",
            {
                "address_line1": "Brand New Penthouse, Viman Nagar",
                "postal_code": "411014",
            },
            format="json",
        )
        assert patch_res.status_code == status.HTTP_200_OK
        assert patch_res.data["address_line1"] == "Brand New Penthouse, Viman Nagar"

        # Existing Invoice 1 MUST still retain its immutable checkout-time snapshot
        inv_1_api = client.get(f"/api/v1/invoices/{inv_1.id}/")
        assert inv_1_api.status_code == 200
        assert inv_1_api.data["customer_address"] == "Old Heritage Villa, Koregaon Park"
        assert inv_1_api.data["customer_pincode"] == "411001"

        # Public digital bill also reads snapshot
        pub = client.get(f"/api/v1/invoices/view/{inv_1.secure_token}/")
        assert pub.status_code == 200
        assert pub.data["customer_address"] == "Old Heritage Villa, Koregaon Park"

        # PDF generation succeeds cleanly with snapshot bytes
        pdf_bytes = generate_invoice_pdf_bytes(inv_1, "a4")
        assert pdf_bytes.startswith(b"%PDF-")

    @patch("apps.whatsapp.service.requests.post")
    def test_11_whatsapp_auto_send_continues_working_for_valid_customer(self, mock_post, customer_flow_env):
        org = customer_flow_env["org"]
        client = customer_flow_env["client"]
        store = customer_flow_env["store"]
        product = customer_flow_env["product"]
        config = customer_flow_env["config"]
        config.auto_send_whatsapp = True
        config.save(update_fields=["auto_send_whatsapp"])

        WhatsAppConfig.objects.create(
            organization=org,
            business_account_id="WABA_CUST_TEST",
            phone_number_id="PNID_CUST_TEST",
            access_token="TOKEN_SECRET",
            is_active=True,
        )
        mock_post.side_effect = [
            _mock_resp(True, 200, {"id": "MEDIA_ID_CUST_1"}),
            _mock_resp(True, 200, {"messages": [{"id": "wamid.CUST_1"}]}),
        ]

        cust = Customer.objects.create(
            organization=org,
            first_name="Karan",
            last_name="Malhotra",
            phone="+91 98201 11223",
            address_line1="Sector 21, Vashi",
            city="Navi Mumbai",
            state="Maharashtra",
            postal_code="400703",
            whatsapp_opt_in=True,
        )

        with patch("apps.whatsapp.service.db_transaction.on_commit", side_effect=lambda fn: fn()):
            res = client.post(
                "/api/v1/pos/checkout/",
                {
                    "store_id": str(store.id),
                    "is_walk_in": False,
                    "customer": {"id": str(cust.id), "phone": cust.phone},
                    "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": "1000.00"}],
                    "payments": [{"payment_method": "upi", "amount": "1180.00"}],
                },
                format="json",
            )
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["whatsapp_delivery"]["status"] == "sent"
        assert mock_post.call_count == 2

    def test_12_inventory_deduction_and_invoice_generation_remain_intact(self, customer_flow_env):
        org = customer_flow_env["org"]
        client = customer_flow_env["client"]
        store = customer_flow_env["store"]
        product = customer_flow_env["product"]

        initial_stock = product.current_stock
        cust = Customer.objects.create(
            organization=org,
            first_name="Tanvi",
            last_name="Gokhale",
            phone="9890011223",
            address_line1="Lane 3, Karve Nagar",
            city="Pune",
            state="Maharashtra",
            postal_code="411052",
        )

        res = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "is_walk_in": False,
                "customer": {"id": str(cust.id), "phone": cust.phone},
                "items": [{"product_id": str(product.id), "quantity": 3, "unit_price": "1000.00"}],
                "payments": [{"payment_method": "card", "amount": "3540.00"}],
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        product.refresh_from_db()
        assert product.current_stock == initial_stock - Decimal("3.00")
        assert InventoryMovement.objects.filter(
            organization=org,
            product=product,
            movement_type="SALE",
            reference_id=str(res.data["transaction_id"]),
        ).exists()
        assert Invoice.objects.filter(id=res.data["invoice_id"]).exists()
