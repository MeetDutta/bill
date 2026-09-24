from celery import shared_task
from django.utils import timezone


@shared_task(name="apps.analytics.tasks.update_daily_sales_task")
def update_daily_sales_task(organization_id, store_id=None):
    from apps.transactions.models import Transaction
    from apps.analytics.models import DailySalesReport
    from apps.stores.models import Store
    from datetime import date, timedelta

    today = date.today()
    yesterday = today - timedelta(days=1)

    if store_id:
        stores = Store.objects.filter(id=store_id, organization_id=organization_id)
    else:
        stores = Store.objects.filter(organization_id=organization_id)

    for store in stores:
        transactions = Transaction.objects.filter(
            organization_id=organization_id,
            store=store,
            transaction_date__date=yesterday,
            status="completed",
        )

        total_revenue = sum(t.total for t in transactions)
        total_transactions = transactions.count()
        total_items = sum(t.items.count() for t in transactions)
        avg_order = total_revenue / total_transactions if total_transactions > 0 else 0

        new_customers = transactions.filter(
            customer__total_purchases=1
        ).values("customer").distinct().count()

        total_customers_tx = transactions.exclude(
            customer__isnull=True
        ).values("customer").distinct().count()
        returning = total_customers_tx - new_customers

        DailySalesReport.objects.update_or_create(
            organization_id=organization_id,
            store=store,
            date=yesterday,
            defaults={
                "total_revenue": total_revenue,
                "total_transactions": total_transactions,
                "total_items_sold": total_items,
                "average_order_value": avg_order,
                "new_customers": new_customers,
                "returning_customers": returning,
            },
        )

    return {"date": str(yesterday), "stores_processed": stores.count()}


@shared_task(name="apps.analytics.tasks.update_customer_analytics_task")
def update_customer_analytics_task(organization_id):
    from apps.customers.models import Customer
    from apps.analytics.models import CustomerAnalytics
    from apps.transactions.models import Transaction
    from datetime import date, timedelta

    today = date.today()
    yesterday = today - timedelta(days=1)

    total = Customer.objects.filter(
        organization_id=organization_id, is_active=True
    ).count()

    new = Customer.objects.filter(
        organization_id=organization_id,
        created_at__date=yesterday,
    ).count()

    active = Customer.objects.filter(
        organization_id=organization_id,
        last_purchase_at__gte=yesterday - timedelta(days=30),
    ).count()

    inactive = total - active

    vip = Customer.objects.filter(
        organization_id=organization_id,
        total_spend__gte=10000,
    ).count()

    avg_ltv = Customer.objects.filter(
        organization_id=organization_id,
        total_purchases__gt=0,
    ).values("total_spend").order_by("total_spend")
    avg_value = sum(c["total_spend"] for c in avg_ltv) / len(avg_ltv) if avg_ltv else 0

    CustomerAnalytics.objects.update_or_create(
        organization_id=organization_id,
        date=yesterday,
        defaults={
            "total_customers": total,
            "new_customers": new,
            "active_customers": active,
            "inactive_customers": inactive,
            "vip_customers": vip,
            "average_lifetime_value": avg_value,
        },
    )

    return {"date": str(yesterday), "total": total, "new": new, "active": active}


@shared_task(name="apps.analytics.tasks.update_campaign_analytics_task")
def update_campaign_analytics_task(organization_id):
    from apps.campaigns.models import Campaign, CampaignMessage
    from apps.analytics.models import CampaignAnalytics
    from apps.coupons.models import CouponRedemption
    from datetime import date, timedelta

    today = date.today()
    yesterday = today - timedelta(days=1)

    campaigns = Campaign.objects.filter(
        organization_id=organization_id,
        sent_at__date=yesterday,
    )

    total_campaigns = campaigns.count()
    messages = CampaignMessage.objects.filter(
        organization_id=organization_id,
        created_at__date=yesterday,
    )
    total_sent = messages.filter(status="sent").count()
    total_delivered = messages.filter(status="delivered").count()
    total_read = messages.filter(status="read").count()
    total_failed = messages.filter(status="failed").count()

    redemptions = CouponRedemption.objects.filter(
        organization_id=organization_id,
        created_at__date=yesterday,
    )
    total_redemptions = redemptions.count()
    total_discount = sum(r.discount_amount for r in redemptions)

    CampaignAnalytics.objects.update_or_create(
        organization_id=organization_id,
        date=yesterday,
        defaults={
            "total_campaigns": total_campaigns,
            "total_messages_sent": total_sent,
            "total_delivered": total_delivered,
            "total_read": total_read,
            "total_failed": total_failed,
            "total_coupons_redeemed": total_redemptions,
            "total_coupon_discount": total_discount,
        },
    )

    return {"date": str(yesterday), "campaigns": total_campaigns}
