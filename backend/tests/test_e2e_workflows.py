import uuid
from decimal import Decimal
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product, Supplier, PurchaseOrder, InventoryMovement
from apps.customers.models import Customer
from apps.invoices.models import Invoice, Quotation
from apps.transactions.models import Transaction, TransactionPayment, SalesReturn
from apps.billing.models import BusinessConfig
from apps.billing.services.reconciliation_service import ReconciliationService


@pytest.fixture
def business_setup():
    org_a = Organization.objects.create(name=f"Enterprise Retail A {uuid.uuid4().hex[:6]}")
    user_a = User.objects.create_user(
        email=f"admin_a_{uuid.uuid4().hex[:6]}@example.com",
        password="securepassword123",
        organization=org_a,
        role="org_admin",
    )
    store_a = Store.objects.create(organization=org_a, name="Store A", code=f"STA-{uuid.uuid4().hex[:4].upper()}")
    config_a = BusinessConfig.objects.create(
        organization=org_a,
        business_type="retail",
        invoice_prefix="INV",
        gst_enabled=True,
        allow_negative_stock=False,
    )

    org_b = Organization.objects.create(name=f"Competitor Store B {uuid.uuid4().hex[:6]}")
    user_b = User.objects.create_user(
        email=f"admin_b_{uuid.uuid4().hex[:6]}@example.com",
        password="securepassword123",
        organization=org_b,
        role="org_admin",
    )
    store_b = Store.objects.create(organization=org_b, name="Store B", code=f"STB-{uuid.uuid4().hex[:4].upper()}")

    client_a = APIClient()
    client_a.force_authenticate(user=user_a)

    client_b = APIClient()
    client_b.force_authenticate(user=user_b)

    return {
        "org_a": org_a,
        "user_a": user_a,
        "store_a": store_a,
        "config_a": config_a,
        "client_a": client_a,
        "org_b": org_b,
        "user_b": user_b,
        "store_b": store_b,
        "client_b": client_b,
    }


@pytest.mark.django_db
class TestEndToEndBusinessWorkflows:
    """
    Complete end-to-end tests validating the core financial invariants:
    Sale -> Invoice -> Items -> Payment -> Inventory Movement -> Customer Stats -> Reconciliation
    """

    def test_workflow_1_pos_sale_lifecycle(self, business_setup):
        client = business_setup["client_a"]
        org = business_setup["org_a"]
        store = business_setup["store_a"]

        # 1. Create product with initial stock
        product = Product.objects.create(
            organization=org,
            name="Wireless Earbuds",
            selling_price=Decimal("2000.00"),
            cost_price=Decimal("1200.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("50.00"),
            track_inventory=True,
        )

        # 2. Create customer
        customer = Customer.objects.create(
            organization=org,
            first_name="Rohan",
            last_name="Verma",
            phone="9811223344",
        )

        # 3. Checkout via POS
        checkout_payload = {
            "store_id": str(store.id),
            "customer": {"phone": customer.phone},
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 2,
                    "unit_price": 2000.00,
                    "discount": 100.00,
                }
            ],
            "payments": [
                {"payment_method": "upi", "amount": 4602.00, "reference": "UPI-REF-001"}
            ],
        }

        resp = client.post("/api/v1/pos/checkout/", checkout_payload, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()

        # Invariants verification
        tx_id = data["id"]
        tx = Transaction.objects.get(id=tx_id)
        assert tx.invoice_number.startswith("INV-")
        assert tx.total == Decimal("4602.00")
        assert tx.payment_status == "paid"

        # Verify Invoice exists
        assert hasattr(tx, "invoice")
        assert tx.invoice.invoice_number == tx.invoice_number
        assert tx.invoice.secure_token != ""

        # Verify Payment record exists
        payments = TransactionPayment.objects.filter(transaction=tx)
        assert payments.count() == 1
        assert payments.first().amount == Decimal("4602.00")
        assert payments.first().payment_method == "upi"

        # Verify inventory was deducted
        product.refresh_from_db()
        assert product.current_stock == Decimal("48.00")

        # Verify InventoryMovement ledger
        mov = InventoryMovement.objects.filter(reference_id=str(tx.id), movement_type="SALE").first()
        assert mov is not None
        assert mov.quantity == Decimal("-2.00")
        assert mov.previous_stock == Decimal("50.00")
        assert mov.new_stock == Decimal("48.00")

        # Verify customer stats updated
        customer.refresh_from_db()
        assert customer.total_purchases == 1
        assert customer.total_spend == Decimal("4602.00")

        # Reconcile
        recon = ReconciliationService.verify_invoice_integrity(tx.invoice_number, organization=org)
        assert recon["valid"] is True
        assert len(recon["errors"]) == 0

    def test_workflow_2_supplier_purchase_ledger(self, business_setup):
        client = business_setup["client_a"]
        org = business_setup["org_a"]
        store = business_setup["store_a"]

        # 1. Create Supplier
        sup_resp = client.post(
            "/api/v1/suppliers/",
            {
                "name": "Apex Electronics Distributors",
                "phone": "9887766554",
                "gstin": "27AABCA1234F1Z5",
            },
            format="json",
        )
        assert sup_resp.status_code == status.HTTP_201_CREATED
        sup_id = sup_resp.json()["id"]

        # 2. Product to purchase
        product = Product.objects.create(
            organization=org,
            name="Smart Watch Band",
            selling_price=Decimal("800.00"),
            cost_price=Decimal("400.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )

        # 3. Create Supplier Purchase Order
        po_payload = {
            "supplier_id": sup_id,
            "supplier_invoice_number": "SUP-INV-8899",
            "store_id": str(store.id),
            "purchase_date": "2026-10-08",
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 25,
                    "purchase_price": 400.00,
                    "tax_rate": 18.00,
                }
            ],
            "notes": "Bulk restocking order",
        }

        resp = client.post("/api/v1/pos/inventory/purchases/", po_payload, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        po_data = resp.json()
        po_id = po_data["id"]

        # Stock should have increased from 10 to 35
        product.refresh_from_db()
        assert product.current_stock == Decimal("35.00")

        # Verify InventoryMovement of type PURCHASE
        mov = InventoryMovement.objects.filter(reference_id=str(po_id), movement_type="PURCHASE").first()
        assert mov is not None
        assert mov.quantity == Decimal("25.00")
        assert mov.previous_stock == Decimal("10.00")
        assert mov.new_stock == Decimal("35.00")

        # Verify Supplier Purchases endpoint
        sup_purchases_resp = client.get(f"/api/v1/suppliers/{sup_id}/purchases/")
        assert sup_purchases_resp.status_code == status.HTTP_200_OK
        p_results = sup_purchases_resp.json().get("results", sup_purchases_resp.json())
        assert len(p_results) >= 1
        assert p_results[0]["supplier_invoice_number"] == "SUP-INV-8899"

        # Reconciliation check
        recon = ReconciliationService.verify_purchase_integrity(po_id, organization=org)
        assert recon["valid"] is True

    def test_workflow_3_customer_credit_sale_and_settlement(self, business_setup):
        client = business_setup["client_a"]
        org = business_setup["org_a"]
        store = business_setup["store_a"]

        customer = Customer.objects.create(
            organization=org,
            first_name="Vikas",
            last_name="Khanna",
            phone="9771122334",
            credit_limit=Decimal("50000.00"),
            outstanding_credit=Decimal("0.00"),
        )

        product = Product.objects.create(
            organization=org,
            name="Power Drill",
            selling_price=Decimal("5000.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )

        # 1. POS Sale on Credit (₹5900 total with 18% GST)
        resp = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "customer": {"phone": customer.phone},
                "items": [{"product_id": str(product.id), "quantity": 1}],
                "payments": [{"payment_method": "credit", "amount": 5900.00}],
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        tx_id = resp.json()["id"]

        customer.refresh_from_db()
        assert customer.outstanding_credit == Decimal("5900.00")

        tx = Transaction.objects.get(id=tx_id)
        assert tx.payment_status == "credit"
        assert tx.outstanding_amount == Decimal("5900.00")

        # 2. Customer partial credit payment (pays ₹2000 cash)
        pay_resp = client.post(
            "/api/v1/pos/credit/payment/",
            {
                "customer_id": str(customer.id),
                "amount": 2000.00,
                "payment_method": "cash",
                "notes": "Partial settlement",
            },
            format="json",
        )
        assert pay_resp.status_code == status.HTTP_201_CREATED

        customer.refresh_from_db()
        assert customer.outstanding_credit == Decimal("3900.00")

        tx.refresh_from_db()
        assert tx.payment_status == "partial"
        assert tx.amount_paid == Decimal("2000.00")
        assert tx.outstanding_amount == Decimal("3900.00")

        # Reconcile customer balance
        recon = ReconciliationService.verify_customer_balance(str(customer.id), organization=org)
        assert recon["valid"] is True
        assert recon["calculated_outstanding"] == "3900.00"

    def test_workflow_4_sales_return_and_restocking(self, business_setup):
        client = business_setup["client_a"]
        org = business_setup["org_a"]
        store = business_setup["store_a"]

        product = Product.objects.create(
            organization=org,
            name="Ceramic Tiles",
            selling_price=Decimal("100.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("100.00"),
            track_inventory=True,
        )

        customer = Customer.objects.create(
            organization=org,
            first_name="Pooja",
            phone="9551122334",
        )

        # 1. Sale of 10 items (₹1180 total)
        sale_resp = client.post(
            "/api/v1/pos/checkout/",
            {
                "store_id": str(store.id),
                "customer": {"phone": customer.phone},
                "items": [{"product_id": str(product.id), "quantity": 10}],
                "payments": [{"payment_method": "cash", "amount": 1180.00}],
            },
            format="json",
        )
        assert sale_resp.status_code == status.HTTP_201_CREATED
        tx_id = sale_resp.json()["id"]

        product.refresh_from_db()
        assert product.current_stock == Decimal("90.00")

        tx = Transaction.objects.get(id=tx_id)
        tx_item = tx.items.first()

        # 2. Return 4 items
        ret_resp = client.post(
            "/api/v1/pos/returns/",
            {
                "transaction_id": str(tx.id),
                "items": [
                    {"transaction_item_id": str(tx_item.id), "quantity": 4, "reason": "Excess tiles"}
                ],
                "refund_method": "cash",
                "restock_inventory": True,
            },
            format="json",
        )
        assert ret_resp.status_code == status.HTTP_201_CREATED
        ret_data = ret_resp.json()
        assert Decimal(ret_data["total_refund_amount"]) == Decimal("472.00")

        # Inventory restocked by 4
        product.refresh_from_db()
        assert product.current_stock == Decimal("94.00")

        # Verify SalesReturn model
        sales_ret = SalesReturn.objects.get(id=ret_data["id"])
        assert sales_ret.total_refund_amount == Decimal("472.00")

        # 3. Attempting to return more than remaining (max 6 remaining, try returning 7)
        invalid_ret = client.post(
            "/api/v1/pos/returns/",
            {
                "transaction_id": str(tx.id),
                "items": [
                    {"transaction_item_id": str(tx_item.id), "quantity": 7, "reason": "Too many"}
                ],
            },
            format="json",
        )
        assert invalid_ret.status_code == status.HTTP_400_BAD_REQUEST

    def test_workflow_5_quotation_conversion_to_invoice(self, business_setup):
        client = business_setup["client_a"]
        org = business_setup["org_a"]
        store = business_setup["store_a"]

        product = Product.objects.create(
            organization=org,
            name="Executive Desk",
            selling_price=Decimal("15000.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("5.00"),
            track_inventory=True,
        )

        customer = Customer.objects.create(
            organization=org,
            first_name="Ananya",
            phone="9441122334",
        )

        # 1. Create Quotation
        quote_resp = client.post(
            "/api/v1/quotations/",
            {
                "customer_id": str(customer.id),
                "items": [
                    {
                        "product_id": str(product.id),
                        "quantity": 1,
                        "unit_price": 15000.00,
                        "discount": 1000.00,
                        "tax_rate": 18.00,
                    }
                ],
                "notes": "Discounted corporate offer",
            },
            format="json",
        )
        assert quote_resp.status_code == status.HTTP_201_CREATED
        quote_id = quote_resp.json()["id"]

        # 2. Convert Quotation to Invoice
        conv_resp = client.post(
            f"/api/v1/quotations/{quote_id}/convert/",
            {"payment_method": "upi"},
            format="json",
        )
        assert conv_resp.status_code == status.HTTP_201_CREATED
        conv_data = conv_resp.json()

        invoice_id = conv_data["invoice_id"]
        inv = Invoice.objects.get(id=invoice_id)
        assert inv.invoice_number.startswith("INV-")
        assert inv.transaction is not None

        # Stock deducted
        product.refresh_from_db()
        assert product.current_stock == Decimal("4.00")

        # Payment record created
        payment = TransactionPayment.objects.filter(transaction=inv.transaction).first()
        assert payment is not None
        assert payment.amount == inv.transaction.total

        # Customer stats updated
        customer.refresh_from_db()
        assert customer.total_purchases == 1

        # Quotation is marked converted
        quote = Quotation.objects.get(id=quote_id)
        assert quote.status == "converted"
        assert quote.converted_invoice == inv

    def test_workflow_6_checkout_idempotency_guarantee(self, business_setup):
        client = business_setup["client_a"]
        org = business_setup["org_a"]
        store = business_setup["store_a"]

        product = Product.objects.create(
            organization=org,
            name="Laptop Charger",
            selling_price=Decimal("1500.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("20.00"),
            track_inventory=True,
        )

        customer = Customer.objects.create(
            organization=org,
            first_name="Idempotency",
            phone="9331122334",
        )

        idempotency_key = f"IDEM-REQ-{uuid.uuid4().hex}"
        checkout_payload = {
            "store_id": str(store.id),
            "customer": {"phone": customer.phone},
            "items": [{"product_id": str(product.id), "quantity": 1}],
            "payments": [{"payment_method": "cash", "amount": 1770.00}],
            "idempotency_key": idempotency_key,
        }

        # Request A
        resp1 = client.post("/api/v1/pos/checkout/", checkout_payload, format="json")
        assert resp1.status_code == status.HTTP_201_CREATED
        tx1_id = resp1.json()["id"]

        product.refresh_from_db()
        assert product.current_stock == Decimal("19.00")

        # Request A again (Simulated double-click / network retry)
        resp2 = client.post("/api/v1/pos/checkout/", checkout_payload, format="json")
        assert resp2.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]
        tx2_id = resp2.json()["id"]

        # Exactly 1 transaction created
        assert tx1_id == tx2_id
        assert Transaction.objects.filter(external_transaction_id=idempotency_key).count() == 1

        # Exactly 1 stock deduction
        product.refresh_from_db()
        assert product.current_stock == Decimal("19.00")

        # Exactly 1 movement
        assert InventoryMovement.objects.filter(reference_id=str(tx1_id)).count() == 1

    def test_workflow_7_strict_cross_tenant_isolation(self, business_setup):
        client_a = business_setup["client_a"]
        client_b = business_setup["client_b"]
        org_a = business_setup["org_a"]
        org_b = business_setup["org_b"]

        # Org A resources
        cust_a = Customer.objects.create(organization=org_a, first_name="Tenant A Customer", phone="9111111111")
        prod_a = Product.objects.create(organization=org_a, name="Secret Product A", selling_price=Decimal("100.00"))
        sup_a = Supplier.objects.create(organization=org_a, name="Private Supplier A", phone="9222222222")

        tx_a = Transaction.objects.create(
            organization=org_a,
            store=business_setup["store_a"],
            invoice_number=f"INV-A-{uuid.uuid4().hex[:6]}",
            transaction_date="2026-10-08T10:00:00Z",
            total=Decimal("100.00"),
        )
        inv_a = Invoice.objects.create(
            organization=org_a,
            transaction=tx_a,
            invoice_number=tx_a.invoice_number,
            secure_token=uuid.uuid4().hex,
        )
        quote_a = Quotation.objects.create(
            organization=org_a,
            quotation_number="QT-A-001",
            total=Decimal("500.00"),
        )

        # Tenant B attempts to read Tenant A's invoice
        resp = client_b.get(f"/api/v1/invoices/{inv_a.id}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

        # Tenant B attempts to read Tenant A's quotation
        resp = client_b.get(f"/api/v1/quotations/{quote_a.id}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

        # Tenant B attempts to read Tenant A's supplier
        resp = client_b.get(f"/api/v1/suppliers/{sup_a.id}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

        # Tenant B attempts to modify Tenant A's product
        resp = client_b.patch(f"/api/v1/products/{prod_a.id}/", {"selling_price": "1.00"}, format="json")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

        # Tenant B cannot see Tenant A's items in list querysets
        list_resp = client_b.get("/api/v1/invoices/")
        inv_ids = [i["id"] for i in list_resp.json().get("results", [])]
        assert str(inv_a.id) not in inv_ids

    def test_workflow_8_public_invoice_security(self, business_setup):
        org = business_setup["org_a"]
        store = business_setup["store_a"]
        cust = Customer.objects.create(
            organization=org,
            first_name="Security",
            last_name="Test",
            phone="9000000000",
        )

        tx = Transaction.objects.create(
            organization=org,
            store=store,
            customer=cust,
            invoice_number=f"INV-SEC-{uuid.uuid4().hex[:6]}",
            transaction_date="2026-10-08T10:00:00Z",
            total=Decimal("999.00"),
        )
        token = f"token_{uuid.uuid4().hex}"
        inv = Invoice.objects.create(
            organization=org,
            transaction=tx,
            invoice_number=tx.invoice_number,
            secure_token=token,
        )

        unauth_client = APIClient()
        resp = unauth_client.get(f"/api/v1/invoices/view/{token}/")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()

        # Verify portal_token is NOT leaked over public invoice
        assert data.get("portal_token") is None
        assert cust.portal_token not in str(data)
