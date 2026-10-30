import os
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.billing.models import BusinessConfig
from apps.products.models import ProductCategory, Product


class Command(BaseCommand):
    help = "Initializes default organization, stores, business config, superadmin, admin, and cashier credentials for production and local environments."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            type=str,
            default=os.environ.get("DJANGO_SUPERUSER_EMAIL", "superadmin@digitalbill.local"),
            help="Super Admin email address",
        )
        parser.add_argument(
            "--password",
            type=str,
            default=os.environ.get("DJANGO_SUPERUSER_PASSWORD", "SuperAdmin@123456"),
            help="Super Admin password",
        )
        parser.add_argument(
            "--first-name",
            type=str,
            default=os.environ.get("DJANGO_SUPERUSER_FIRST_NAME", "SuperAdmin"),
            help="Super Admin first name",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # 1. Ensure default Organization exists
        org = Organization.objects.first()
        if not org:
            org = Organization.objects.create(
                name="BillMeet Demo Store",
                legal_name="BillMeet Retail Solutions Private Limited",
                city="Mumbai",
                state="Maharashtra",
                country="IN",
                currency="INR",
                gst_number="27ABCDE1234F1Z5",
            )
            self.stdout.write(self.style.SUCCESS(f"Created initial organization: '{org.name}'"))
        else:
            self.stdout.write(self.style.SUCCESS(f"Using existing organization: '{org.name}'"))

        # 2. Ensure default Store exists
        store = Store.objects.filter(organization=org).first()
        if not store:
            store = Store.objects.create(
                organization=org,
                name="Main Counter Store",
                code="STR-MAIN",
                state="Maharashtra",
                city="Mumbai",
                status="active",
            )
            self.stdout.write(self.style.SUCCESS(f"Created default store: '{store.name}' ({store.code})"))

        # 3. Ensure BusinessConfig exists
        biz_config, _ = BusinessConfig.objects.get_or_create(
            organization=org,
            defaults={
                "business_type": "retail",
                "gst_enabled": True,
                "allow_negative_stock": False,
                "credit_sales_enabled": True,
            },
        )

        # 4A. Ensure Dedicated SUPER ADMIN exists
        super_email = (options.get("email") or os.environ.get("DJANGO_SUPER_ADMIN_EMAIL") or os.environ.get("DJANGO_SUPERUSER_EMAIL") or "superadmin@digitalbill.local").strip().lower()
        super_pass = options.get("password") or os.environ.get("DJANGO_SUPER_ADMIN_PASSWORD") or os.environ.get("DJANGO_SUPERUSER_PASSWORD") or "SuperAdmin@123456"
        super_first = (options.get("first_name") or os.environ.get("DJANGO_SUPERUSER_FIRST_NAME") or "SuperAdmin").strip()

        super_user = User.objects.filter(email__iexact=super_email).first()
        if not super_user:
            super_user = User.objects.create(
                email=super_email,
                first_name=super_first,
                last_name="System",
                role="super_admin",
                organization=org,
                is_staff=True,
                is_superuser=True,
                is_active=True,
            )
            super_user.set_password(super_pass)
            super_user.save()
            self.stdout.write(self.style.SUCCESS(f"Successfully created Super Admin user: '{super_email}'"))
        else:
            super_user.organization = org
            super_user.role = "super_admin"
            super_user.is_staff = True
            super_user.is_superuser = True
            super_user.is_active = True
            if super_pass:
                super_user.set_password(super_pass)
            super_user.save()
            self.stdout.write(self.style.SUCCESS(f"Updated and verified Super Admin user: '{super_email}'"))

        # 4B. Ensure Default ADMIN (Merchant / Org Admin) exists
        admin_email = (os.environ.get("DJANGO_ADMIN_EMAIL") or "admin@digitalbill.local").strip().lower()
        admin_pass = os.environ.get("DJANGO_ADMIN_PASSWORD") or "Admin@123456"

        admin_user = User.objects.filter(email__iexact=admin_email).first()
        if not admin_user:
            admin_user = User.objects.create(
                email=admin_email,
                first_name="Admin",
                last_name="Merchant",
                role="org_admin",
                organization=org,
                is_staff=True,
                is_superuser=True,
                is_active=True,
            )
            admin_user.set_password(admin_pass)
            admin_user.save()
            self.stdout.write(self.style.SUCCESS(f"Successfully created Org Admin user: '{admin_email}'"))
        else:
            admin_user.organization = org
            admin_user.role = "org_admin"
            admin_user.is_staff = True
            admin_user.is_superuser = True
            admin_user.is_active = True
            if admin_pass:
                admin_user.set_password(admin_pass)
            admin_user.save()
            self.stdout.write(self.style.SUCCESS(f"Updated and verified Org Admin user: '{admin_email}'"))

        # Attach any orphaned users to org so dashboard doesn't fail
        orphans = User.objects.filter(organization__isnull=True)
        if orphans.exists():
            orphans.update(organization=org)
            self.stdout.write(self.style.SUCCESS(f"Linked {orphans.count()} orphaned user(s) to organization '{org.name}'"))

        # 5. Ensure Cashier / Staff User exists for staff login
        cashier_email = (os.environ.get("DJANGO_CASHIER_EMAIL") or "cashier@digitalbill.local").strip().lower()
        cashier_pass = os.environ.get("DJANGO_CASHIER_PASSWORD") or "Cashier@123456"
        cashier_user = User.objects.filter(email__iexact=cashier_email).first()
        if not cashier_user:
            cashier_user = User.objects.create(
                email=cashier_email,
                first_name="Cashier",
                last_name="Staff",
                role="cashier",
                organization=org,
                is_staff=False,
                is_superuser=False,
                is_active=True,
            )
            cashier_user.set_password(cashier_pass)
            cashier_user.save()
            self.stdout.write(self.style.SUCCESS(f"Successfully created cashier user: '{cashier_email}'"))
        else:
            cashier_user.organization = org
            cashier_user.role = "cashier"
            cashier_user.is_active = True
            if cashier_pass:
                cashier_user.set_password(cashier_pass)
            cashier_user.save()
            self.stdout.write(self.style.SUCCESS(f"Updated and verified cashier user: '{cashier_email}'"))

        # 6. Seed starter product catalog if empty
        if Product.objects.filter(organization=org).count() == 0:
            cat_beverages, _ = ProductCategory.objects.get_or_create(
                organization=org,
                name="Beverages",
            )
            cat_bakery, _ = ProductCategory.objects.get_or_create(
                organization=org,
                name="Bakery & Snacks",
            )

            starter_products = [
                {
                    "name": "Artisanal Cold Brew 250ml",
                    "sku": "BEV-001",
                    "category": cat_beverages,
                    "unit_price": Decimal("180.00"),
                    "cost_price": Decimal("100.00"),
                    "mrp": Decimal("200.00"),
                    "tax_rate": Decimal("18.00"),
                    "hsn_code": "2202",
                    "unit": "pcs",
                    "current_stock": Decimal("50.00"),
                    "baseline_stock": Decimal("50.00"),
                    "min_stock": Decimal("10.00"),
                    "track_inventory": True,
                    "is_active": True,
                },
                {
                    "name": "Organic Green Tea 100g",
                    "sku": "BEV-002",
                    "category": cat_beverages,
                    "unit_price": Decimal("250.00"),
                    "cost_price": Decimal("150.00"),
                    "mrp": Decimal("280.00"),
                    "tax_rate": Decimal("5.00"),
                    "hsn_code": "0902",
                    "unit": "pcs",
                    "current_stock": Decimal("60.00"),
                    "baseline_stock": Decimal("60.00"),
                    "min_stock": Decimal("10.00"),
                    "track_inventory": True,
                    "is_active": True,
                },
                {
                    "name": "Artisan Sourdough Loaf",
                    "sku": "BAK-001",
                    "category": cat_bakery,
                    "unit_price": Decimal("160.00"),
                    "cost_price": Decimal("90.00"),
                    "mrp": Decimal("180.00"),
                    "tax_rate": Decimal("5.00"),
                    "hsn_code": "1905",
                    "unit": "pcs",
                    "current_stock": Decimal("30.00"),
                    "baseline_stock": Decimal("30.00"),
                    "min_stock": Decimal("5.00"),
                    "track_inventory": True,
                    "is_active": True,
                },
            ]

            for p_data in starter_products:
                Product.objects.create(organization=org, **p_data)
            self.stdout.write(self.style.SUCCESS(f"Seeded {len(starter_products)} starter products for POS billing."))

        self.stdout.write(self.style.SUCCESS("All default deployment credentials and stores verified successfully."))
