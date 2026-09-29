import json
from decimal import Decimal

import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone


class WhatsAppService:
    BASE_URL = "https://graph.facebook.com/v18.0"

    def __init__(self, phone_number_id=None, access_token=None):
        self.phone_number_id = phone_number_id or settings.WHATSAPP_PHONE_NUMBER_ID
        self.access_token = access_token or settings.WHATSAPP_ACCESS_TOKEN

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def send_template(self, to, template_name, language="en", components=None):
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
            },
        }
        if components:
            payload["template"]["components"] = components

        url = f"{self.BASE_URL}/{self.phone_number_id}/messages"
        response = requests.post(url, json=payload, headers=self._headers(), timeout=30)
        return response.json()

    def send_text(self, to, text):
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": text},
        }
        url = f"{self.BASE_URL}/{self.phone_number_id}/messages"
        response = requests.post(url, json=payload, headers=self._headers(), timeout=30)
        return response.json()

    def send_document(self, to, document_url, caption=""):
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "document",
            "document": {
                "link": document_url,
                "caption": caption,
            },
        }
        url = f"{self.BASE_URL}/{self.phone_number_id}/messages"
        response = requests.post(url, json=payload, headers=self._headers(), timeout=30)
        return response.json()

    def send_image(self, to, image_url, caption=""):
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "image",
            "image": {
                "link": image_url,
                "caption": caption,
            },
        }
        url = f"{self.BASE_URL}/{self.phone_number_id}/messages"
        response = requests.post(url, json=payload, headers=self._headers(), timeout=30)
        return response.json()


@shared_task(name="apps.whatsapp.tasks.send_digital_bill_task")
def send_digital_bill_task(transaction_id):
    from apps.transactions.models import Transaction
    from apps.invoices.models import Invoice
    from apps.whatsapp.models import WhatsAppMessage

    try:
        tx = Transaction.objects.select_related("customer", "store", "organization").get(id=transaction_id)
    except Transaction.DoesNotExist:
        return {"error": "Transaction not found"}

    if not tx.customer or not tx.customer.phone:
        return {"error": "No customer phone number"}
    if not tx.customer.whatsapp_opt_in:
        return {"error": "Customer opted out of WhatsApp"}

    try:
        invoice = tx.invoice
    except Invoice.DoesNotExist:
        return {"error": "Invoice not found"}

    phone = tx.customer.phone.replace("+", "").replace(" ", "")
    if not phone.startswith("91"):
        phone = f"91{phone}"

    from apps.whatsapp.models import WhatsAppConfig
    try:
        config = WhatsAppConfig.objects.get(organization=tx.organization, is_active=True)
    except WhatsAppConfig.DoesNotExist:
        return {"error": "WhatsApp not configured"}

    msg = WhatsAppMessage.objects.create(
        organization=tx.organization,
        customer=tx.customer,
        phone_number=phone,
        message_type="document",
        content={
            "invoice_number": invoice.invoice_number,
            "total": str(tx.total),
            "store": tx.store.name,
        },
        status="processing",
    )

    try:
        service = WhatsAppService(
            phone_number_id=config.phone_number_id,
            access_token=config.access_token,
        )

        if invoice.pdf_url:
            result = service.send_document(
                to=phone,
                document_url=invoice.pdf_url,
                caption=f"Your bill from {tx.store.name} - Invoice #{invoice.invoice_number}",
            )
        else:
            frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
            text = (
                f"Hi {tx.customer.first_name},\n\n"
                f"Thank you for your purchase at {tx.store.name}!\n"
                f"Invoice: {invoice.invoice_number}\n"
                f"Amount: ₹{tx.total}\n"
                f"Date: {tx.transaction_date.strftime('%d %b %Y')}\n\n"
                f"View your bill: {frontend_url}/bills/{invoice.secure_token}"
            )
            result = service.send_text(to=phone, text=text)

        if "messages" in result:
            msg.provider_message_id = result["messages"][0].get("id", "")
            msg.status = "sent"
            msg.sent_at = timezone.now()
            tx.bill_sent = True
            tx.bill_sent_at = timezone.now()
            tx.save(update_fields=["bill_sent", "bill_sent_at"])
        else:
            msg.status = "failed"
            msg.failure_reason = json.dumps(result)
            msg.failed_at = timezone.now()

    except Exception as e:
        msg.status = "failed"
        msg.failure_reason = str(e)
        msg.failed_at = timezone.now()

    msg.save()
    return {"message_id": str(msg.id), "status": msg.status}


@shared_task(name="apps.whatsapp.tasks.send_coupon_task")
def send_coupon_task(coupon_id, customer_id):
    from apps.coupons.models import Coupon
    from apps.customers.models import Customer
    from apps.whatsapp.models import WhatsAppConfig, WhatsAppMessage

    try:
        coupon = Coupon.objects.get(id=coupon_id)
        customer = Customer.objects.get(id=customer_id)
    except (Coupon.DoesNotExist, Customer.DoesNotExist):
        return {"error": "Coupon or customer not found"}

    if not customer.phone or not customer.whatsapp_opt_in:
        return {"error": "Customer not reachable"}

    phone = customer.phone.replace("+", "").replace(" ", "")
    if not phone.startswith("91"):
        phone = f"91{phone}"

    try:
        config = WhatsAppConfig.objects.get(organization=coupon.organization, is_active=True)
    except WhatsAppConfig.DoesNotExist:
        return {"error": "WhatsApp not configured"}

    msg = WhatsAppMessage.objects.create(
        organization=coupon.organization,
        customer=customer,
        phone_number=phone,
        message_type="text",
        content={"coupon_code": coupon.code, "discount": str(coupon.discount_value)},
        status="processing",
    )

    try:
        service = WhatsAppService(
            phone_number_id=config.phone_number_id,
            access_token=config.access_token,
        )
        text = (
            f"Hi {customer.first_name}! 🎉\n\n"
            f"You have a special coupon from us!\n\n"
            f"Code: *{coupon.code}*\n"
            f"Discount: {coupon.discount_type} {coupon.discount_value}\n"
            f"Valid until: {coupon.expires_at.strftime('%d %b %Y')}\n\n"
            f"Use this at your next purchase!"
        )
        result = service.send_text(to=phone, text=text)

        if "messages" in result:
            msg.provider_message_id = result["messages"][0].get("id", "")
            msg.status = "sent"
            msg.sent_at = timezone.now()
        else:
            msg.status = "failed"
            msg.failure_reason = json.dumps(result)
            msg.failed_at = timezone.now()

    except Exception as e:
        msg.status = "failed"
        msg.failure_reason = str(e)
        msg.failed_at = timezone.now()

    msg.save()
    return {"message_id": str(msg.id), "status": msg.status}


@shared_task(name="apps.whatsapp.tasks.send_loyalty_notification_task")
def send_loyalty_notification_task(customer_id, points, transaction_type="earn"):
    from apps.customers.models import Customer
    from apps.whatsapp.models import WhatsAppConfig, WhatsAppMessage

    try:
        customer = Customer.objects.get(id=customer_id)
    except Customer.DoesNotExist:
        return {"error": "Customer not found"}

    if not customer.phone or not customer.whatsapp_opt_in:
        return {"error": "Customer not reachable"}

    phone = customer.phone.replace("+", "").replace(" ", "")
    if not phone.startswith("91"):
        phone = f"91{phone}"

    try:
        config = WhatsAppConfig.objects.get(organization=customer.organization, is_active=True)
    except WhatsAppConfig.DoesNotExist:
        return {"error": "WhatsApp not configured"}

    action = "earned" if transaction_type == "earn" else "redeemed"

    msg = WhatsAppMessage.objects.create(
        organization=customer.organization,
        customer=customer,
        phone_number=phone,
        message_type="text",
        content={"points": str(points), "action": action},
        status="processing",
    )

    try:
        service = WhatsAppService(
            phone_number_id=config.phone_number_id,
            access_token=config.access_token,
        )
        text = (
            f"Hi {customer.first_name}! 🌟\n\n"
            f"You've {action} *{points}* loyalty points!\n\n"
            f"Keep shopping to earn more rewards."
        )
        result = service.send_text(to=phone, text=text)

        if "messages" in result:
            msg.provider_message_id = result["messages"][0].get("id", "")
            msg.status = "sent"
            msg.sent_at = timezone.now()
        else:
            msg.status = "failed"
            msg.failure_reason = json.dumps(result)
            msg.failed_at = timezone.now()

    except Exception as e:
        msg.status = "failed"
        msg.failure_reason = str(e)
        msg.failed_at = timezone.now()

    msg.save()
    return {"message_id": str(msg.id), "status": msg.status}


@shared_task(name="apps.whatsapp.tasks.send_birthday_message_task")
def send_birthday_message_task(customer_id):
    from apps.customers.models import Customer
    from apps.whatsapp.models import WhatsAppConfig, WhatsAppMessage

    try:
        customer = Customer.objects.get(id=customer_id)
    except Customer.DoesNotExist:
        return {"error": "Customer not found"}

    if not customer.phone or not customer.whatsapp_opt_in:
        return {"error": "Customer not reachable"}

    phone = customer.phone.replace("+", "").replace(" ", "")
    if not phone.startswith("91"):
        phone = f"91{phone}"

    try:
        config = WhatsAppConfig.objects.get(organization=customer.organization, is_active=True)
    except WhatsAppConfig.DoesNotExist:
        return {"error": "WhatsApp not configured"}

    msg = WhatsAppMessage.objects.create(
        organization=customer.organization,
        customer=customer,
        phone_number=phone,
        message_type="text",
        content={"type": "birthday"},
        status="processing",
    )

    try:
        service = WhatsAppService(
            phone_number_id=config.phone_number_id,
            access_token=config.access_token,
        )
        text = (
            f"Happy Birthday, {customer.first_name}! 🎂🎉\n\n"
            f"Wishing you a wonderful day! Here's a special birthday treat for you.\n"
            f"Use code BDAY{customer.first_name[:3].upper()} for 15% off your next order!"
        )
        result = service.send_text(to=phone, text=text)

        if "messages" in result:
            msg.provider_message_id = result["messages"][0].get("id", "")
            msg.status = "sent"
            msg.sent_at = timezone.now()
        else:
            msg.status = "failed"
            msg.failure_reason = json.dumps(result)
            msg.failed_at = timezone.now()

    except Exception as e:
        msg.status = "failed"
        msg.failure_reason = str(e)
        msg.failed_at = timezone.now()

    msg.save()
    return {"message_id": str(msg.id), "status": msg.status}
