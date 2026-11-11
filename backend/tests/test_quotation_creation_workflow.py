import pytest
from decimal import Decimal
from rest_framework.test import APIClient

from apps.analytics.views import compute_analytics
from apps.billing.models import BusinessConfig
from apps.customers.models import Customer
from apps.invoices.models import Invoice, Quotation, QuotationItem
from apps.organizations.models import Organization
from apps.products.models import InventoryMovement, Product
from apps.stores.models import Store
from apps.transactions.models import Transaction, TransactionPayment
from apps.users.models import User


@pytest.fixture
def quote_workflow_env(db):
    org = Organization.objects.create(
        name="Vertex Electronics",
        currency="INR",
        gst_number="27AABCU9603R1ZM",
    )
    config = BusinessConfig.objects.create(
        organization=org,
        gst_enabled=True,
        default_tax_mode="exclusive",
        default_tax_rate=Decimal("18.00"),
        terms_and_conditions="Valid for 15 days. Prices subject to confirmation.",
    )
    store = Store.objects.create(organization=org, name="Flagship Store", code="FLG1")

    admin_user = User.objects.create_user(
        email="owner@vertex.local",
        password="password123",
        first_name="Owner",
        last_name="Admin",
        role="org_admin",
        organization=org,
    )
    cashier_user = User.objects.create_user(
        email="cashier@vertex.local",
        password="password123",
        first_name="Kiran",
        last_name="Cashier",
        role="cashier",
        organization=org,
    )
    inventory_user = User.objects.create_user(
        email="warehouse@vertex.local",
        password="password123",
        first_name="Vikram",
        last_name="Warehouse",
        role="inventory",
        organization=org,
    )

    other_org = Organization.objects.create(name="Other Biz", currency="INR")
    other_admin = User.objects.create_user(
        email="admin@other.local",
        password="password123",
        first_name="Other",
        last_name="Admin",
        role="org_admin",
        organization=other_org,
    )

    customer = Customer.objects.create(
        organization=org,
        first_name="Ananya",
        last_name="Desai",
        phone="9876543210",
        email="ananya@example.com",
        is_walk_in=False,
    )
    product_a = Product.objects.create(
        organization=org,
        external_id="SKU-A1",
        sku="SKU-A1",
        name="USB-C Dock 8-in-1",
        unit_price=Decimal("2500.00"),
        cost_price=Decimal("1700.00"),
        current_stock=Decimal("15.00"),
        track_inventory=True,
        tax_rate=Decimal("18.00"),
        hsn_code="8471",
        unit="pcs",
    )
    product_b = Product.objects.create(
        organization=org,
        external_id="SKU-B2",
        sku="SKU-B2",
        name="Mechanical Keyboard",
        unit_price=Decimal("4000.00"),
        cost_price=Decimal("2900.00"),
        current_stock=Decimal("8.00"),
        track_inventory=True,
        tax_rate=Decimal("18.00"),
        hsn_code="8471",
        unit="pcs",
    )

    def _client_for(user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    return {
        "org": org,
        "config": config,
        "store": store,
        "customer": customer,
        "product_a": product_a,
        "product_b": product_b,
        "admin_client": _client_for(admin_user),
        "cashier_client": _client_for(cashier_user),
        "inventory_client": _client_for(inventory_user),
        "other_client": _client_for(other_admin),
    }


@pytest.mark.django_db
class TestQuotationCreationWorkflow:
    def test_create_multi_item_quotation_with_override_discount_tax_notes_terms_no_side_effects(
        self, quote_workflow_env
    ):
        env = quote_workflow_env
        org = env["org"]
        product_a = env["product_a"]
        product_b = env["product_b"]

        analytics_before = compute_analytics(org)
        stock_a_before = product_a.current_stock
        stock_b_before = product_b.current_stock
        movements_before = InventoryMovement.objects.filter(organization=org).count()
        tx_before = Transaction.objects.filter(organization=org).count()
        payments_before = TransactionPayment.objects.filter(
            transaction__organization=org
        ).count()
        invoices_before = Invoice.objects.filter(organization=org).count()

        # Qty 2 x custom price 2200 - 400 discount = 4000 net + 18% GST (720) = 4720
        # Qty 1 x catalog fallback (no unit_price -> product_b.unit_price=4000) - 0 + 18% GST (720) = 4720
        # Custom item qty 1 x 500 + 0% GST = 500
        payload = {
            "customer_id": str(env["customer"].id),
            "valid_until": "",
            "status": "draft",
            "notes": "Prepare bundle quote for corporate client",
            "terms_and_conditions": "50% advance on confirmation",
            "items": [
                {
                    "product_id": str(product_a.id),
                    "name": product_a.name,
                    "quantity": 2,
                    "unit_price": "2200.00",
                    "discount": "400.00",
                    "tax_rate": "18.00",
                },
                {
                    "product_id": str(product_b.id),
                    "quantity": 1,
                },
                {
                    "name": "On-site Setup Fee",
                    "quantity": 1,
                    "unit_price": "500.00",
                    "discount": "0.00",
                    "tax_rate": "0.00",
                },
            ],
        }

        res = env["cashier_client"].post("/api/v1/quotations/", payload, format="json")
        assert res.status_code == 201, res.data

        data = res.data
        assert data["quotation_number"].startswith("QT-")
        assert data["customer_name"] == "Ananya Desai"
        assert data["valid_until"] is None
        assert data["notes"] == "Prepare bundle quote for corporate client"
        assert data["terms_and_conditions"] == "50% advance on confirmation"
        assert Decimal(str(data["subtotal"])) == Decimal("8900.00")
        assert Decimal(str(data["discount"])) == Decimal("400.00")
        assert Decimal(str(data["tax"])) == Decimal("1440.00")
        assert Decimal(str(data["total"])) == Decimal("9940.00")
        assert len(data["items"]) == 3
        assert QuotationItem.objects.filter(quotation_id=data["id"]).count() == 3

        # Stock, payments, invoices, and analytics must remain completely untouched
        product_a.refresh_from_db()
        product_b.refresh_from_db()
        assert product_a.current_stock == stock_a_before
        assert product_b.current_stock == stock_b_before
        assert InventoryMovement.objects.filter(organization=org).count() == movements_before
        assert Transaction.objects.filter(organization=org).count() == tx_before
        assert (
            TransactionPayment.objects.filter(transaction__organization=org).count()
            == payments_before
        )
        assert Invoice.objects.filter(organization=org).count() == invoices_before

        analytics_after = compute_analytics(org)
        assert analytics_after["today"] == analytics_before["today"]

    def test_quotation_respects_inclusive_tax_mode_and_gst_disabled(self, quote_workflow_env):
        env = quote_workflow_env
        config = env["config"]
        config.default_tax_mode = "inclusive"
        config.save()

        # Inclusive: 118.00 at 18% -> net 100.00, tax 18.00, total 118.00
        res_inc = env["admin_client"].post(
            "/api/v1/quotations/",
            {
                "customer_name": "Walk-in Tester",
                "items": [{"name": "Inclusive Cable", "quantity": 1, "unit_price": "118.00", "tax_rate": "18.00"}],
            },
            format="json",
        )
        assert res_inc.status_code == 201, res_inc.data
        assert Decimal(str(res_inc.data["tax"])) == Decimal("18.00")
        assert Decimal(str(res_inc.data["total"])) == Decimal("118.00")

        config.gst_enabled = False
        config.save()
        res_nogst = env["admin_client"].post(
            "/api/v1/quotations/",
            {
                "customer_name": "Walk-in NoGST",
                "items": [{"name": "Zero GST Item", "quantity": 1, "unit_price": "500.00", "tax_rate": "18.00"}],
            },
            format="json",
        )
        assert res_nogst.status_code == 201, res_nogst.data
        assert Decimal(str(res_nogst.data["tax"])) == Decimal("0.00")
        assert Decimal(str(res_nogst.data["total"])) == Decimal("500.00")

    @pytest.mark.parametrize(
        "bad_payload",
        [
            {"items": []},
            {"valid_until": "invalid-date", "items": [{"name": "Item", "quantity": 1, "unit_price": 100}]},
            {"status": "converted", "items": [{"name": "Item", "quantity": 1, "unit_price": 100}]},
            {"items": [{"name": "Item", "quantity": 0, "unit_price": 100}]},
            {"items": [{"name": "Item", "quantity": 1, "unit_price": "not-a-number"}]},
            {"items": [{"name": "Item", "quantity": 1, "unit_price": 100, "discount": 150}]},
            {"customer_id": "not-a-uuid", "items": [{"name": "Item", "quantity": 1, "unit_price": 100}]},
        ],
    )
    def test_quotation_validation_errors_return_400_not_500(self, quote_workflow_env, bad_payload):
        res = quote_workflow_env["admin_client"].post("/api/v1/quotations/", bad_payload, format="json")
        assert res.status_code == 400, (bad_payload, res.status_code, res.data)

    def test_pos_product_search_supports_both_q_and_search_params(self, quote_workflow_env):
        client = quote_workflow_env["cashier_client"]
        res_q = client.get("/api/v1/pos/products/?q=Mechanical")
        res_search = client.get("/api/v1/pos/products/?search=Mechanical")
        assert res_q.status_code == 200
        assert res_search.status_code == 200
        q_names = [item["name"] for item in res_q.data["results"]]
        s_names = [item["name"] for item in res_search.data["results"]]
        assert "Mechanical Keyboard" in q_names
        assert q_names == s_names

    def test_rbac_blocks_inventory_role_and_isolates_tenants(self, quote_workflow_env):
        env = quote_workflow_env
        inv_client = env["inventory_client"]
        payload = {"items": [{"name": "Test Item", "quantity": 1, "unit_price": "100.00"}]}

        assert inv_client.get("/api/v1/quotations/").status_code == 403
        assert inv_client.post("/api/v1/quotations/", payload, format="json").status_code == 403
        assert inv_client.get("/api/v1/billing/staff/quotations/").status_code == 403

        # Cashier and staff quotation list works
        assert env["cashier_client"].get("/api/v1/quotations/").status_code == 200
        assert env["cashier_client"].get("/api/v1/billing/staff/quotations/").status_code == 200

        created = env["admin_client"].post("/api/v1/quotations/", payload, format="json").data
        quote_id = created["id"]
        assert inv_client.post(f"/api/v1/quotations/{quote_id}/convert/", {}, format="json").status_code == 403
        # Cross-tenant isolation returns 404
        assert env["other_client"].get(f"/api/v1/quotations/{quote_id}/").status_code == 404
        assert Quotation.objects.filter(id=quote_id, organization=env["org"]).exists()
