from celery import shared_task
from .service import (
    send_coupon_task,
    send_digital_bill_task,
    send_loyalty_notification_task,
)


@shared_task(name="apps.whatsapp.tasks.process_webhook_task")
def process_webhook_task(data):
    from django.utils import timezone

    entries = data.get("entry", [])
    for entry in entries:
        changes = entry.get("changes", [])
        for change in changes:
            value = change.get("value", {})
            messages = value.get("messages", [])
            for msg in messages:
                msg_id = msg.get("id")
                status = msg.get("status")
                if msg_id:
                    from .models import WhatsAppMessage
                    try:
                        whatsapp_msg = WhatsAppMessage.objects.get(provider_message_id=msg_id)
                        if status == "sent":
                            whatsapp_msg.status = "sent"
                            whatsapp_msg.sent_at = timezone.now()
                        elif status == "delivered":
                            whatsapp_msg.status = "delivered"
                            whatsapp_msg.delivered_at = timezone.now()
                        elif status == "read":
                            whatsapp_msg.status = "read"
                            whatsapp_msg.read_at = timezone.now()
                        whatsapp_msg.save(update_fields=["status", "sent_at", "delivered_at", "read_at"])
                    except WhatsAppMessage.DoesNotExist:
                        pass
