from django.core.management.base import BaseCommand
from apps.organizations.models import Organization
from apps.products.models import Product
from apps.notifications.services import NotificationService


class Command(BaseCommand):
    help = "Reconciles inventory stock against replenishment baselines and updates/generates low-stock notifications."

    def add_arguments(self, parser):
        parser.add_argument(
            "--organization-id",
            type=str,
            help="Optional UUID of a specific organization to reconcile.",
        )

    def handle(self, *args, **options):
        org_id = options.get("organization_id")
        orgs = Organization.objects.filter(is_active=True)
        if org_id:
            orgs = orgs.filter(id=org_id)

        self.stdout.write(f"Reconciling low-stock alerts across {orgs.count()} organization(s)...")

        total_evaluated = 0
        total_alerts = 0
        total_missing_baseline = 0

        for org in orgs:
            products = Product.objects.filter(
                organization=org,
                track_inventory=True,
                is_active=True,
            )
            for prod in products:
                total_evaluated += 1
                baseline = NotificationService.get_product_baseline(prod)
                if baseline is None or baseline <= 0:
                    total_missing_baseline += 1
                    continue
                alert = NotificationService.evaluate_product_low_stock(prod)
                if alert:
                    total_alerts += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Reconciliation completed successfully. Evaluated: {total_evaluated}, "
                f"Active alerts: {total_alerts}, Missing baselines: {total_missing_baseline}."
            )
        )

