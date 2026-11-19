import io
from decimal import Decimal
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.organizations.models import Organization
from apps.users.models import User
from apps.customers.models import Customer
from apps.products.models import Product, ProductCategory, InventoryMovement, Supplier
from apps.transactions.models import Transaction, TransactionItem
from apps.invoices.models import Invoice
from apps.invoices.pdf import sanitize_invoice_pdf_filename, generate_invoice_pdf
from apps.whatsapp.models import WhatsAppConfig
from apps.whatsapp.service import (
    render_whatsapp_invoice_message,
    build_invoice_pdf_filename,
    DEFAULT_INVOICE_WHATSAPP_TEMPLATE,
)
from apps.billing.services.inventory_service import InventoryService
from apps.migration.models import POSMigrationJob
from apps.migration.services.pos_migration_service import POSMigrationService


@pytest.fixture
def setup_data(db):
    from apps.stores.models import Store
    org = Organization.objects.create(name="Apex Retail Pvt Ltd", currency="INR", country="IN")
    store = Store.objects.create(organization=org, name="Main Store", code="STR-MAIN")
    admin_user = User.objects.create_user(
        email="admin@apex.com",
        password="securepass123",
        role="org_admin",
        first_name="Admin",
        last_name="Owner",
        organization=org,
    )

    staff_user = User.objects.create_user(
        email="cashier@apex.com",
        password="securepass123",
        role="cashier",
        first_name="Cashier",
        last_name="Staff",
        organization=org,
    )

    category = ProductCategory.objects.create(organization=org, name="Stationery")
    product = Product.objects.create(
        organization=org,
        name="Reynolds Ball Pen",
        sku="PEN-001",
        category=category,
        selling_price=Decimal("20.00"),
        purchase_price=Decimal("12.00"),
        cost_price=Decimal("12.00"),
        opening_stock=Decimal("50.00"),
        current_stock=Decimal("50.00"),
        min_stock=Decimal("10.00"),
        tax_rate=Decimal("18.00"),
        unit="PCS",
        is_active=True,
    )

    customer = Customer.objects.create(
        organization=org,
        first_name="Vrushabh",
        last_name="Gillakar",
        phone="+919876543210",
        address_line1="Shop 4, MG Road",
        city="Pune",
        state="Maharashtra",
        postal_code="411001",
        whatsapp_opt_in=True,
    )

    return {
        "org": org,
        "store": store,
        "admin": admin_user,
        "staff": staff_user,
        "category": category,
        "product": product,
        "customer": customer,
    }


@pytest.mark.django_db
class TestMigrationAndUpgradeSuite:
    """Automated verification suite covering all 18 requirements."""

    # 1. Customer search using name
    def test_01_customer_search_using_name(self, setup_data):
        client = APIClient()
        client.force_authenticate(user=setup_data["staff"])
        res = client.get("/api/v1/customers/?search=Vrushabh Gillakar")
        assert res.status_code == 200
        data = res.data.get("results", res.data)
        assert len(data) >= 1
        assert "9876543210" in data[0]["phone"]

        # Partial case-insensitive search
        res_partial = client.get("/api/v1/customers/?search=vrush")
        assert res_partial.status_code == 200
        assert len(res_partial.data.get("results", res_partial.data)) >= 1

    # 2. Customer search using mobile number
    def test_02_customer_search_using_mobile_number(self, setup_data):
        client = APIClient()
        client.force_authenticate(user=setup_data["staff"])
        res = client.get("/api/v1/customers/?search=9876543210")
        assert res.status_code == 200
        results = res.data.get("results", res.data)
        assert len(results) >= 1
        assert results[0]["id"] == str(setup_data["customer"].id)

    # 3. Customer creation with individual address
    def test_03_customer_creation_with_individual_address(self, setup_data):
        client = APIClient()
        client.force_authenticate(user=setup_data["staff"])
        payload = {
            "first_name": "Aarav",
            "last_name": "Patil",
            "phone": "9123456780",
            "address_line1": "Flat 302, Greenwoods",
            "city": "Mumbai",
            "state": "Maharashtra",
            "postal_code": "400001",
        }
        res = client.post("/api/v1/customers/", payload, format="json")
        assert res.status_code == 201
        created = Customer.objects.get(id=res.data["id"])
        assert created.first_name == "Aarav"
        assert created.address_line1 == "Flat 302, Greenwoods"
        assert created.city == "Mumbai"
        assert created.postal_code == "400001"

    # 4. Category filtering on Sell page
    def test_04_category_filtering_on_sell_page(self, setup_data):
        client = APIClient()
        client.force_authenticate(user=setup_data["staff"])
        # All products
        res_all = client.get("/api/v1/pos/products/?category=all")
        assert res_all.status_code == 200
        assert len(res_all.data.get("results", res_all.data)) >= 1

        # Specific category
        res_cat = client.get("/api/v1/pos/products/?category=Stationery")
        assert res_cat.status_code == 200
        assert len(res_cat.data.get("results", res_cat.data)) >= 1

        # Uncategorized filter
        res_uncat = client.get("/api/v1/pos/products/?category=uncategorized")
        assert res_uncat.status_code == 200

    # 5. Category synchronization with Inventory
    def test_05_category_synchronization_with_inventory(self, setup_data):
        client = APIClient()
        client.force_authenticate(user=setup_data["admin"])
        res = client.post("/api/v1/products/categories/", {"name": "Electronics"}, format="json")
        assert res.status_code == 201

        # Must be available across products listing
        cat_res = client.get("/api/v1/products/categories/")
        names = [c["name"] for c in cat_res.data.get("results", cat_res.data)]
        assert "Electronics" in names

    # 6. Stock addition and deduction
    def test_06_stock_addition_and_deduction(self, setup_data):
        prod = setup_data["product"]
        org = setup_data["org"]
        admin = setup_data["admin"]

        # Stock Addition (+15)
        res_add = InventoryService.adjust_stock(
            organization=org,
            store=None,
            user=admin,
            product_id=str(prod.id),
            quantity_delta=Decimal("15.00"),
            movement_type="PURCHASE",
            notes="Restock shipment",
        )
        prod.refresh_from_db()
        assert prod.current_stock == Decimal("65.00")
        assert Decimal(res_add["new_stock"]) == Decimal("65.00")

        # Stock Deduction (-5 for DAMAGE)
        res_ded = InventoryService.adjust_stock(
            organization=org,
            store=None,
            user=admin,
            product_id=str(prod.id),
            quantity_delta=Decimal("5.00"),  # Auto-negated for DAMAGE
            movement_type="DAMAGE",
            notes="Broken package",
        )
        prod.refresh_from_db()
        assert prod.current_stock == Decimal("60.00")
        assert Decimal(res_ded["quantity_delta"]) == Decimal("-5.00")

    # 7. Stock movement history
    def test_07_stock_movement_history(self, setup_data):
        # Create an explicit movement first
        InventoryService.adjust_stock(
            organization=setup_data["org"],
            store=None,
            user=setup_data["admin"],
            product_id=str(setup_data["product"].id),
            quantity_delta=Decimal("10.00"),
            movement_type="PURCHASE",
            notes="Audit initial stock intake",
        )
        client = APIClient()
        client.force_authenticate(user=setup_data["admin"])
        res = client.get(f"/api/v1/pos/inventory/movements/?product_id={setup_data['product'].id}")
        assert res.status_code == 200
        data = res.data.get("results", res.data)
        assert len(data) >= 1
        mov = data[0]
        assert "quantity" in mov
        assert "previous_stock" in mov
        assert "new_stock" in mov
        assert "movement_type" in mov

    # 8. Low-stock alerts
    def test_08_low_stock_and_out_of_stock_alerts(self, setup_data):
        prod = setup_data["product"]
        org = setup_data["org"]
        admin = setup_data["admin"]

        # Adjust stock below min_stock (10.00)
        InventoryService.adjust_stock(
            organization=org,
            store=None,
            user=admin,
            product_id=str(prod.id),
            quantity_delta=Decimal("5.00"),
            movement_type="ADJUSTMENT",
            set_stock=True,
        )
        prod.refresh_from_db()
        assert prod.current_stock == Decimal("5.00")

        summary = InventoryService.get_inventory_summary(org)
        assert summary["low_stock_count"] >= 1

    # 9. Custom WhatsApp message templates
    def test_09_custom_whatsapp_message_templates(self, setup_data):
        import secrets
        custom_template = (
            "Hello {customer_name}! Your bill #{invoice_number} of {total_amount} is ready. "
            "Issued on {invoice_date}. Thank you for visiting {business_name}!"
        )
        tx = Transaction.objects.create(
            organization=setup_data["org"],
            store=setup_data["store"],
            invoice_number="INV-2026-99",
            transaction_date=timezone.now(),
            customer=setup_data["customer"],
            total=Decimal("1500.00"),
            status="completed",
        )
        invoice = Invoice(
            organization=setup_data["org"],
            transaction=tx,
            invoice_number="INV-2026-99",
            secure_token=secrets.token_urlsafe(24),
            created_at=timezone.now(),
        )
        rendered = render_whatsapp_invoice_message(
            template_str=custom_template,
            invoice=invoice,
            customer=setup_data["customer"],
            organization=setup_data["org"],
        )
        assert "Hello Vrushabh Gillakar!" in rendered
        assert "INV-2026-99" in rendered
        assert "₹1500.00" in rendered
        assert "Apex Retail Pvt Ltd" in rendered

    # 10. Invoice PDF attachment sending
    def test_10_invoice_pdf_attachment_sending(self, setup_data):
        import secrets
        tx = Transaction.objects.create(
            organization=setup_data["org"],
            store=setup_data["store"],
            invoice_number="INV-ATTACH-1",
            transaction_date=timezone.now(),
            customer=setup_data["customer"],
            total=Decimal("500.00"),
            status="completed",
        )
        inv = Invoice.objects.create(
            organization=setup_data["org"],
            transaction=tx,
            invoice_number="INV-ATTACH-1",
            secure_token=secrets.token_urlsafe(24),
        )
        client = APIClient()
        client.force_authenticate(user=setup_data["admin"])
        res = client.get(f"/api/v1/invoices/{inv.id}/send-whatsapp/")
        assert res.status_code == 200
        assert res.data["invoice_number"] == "INV-ATTACH-1"

    # 11. Invoice printing
    def test_11_invoice_printing(self, setup_data):
        import secrets
        tx = Transaction.objects.create(
            organization=setup_data["org"],
            store=setup_data["store"],
            invoice_number="INV-PRINT-1",
            transaction_date=timezone.now(),
            customer=setup_data["customer"],
            total=Decimal("400.00"),
            status="completed",
        )
        inv = Invoice.objects.create(
            organization=setup_data["org"],
            transaction=tx,
            invoice_number="INV-PRINT-1",
            secure_token=secrets.token_urlsafe(24),
        )
        client = APIClient()
        client.force_authenticate(user=setup_data["staff"])
        res = client.get(f"/api/v1/invoices/{inv.id}/")
        assert res.status_code == 200
        assert res.data["invoice_number"] == "INV-PRINT-1"

    # 12. Invoice PDF naming: CustomerName_InvoiceNumber_Date.pdf
    def test_12_invoice_pdf_naming(self, setup_data):
        # Named customer
        fname = sanitize_invoice_pdf_filename(
            invoice_number="INV-1024",
            customer_name="Vrushabh Gillakar",
            invoice_date="2026-11-19",
        )
        assert fname == "Vrushabh_Gillakar_INV-1024_2026-11-19.pdf"

        # Walk-in customer
        walkin_fname = sanitize_invoice_pdf_filename(
            invoice_number="INV-1025",
            customer_name="Walk-in Customer",
            invoice_date="2026-11-19",
        )
        assert walkin_fname == "WalkIn_INV-1025_2026-11-19.pdf"

    # 13. CSV column mapping
    def test_13_csv_column_mapping(self, setup_data):
        headers = ["Item Name", "Item Code", "Retail Price", "Cost Rate", "Opening Stock Qty", "Item Group"]
        mapping = POSMigrationService.suggest_column_mapping(headers, entity_type="products")
        assert mapping["name"] == "Item Name"
        assert mapping["sku"] == "Item Code"
        assert mapping["selling_price"] == "Retail Price"
        assert mapping["opening_stock"] == "Opening Stock Qty"

    # 14. CSV duplicate detection
    def test_14_csv_duplicate_detection(self, setup_data):
        csv_content = (
            "Product Name,SKU,Selling Price,Stock\n"
            "Reynolds Ball Pen,PEN-001,20.00,10\n"  # Duplicate existing SKU & Name
            "Reynolds Ball Pen,PEN-002,20.00,10\n"  # Duplicate Name in file
        )
        job = POSMigrationJob.objects.create(
            organization=setup_data["org"],
            user=setup_data["admin"],
            file_name="dup_test.csv",
            entity_type="products",
            file_content=csv_content,
            duplicate_strategy="skip",
        )
        mapping = {"name": "Product Name", "sku": "SKU", "selling_price": "Selling Price", "opening_stock": "Stock"}
        validated_job = POSMigrationService.validate_job(job, column_mapping=mapping)
        assert validated_job.duplicate_rows >= 1

    # 15. CSV validation
    def test_15_csv_validation(self, setup_data):
        csv_content = (
            "Product Name,SKU,Selling Price,Stock\n"
            ",PEN-999,50.00,10\n"         # Missing required name
            "Valid Item,PEN-888,-20.00,10\n" # Negative selling price
        )
        job = POSMigrationJob.objects.create(
            organization=setup_data["org"],
            user=setup_data["admin"],
            file_name="val_test.csv",
            entity_type="products",
            file_content=csv_content,
        )
        mapping = {"name": "Product Name", "sku": "SKU", "selling_price": "Selling Price", "opening_stock": "Stock"}
        validated_job = POSMigrationService.validate_job(job, column_mapping=mapping)
        assert validated_job.invalid_rows == 2
        assert len(validated_job.validation_errors) >= 2

    # 16. Migration rollback
    def test_16_migration_rollback(self, setup_data):
        csv_content = (
            "Product Name,SKU,Selling Price,Stock\n"
            "Rollback Item 1,RBK-001,100.00,25\n"
            "Rollback Item 2,RBK-002,150.00,30\n"
        )
        job = POSMigrationJob.objects.create(
            organization=setup_data["org"],
            user=setup_data["admin"],
            file_name="rollback_test.csv",
            entity_type="products",
            file_content=csv_content,
            duplicate_strategy="skip",
        )
        mapping = {"name": "Product Name", "sku": "SKU", "selling_price": "Selling Price", "opening_stock": "Stock"}
        POSMigrationService.validate_job(job, column_mapping=mapping)
        completed_job = POSMigrationService.execute_import(job)
        assert completed_job.status == "completed"
        assert completed_job.imported_count == 2
        assert Product.objects.filter(sku="RBK-001").exists()

        # Execute rollback
        rolled_back = POSMigrationService.rollback_job(completed_job)
        assert rolled_back.status == "rolled_back"
        assert not Product.objects.filter(sku="RBK-001").exists()
        assert not Product.objects.filter(sku="RBK-002").exists()

    # 17. Admin and Staff permissions
    def test_17_admin_and_staff_permissions(self, setup_data):
        admin_client = APIClient()
        admin_client.force_authenticate(user=setup_data["admin"])

        staff_client = APIClient()
        staff_client.force_authenticate(user=setup_data["staff"])

        # Admin can access migration endpoints
        res_admin = admin_client.get("/api/v1/migration/jobs/")
        assert res_admin.status_code == 200

        # Cashier is blocked from migration jobs
        res_staff = staff_client.get("/api/v1/migration/jobs/")
        assert res_staff.status_code == 403

        # But staff can search customers and products
        res_cust = staff_client.get("/api/v1/customers/?search=Vrushabh")
        assert res_cust.status_code == 200
        res_prod = staff_client.get("/api/v1/pos/products/")
        assert res_prod.status_code == 200

    # 18. Existing POS billing and checkout functionality
    def test_18_existing_pos_billing_and_checkout_functionality(self, setup_data):
        client = APIClient()
        client.force_authenticate(user=setup_data["staff"])
        prod = setup_data["product"]
        cust = setup_data["customer"]
        initial_stock = prod.current_stock

        checkout_payload = {
            "items": [
                {
                    "product_id": str(prod.id),
                    "name": prod.name,
                    "quantity": 2,
                    "unit_price": 20.00,
                    "tax_rate": 18.00,
                }
            ],
            "customer": {
                "id": str(cust.id),
                "name": cust.full_name,
                "phone": cust.phone,
            },
            "payments": [
                {
                    "payment_method": "cash",
                    "amount": 47.20,
                }
            ],
            "idempotency_key": f"test-chk-{timezone.now().timestamp()}",
        }

        res = client.post("/api/v1/pos/checkout/", checkout_payload, format="json")
        assert res.status_code == 201
        assert "transaction_id" in res.data
        assert "invoice_number" in res.data

        # Stock deducted by 2
        prod.refresh_from_db()
        assert prod.current_stock == initial_stock - Decimal("2.00")

        # Invoice generated
        inv = Invoice.objects.filter(transaction_id=res.data["transaction_id"]).first()
        assert inv is not None
        assert inv.invoice_number == res.data["invoice_number"]
