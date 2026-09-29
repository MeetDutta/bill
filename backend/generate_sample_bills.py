import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

import uuid
from decimal import Decimal
from django.utils import timezone
from apps.organizations.models import Organization
from apps.users.models import User
from apps.stores.models import Store
from apps.customers.models import Customer, CustomerTimeline
from apps.products.models import ProductCategory, Product
from apps.transactions.models import Transaction, TransactionItem
from apps.invoices.models import Invoice
from apps.loyalty.models import LoyaltyAccount, LoyaltyRule, LoyaltyTransaction

def run_seed():
    print("--- Starting Sample Data Generation ---")
    
    # 1. Organization
    org = Organization.objects.first()
    if not org:
        org = Organization.objects.create(
            name="Apex Retail Hub",
            legal_name="Apex Retail Hub Private Limited",
            city="Mumbai",
            state="Maharashtra",
            country="IN",
            currency="INR",
            gst_number="27AABCU9603R1ZM",
        )
        print(f"Created organization: {org.name}")
    else:
        org.name = "Apex Retail Hub"
        org.city = "Mumbai"
        org.state = "Maharashtra"
        org.currency = "INR"
        org.gst_number = "27AABCU9603R1ZM"
        org.save()
        print(f"Using organization: {org.name}")

    # Ensure all users are linked to this org
    for user in User.objects.all():
        if not user.organization:
            user.organization = org
            user.save(update_fields=["organization"])
            print(f"Linked user {user.email} to {org.name}")

    # 2. Stores
    store1, _ = Store.objects.get_or_create(
        organization=org,
        code="STORE001",
        defaults={
            "name": "Flagship Store - Bandra",
            "address_line1": "Plot 42, Linking Road, Bandra West",
            "city": "Mumbai",
            "state": "Maharashtra",
            "postal_code": "400050",
            "phone": "+91 9820011223",
            "whatsapp_number": "+91 9820011223",
            "status": "active",
        }
    )
    store2, _ = Store.objects.get_or_create(
        organization=org,
        code="STORE002",
        defaults={
            "name": "High Street Mall - Lower Parel",
            "address_line1": "Shop 104, High Street Phoenix, Lower Parel",
            "city": "Mumbai",
            "state": "Maharashtra",
            "postal_code": "400013",
            "phone": "+91 9820044556",
            "whatsapp_number": "+91 9820044556",
            "status": "active",
        }
    )
    print(f"Configured stores: {store1.name}, {store2.name}")

    # 3. Loyalty Rule
    rule, _ = LoyaltyRule.objects.get_or_create(
        organization=org,
        name="Standard Shopping Cashback",
        defaults={
            "rule_type": "earn_purchase",
            "points": Decimal("10.00"),
            "per_amount": Decimal("100.00"),
            "min_transaction_amount": Decimal("100.00"),
            "is_active": True,
        }
    )
    print(f"Configured loyalty rule: {rule.name}")

    # 4. Product Categories & Products
    cat_apparel, _ = ProductCategory.objects.get_or_create(organization=org, name="Apparel")
    cat_footwear, _ = ProductCategory.objects.get_or_create(organization=org, name="Footwear")
    cat_accessories, _ = ProductCategory.objects.get_or_create(organization=org, name="Accessories")
    cat_electronics, _ = ProductCategory.objects.get_or_create(organization=org, name="Electronics")

    products_data = [
        {"name": "Classic Oxford Cotton Shirt", "sku": "SHT-001", "external_id": "P001", "cat": cat_apparel, "price": Decimal("1499.00"), "tax": Decimal("12.0")},
        {"name": "Slim Fit Denim Jeans", "sku": "JNS-002", "external_id": "P002", "cat": cat_apparel, "price": Decimal("2499.00"), "tax": Decimal("12.0")},
        {"name": "Air Comfort Running Shoes", "sku": "SHO-003", "external_id": "P003", "cat": cat_footwear, "price": Decimal("3999.00"), "tax": Decimal("18.0")},
        {"name": "Leather Bi-fold Wallet", "sku": "ACC-004", "external_id": "P004", "cat": cat_accessories, "price": Decimal("899.00"), "tax": Decimal("18.0")},
        {"name": "Wireless ANC Earbuds", "sku": "ELE-005", "external_id": "P005", "cat": cat_electronics, "price": Decimal("4499.00"), "tax": Decimal("18.0")},
        {"name": "Casual Linen Summer Blazer", "sku": "BLZ-006", "external_id": "P006", "cat": cat_apparel, "price": Decimal("5999.00"), "tax": Decimal("12.0")},
    ]

    product_map = {}
    for p_info in products_data:
        prod, _ = Product.objects.get_or_create(
            organization=org,
            external_id=p_info["external_id"],
            defaults={
                "name": p_info["name"],
                "sku": p_info["sku"],
                "category": p_info["cat"],
                "unit_price": p_info["price"],
                "tax_rate": p_info["tax"],
                "is_active": True,
            }
        )
        product_map[p_info["external_id"]] = prod
    print(f"Loaded {len(product_map)} products.")

    # 5. Customers
    customers_data = [
        {"first_name": "Rahul", "last_name": "Sharma", "phone": "+919820112233", "email": "rahul.sharma@example.com", "city": "Mumbai", "store": store1},
        {"first_name": "Priya", "last_name": "Patel", "phone": "+919876543210", "email": "priya.patel@example.com", "city": "Mumbai", "store": store2},
        {"first_name": "Ananya", "last_name": "Roy", "phone": "+919811223344", "email": "ananya.roy@example.com", "city": "Pune", "store": store1},
        {"first_name": "Vikram", "last_name": "Malhotra", "phone": "+919899001122", "email": "vikram.m@example.com", "city": "Delhi", "store": store2},
        {"first_name": "Sneha", "last_name": "Kulkarni", "phone": "+919766554433", "email": "sneha.k@example.com", "city": "Bangalore", "store": store1},
    ]

    customer_map = {}
    for c_info in customers_data:
        cust, created = Customer.objects.get_or_create(
            organization=org,
            phone=c_info["phone"],
            defaults={
                "customer_id": f"CUST-{uuid.uuid4().hex[:8].upper()}",
                "first_name": c_info["first_name"],
                "last_name": c_info["last_name"],
                "email": c_info["email"],
                "city": c_info["city"],
                "preferred_store": c_info["store"],
                "source": "pos",
                "segment": "Frequent Shopper",
            }
        )
        # Ensure loyalty account exists
        LoyaltyAccount.objects.get_or_create(
            organization=org,
            customer=cust,
            defaults={"balance": 0, "total_earned": 0, "total_redeemed": 0}
        )
        customer_map[c_info["phone"]] = cust
    print(f"Loaded {len(customer_map)} customers.")

    # 6. Sample Bills (Transactions)
    bills_specs = [
        {
            "invoice_number": "INV-2026-001",
            "external_id": "TXN-1001",
            "customer_phone": "+919820112233",
            "store": store1,
            "payment_method": "UPI (Google Pay)",
            "items": [
                {"prod": "P001", "qty": Decimal("2"), "discount": Decimal("100.00")},
                {"prod": "P004", "qty": Decimal("1"), "discount": Decimal("50.00")},
            ],
            "discount": Decimal("150.00"),
        },
        {
            "invoice_number": "INV-2026-002",
            "external_id": "TXN-1002",
            "customer_phone": "+919876543210",
            "store": store2,
            "payment_method": "Credit Card (HDFC)",
            "items": [
                {"prod": "P003", "qty": Decimal("1"), "discount": Decimal("200.00")},
                {"prod": "P002", "qty": Decimal("1"), "discount": Decimal("150.00")},
            ],
            "discount": Decimal("350.00"),
        },
        {
            "invoice_number": "INV-2026-003",
            "external_id": "TXN-1003",
            "customer_phone": "+919811223344",
            "store": store1,
            "payment_method": "UPI (PhonePe)",
            "items": [
                {"prod": "P006", "qty": Decimal("1"), "discount": Decimal("500.00")},
                {"prod": "P001", "qty": Decimal("1"), "discount": Decimal("100.00")},
            ],
            "discount": Decimal("600.00"),
        },
        {
            "invoice_number": "INV-2026-004",
            "external_id": "TXN-1004",
            "customer_phone": "+919899001122",
            "store": store2,
            "payment_method": "Debit Card (ICICI)",
            "items": [
                {"prod": "P005", "qty": Decimal("1"), "discount": Decimal("300.00")},
                {"prod": "P004", "qty": Decimal("1"), "discount": Decimal("0.00")},
            ],
            "discount": Decimal("300.00"),
        },
        {
            "invoice_number": "INV-2026-005",
            "external_id": "TXN-1005",
            "customer_phone": "+919766554433",
            "store": store1,
            "payment_method": "Cash",
            "items": [
                {"prod": "P002", "qty": Decimal("2"), "discount": Decimal("200.00")},
            ],
            "discount": Decimal("200.00"),
        },
        {
            "invoice_number": "INV-2026-006",
            "external_id": "TXN-1006",
            "customer_phone": "+919820112233", # Rahul Sharma repeat purchase
            "store": store1,
            "payment_method": "UPI (Google Pay)",
            "items": [
                {"prod": "P003", "qty": Decimal("1"), "discount": Decimal("100.00")},
                {"prod": "P005", "qty": Decimal("1"), "discount": Decimal("200.00")},
            ],
            "discount": Decimal("300.00"),
        },
    ]

    created_invoices = []

    for spec in bills_specs:
        if Transaction.objects.filter(organization=org, external_transaction_id=spec["external_id"]).exists():
            print(f"Skipping {spec['invoice_number']} (already exists)")
            continue

        customer = customer_map[spec["customer_phone"]]
        
        # Calculate totals
        subtotal = Decimal("0.00")
        tax_total = Decimal("0.00")
        items_to_create = []

        for item_spec in spec["items"]:
            prod = product_map[item_spec["prod"]]
            qty = item_spec["qty"]
            unit_price = prod.unit_price
            item_disc = item_spec["discount"]
            item_sub = (unit_price * qty) - item_disc
            item_tax = (item_sub * (prod.tax_rate / Decimal("100.0"))).quantize(Decimal("0.01"))
            item_total = item_sub + item_tax

            subtotal += unit_price * qty
            tax_total += item_tax

            items_to_create.append({
                "product": prod,
                "name": prod.name,
                "quantity": qty,
                "unit_price": unit_price,
                "discount": item_disc,
                "tax": item_tax,
                "total": item_total,
                "hsn_code": prod.hsn_code or "6205",
            })

        overall_discount = spec["discount"]
        grand_total = (subtotal - overall_discount + tax_total).quantize(Decimal("0.01"))

        # Loyalty points: 10 points per 100 spent
        points_earned = int((grand_total / Decimal("100.0")) * 10)

        # Create Transaction
        tx = Transaction.objects.create(
            organization=org,
            store=spec["store"],
            customer=customer,
            invoice_number=spec["invoice_number"],
            transaction_date=timezone.now(),
            status="completed",
            subtotal=subtotal,
            discount=overall_discount,
            tax=tax_total,
            total=grand_total,
            payment_method=spec["payment_method"],
            external_source="POS_INTEGRATION",
            external_transaction_id=spec["external_id"],
            loyalty_points_earned=points_earned,
            bill_sent=True,
            bill_sent_at=timezone.now(),
        )

        for it in items_to_create:
            TransactionItem.objects.create(
                transaction=tx,
                product=it["product"],
                external_product_id=it["product"].external_id,
                name=it["name"],
                quantity=it["quantity"],
                unit_price=it["unit_price"],
                discount=it["discount"],
                tax=it["tax"],
                total=it["total"],
                hsn_code=it["hsn_code"],
            )

        # Update Customer CRM Stats
        customer.update_stats(grand_total)

        # Customer Timeline
        CustomerTimeline.objects.create(
            organization=org,
            customer=customer,
            event_type="purchase" if customer.total_purchases == 1 else "repeat_purchase",
            reference_id=str(tx.id),
            metadata={"invoice_number": tx.invoice_number, "total": str(tx.total), "store": spec["store"].name},
        )

        # Credit Loyalty Account
        loyalty_acct, _ = LoyaltyAccount.objects.get_or_create(organization=org, customer=customer)
        loyalty_acct.balance += Decimal(points_earned)
        loyalty_acct.total_earned += Decimal(points_earned)
        loyalty_acct.save()

        LoyaltyTransaction.objects.create(
            organization=org,
            loyalty_account=loyalty_acct,
            transaction_type="earn",
            points=Decimal(points_earned),
            balance_after=loyalty_acct.balance,
            rule=rule,
            description=f"Earned on purchase #{tx.invoice_number}",
            reference_type="transaction",
            reference_id=str(tx.id),
        )

        # Generate Digital Invoice
        secure_token = uuid.uuid4().hex
        inv_number = f"INV-{timezone.now().strftime('%Y%m')}-{tx.invoice_number}"
        invoice = Invoice.objects.create(
            organization=org,
            transaction=tx,
            invoice_number=inv_number,
            secure_token=secure_token,
            web_url=f"/bills/{secure_token}",
            is_viewed=False,
        )
        created_invoices.append(invoice)
        print(f"Generated Bill: {tx.invoice_number} | Amount: ₹{tx.total} | Customer: {customer.first_name} {customer.last_name} | Token: {secure_token}")

    print(f"\n--- Completed! Successfully created {len(created_invoices)} new sample digital bills! ---")

if __name__ == "__main__":
    run_seed()
