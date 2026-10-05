import uuid
from decimal import Decimal
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product, InventoryMovement
from apps.customers.models import Customer
from apps.billing.models import BusinessConfig, HeldCart, CashRegister
from apps.billing.services.tax_engine import TaxEngine
from apps.billing.services.cart_engine import CartEngine


@pytest.fixture
def pos_setup():
    org = Organization.objects.create(name=f"Universal Hardware Org {uuid.uuid4().hex[:6]}")
    user = User.objects.create_user(
        email=f"cashier-{uuid.uuid4().hex[:6]}@example.com",
        password="pospassword123",
        organization=org,
        role="org_admin",
        first_name="Rajesh",
        last_name="Kumar",
    )
    store = Store.objects.create(organization=org, name="Main Hardware Store", code=f"STR-{uuid.uuid4().hex[:4].upper()}")

    config = BusinessConfig.objects.create(
        organization=org,
        business_type="hardware",
        gst_enabled=True,
        tax_mode="exclusive",
        default_tax_rate=Decimal("18.00"),
        allow_credit_sales=True,
        default_credit_limit=Decimal("50000.00"),
    )

    client = APIClient()
    client.force_authenticate(user=user)

    return {
        "org": org,
        "user": user,
        "store": store,
        "config": config,
        "client": client,
    }


@pytest.mark.django_db
class TestUniversalPOS:

    def test_business_config_and_types(self, pos_setup):
        client = pos_setup["client"]

        # 1. Fetch business types
        resp = client.get("/api/v1/pos/business-types/")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert len(data) >= 10
        type_keys = [t["key"].lower() for t in data]
        assert "hardware" in type_keys
        assert "jewellery" in type_keys
        assert "auto_spares" in type_keys

        # 2. Update config to Jewellery
        resp = client.patch("/api/v1/pos/config/", {"business_type": "jewellery"})
        assert resp.status_code == status.HTTP_200_OK, resp.json()
        updated = resp.json()
        assert updated["business_type"].lower() == "jewellery"
        assert updated["schema"]["label"] == "Jewellery & Gems"

    def test_tax_engine_precision(self):
        # Intra-state exclusive tax: 18% on ₹1000 => ₹90 CGST + ₹90 SGST, total ₹1180
        res = TaxEngine.calculate_item_tax(
            unit_price=Decimal("1000.00"),
            quantity=Decimal("1.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("18.00"),
            is_tax_inclusive=False,
            is_interstate=False,
            gst_enabled=True,
        )
        assert res["taxable_amount"] == Decimal("1000.00")
        assert res["cgst_amount"] == Decimal("90.00")
        assert res["sgst_amount"] == Decimal("90.00")
        assert res["igst_amount"] == Decimal("0.00")
        assert res["line_total"] == Decimal("1180.00")

        # Inter-state exclusive tax: 18% on ₹1000 => ₹180 IGST
        res_inter = TaxEngine.calculate_item_tax(
            unit_price=Decimal("1000.00"),
            quantity=Decimal("1.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("18.00"),
            is_tax_inclusive=False,
            is_interstate=True,
            gst_enabled=True,
        )
        assert res_inter["igst_amount"] == Decimal("180.00")
        assert res_inter["cgst_amount"] == Decimal("0.00")

        # Inclusive tax: ₹1180 total with 18% tax => taxable ₹1000, total_tax ₹180
        res_inc = TaxEngine.calculate_item_tax(
            unit_price=Decimal("1180.00"),
            quantity=Decimal("1.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("18.00"),
            is_tax_inclusive=True,
            is_interstate=False,
            gst_enabled=True,
        )
        assert res_inc["taxable_amount"] == Decimal("1000.00")
        assert res_inc["total_tax"] == Decimal("180.00")
        assert res_inc["line_total"] == Decimal("1180.00")

    def test_cart_engine_discounts_and_roundoff(self):
        items = [
            {
                "unit_price": Decimal("499.50"),
                "quantity": Decimal("2.00"),
                "discount": Decimal("50.00"),
                "tax_rate": Decimal("18.00"),
            }
        ]
        res = CartEngine.calculate_cart(
            items=items,
            overall_discount_value=Decimal("49.00"),
            gst_enabled=True,
            is_tax_inclusive=False,
        )
        # Line subtotal = 999.00 - 50 = 949.00
        # Total tax 18% on 949 = 170.82
        # After overall disc 49: 949 - 49 + 170.82 = 1070.82
        # Rounded = 1071.00
        assert res["grand_total"] == Decimal("1071.00")
        assert res["round_off"] == Decimal("0.18")

    def test_product_quick_create_and_search(self, pos_setup):
        client = pos_setup["client"]

        resp = client.post("/api/v1/pos/products/quick-create/", {
            "name": "Bosch Hammer Drill 500W",
            "sku": "BOSCH-DRL-500",
            "barcode": "8901234567890",
            "selling_price": "4500.00",
            "mrp": "5200.00",
            "tax_rate": "18.00",
            "hsn_code": "8467",
            "unit": "PCS",
            "opening_stock": "10.00",
            "product_attributes": {
                "brand": "Bosch",
                "power": "500W",
                "warranty_months": 12,
            },
        }, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        p_data = resp.json()
        assert p_data["sku"] == "BOSCH-DRL-500"
        assert Decimal(p_data["current_stock"]) == Decimal("10.00")

        # Verify initial opening stock movement was recorded
        movements = InventoryMovement.objects.filter(product_id=p_data["id"])
        assert movements.count() == 1
        assert movements.first().movement_type == "OPENING_STOCK"

        # Search by SKU
        search_resp = client.get("/api/v1/pos/products/?q=BOSCH")
        assert search_resp.status_code == status.HTTP_200_OK
        results = search_resp.json()["results"]
        assert any(p["sku"] == "BOSCH-DRL-500" for p in results)

    def test_complete_pos_sale_and_inventory_deduction(self, pos_setup):
        client = pos_setup["client"]
        org = pos_setup["org"]

        # 1. Create product with 10 stock
        product = Product.objects.create(
            organization=org,
            name="Asian Paints Apex 20L",
            sku="AP-APX-20L",
            barcode="8901112223334",
            selling_price=Decimal("3500.00"),
            mrp=Decimal("3800.00"),
            tax_rate=Decimal("18.00"),
            hsn_code="3209",
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )

        customer = Customer.objects.create(
            organization=org,
            first_name="Amit",
            last_name="Sharma",
            phone="9876543210",
        )

        # 2. Checkout 2 units with UPI
        cart_payload = {
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 2,
                    "unit_price": "3500.00",
                    "discount": "0.00",
                    "tax_rate": "18.00",
                    "hsn_code": "3209",
                }
            ],
            "customer": {
                "phone": "9876543210",
            },
            "payments": [
                {
                    "payment_method": "upi",
                    "amount": "8260.00",  # 2 * 3500 = 7000 + 18% tax (1260) = 8260
                    "reference": "UPI987654321",
                }
            ],
        }

        resp = client.post("/api/v1/pos/checkout/", cart_payload, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()

        # Verify transaction totals
        assert Decimal(data["total"]) == Decimal("8260.00")
        assert data["payment_status"] == "paid"
        assert data["invoice"]["invoice_number"] is not None

        # Verify inventory was decreased from 10 to 8
        product.refresh_from_db()
        assert product.current_stock == Decimal("8.00")

        # Verify InventoryMovement SALE recorded
        sale_mov = InventoryMovement.objects.filter(product=product, movement_type="SALE").first()
        assert sale_mov is not None
        assert sale_mov.quantity == Decimal("-2.00")
        assert sale_mov.new_stock == Decimal("8.00")

        # Verify customer stats updated
        customer.refresh_from_db()
        assert customer.total_purchases == 1
        assert customer.total_spend == Decimal("8260.00")

    def test_split_payment_checkout(self, pos_setup):
        client = pos_setup["client"]
        org = pos_setup["org"]

        product = Product.objects.create(
            organization=org,
            name="Wire Bundle 90m",
            sku="WIRE-90M",
            selling_price=Decimal("5000.00"),
            tax_rate=Decimal("0.00"),
            current_stock=Decimal("10.00"),
        )

        resp = client.post("/api/v1/pos/checkout/", {
            "items": [{"product_id": str(product.id), "quantity": 1, "unit_price": "5000.00", "tax_rate": "0.00"}],
            "is_walk_in": True,
            "payments": [
                {"payment_method": "cash", "amount": "2000.00"},
                {"payment_method": "upi", "amount": "3000.00", "reference": "UPI-SPLIT-1"},
            ],
        }, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert len(data["payments"]) == 2
        methods = [p["payment_method"] for p in data["payments"]]
        assert "cash" in methods
        assert "upi" in methods

    def test_credit_sale_and_settlement(self, pos_setup):
        client = pos_setup["client"]
        org = pos_setup["org"]

        customer = Customer.objects.create(
            organization=org,
            first_name="Ramesh",
            last_name="Contractor",
            phone="9123456789",
            credit_limit=Decimal("20000.00"),
        )

        product = Product.objects.create(
            organization=org,
            name="Cement Bag 50kg",
            sku="CEMENT-50KG",
            selling_price=Decimal("400.00"),
            tax_rate=Decimal("0.00"),
            current_stock=Decimal("50.00"),
        )

        # 1. Purchase 10 bags on credit (₹4000)
        resp = client.post("/api/v1/pos/checkout/", {
            "items": [{"product_id": str(product.id), "quantity": 10, "unit_price": "400.00", "tax_rate": "0.00"}],
            "customer": {"phone": "9123456789"},
            "payments": [{"payment_method": "credit", "amount": "4000.00"}],
        }, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        tx_data = resp.json()
        assert tx_data["payment_status"] == "credit"
        assert Decimal(tx_data["outstanding_amount"]) == Decimal("4000.00")

        customer.refresh_from_db()
        assert customer.outstanding_credit == Decimal("4000.00")

        # 2. Check Customer Ledger endpoint
        ledger_resp = client.get(f"/api/v1/pos/credit/{customer.id}/ledger/")
        assert ledger_resp.status_code == status.HTTP_200_OK
        ledger = ledger_resp.json()
        assert len(ledger["unpaid_invoices"]) == 1

        # 3. Settle partial credit (₹2500)
        pay_resp = client.post("/api/v1/pos/credit/record-payment/", {
            "customer_id": str(customer.id),
            "amount": "2500.00",
            "payment_method": "upi",
            "reference": "UPI-SETTLE-1",
        }, format="json")
        assert pay_resp.status_code == status.HTTP_201_CREATED
        assert Decimal(pay_resp.json()["remaining_outstanding"]) == Decimal("1500.00")

        customer.refresh_from_db()
        assert customer.outstanding_credit == Decimal("1500.00")

    def test_sales_return_and_restocking(self, pos_setup):
        client = pos_setup["client"]
        org = pos_setup["org"]

        product = Product.objects.create(
            organization=org,
            name="LED Tube Light 20W",
            sku="LED-20W",
            selling_price=Decimal("300.00"),
            tax_rate=Decimal("0.00"),
            current_stock=Decimal("20.00"),
            track_inventory=True,
        )

        # Buy 5 lights -> stock becomes 15
        buy_resp = client.post("/api/v1/pos/checkout/", {
            "items": [{"product_id": str(product.id), "quantity": 5, "unit_price": "300.00", "tax_rate": "0.00"}],
            "is_walk_in": True,
            "payments": [{"payment_method": "cash", "amount": "1500.00"}],
        }, format="json")
        tx_data = buy_resp.json()
        tx_item_id = tx_data["items"][0]["id"]

        product.refresh_from_db()
        assert product.current_stock == Decimal("15.00")

        # Return 2 units
        ret_resp = client.post("/api/v1/pos/returns/", {
            "transaction_id": tx_data["id"],
            "refund_method": "cash",
            "items": [
                {
                    "transaction_item_id": tx_item_id,
                    "quantity": 2,
                    "reason": "Defective item exchange",
                }
            ],
            "restock_inventory": True,
        }, format="json")
        assert ret_resp.status_code == status.HTTP_201_CREATED
        ret_data = ret_resp.json()
        assert Decimal(ret_data["total_refund_amount"]) == Decimal("600.00")

        # Stock should be restocked from 15 to 17
        product.refresh_from_db()
        assert product.current_stock == Decimal("17.00")

        # Attempt to return 4 more (which exceeds 5 - 2 = 3) -> should be rejected!
        fail_resp = client.post("/api/v1/pos/returns/", {
            "transaction_id": tx_data["id"],
            "items": [
                {
                    "transaction_item_id": tx_item_id,
                    "quantity": 4,
                }
            ],
        }, format="json")
        assert fail_resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_held_cart_lifecycle(self, pos_setup):
        client = pos_setup["client"]

        # Hold cart
        hold_resp = client.post("/api/v1/pos/held/", {
            "hold_reference": "TABLE-4",
            "customer_name": "Sunil",
            "subtotal": "1200.00",
            "item_count": 3,
            "cart_data": {"items": [{"name": "Test Item", "qty": 3}]},
        }, format="json")
        assert hold_resp.status_code == status.HTTP_201_CREATED
        held_id = hold_resp.json()["id"]

        # List held
        list_resp = client.get("/api/v1/pos/held/")
        assert list_resp.status_code == status.HTTP_200_OK
        assert any(h["id"] == held_id for h in list_resp.json())

        # Delete / Resume
        del_resp = client.delete(f"/api/v1/pos/held/{held_id}/")
        assert del_resp.status_code == status.HTTP_200_OK

    def test_cash_register_lifecycle(self, pos_setup):
        client = pos_setup["client"]

        # 1. Open register with ₹2000
        open_resp = client.post("/api/v1/pos/register/open/", {
            "opening_balance": "2000.00",
            "notes": "Morning opening",
        }, format="json")
        assert open_resp.status_code == status.HTTP_201_CREATED
        assert open_resp.json()["status"] == "open"

        # Check status
        st_resp = client.get("/api/v1/pos/register/status/")
        assert st_resp.status_code == status.HTTP_200_OK
        assert st_resp.json()["is_open"] is True

        # 2. Add cash movement (e.g. added ₹500 change)
        mov_resp = client.post("/api/v1/pos/register/movement/", {
            "amount": "500.00",
            "type": "add",
            "notes": "Added float change",
        }, format="json")
        assert mov_resp.status_code == status.HTTP_200_OK
        assert Decimal(mov_resp.json()["cash_added"]) == Decimal("500.00")

        # 3. Close register: Expected 2000 + 500 = 2500. Actual = 2480 (₹20 short)
        close_resp = client.post("/api/v1/pos/register/close/", {
            "actual_cash": "2480.00",
            "notes": "Evening day close",
        }, format="json")
        assert close_resp.status_code == status.HTTP_200_OK
        close_data = close_resp.json()
        assert close_data["status"] == "closed"
        assert Decimal(close_data["expected_cash"]) == Decimal("2500.00")
        assert Decimal(close_data["actual_cash"]) == Decimal("2480.00")
        assert Decimal(close_data["difference"]) == Decimal("-20.00")

    def test_pos_reports(self, pos_setup):
        client = pos_setup["client"]

        sales_rep = client.get("/api/v1/pos/reports/sales/")
        assert sales_rep.status_code == status.HTTP_200_OK

        pay_rep = client.get("/api/v1/pos/reports/payments/")
        assert pay_rep.status_code == status.HTTP_200_OK

        tax_rep = client.get("/api/v1/pos/reports/tax/")
        assert tax_rep.status_code == status.HTTP_200_OK

        close_rep = client.get("/api/v1/pos/reports/daily-closing/")
        assert close_rep.status_code == status.HTTP_200_OK
