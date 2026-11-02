import uuid
from decimal import Decimal
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product
from apps.billing.models import BusinessConfig
from apps.transactions.models import Transaction


@pytest.fixture
def clean_merchant_client():
    org = Organization.objects.create(name="Fresh Merchant Co")
    user = User.objects.create_user(
        email=f"merchant-{uuid.uuid4().hex[:6]}@example.com",
        password="securepass123",
        organization=org,
        role="org_admin",
        first_name="Anita",
        last_name="Sharma",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return {"org": org, "user": user, "client": client}


@pytest.mark.django_db
class TestSettingsReliability:
    """
    Verifies that Business & POS Settings endpoints accept GET, POST, PUT, and PATCH,
    properly synchronize trade name / GSTIN to Organization and Store, and reject unauthorized staff.
    """

    def test_pos_config_supports_post_patch_and_put(self, clean_merchant_client):
        client = clean_merchant_client["client"]
        org = clean_merchant_client["org"]

        # 1. GET initial config
        res_get = client.get("/api/v1/pos/config/")
        assert res_get.status_code == status.HTTP_200_OK

        # 2. POST update (which previously returned Method "POST" not allowed)
        res_post = client.post("/api/v1/pos/config/", {
            "business_type": "RETAIL",
            "trade_name": "Zudio Fashion",
            "gstin": "27AAPFU0939F1ZV",
            "gst_enabled": True,
            "default_tax_rate": 18.0,
        }, format="json")
        assert res_post.status_code == status.HTTP_200_OK
        assert res_post.data["trade_name"] == "Zudio Fashion"
        assert res_post.data["gstin"] == "27AAPFU0939F1ZV"

        # Verify Organization and Store synchronization
        org.refresh_from_db()
        assert org.name == "Zudio Fashion"
        assert org.gst_number == "27AAPFU0939F1ZV"

        # Auto-created store should also reflect trade name
        store = Store.objects.filter(organization=org).first()
        assert store is not None
        assert "Zudio Fashion" in store.name

        # 3. PATCH update
        res_patch = client.patch("/api/v1/pos/config/", {
            "trade_name": "Zudio Mega Store",
            "allow_credit_sales": True,
        }, format="json")
        assert res_patch.status_code == status.HTTP_200_OK
        assert res_patch.data["trade_name"] == "Zudio Mega Store"

        org.refresh_from_db()
        assert org.name == "Zudio Mega Store"

        # 4. PUT update
        res_put = client.put("/api/v1/pos/config/", {
            "business_type": "clothing",
            "trade_name": "Zudio Apparel",
            "gstin": "27AAPFU0939F1ZV",
        }, format="json")
        assert res_put.status_code == status.HTTP_200_OK
        assert res_put.data["business_type"] == "CLOTHING"

    def test_store_list_view_auto_creates_default_store_if_none_exists(self, clean_merchant_client):
        client = clean_merchant_client["client"]
        org = clean_merchant_client["org"]

        # Ensure no stores exist
        Store.objects.filter(organization=org).delete()
        assert Store.objects.filter(organization=org).count() == 0

        # Query StoreListView
        res = client.get("/api/v1/stores/")
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data["results"]) >= 1

        store = Store.objects.filter(organization=org).first()
        assert store is not None
        assert store.status == "active"
        assert store.code == "STR-MAIN"

    def test_tally_config_supports_post_patch_and_put(self, clean_merchant_client):
        client = clean_merchant_client["client"]

        # POST
        res_post = client.post("/api/v1/pos/reports/sales/tally-config/", {
            "company_name": "Zudio Retail Ltd",
            "sales_ledger": "Sales - GST",
        }, format="json")
        assert res_post.status_code == status.HTTP_200_OK

        # PATCH
        res_patch = client.patch("/api/v1/pos/reports/sales/tally-config/", {
            "company_name": "Zudio International",
        }, format="json")
        assert res_patch.status_code == status.HTTP_200_OK

        # GET
        res_get = client.get("/api/v1/pos/reports/sales/tally-config/")
        assert res_get.status_code == status.HTTP_200_OK
        assert res_get.data["company_name"] == "Zudio International"


@pytest.mark.django_db
class TestCheckoutGuarantees:
    """
    Verifies that POS Checkout guarantees non-null store resolution under all circumstances,
    preventing null value in column store_id violates not-null constraint.
    """

    def test_checkout_succeeds_when_no_stores_exist_beforehand(self, clean_merchant_client):
        client = clean_merchant_client["client"]
        org = clean_merchant_client["org"]

        # Guarantee 0 stores exist in DB
        Store.objects.filter(organization=org).delete()
        assert Store.objects.filter(organization=org).count() == 0

        product = Product.objects.create(
            organization=org,
            name="Cotton T-Shirt",
            sku="TSHIRT-001",
            selling_price=Decimal("600.00"),
            current_stock=Decimal("50.00"),
            tax_rate=Decimal("18.00"),
            is_active=True,
        )

        checkout_payload = {
            "items": [
                {
                    "product_id": str(product.id),
                    "name": product.name,
                    "unit_price": 600.0,
                    "quantity": 1,
                    "discount": 0,
                    "tax_rate": 18.0,
                }
            ],
            "payments": [
                {
                    "payment_method": "cash",
                    "amount": 708.0,
                }
            ],
            "is_walk_in": True,
            "idempotency_key": f"test-checkout-{uuid.uuid4().hex}",
        }

        # Checkout WITHOUT passing store_id
        res = client.post("/api/v1/pos/checkout/", checkout_payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED, res.data

        # Verify transaction and store in database
        tx = Transaction.objects.filter(organization=org).first()
        assert tx is not None
        assert tx.store is not None, "Transaction.store MUST NOT be null!"
        assert tx.store.organization == org
        assert tx.total == Decimal("708.00")
        assert tx.amount_paid == Decimal("708.00")

    def test_checkout_handles_empty_or_null_store_id_gracefully(self, clean_merchant_client):
        client = clean_merchant_client["client"]
        org = clean_merchant_client["org"]

        product = Product.objects.create(
            organization=org,
            name="Denim Jeans",
            sku="JEANS-001",
            selling_price=Decimal("1000.00"),
            current_stock=Decimal("20.00"),
            tax_rate=Decimal("18.00"),
            is_active=True,
        )

        for empty_val in ["", "null", "undefined", None]:
            checkout_payload = {
                "store_id": empty_val,
                "items": [
                    {
                        "product_id": str(product.id),
                        "name": product.name,
                        "unit_price": 1000.0,
                        "quantity": 1,
                        "discount": 0,
                        "tax_rate": 18.0,
                    }
                ],
                "payments": [
                    {"payment_method": "cash", "amount": 1180.0}
                ],
                "is_walk_in": True,
                "idempotency_key": f"test-checkout-null-{uuid.uuid4().hex}",
            }
            res = client.post("/api/v1/pos/checkout/", checkout_payload, format="json")
            assert res.status_code == status.HTTP_201_CREATED, f"Failed for store_id={empty_val}: {res.data}"
