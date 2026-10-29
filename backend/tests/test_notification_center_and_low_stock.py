import pytest
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient

from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.users.models import User
from apps.products.models import Product, ProductCategory, PurchaseOrder, PurchaseOrderItem, InventoryMovement
from apps.notifications.models import Notification
from apps.notifications.services import NotificationService


@pytest.fixture
def org_and_users(db):
    org = Organization.objects.create(name="Test Alert Org")
    store = Store.objects.create(organization=org, name="Main Alert Store", code="MAS-01")
    admin = User.objects.create_user(
        email="alertadmin@test.com",
        password="Password@123",
        organization=org,
        role="org_admin",
        first_name="Alert",
        last_name="Admin",
    )
    staff = User.objects.create_user(
        email="alertstaff@test.com",
        password="Password@123",
        organization=org,
        role="cashier",
        first_name="Alert",
        last_name="Staff",
    )
    category = ProductCategory.objects.create(organization=org, name="Peripherals")
    return {
        "org": org,
        "store": store,
        "admin": admin,
        "staff": staff,
        "category": category,
    }


@pytest.mark.django_db
class TestNotificationCenterAndIntelligentLowStock:
    def test_baseline_calculation_hierarchy(self, org_and_users):
        org = org_and_users["org"]
        store = org_and_users["store"]
        category = org_and_users["category"]

        # Product with explicit baseline_stock
        p1 = Product.objects.create(
            organization=org,
            name="Explicit Baseline Mouse",
            sku="EBM-001",
            selling_price=Decimal("500.00"),
            current_stock=Decimal("50.00"),
            baseline_stock=Decimal("200.00"),
            category=category,
        )
        assert NotificationService.get_product_baseline(p1) == Decimal("200.00")

        # Product with purchase order receipts
        p2 = Product.objects.create(
            organization=org,
            name="Purchased Keyboard",
            sku="PKB-001",
            selling_price=Decimal("1200.00"),
            current_stock=Decimal("40.00"),
            category=category,
        )
        po = PurchaseOrder.objects.create(
            organization=org,
            store=store,
            po_number="PO-TEST-001",
            supplier_name="Tech Imports",
            status="received",
        )
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=p2,
            quantity=Decimal("150.00"),
            purchase_price=Decimal("800.00"),
            total=Decimal("120000.00"),
        )
        assert NotificationService.get_product_baseline(p2) == Decimal("150.00")

        # Product with documented min_stock fallback (min_stock * 4)
        p3 = Product.objects.create(
            organization=org,
            name="Min Stock Item",
            sku="MSI-001",
            selling_price=Decimal("100.00"),
            current_stock=Decimal("20.00"),
            min_stock=Decimal("25.00"),
            category=category,
        )
        assert NotificationService.get_product_baseline(p3) == Decimal("100.00")

    def test_intelligent_threshold_alert_progression(self, org_and_users):
        """
        Tests the prompt's exact sequence:
        Baseline = 100 units
        40 units (40%) -> No alert
        25 units (25%) -> Warning notification
        22 units (22%) -> Keep existing warning active (no duplicate)
        20 units (20%) -> Escalate to Critical
        10 units (10%) -> Keep critical active
        0 units (0%)   -> Out of Stock notification
        """
        org = org_and_users["org"]
        category = org_and_users["category"]

        product = Product.objects.create(
            organization=org,
            name="Wireless Mouse",
            sku="WM-001",
            selling_price=Decimal("699.00"),
            current_stock=Decimal("40.00"),
            baseline_stock=Decimal("100.00"),
            category=category,
            track_inventory=True,
        )

        # 1. 40 units -> 40% -> No alert
        alert = NotificationService.evaluate_product_low_stock(product)
        assert alert is None
        assert Notification.objects.filter(organization=org).count() == 0

        # 2. 25 units -> 25% -> Create Warning notification
        product.current_stock = Decimal("25.00")
        product.save()
        alert = NotificationService.evaluate_product_low_stock(product)
        assert alert is not None
        assert alert.severity == "warning"
        assert alert.title == "Low Stock Warning"
        assert "down to 25 units" in alert.message
        assert Notification.objects.filter(organization=org, resolved_at__isnull=True).count() == 1
        initial_alert_id = alert.id

        # 3. 22 units -> 22% -> Keep existing warning active, no duplicate created
        product.current_stock = Decimal("22.00")
        product.save()
        alert2 = NotificationService.evaluate_product_low_stock(product)
        assert alert2.id == initial_alert_id
        assert Notification.objects.filter(organization=org, resolved_at__isnull=True).count() == 1
        assert alert2.severity == "warning"

        # 4. 20 units -> 20% -> Escalate to Critical
        product.current_stock = Decimal("20.00")
        product.save()
        alert3 = NotificationService.evaluate_product_low_stock(product)
        assert alert3.id == initial_alert_id
        assert alert3.severity == "critical"
        assert alert3.title == "Critical Stock Level"
        assert "critically low: 20 units remaining" in alert3.message
        assert Notification.objects.filter(organization=org, resolved_at__isnull=True).count() == 1

        # 5. 10 units -> 10% -> Keep critical active, no duplicate
        product.current_stock = Decimal("10.00")
        product.save()
        alert4 = NotificationService.evaluate_product_low_stock(product)
        assert alert4.id == initial_alert_id
        assert alert4.severity == "critical"
        assert Notification.objects.filter(organization=org, resolved_at__isnull=True).count() == 1

        # 6. 0 units -> 0% -> Mark as Out of Stock
        product.current_stock = Decimal("0.00")
        product.save()
        alert5 = NotificationService.evaluate_product_low_stock(product)
        assert alert5.id == initial_alert_id
        assert alert5.severity == "critical"
        assert alert5.title == "Product Out of Stock"
        assert "completely out of stock" in alert5.message
        assert Notification.objects.filter(organization=org, resolved_at__isnull=True).count() == 1

    def test_hysteresis_and_recovery_resolution(self, org_and_users):
        """
        Tests hysteresis recovery:
        - When stock is at 28% (between 25% and 30%), the alert remains active.
        - When stock reaches 30% or more (e.g. 50%), the active alert is resolved.
        - Subsequent drop to 25% creates a fresh alert episode.
        """
        org = org_and_users["org"]
        category = org_and_users["category"]

        product = Product.objects.create(
            organization=org,
            name="Mechanical Keyboard",
            sku="MK-001",
            selling_price=Decimal("2500.00"),
            current_stock=Decimal("15.00"),  # 15% -> Critical
            baseline_stock=Decimal("100.00"),
            category=category,
            track_inventory=True,
        )

        alert = NotificationService.evaluate_product_low_stock(product)
        assert alert.severity == "critical"
        assert alert.resolved_at is None

        # Stock increases to 28% (above 25% warning, but below 30% hysteresis recovery)
        product.current_stock = Decimal("28.00")
        product.save()
        alert_h = NotificationService.evaluate_product_low_stock(product)
        assert alert_h is not None
        assert alert_h.resolved_at is None  # Still active due to hysteresis!

        # Stock replenished to 50 units (50% >= 30% recovery threshold)
        product.current_stock = Decimal("50.00")
        product.save()
        res = NotificationService.evaluate_product_low_stock(product)
        assert res is None  # Active alert resolved

        alert.refresh_from_db()
        assert alert.resolved_at is not None

        # Restored notification should have been emitted
        restored = Notification.objects.filter(
            organization=org,
            title="Stock Level Restored",
            severity="success",
        ).first()
        assert restored is not None
        assert "replenished to 50 units" in restored.message

        # Now if stock drops again to 25%, a fresh alert episode is generated
        product.current_stock = Decimal("25.00")
        product.save()
        fresh_alert = NotificationService.evaluate_product_low_stock(product)
        assert fresh_alert is not None
        assert fresh_alert.id != alert.id
        assert fresh_alert.resolved_at is None
        assert fresh_alert.severity == "warning"

    def test_reconcile_management_command(self, org_and_users):
        from django.core.management import call_command
        from io import StringIO

        org = org_and_users["org"]
        category = org_and_users["category"]

        Product.objects.create(
            organization=org,
            name="Reconcile Item",
            sku="REC-001",
            selling_price=Decimal("100.00"),
            current_stock=Decimal("10.00"),
            baseline_stock=Decimal("100.00"),
            category=category,
            track_inventory=True,
        )

        out = StringIO()
        call_command("reconcile_low_stock", organization_id=str(org.id), stdout=out)
        output = out.getvalue()
        assert "Reconciliation completed successfully" in output

        alert = Notification.objects.filter(organization=org, title="Critical Stock Level").first()
        assert alert is not None
        assert alert.severity == "critical"

    def test_api_endpoints_and_authorization(self, org_and_users):
        org = org_and_users["org"]
        admin = org_and_users["admin"]
        staff = org_and_users["staff"]

        # Create notifications with different audiences
        n_all = Notification.objects.create(
            organization=org,
            category="inventory",
            severity="warning",
            title="All Staff Notification",
            message="Visible to all",
            audience="all",
        )
        n_admin = Notification.objects.create(
            organization=org,
            category="system",
            severity="critical",
            title="Admin Only Security Event",
            message="Only for administrators",
            audience="admin",
        )

        # 1. Staff client can only see audience="all" or "staff"
        client_staff = APIClient()
        client_staff.force_authenticate(user=staff)

        res_staff = client_staff.get("/api/v1/notifications/")
        assert res_staff.status_code == 200
        staff_titles = [n["title"] for n in res_staff.data["results"]]
        assert "All Staff Notification" in staff_titles
        assert "Admin Only Security Event" not in staff_titles

        # Staff summary counts only permitted items
        res_summary_staff = client_staff.get("/api/v1/notifications/summary/")
        assert res_summary_staff.status_code == 200
        assert res_summary_staff.data["total"] == 1
        assert res_summary_staff.data["critical"] == 0

        # 2. Admin client sees both
        client_admin = APIClient()
        client_admin.force_authenticate(user=admin)

        res_admin = client_admin.get("/api/v1/notifications/")
        assert res_admin.status_code == 200
        admin_titles = [n["title"] for n in res_admin.data["results"]]
        assert "All Staff Notification" in admin_titles
        assert "Admin Only Security Event" in admin_titles

        res_summary_admin = client_admin.get("/api/v1/notifications/summary/")
        assert res_summary_admin.status_code == 200
        assert res_summary_admin.data["total"] == 2
        assert res_summary_admin.data["critical"] == 1

        # 3. Mark read, mark unread, mark all read, dismiss
        mark_res = client_admin.post(f"/api/v1/notifications/{n_admin.id}/mark-read/")
        assert mark_res.status_code == 200
        assert mark_res.data["is_read"] is True

        unread_res = client_admin.post(f"/api/v1/notifications/{n_admin.id}/mark-unread/")
        assert unread_res.status_code == 200
        assert unread_res.data["is_read"] is False

        mark_all = client_admin.post("/api/v1/notifications/mark-all-read/")
        assert mark_all.status_code == 200
        assert mark_all.data["marked_read_count"] == 2

        # Dismiss notification
        dismiss_res = client_admin.post(f"/api/v1/notifications/{n_admin.id}/dismiss/")
        assert dismiss_res.status_code == 200
        assert dismiss_res.data["is_dismissed"] is True

        # Dismissed notification does not appear in normal list
        res_after = client_admin.get("/api/v1/notifications/")
        after_titles = [n["title"] for n in res_after.data["results"]]
        assert "Admin Only Security Event" not in after_titles

    def test_checkout_triggers_sale_and_low_stock_notifications(self, org_and_users):
        from apps.billing.services.checkout_service import CheckoutService

        org = org_and_users["org"]
        store = org_and_users["store"]
        admin = org_and_users["admin"]
        category = org_and_users["category"]

        product = Product.objects.create(
            organization=org,
            name="Checkout Fast Sale Item",
            sku="CFS-001",
            selling_price=Decimal("150.00"),
            current_stock=Decimal("30.00"),
            baseline_stock=Decimal("100.00"),
            category=category,
            track_inventory=True,
        )

        cart_data = {
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 10,  # stock drops from 30 to 20 (20% -> Critical!)
                    "selling_price": 150.00,
                }
            ],
            "payments": [
                {
                    "payment_method": "cash",
                    "amount": 1500.00,
                }
            ],
        }

        # 1. Execute checkout
        resp = CheckoutService.process_checkout(
            organization=org,
            store=store,
            user=admin,
            cart_data=cart_data,
            idempotency_key="TEST-CHECKOUT-IDEMP-001",
        )
        assert resp["invoice_number"] is not None

        # Verify sale notification created
        sale_n = Notification.objects.filter(
            organization=org,
            category="sales",
            related_entity_id=resp["invoice_number"],
        ).first()
        assert sale_n is not None
        assert "Sale Completed" in sale_n.title

        # Verify low-stock notification created via checkout inventory deduction
        low_stock_n = Notification.objects.filter(
            organization=org,
            category="inventory",
            related_entity_id=str(product.id),
            resolved_at__isnull=True,
        ).first()
        assert low_stock_n is not None
        assert low_stock_n.severity == "critical"
        assert "critically low: 20 units remaining" in low_stock_n.message

        # 2. Idempotency replay with same key must return existing response and not duplicate notifications
        notif_count_before = Notification.objects.filter(organization=org).count()
        resp2 = CheckoutService.process_checkout(
            organization=org,
            store=store,
            user=admin,
            cart_data=cart_data,
            idempotency_key="TEST-CHECKOUT-IDEMP-001",
        )
        assert resp2["invoice_number"] == resp["invoice_number"]
        assert Notification.objects.filter(organization=org).count() == notif_count_before

