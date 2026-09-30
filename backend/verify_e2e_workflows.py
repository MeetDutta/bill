import os
import sys
import django
import uuid
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "True"
django.setup()

from rest_framework.test import APIClient
from rest_framework import status
from apps.organizations.models import Organization
from apps.users.models import User
from apps.stores.models import Store
from apps.customers.models import Customer, CustomerTimeline
from apps.products.models import Product
from apps.transactions.models import Transaction, TransactionItem
from apps.invoices.models import Invoice
from apps.loyalty.models import LoyaltyAccount, LoyaltyRule, LoyaltyTransaction
from apps.coupons.models import Coupon, CouponRedemption
from apps.whatsapp.models import WhatsAppConfig, WhatsAppMessage

results = {}

def record_result(flow_name: str, passed: bool, message: str = ""):
    results[flow_name] = {"passed": passed, "message": message}
    symbol = "✅ PASS" if passed else "❌ FAIL"
    print(f"[{symbol}] {flow_name}: {message}")


def run_e2e_audit():
    print("=" * 80)
    print("STARTING COMPLETE END-TO-END BUSINESS WORKFLOW VERIFICATION")
    print("=" * 80)

    client = APIClient()

    # -------------------------------------------------------------
    # FLOW A: NEW BUSINESS REGISTRATION & AUTHENTICATION
    # -------------------------------------------------------------
    email = f"owner_{uuid.uuid4().hex[:6]}@apexretail.com"
    reg_payload = {
        "email": email,
        "password": "SecurePassword@123",
        "first_name": "Rajesh",
        "last_name": "Kumar",
        "organization_name": "Apex Supermarkets",
    }
    reg_res = client.post("/api/v1/auth/register/", reg_payload, format="json")
    if reg_res.status_code == status.HTTP_201_CREATED and "access" in reg_res.data and "refresh" in reg_res.data:
        access_token = reg_res.data["access"]
        refresh_token = reg_res.data["refresh"]
        user_id = reg_res.data["user"]["id"]
        org_id = reg_res.data["user"]["organization"]

        # Authenticate client with access token
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        # Test profile endpoint
        prof_res = client.get("/api/v1/auth/profile/")
        prof_ok = prof_res.status_code == status.HTTP_200_OK and prof_res.data["email"] == email

        # Test token refresh endpoint
        ref_client = APIClient()
        ref_res = ref_client.post("/api/v1/auth/refresh/", {"refresh": refresh_token}, format="json")
        ref_ok = ref_res.status_code == status.HTTP_200_OK and "access" in ref_res.data

        record_result("FLOW A - Registration & Auth", prof_ok and ref_ok, f"Registered user {email}, org {org_id}, token refresh verified")
    else:
        record_result("FLOW A - Registration & Auth", False, f"Failed registration: {reg_res.data}")
        return results

    org = Organization.objects.get(id=org_id)
    org.gst_number = "27AABCU9603R1ZM"
    org.city = "Mumbai"
    org.state = "Maharashtra"
    org.currency = "INR"
    org.save()

    # -------------------------------------------------------------
    # FLOW B: STORE CREATION
    # -------------------------------------------------------------
    store_payload = {
        "name": "Apex Bandra Flagship",
        "code": "STORE001",
        "address_line1": "Hill Road, Bandra West",
        "city": "Mumbai",
        "state": "Maharashtra",
        "postal_code": "400050",
        "phone": "02226401122",
        "status": "active",
    }
    store_res = client.post("/api/v1/stores/", store_payload, format="json")
    if store_res.status_code == status.HTTP_201_CREATED:
        store_id = store_res.data["id"]
        store = Store.objects.get(id=store_id)
        store_ok = store.organization_id == org.id and store.code == "STORE001"
        record_result("FLOW B - Store Creation", store_ok, f"Created store {store.name} scoped to org {org.name}")
    else:
        record_result("FLOW B - Store Creation", False, f"Failed store creation: {store_res.data}")

    # -------------------------------------------------------------
    # FLOW C: CUSTOMER CREATION
    # -------------------------------------------------------------
    cust_payload = {
        "first_name": "Aditi",
        "last_name": "Sharma",
        "phone": "+91 98765 43210",
        "email": "aditi.sharma@example.com",
    }
    cust_res = client.post("/api/v1/customers/", cust_payload, format="json")
    if cust_res.status_code == status.HTTP_201_CREATED:
        cust_id = cust_res.data["id"]
        customer = Customer.objects.get(id=cust_id)
        has_id = bool(customer.customer_id) and customer.customer_id.startswith("CUS-")
        has_loyalty = LoyaltyAccount.objects.filter(customer=customer, organization=org).exists()
        has_timeline = CustomerTimeline.objects.filter(customer=customer, event_type="created").exists()
        phone_normalized = customer.phone == "9876543210"

        cust_ok = has_id and has_loyalty and has_timeline and phone_normalized
        record_result(
            "FLOW C - Customer Creation",
            cust_ok,
            f"Customer ID {customer.customer_id}, phone normalized to {customer.phone}, loyalty account and timeline created",
        )
    else:
        record_result("FLOW C - Customer Creation", False, f"Failed customer creation: {cust_res.data}")

    # -------------------------------------------------------------
    # FLOW D: PRODUCT CREATION
    # -------------------------------------------------------------
    prod_payload = {
        "name": "Organic Almond Milk 1L",
        "sku": "SKU-OAM-01",
        "barcode": "8901234567890",
        "unit_price": "350.00",
        "cost_price": "220.00",
        "tax_rate": "18.00",
        "hsn_code": "0402",
        "is_active": True,
    }
    prod_res = client.post("/api/v1/products/", prod_payload, format="json")
    if prod_res.status_code == status.HTTP_201_CREATED:
        prod_id = prod_res.data["id"]
        product = Product.objects.get(id=prod_id)
        prod_ok = product.organization_id == org.id and product.unit_price == Decimal("350.00")
        record_result("FLOW D - Product Creation", prod_ok, f"Product {product.name} created at ₹{product.unit_price}")
    else:
        record_result("FLOW D - Product Creation", False, f"Failed product creation: {prod_res.data}")

    # Setup loyalty earn rule for testing
    LoyaltyRule.objects.create(
        organization=org,
        name="Standard Spend Rule",
        rule_type="earn_purchase",
        min_transaction_amount=Decimal("100"),
        per_amount=Decimal("100"),
        points=10,
        is_active=True,
    )

    # -------------------------------------------------------------
    # FLOW E: EXACT SPEC TRANSACTION INGESTION & PIPELINE
    # -------------------------------------------------------------
    txn_payload = {
        "store_id": "STORE001",
        "invoice_number": "INV-TEST-001",
        "transaction_date": "2026-09-29T12:00:00Z",
        "customer": {
            "name": "Test Customer",
            "phone": "9876543210",
        },
        "items": [
            {
                "external_product_id": "P001",
                "name": "Test Product",
                "quantity": 2,
                "unit_price": 500,
                "discount": 0,
                "tax": 180,
                "total": 1180,
            }
        ],
        "subtotal": 1000,
        "discount": 0,
        "tax": 180,
        "total": 1180,
        "payment_method": "UPI",
        "external_source": "TEST_POS",
        "external_transaction_id": "TEST-TXN-001",
    }

    txn_res = client.post("/api/v1/transactions/ingest/", txn_payload, format="json")
    if txn_res.status_code == status.HTTP_201_CREATED:
        tx_id = txn_res.data["id"]
        tx = Transaction.objects.get(id=tx_id)
        tx_ok = (
            tx.organization == org
            and tx.subtotal == Decimal("1000.00")
            and tx.total == Decimal("1180.00")
            and tx.items.count() == 1
        )

        # Check invoice generation
        invoice = Invoice.objects.filter(transaction=tx).first()
        inv_ok = invoice is not None and bool(invoice.secure_token)

        # Check loyalty calculation
        account = LoyaltyAccount.objects.get(customer=tx.customer, organization=org)
        loyalty_ok = account.balance > 0

        # Check digital bill public view
        unauth_client = APIClient()
        bill_res = unauth_client.get(f"/api/v1/invoices/view/{invoice.secure_token}/")
        bill_ok = (
            bill_res.status_code == status.HTTP_200_OK
            and bill_res.data["total"] == "1180.00"
            and bill_res.data["business"]["name"] == org.name
            and len(bill_res.data["items"]) == 1
        )

        all_e_ok = tx_ok and inv_ok and loyalty_ok and bill_ok
        record_result(
            "FLOW E - Transaction Pipeline",
            all_e_ok,
            f"Transaction saved, Invoice {invoice.invoice_number} created with token, loyalty points={account.balance}, public bill rendered",
        )
    else:
        record_result("FLOW E - Transaction Pipeline", False, f"Transaction ingest failed: {txn_res.data}")

    # -------------------------------------------------------------
    # FLOW 44: TRANSACTION IDEMPOTENCY
    # -------------------------------------------------------------
    # Send the exact same transaction TEST-TXN-001 5 times
    initial_tx_count = Transaction.objects.filter(organization=org, external_transaction_id="TEST-TXN-001").count()
    initial_inv_count = Invoice.objects.filter(organization=org, invoice_number__contains="INV-TEST-001").count()
    initial_loyalty = LoyaltyAccount.objects.get(customer__phone="9876543210", organization=org).balance

    for i in range(5):
        idempotent_res = client.post("/api/v1/transactions/ingest/", txn_payload, format="json")
        if idempotent_res.status_code not in [status.HTTP_200_OK, status.HTTP_201_CREATED]:
            record_result("FLOW 44 - Idempotency", False, f"Failed on iteration {i}: {idempotent_res.data}")
            break

    final_tx_count = Transaction.objects.filter(organization=org, external_transaction_id="TEST-TXN-001").count()
    final_inv_count = Invoice.objects.filter(organization=org, invoice_number__contains="INV-TEST-001").count()
    final_loyalty = LoyaltyAccount.objects.get(customer__phone="9876543210", organization=org).balance

    idempotency_ok = (
        final_tx_count == 1
        and final_inv_count == 1
        and final_loyalty == initial_loyalty
    )
    record_result(
        "FLOW 44 - Idempotency",
        idempotency_ok,
        f"5 duplicate requests resulted in exactly 1 transaction, 1 invoice, and 0 duplicate loyalty points",
    )

    # -------------------------------------------------------------
    # FLOW 45: COUPON SYSTEM & ATOMIC REDEMPTION
    # -------------------------------------------------------------
    from django.utils import timezone
    from datetime import timedelta

    coupon = Coupon.objects.create(
        organization=org,
        code="WELCOME100",
        name="Welcome Discount",
        discount_type="fixed",
        discount_value=Decimal("100"),
        min_order_value=Decimal("500"),
        start_at=timezone.now() - timedelta(days=1),
        expires_at=timezone.now() + timedelta(days=30),
        usage_limit=1,
        per_customer_limit=1,
        is_active=True,
    )

    # 1. Test case-insensitive validation
    val_res = client.post("/api/v1/coupons/validate/", {"code": "welcome100", "order_value": "600"}, format="json")
    val_ok = val_res.status_code == status.HTTP_200_OK and val_res.data["valid"] is True

    # 2. Test min order value enforcement
    val_min_res = client.post("/api/v1/coupons/validate/", {"code": "WELCOME100", "order_value": "400"}, format="json")
    min_ok = val_min_res.status_code == status.HTTP_400_BAD_REQUEST

    # 3. Test successful redemption
    cust = Customer.objects.get(organization=org, phone="9876543210")
    red_res1 = client.post("/api/v1/coupons/redeem/", {
        "code": "welcome100",
        "customer_id": str(cust.id),
        "order_value": "600",
    }, format="json")
    red1_ok = red_res1.status_code == status.HTTP_200_OK

    # 4. Test usage limit / duplicate redemption rejection
    red_res2 = client.post("/api/v1/coupons/redeem/", {
        "code": "welcome100",
        "customer_id": str(cust.id),
        "order_value": "600",
    }, format="json")
    red2_rejected = red_res2.status_code == status.HTTP_400_BAD_REQUEST

    coupon_ok = val_ok and min_ok and red1_ok and red2_rejected
    record_result(
        "FLOW 45 - Coupon System",
        coupon_ok,
        "Case-insensitive validation, min order enforcement, successful redemption, and usage limit rejection passed",
    )

    # -------------------------------------------------------------
    # FLOW 46: TENANT ISOLATION
    # -------------------------------------------------------------
    org_b = Organization.objects.create(name="Competitor Retail")
    user_b = User.objects.create_user(
        email=f"user_b_{uuid.uuid4().hex[:4]}@competitor.com",
        password="Password@123",
        organization=org_b,
        first_name="Alice",
    )
    store_b = Store.objects.create(organization=org_b, name="Competitor Store", code="COMP01")

    # Client is authenticated as Org A (Rajesh)
    # Attempt 1: Org A requests Org B store
    idor_store = client.get(f"/api/v1/stores/{store_b.id}/")
    idor_store_blocked = idor_store.status_code == status.HTTP_404_NOT_FOUND

    # Attempt 2: Org B client attempts to access Org A transaction
    client_b = APIClient()
    client_b.force_authenticate(user=user_b)
    idor_tx = client_b.get(f"/api/v1/transactions/{tx.id}/")
    idor_tx_blocked = idor_tx.status_code == status.HTTP_404_NOT_FOUND

    # Attempt 3: Org B attempts to access Org A coupon
    idor_coupon = client_b.get(f"/api/v1/coupons/{coupon.id}/")
    idor_coupon_blocked = idor_coupon.status_code == status.HTTP_404_NOT_FOUND

    # Attempt 4: Org B attempts to validate Org A coupon
    idor_val = client_b.post("/api/v1/coupons/validate/", {"code": "WELCOME100", "order_value": 1000}, format="json")
    idor_val_blocked = idor_val.status_code == status.HTTP_400_BAD_REQUEST

    tenant_ok = idor_store_blocked and idor_tx_blocked and idor_coupon_blocked and idor_val_blocked
    record_result(
        "FLOW 46 - Tenant Isolation",
        tenant_ok,
        "Cross-organization requests across stores, transactions, and coupons strictly blocked with 404/400",
    )

    # -------------------------------------------------------------
    # FLOW 47: FAILURE & RESILIENCE TESTING
    # -------------------------------------------------------------
    # Invalid API requests
    invalid_req = client.post("/api/v1/transactions/ingest/", {"bad": "data"}, format="json")
    fail_bad_req = invalid_req.status_code == status.HTTP_400_BAD_REQUEST

    # Duplicate phone in same organization rejected
    dup_phone_res = client.post("/api/v1/customers/", {
        "first_name": "Duplicate",
        "phone": "9876543210",
    }, format="json")
    fail_dup_phone = dup_phone_res.status_code == status.HTTP_400_BAD_REQUEST

    failure_ok = fail_bad_req and fail_dup_phone
    record_result(
        "FLOW 47 - Failure Testing",
        failure_ok,
        "Malformed payloads and duplicate phone numbers handled cleanly with standard 400 validation responses",
    )

    print("=" * 80)
    all_passed = all(r["passed"] for r in results.values())
    if all_passed:
        print("🎉 ALL END-TO-END WORKFLOWS PASSED WITH 100% INTEGRITY!")
    else:
        print("⚠️ SOME WORKFLOWS FAILED")
    print("=" * 80)
    return results

if __name__ == "__main__":
    run_e2e_audit()
