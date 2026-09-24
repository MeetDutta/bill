import uuid
from decimal import Decimal

from celery import shared_task
from django.utils import timezone


@shared_task(name="apps.loyalty.tasks.calculate_loyalty_task")
def calculate_loyalty_task(transaction_id, organization_id):
    from apps.transactions.models import Transaction
    from apps.loyalty.models import LoyaltyAccount, LoyaltyRule, LoyaltyTransaction
    from apps.customers.models import CustomerTimeline

    try:
        tx = Transaction.objects.select_related("customer", "organization").get(id=transaction_id)
    except Transaction.DoesNotExist:
        return {"error": "Transaction not found"}

    if not tx.customer:
        return {"error": "No customer linked"}

    customer = tx.customer
    org_id = organization_id

    account, _ = LoyaltyAccount.objects.get_or_create(
        organization_id=org_id,
        customer=customer,
    )

    earn_rules = LoyaltyRule.objects.filter(
        organization_id=org_id,
        rule_type="earn_purchase",
        is_active=True,
    ).order_by("-priority")

    total_points = Decimal("0")
    for rule in earn_rules:
        if tx.total >= rule.min_transaction_amount:
            if rule.per_amount > 0:
                points = (tx.total / rule.per_amount) * rule.points
            else:
                points = rule.points

            if rule.max_points_per_transaction > 0:
                points = min(points, rule.max_points_per_transaction)

            total_points += points
            break

    if total_points > 0:
        balance_after = account.balance + total_points
        account.balance = balance_after
        account.total_earned += total_points
        account.save(update_fields=["balance", "total_earned", "updated_at"])

        LoyaltyTransaction.objects.create(
            organization_id=org_id,
            loyalty_account=account,
            transaction_type="earn",
            points=total_points,
            balance_after=balance_after,
            reference_type="transaction",
            reference_id=str(tx.id),
            description=f"Points earned for invoice {tx.invoice_number}",
            expires_at=timezone.now() + timezone.timedelta(days=365),
        )

        tx.loyalty_points_earned = int(total_points)
        tx.save(update_fields=["loyalty_points_earned"])

        CustomerTimeline.objects.create(
            organization_id=org_id,
            customer=customer,
            event_type="loyalty_earned",
            reference_id=str(tx.id),
            metadata={"points": str(total_points), "invoice_number": tx.invoice_number},
        )

    return {
        "transaction_id": str(tx.id),
        "customer_id": str(customer.id),
        "points_earned": str(total_points),
        "new_balance": str(account.balance),
    }
