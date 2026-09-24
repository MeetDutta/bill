from celery import shared_task
from django.utils import timezone


@shared_task(name="apps.automations.tasks.run_automation_task")
def run_automation_task(automation_id):
    from apps.automations.models import Automation, AutomationExecution
    from apps.customers.models import Customer

    try:
        automation = Automation.objects.get(id=automation_id)
    except Automation.DoesNotExist:
        return {"error": "Automation not found"}

    if not automation.is_active:
        return {"error": "Automation is inactive"}

    conditions_met = True
    if automation.conditions:
        if "min_total_spend" in automation.conditions:
            pass
        if "segment" in automation.conditions:
            pass
        if "min_purchases" in automation.conditions:
            pass

    if not conditions_met:
        return {"message": "Conditions not met"}

    automation.execution_count += 1
    automation.last_executed_at = timezone.now()
    automation.save(update_fields=["execution_count", "last_executed_at"])

    return {
        "automation_id": str(automation.id),
        "executed_at": str(automation.last_executed_at),
    }


@shared_task(name="apps.automations.tasks.process_event_task")
def process_event_task(event_type, customer_id, metadata=None):
    from apps.automations.models import Automation, AutomationExecution
    from apps.customers.models import Customer

    automations = Automation.objects.filter(
        trigger=event_type,
        is_active=True,
    )

    for automation in automations:
        try:
            customer = Customer.objects.get(id=customer_id)
        except Customer.DoesNotExist:
            continue

        conditions_met = True
        if automation.conditions:
            if "segment" in automation.conditions:
                if customer.segment != automation.conditions["segment"]:
                    conditions_met = False
            if "min_total_spend" in automation.conditions:
                if customer.total_spend < automation.conditions["min_total_spend"]:
                    conditions_met = False
            if "max_days_since_purchase" in automation.conditions:
                from datetime import timedelta
                cutoff = timezone.now() - timedelta(days=automation.conditions["max_days_since_purchase"])
                if customer.last_purchase_at and customer.last_purchase_at > cutoff:
                    conditions_met = False

        if not conditions_met:
            continue

        execution = AutomationExecution.objects.create(
            organization=automation.organization,
            automation=automation,
            customer=customer,
            trigger_data=metadata or {},
            status="pending",
        )

        if automation.delay_hours > 0:
            execute_automation_action.apply_async(
                args=[str(execution.id)],
                countdown=automation.delay_hours * 3600,
            )
        else:
            execute_automation_action.delay(str(execution.id))

    return {"event_type": event_type, "processed": len(automations)}


@shared_task(name="apps.automations.tasks.execute_automation_action")
def execute_automation_action(execution_id):
    from apps.automations.models import AutomationExecution

    try:
        execution = AutomationExecution.objects.select_related(
            "automation", "customer", "organization"
        ).get(id=execution_id)
    except AutomationExecution.DoesNotExist:
        return {"error": "Execution not found"}

    automation = execution.automation
    customer = execution.customer

    try:
        if automation.action == "send_whatsapp":
            from apps.whatsapp.tasks import send_digital_bill_task
            message_content = automation.action_config.get("message", "")
            if message_content:
                from apps.whatsapp.models import WhatsAppConfig, WhatsAppMessage
                from apps.whatsapp.service import WhatsAppService

                config = WhatsAppConfig.objects.get(organization=execution.organization, is_active=True)
                service = WhatsAppService(
                    phone_number_id=config.phone_number_id,
                    access_token=config.access_token,
                )
                phone = customer.phone.replace("+", "").replace(" ", "")
                if not phone.startswith("91"):
                    phone = f"91{phone}"

                result = service.send_text(to=phone, text=message_content)
                if "messages" in result:
                    WhatsAppMessage.objects.create(
                        organization=execution.organization,
                        customer=customer,
                        phone_number=phone,
                        message_type="text",
                        content={"automation_id": str(automation.id)},
                        status="sent",
                        provider_message_id=result["messages"][0].get("id", ""),
                        sent_at=timezone.now(),
                    )

        elif automation.action == "send_email":
            pass

        elif automation.action == "create_coupon":
            from apps.coupons.models import Coupon
            import uuid
            discount_value = automation.action_config.get("discount_value", 10)
            Coupon.objects.create(
                organization=execution.organization,
                code=f"AUTO-{uuid.uuid4().hex[:8].upper()}",
                name=f"Auto Coupon - {automation.name}",
                discount_type="percentage",
                discount_value=discount_value,
                min_order_value=automation.action_config.get("min_order_value", 0),
                start_at=timezone.now(),
                expires_at=timezone.now() + timezone.timedelta(days=30),
                usage_limit=1,
                per_customer_limit=1,
            )

        elif automation.action == "award_loyalty":
            from apps.loyalty.models import LoyaltyAccount, LoyaltyTransaction
            points = automation.action_config.get("points", 100)
            account, _ = LoyaltyAccount.objects.get_or_create(
                organization=execution.organization,
                customer=customer,
            )
            account.balance += points
            account.total_earned += points
            account.save(update_fields=["balance", "total_earned"])
            LoyaltyTransaction.objects.create(
                organization=execution.organization,
                loyalty_account=account,
                transaction_type="earn",
                points=points,
                balance_after=account.balance,
                description=f"Awarded by automation: {automation.name}",
            )

        execution.status = "completed"
        execution.executed_at = timezone.now()
        execution.save(update_fields=["status", "executed_at"])

    except Exception as e:
        execution.status = "failed"
        execution.error_message = str(e)
        execution.save(update_fields=["status", "error_message"])

    return {"execution_id": str(execution.id), "status": execution.status}
