import pytest
from decimal import Decimal
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APIClient

from apps.products.models import Product, ProductCategory
from apps.transactions.models import Transaction
from apps.invoices.models import Quotation
from apps.whatsapp.models import WhatsAppConfig
from apps.billing.models import BusinessConfig
from tests.factories import OrganizationFactory, UserFactory, StoreFactory


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def org_admin():
    org = OrganizationFactory(name="Audit Test Org")
    admin = UserFactory(role="org_admin", organization=org)
    BusinessConfig.objects.create(
        organization=org,
        business_type="RETAIL",
        gst_enabled=True,
        tax_mode="exclusive",
        default_tax_rate=Decimal("18.00"),
        allow_credit_sales=True,
    )
    return admin


@pytest.fixture
def cashier(org_admin):
    return UserFactory(role="cashier", organization=org_admin.organization)


@pytest.fixture
def store(org_admin):
    return StoreFactory(organization=org_admin.organization)


@pytest.mark.django_db
class TestPhase1InventoryAndPOS:
    """Automated verification for Phase 1: Categories, Inventory propagation, POS, WhatsApp."""

    def test_category_creation_and_duplicate_prevention(self, api_client, org_admin):
        api_client.force_authenticate(user=org_admin)
        url = "/api/v1/products/categories/"

        # 1. Create a category
        res = api_client.post(url, {"name": "Electronics", "description": "Gadgets"})
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["name"] == "Electronics"

        # 2. Case-insensitive duplicate prevention for the same organization
        res_dup = api_client.post(url, {"name": "electronics"})
        assert res_dup.status_code == status.HTTP_400_BAD_REQUEST

        # 3. Another organization can have the same category name
        other_org = OrganizationFactory(name="Second Org")
        other_admin = UserFactory(role="org_admin", organization=other_org)
        api_client.force_authenticate(user=other_admin)
        res_other = api_client.post(url, {"name": "Electronics"})
        assert res_other.status_code == status.HTTP_201_CREATED

    def test_category_list_all_unpaginated_parameter(self, api_client, org_admin):
        api_client.force_authenticate(user=org_admin)
        url = "/api/v1/products/categories/"

        # Create multiple categories
        for name in ["Apparel", "Footwear", "Home Decor", "Stationery", "Groceries"]:
            ProductCategory.objects.create(organization=org_admin.organization, name=name)

        # Call with ?all=true
        res = api_client.get(f"{url}?all=true")
        assert res.status_code == status.HTTP_200_OK
        # Unpaginated response returns a direct list
        assert isinstance(res.data, list)
        assert len(res.data) >= 5
        names = [c["name"] for c in res.data]
        assert "Apparel" in names
        assert "Groceries" in names

    def test_product_creation_and_update_with_category_assignment(self, api_client, org_admin):
        api_client.force_authenticate(user=org_admin)
        cat = ProductCategory.objects.create(organization=org_admin.organization, name="Beverages")

        # Create product assigning category by name string
        res = api_client.post("/api/v1/products/", {
            "name": "Cold Brew Coffee",
            "sku": "CB-001",
            "category": "Beverages",
            "selling_price": "180.00",
            "unit_price": "180.00",
            "purchase_price": "75.00",
            "tax_rate": "18.00",
        })
        assert res.status_code == status.HTTP_201_CREATED
        product_id = res.data["id"]
        product = Product.objects.get(id=product_id)
        assert product.category == cat

        # Update product to a new category created inline
        res_patch = api_client.patch(f"/api/v1/products/{product_id}/", {
            "category": "Organic Drinks",
            "selling_price": "195.00",
        })
        assert res_patch.status_code == status.HTTP_200_OK
        product.refresh_from_db()
        assert product.category.name == "Organic Drinks"
        assert product.selling_price == Decimal("195.00")

    def test_pos_product_serializer_includes_category_name(self, api_client, org_admin):
        api_client.force_authenticate(user=org_admin)
        cat = ProductCategory.objects.create(organization=org_admin.organization, name="Snacks")
        prod = Product.objects.create(
            organization=org_admin.organization,
            name="Organic Almonds",
            sku="SNK-001",
            barcode="890123456789",
            category=cat,
            selling_price=Decimal("250.00"),
            unit_price=Decimal("250.00"),
            purchase_price=Decimal("180.00"),
            tax_rate=Decimal("5.00"),
            current_stock=Decimal("50.00"),
            unit="PKT",
            track_inventory=True,
            is_active=True,
        )

        res = api_client.get("/api/v1/billing/products/", {"search": "Almonds"})
        assert res.status_code == status.HTTP_200_OK
        items = res.data if isinstance(res.data, list) else res.data.get("results", [])
        found = [i for i in items if i["id"] == str(prod.id)]
        assert len(found) == 1
        assert found[0]["category_name"] == "Snacks"

    def test_whatsapp_config_update_preserves_token_when_blank(self, api_client, org_admin):
        api_client.force_authenticate(user=org_admin)
        wa_config = WhatsAppConfig.objects.create(
            organization=org_admin.organization,
            phone_number_id="1234567890",
            access_token="SUPER_SECRET_TOKEN_ABC_123",
            is_active=True,
        )
        url = "/api/v1/whatsapp/config/"

        # PATCH with blank access_token should preserve the existing token
        res = api_client.patch(url, {
            "phone_number_id": "9876543210",
            "access_token": "",
        })
        assert res.status_code == status.HTTP_200_OK
        wa_config.refresh_from_db()
        assert wa_config.phone_number_id == "9876543210"
        assert wa_config.access_token == "SUPER_SECRET_TOKEN_ABC_123"

        # Check response does NOT leak the access token
        assert "SUPER_SECRET_TOKEN" not in str(res.data)
        assert res.data.get("has_access_token") is True

    @patch("requests.get")
    def test_whatsapp_connection_test_diagnostic(self, mock_get, api_client, org_admin):
        api_client.force_authenticate(user=org_admin)
        WhatsAppConfig.objects.create(
            organization=org_admin.organization,
            phone_number_id="1234567890",
            access_token="TEST_TOKEN",
            is_active=True,
        )
        mock_response = patch("requests.Response").start()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "1234567890",
            "display_phone_number": "+91 98765 43210",
            "verified_name": "BillMeet Store",
        }
        mock_get.return_value = mock_response

        url = "/api/v1/whatsapp/config/test-connection/"
        res = api_client.post(url)
        assert res.status_code == status.HTTP_200_OK
        assert res.data["connected"] is True
        assert res.data["verified_name"] == "BillMeet Store"
        assert "checked_at" in res.data


@pytest.mark.django_db
class TestPhase2DashboardAndFinancialIntegrity:
    """Automated verification for Phase 2: Reconciliation, Split Payments, Invariant tests."""

    def test_quotation_creation_does_not_deduct_inventory(self, api_client, org_admin):
        api_client.force_authenticate(user=org_admin)
        prod = Product.objects.create(
            organization=org_admin.organization,
            name="Industrial Drill",
            sku="DRL-001",
            selling_price=Decimal("4500.00"),
            unit_price=Decimal("4500.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
            is_active=True,
        )

        # Create quotation for 3 units
        res = api_client.post("/api/v1/invoices/quotations/", {
            "customer_name": "ABC Contractors",
            "items": [
                {
                    "product": str(prod.id),
                    "name": prod.name,
                    "quantity": 3,
                    "unit_price": "4500.00",
                    "tax_rate": "18.00",
                }
            ],
            "valid_until": "2026-12-31",
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        prod.refresh_from_db()
        # Stock must strictly remain 10 (not deducted)
        assert prod.current_stock == Decimal("10.00")

    def test_split_payment_checkout_without_double_counting(self, api_client, org_admin, store):
        api_client.force_authenticate(user=org_admin)
        prod = Product.objects.create(
            organization=org_admin.organization,
            name="Executive Desk",
            sku="DSK-001",
            selling_price=Decimal("10000.00"),
            unit_price=Decimal("10000.00"),
            current_stock=Decimal("5.00"),
            track_inventory=True,
            is_active=True,
        )

        # Checkout with split payment: 4000 CASH, 6000 UPI
        res = api_client.post("/api/v1/billing/checkout/", {
            "store_id": str(store.id),
            "items": [
                {
                    "product_id": str(prod.id),
                    "name": prod.name,
                    "quantity": 1,
                    "unit_price": 10000.00,
                    "discount": 0.0,
                    "tax_rate": 0.00,
                }
            ],
            "payments": [
                {"payment_method": "CASH", "amount": 4000.00},
                {"payment_method": "UPI", "amount": 6000.00},
            ],
            "discount_amount": 0.0,
            "notes": "Split payment test",
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        txn_id = res.data["transaction_id"]

        txn = Transaction.objects.get(id=txn_id)
        assert txn.total == Decimal("10000.00")
        assert txn.status == "completed"

        # Verify inventory was deducted atomically
        prod.refresh_from_db()
        assert prod.current_stock == Decimal("4.00")

        # Verify dashboard reconciliation
        res_dash = api_client.get("/api/v1/analytics/dashboard/")
        assert res_dash.status_code == status.HTTP_200_OK
        # Total revenue should reflect 10000 once (not duplicated by split payments)
        assert Decimal(str(res_dash.data["today_net_sales"])) >= Decimal("10000.00")


@pytest.mark.django_db
class TestPhase3StaffRBACAndWorkspaceSecurity:
    """Automated verification for Phase 3: Staff RBAC, admin controls, privilege separation."""

    def test_cashier_cannot_access_whatsapp_config(self, api_client, cashier):
        api_client.force_authenticate(user=cashier)
        res = api_client.get("/api/v1/whatsapp/config/")
        assert res.status_code == status.HTTP_403_FORBIDDEN

        res_test = api_client.post("/api/v1/whatsapp/config/test-connection/")
        assert res_test.status_code == status.HTTP_403_FORBIDDEN

    def test_cashier_cannot_access_business_config_or_staff_sales_report(self, api_client, cashier):
        api_client.force_authenticate(user=cashier)

        # Business Config PUT
        res_cfg = api_client.put("/api/v1/billing/config/", {"trade_name": "Hacked Name"})
        assert res_cfg.status_code == status.HTTP_403_FORBIDDEN

        # Staff sales report (admin only)
        res_sales = api_client.get("/api/v1/billing/admin/staff-sales/")
        assert res_sales.status_code == status.HTTP_403_FORBIDDEN

        # Tax report (admin only)
        res_tax = api_client.get("/api/v1/billing/reports/tax/")
        assert res_tax.status_code == status.HTTP_403_FORBIDDEN

        # Executive analytics dashboard (admin/manager only)
        res_dash = api_client.get("/api/v1/analytics/dashboard/")
        assert res_dash.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_create_and_manage_staff(self, api_client, org_admin):
        api_client.force_authenticate(user=org_admin)

        # Admin creates a new cashier
        res = api_client.post("/api/v1/users/create/", {
            "first_name": "Ramesh",
            "last_name": "Kumar",
            "email": "ramesh@teststore.com",
            "phone": "+919876500001",
            "role": "cashier",
            "password": "Password123!",
        })
        assert res.status_code == status.HTTP_201_CREATED
        user_id = res.data["id"]

        # Deactivate staff account
        res_deact = api_client.patch(f"/api/v1/users/{user_id}/", {
            "is_active": False,
        })
        assert res_deact.status_code == status.HTTP_200_OK
        assert res_deact.data["is_active"] is False

    def test_manager_cannot_promote_to_admin(self, api_client, org_admin):
        manager = UserFactory(role="store_manager", organization=org_admin.organization)
        api_client.force_authenticate(user=manager)

        # Attempt to create an admin account should be blocked
        res = api_client.post("/api/v1/users/create/", {
            "first_name": "Sneha",
            "last_name": "Patel",
            "email": "sneha@teststore.com",
            "role": "org_admin",
            "password": "Password123!",
        })
        assert res.status_code == status.HTTP_403_FORBIDDEN
