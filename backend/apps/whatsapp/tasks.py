from celery import shared_task
from .service import (
    send_coupon_task,
    send_digital_bill_task,
    send_loyalty_notification_task,
)


@shared_task(name="apps.whatsapp.tasks.process_webhook_task")
def process_webhook_task(data):
    from django.utils import timezone
    from .models import WhatsAppMessage

    entries = data.get("entry", [])
    for entry in entries:
        changes = entry.get("changes", [])
        for change in changes:
            value = change.get("value", {})

            # 1. Process delivery / read / failure statuses
            statuses = value.get("statuses", [])
            for st in statuses:
                msg_id = st.get("id")
                new_status = st.get("status")
                if not msg_id or not new_status:
                    continue

                whatsapp_msg = WhatsAppMessage.objects.filter(provider_message_id=msg_id).first()
                if not whatsapp_msg:
                    continue

                now = timezone.now()
                update_fields = ["status"]

                if new_status == "sent":
                    if whatsapp_msg.status == "processing":
                        whatsapp_msg.status = "sent"
                    if not whatsapp_msg.sent_at:
                        whatsapp_msg.sent_at = now
                        update_fields.append("sent_at")
                elif new_status == "delivered":
                    if whatsapp_msg.status != "read":
                        whatsapp_msg.status = "delivered"
                    if not whatsapp_msg.delivered_at:
                        whatsapp_msg.delivered_at = now
                        update_fields.append("delivered_at")
                elif new_status == "read":
                    whatsapp_msg.status = "read"
                    if not whatsapp_msg.read_at:
                        whatsapp_msg.read_at = now
                        update_fields.append("read_at")
                    if not whatsapp_msg.delivered_at:
                        whatsapp_msg.delivered_at = now
                        update_fields.append("delivered_at")
                elif new_status == "failed":
                    whatsapp_msg.status = "failed"
                    whatsapp_msg.failed_at = now
                    errors = st.get("errors", [])
                    whatsapp_msg.failure_reason = str(errors) if errors else "Message failed to deliver"
                    update_fields.extend(["failed_at", "failure_reason"])

                whatsapp_msg.save(update_fields=list(set(update_fields)))

            # 2. Process incoming customer messages
            messages = value.get("messages", [])
            for msg in messages:
                msg_id = msg.get("id")
                # Can be extended for customer opt-out or inbound replies
                pass
