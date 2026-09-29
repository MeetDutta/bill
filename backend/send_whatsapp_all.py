import os
import django
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.organizations.models import Organization
from apps.customers.models import Customer
from apps.coupons.models import Coupon
from apps.whatsapp.service import send_digital_bill_task, send_coupon_task
from apps.whatsapp.models import WhatsAppConfig

def send_all(new_token=None):
    org = Organization.objects.first()
    if new_token:
        config, _ = WhatsAppConfig.objects.get_or_create(organization=org)
        config.access_token = new_token.strip()
        config.is_active = True
        config.save()
        print("Updated WhatsApp token in database.")

    numbers = ["8010858983", "9322520275"]
    print(f"=== Sending WhatsApp Digital Bills and Coupons to {numbers} ===")
    
    for phone in numbers:
        cust = Customer.objects.filter(phone=phone, organization=org).first()
        if not cust:
            print(f"[-] Customer not found for {phone}")
            continue

        # 1. Send Bill
        tx = cust.transactions.first()
        if tx:
            print(f"\n[+] Dispatching Digital Bill to {cust.first_name} ({phone}) for Invoice {tx.invoice_number}...")
            res = send_digital_bill_task(str(tx.id))
            print(f"    Result: {res}")
        else:
            print(f"[-] No transaction for {phone}")

        # 2. Send Coupon
        coupons = Coupon.objects.filter(organization=org, is_active=True)[:2]
        for cp in coupons:
            print(f"[+] Dispatching Coupon '{cp.code}' to {cust.first_name} ({phone})...")
            c_res = send_coupon_task(str(cp.id), str(cust.id))
            print(f"    Result: {c_res}")

if __name__ == "__main__":
    token = sys.argv[1] if len(sys.argv) > 1 else None
    send_all(token)
