from celery import shared_task
from django.utils import timezone


@shared_task(name="apps.campaigns.tasks.process_campaign_task")
def process_campaign_task(campaign_id):
    from apps.campaigns.models import Campaign, CampaignMessage
    from apps.customers.models import Customer
    from apps.whatsapp.models import WhatsAppConfig, WhatsAppMessage
    from apps.whatsapp.service import WhatsAppService

    try:
        campaign = Campaign.objects.select_related("organization").get(id=campaign_id)
    except Campaign.DoesNotExist:
        return {"error": "Campaign not found"}

    campaign.status = "sending"
    campaign.save(update_fields=["status"])

    customers = Customer.objects.filter(
        organization=campaign.organization,
        is_active=True,
        whatsapp_opt_in=True,
    )
    if campaign.segment_rules:
        for key, value in campaign.segment_rules.items():
            if key == "segment":
                customers = customers.filter(segment=value)
            elif key == "min_total_spend":
                customers = customers.filter(total_spend__gte=value)
            elif key == "max_days_since_purchase":
                cutoff = timezone.now() - timezone.timedelta(days=value)
                customers = customers.filter(last_purchase_at__gte=cutoff)

    total = customers.count()
    campaign.total_recipients = total
    campaign.save(update_fields=["total_recipients"])

    try:
        config = WhatsAppConfig.objects.get(organization=campaign.organization, is_active=True)
    except WhatsAppConfig.DoesNotExist:
        campaign.status = "cancelled"
        campaign.save(update_fields=["status"])
        return {"error": "WhatsApp not configured"}

    service = WhatsAppService(
        phone_number_id=config.phone_number_id,
        access_token=config.access_token,
    )

    sent = 0
    failed = 0
    for customer in customers:
        phone = customer.phone.replace("+", "").replace(" ", "")
        if not phone.startswith("91"):
            phone = f"91{phone}"

        msg = CampaignMessage.objects.create(
            organization=campaign.organization,
            campaign=campaign,
            customer=customer,
            phone=phone,
            status="processing",
        )

        try:
            result = service.send_text(
                to=phone,
                text=campaign.message_content,
            )
            if "messages" in result:
                msg.provider_message_id = result["messages"][0].get("id", "")
                msg.status = "sent"
                msg.sent_at = timezone.now()
                sent += 1

                WhatsAppMessage.objects.create(
                    organization=campaign.organization,
                    customer=customer,
                    phone_number=phone,
                    message_type="text",
                    content={"campaign_id": str(campaign.id)},
                    status="sent",
                    provider_message_id=msg.provider_message_id,
                    sent_at=timezone.now(),
                    campaign=campaign,
                )
            else:
                msg.status = "failed"
                msg.failure_reason = str(result)
                msg.failed_at = timezone.now()
                failed += 1
        except Exception as e:
            msg.status = "failed"
            msg.failure_reason = str(e)
            msg.failed_at = timezone.now()
            failed += 1

        msg.save()

    campaign.total_sent = sent
    campaign.total_failed = failed
    campaign.status = "completed"
    campaign.sent_at = timezone.now()
    campaign.save(update_fields=["total_sent", "total_failed", "status", "sent_at"])

    from apps.analytics.tasks import update_campaign_analytics_task
    update_campaign_analytics_task.delay(str(campaign.organization_id))

    return {
        "campaign_id": str(campaign.id),
        "total_recipients": total,
        "sent": sent,
        "failed": failed,
    }


@shared_task(name="apps.campaigns.tasks.send_campaign_message_task")
def send_campaign_message_task(message_id):
    from apps.campaigns.models import CampaignMessage
    from apps.whatsapp.models import WhatsAppConfig
    from apps.whatsapp.service import WhatsAppService

    try:
        msg = CampaignMessage.objects.select_related("campaign", "customer").get(id=message_id)
    except CampaignMessage.DoesNotExist:
        return {"error": "Message not found"}

    phone = msg.phone.replace("+", "").replace(" ", "")
    if not phone.startswith("91"):
        phone = f"91{phone}"

    try:
        config = WhatsAppConfig.objects.get(organization=msg.campaign.organization, is_active=True)
    except WhatsAppConfig.DoesNotExist:
        return {"error": "WhatsApp not configured"}

    service = WhatsAppService(
        phone_number_id=config.phone_number_id,
        access_token=config.access_token,
    )

    try:
        result = service.send_text(
            to=phone,
            text=msg.campaign.message_content,
        )
        if "messages" in result:
            msg.provider_message_id = result["messages"][0].get("id", "")
            msg.status = "sent"
            msg.sent_at = timezone.now()
        else:
            msg.status = "failed"
            msg.failure_reason = str(result)
            msg.failed_at = timezone.now()
    except Exception as e:
        msg.status = "failed"
        msg.failure_reason = str(e)
        msg.failed_at = timezone.now()

    msg.save()
    return {"message_id": str(msg.id), "status": msg.status}
