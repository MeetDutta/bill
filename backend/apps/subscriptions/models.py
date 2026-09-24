from decimal import Decimal

from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel, UUIDModel


class Plan(UUIDModel, TimeStampedModel):
    PLAN_TIER_CHOICES = [
        ("free", "Free"),
        ("starter", "Starter"),
        ("professional", "Professional"),
        ("business", "Business"),
        ("enterprise", "Enterprise"),
    ]

    name = models.CharField(max_length=100)
    tier = models.CharField(max_length=20, choices=PLAN_TIER_CHOICES)
    description = models.TextField(blank=True)
    price_monthly = models.DecimalField(max_digits=10, decimal_places=2)
    price_yearly = models.DecimalField(max_digits=10, decimal_places=2)
    max_stores = models.PositiveIntegerField(default=1)
    max_users = models.PositiveIntegerField(default=5)
    max_customers = models.PositiveIntegerField(default=1000)
    max_whatsapp_messages = models.PositiveIntegerField(default=1000)
    max_campaigns = models.PositiveIntegerField(default=10)
    max_products = models.PositiveIntegerField(default=500)
    max_api_calls = models.PositiveIntegerField(default=10000)
    features = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(default=True)

    class Meta:
        ordering = ["price_monthly"]

    def __str__(self):
        return f"{self.name} ({self.tier})"


class Subscription(UUIDModel, TimeStampedModel):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("trialing", "Trialing"),
        ("past_due", "Past Due"),
        ("cancelled", "Cancelled"),
        ("expired", "Expired"),
    ]

    organization = models.OneToOneField(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    plan = models.ForeignKey(
        Plan,
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="trialing")
    billing_cycle = models.CharField(
        max_length=20,
        choices=[("monthly", "Monthly"), ("yearly", "Yearly")],
        default="monthly",
    )
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    trial_end_date = models.DateField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.TextField(blank=True)
    payment_method = models.CharField(max_length=50, blank=True)
    external_subscription_id = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self):
        return f"{self.organization} - {self.plan.name} ({self.status})"

    @property
    def is_active(self):
        return self.status in ("active", "trialing")

    @property
    def days_remaining(self):
        if self.end_date:
            delta = self.end_date - timezone.now().date()
            return max(0, delta.days)
        return None


class SubscriptionUsage(UUIDModel, TimeStampedModel):
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name="usage",
    )
    metric = models.CharField(max_length=50, db_index=True)
    current_usage = models.PositiveIntegerField(default=0)
    period_start = models.DateField()
    period_end = models.DateField()

    class Meta:
        unique_together = [("subscription", "metric", "period_start")]
        ordering = ["-period_start"]

    def __str__(self):
        return f"{self.metric}: {self.current_usage}/{self.subscription.plan}"

    @property
    def limit(self):
        plan = self.subscription.plan
        limits = {
            "stores": plan.max_stores,
            "users": plan.max_users,
            "customers": plan.max_customers,
            "whatsapp_messages": plan.max_whatsapp_messages,
            "campaigns": plan.max_campaigns,
            "products": plan.max_products,
            "api_calls": plan.max_api_calls,
        }
        return limits.get(self.metric, 0)

    @property
    def usage_percentage(self):
        limit = self.limit
        if limit == 0:
            return 0
        return min(100, int((self.current_usage / limit) * 100))

    @property
    def is_exceeded(self):
        return self.current_usage >= self.limit


class EntitlementService:
    @staticmethod
    def check_entitlement(organization, metric):
        from apps.subscriptions.models import Subscription, SubscriptionUsage

        try:
            subscription = Subscription.objects.select_related("plan").get(
                organization=organization,
                status__in=["active", "trialing"],
            )
        except Subscription.DoesNotExist:
            return {"allowed": False, "reason": "No active subscription"}

        today = timezone.now().date()
        usage, _ = SubscriptionUsage.objects.get_or_create(
            subscription=subscription,
            metric=metric,
            period_start=today.replace(day=1),
            defaults={"period_end": today},
        )

        plan = subscription.plan
        limits = {
            "stores": plan.max_stores,
            "users": plan.max_users,
            "customers": plan.max_customers,
            "whatsapp_messages": plan.max_whatsapp_messages,
            "campaigns": plan.max_campaigns,
            "products": plan.max_products,
            "api_calls": plan.max_api_calls,
        }
        limit = limits.get(metric, 0)

        return {
            "allowed": usage.current_usage < limit,
            "current_usage": usage.current_usage,
            "limit": limit,
            "usage_percentage": usage.usage_percentage,
            "plan": plan.name,
            "tier": plan.tier,
        }

    @staticmethod
    def increment_usage(organization, metric, count=1):
        from apps.subscriptions.models import Subscription, SubscriptionUsage

        try:
            subscription = Subscription.objects.get(
                organization=organization,
                status__in=["active", "trialing"],
            )
        except Subscription.DoesNotExist:
            return False

        today = timezone.now().date()
        usage, _ = SubscriptionUsage.objects.get_or_create(
            subscription=subscription,
            metric=metric,
            period_start=today.replace(day=1),
            defaults={"period_end": today},
        )

        if usage.is_exceeded:
            return False

        usage.current_usage += count
        usage.save(update_fields=["current_usage"])
        return True

    @staticmethod
    def get_usage_summary(organization):
        from apps.subscriptions.models import Subscription, SubscriptionUsage

        try:
            subscription = Subscription.objects.select_related("plan").get(
                organization=organization,
                status__in=["active", "trialing"],
            )
        except Subscription.DoesNotExist:
            return None

        today = timezone.now().date()
        period_start = today.replace(day=1)
        usages = SubscriptionUsage.objects.filter(
            subscription=subscription,
            period_start=period_start,
        )

        plan = subscription.plan
        summary = {
            "plan": plan.name,
            "tier": plan.tier,
            "status": subscription.status,
            "billing_cycle": subscription.billing_cycle,
            "end_date": subscription.end_date,
            "usage": {},
        }

        metrics = {
            "stores": ("Stores", plan.max_stores),
            "users": ("Users", plan.max_users),
            "customers": ("Customers", plan.max_customers),
            "whatsapp_messages": ("WhatsApp Messages", plan.max_whatsapp_messages),
            "campaigns": ("Campaigns", plan.max_campaigns),
            "products": ("Products", plan.max_products),
            "api_calls": ("API Calls", plan.max_api_calls),
        }

        for metric, (label, limit) in metrics.items():
            usage = usages.filter(metric=metric).first()
            current = usage.current_usage if usage else 0
            summary["usage"][metric] = {
                "label": label,
                "current": current,
                "limit": limit,
                "percentage": min(100, int((current / limit) * 100)) if limit > 0 else 0,
            }

        return summary
