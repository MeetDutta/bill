from django.db import transaction
from django.utils import timezone
from apps.billing.models import BusinessConfig, InvoiceSequence
from apps.transactions.models import Transaction


class InvoiceNumberService:
    """
    Authoritative Sequential Invoice Number Generation Engine.
    Ensures:
    - Organization-isolated sequential numbering (e.g. INV-20261008-000001)
    - Row-locked concurrency safety (select_for_update)
    - Configurable prefix from BusinessConfig
    - Configurable date/period format
    - Collision prevention against historical invoices
    """

    @classmethod
    def generate_invoice_number(
        cls,
        organization,
        store=None,
        prefix: str = None,
        date_override=None,
    ) -> str:
        date_val = date_override or timezone.now()
        config = BusinessConfig.objects.filter(organization=organization).first()

        chosen_prefix = (prefix or (config.invoice_prefix if config else None) or "INV").strip().upper()
        # Daily sequential key: YYYYMMDD
        date_part = date_val.strftime("%Y%m%d")
        period_key = date_part

        with transaction.atomic():
            seq, _ = InvoiceSequence.objects.select_for_update().get_or_create(
                organization=organization,
                store=store,
                prefix=chosen_prefix,
                period_key=period_key,
                defaults={"last_number": 0},
            )

            while True:
                seq.last_number += 1
                candidate = f"{chosen_prefix}-{date_part}-{seq.last_number:06d}"
                # Check that candidate does not collide with historical/imported transactions
                exists = Transaction.objects.filter(
                    organization=organization,
                    invoice_number=candidate,
                ).exists()
                if not exists:
                    seq.save(update_fields=["last_number", "updated_at"])
                    return candidate
