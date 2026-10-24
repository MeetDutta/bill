import pytest
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient
from apps.organizations.models import Organization
from apps.users.models import User
from apps.stores.models import Store
from apps.products.models import Product, Supplier, PurchaseOrder
from apps.invoices.models import Quotation, QuotationItem
from apps.transactions.models import Transaction
from apps.analytics.views import compute_analytics


@pytest.fixture
def auth_setup(db):
    org = Organization.objects.create(name="BillMeet Retail Org", currency="INR")
    user = User.objects.create_user(
        email="cashier@billmeet.local",
        password="password123",
        first_name="Cashier",
        last_name="Test",
        organization=org,
    )
    store = Store.objects.create(organization=org, name="Main Counter Store", code="CTR1")
    client = APIClient()
    client.force_authenticate(user=user)
    return {
        "org": org,
        "user": user,
        "store": store,
        "client": client,
    }


@pytest.mark.django_db
class TestQuotationLookupAndAnalytics:
    def test_quotation_lookup_by_serial_number(self, auth_setup):
        org = auth_setup["org"]
        client = auth_setup["client"]

        prod = Product.objects.create(
            organization=org,
            external_id="P_LU_101",
            name="Orient Ceiling Fan 1200mm",
            unit_price=Decimal("2450.00"),
            cost_price=Decimal("1900.00"),
            current_stock=Decimal("15.00"),
        )

        quote = Quotation.objects.create(
            organization=org,
            quotation_number="QT-2026-9999",
            quotation_date=timezone.now().date(),
            customer_name="Mr. Sharma",
            customer_phone="9876543210",
            subtotal=Decimal("2450.00"),
            tax=Decimal("441.00"),
            total=Decimal("2891.00"),
            status="draft",
        )

        QuotationItem.objects.create(
            quotation=quote,
            product=prod,
            name=prod.name,
            quantity=Decimal("1.00"),
            unit_price=Decimal("2450.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("18.00"),
            tax=Decimal("441.00"),
            total=Decimal("2891.00"),
        )

        # 1. Lookup by exact quotation number
        url = f"/api/v1/invoices/quotations/lookup/{quote.quotation_number}/"
        res = client.get(url)
        assert res.status_code == 200
        data = res.json()
        assert data["quotation_number"] == "QT-2026-9999"
        assert data["customer_name"] == "Mr. Sharma"
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == "Orient Ceiling Fan 1200mm"
        assert float(data["total"]) == 2891.0

        # 2. Lookup by partial number
        res_partial = client.get("/api/v1/invoices/quotations/lookup/9999/")
        assert res_partial.status_code == 200
        assert res_partial.json()["quotation_number"] == "QT-2026-9999"

        # 3. Lookup non-existent quote returns 404
        res_not_found = client.get("/api/v1/invoices/quotations/lookup/NON_EXISTENT_QUOTE/")
        assert res_not_found.status_code == 404

    def test_compute_analytics_extended_metrics(self, auth_setup):
        org = auth_setup["org"]
        store = auth_setup["store"]
        user = auth_setup["user"]

        # Create active products
        p1 = Product.objects.create(
            organization=org,
            external_id="P_AN_1",
            name="Hammer 500g",
            unit_price=Decimal("350.00"),
            cost_price=Decimal("200.00"),
            current_stock=Decimal("20.00"),
            min_stock=Decimal("5.00"),
            track_inventory=True,
        )
        p2 = Product.objects.create(
            organization=org,
            external_id="P_AN_2",
            name="Screwdriver Set",
            unit_price=Decimal("450.00"),
            cost_price=Decimal("300.00"),
            current_stock=Decimal("2.00"),
            min_stock=Decimal("5.00"),
            track_inventory=True,
        )

        # Create a supplier and purchase order
        sup = Supplier.objects.create(
            organization=org,
            name="Tools Wholesaler Ltd",
            phone="9811223344",
        )
        PurchaseOrder.objects.create(
            organization=org,
            store=store,
            supplier_ref=sup,
            supplier_name=sup.name,
            po_number="PO-9001",
            total_amount=Decimal("10000.00"),
            paid_amount=Decimal("4000.00"),
            status="received",
            created_by=user,
        )

        # Create completed transaction
        Transaction.objects.create(
            organization=org,
            store=store,
            invoice_number="INV-AN-100",
            transaction_date=timezone.now(),
            subtotal=Decimal("800.00"),
            discount=Decimal("0.00"),
            tax=Decimal("144.00"),
            total=Decimal("944.00"),
            amount_paid=Decimal("944.00"),
            payment_method="cash",
            payment_status="paid",
            status="completed",
        )

        analytics = compute_analytics(org)

        # Verify new fields
        assert "kpis" in analytics
        assert "stock_value" in analytics
        assert "total_products_count" in analytics
        assert "low_stock_count" in analytics
        assert "supplier_dues" in analytics
        assert "sales_trend_30" in analytics
        assert "sales_by_category" in analytics

        # Stock valuation: (20 * 200) + (2 * 300) = 4000 + 600 = 4600
        assert analytics["stock_value"] == 4600.0
        assert analytics["low_stock_count"] == 1  # p2 has 2 <= min_stock 5
        assert analytics["supplier_dues"] == 6000.0  # 10000 - 4000
        assert len(analytics["sales_trend_30"]) == 30
        assert analytics["kpis"]["today_sales_count"] == 1
