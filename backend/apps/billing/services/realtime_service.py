import logging
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from apps.billing.models import RealtimeEvent

logger = logging.getLogger(__name__)


class RealtimeService:
    """
    Authoritative Real-Time Event Publisher & Event-Stream Engine.
    Emits post-commit tenant-isolated business events for live dashboard and POS synchronization.
    """

    @classmethod
    def publish_event(
        cls,
        organization,
        event_type: str,
        payload: dict,
        store=None,
    ):
        """
        Publishes a real-time event. If inside an active transaction,
        defers publishing until transaction.on_commit guarantees data safety.
        """
        def _commit_publisher():
            try:
                # 1. Create durable event record
                event = RealtimeEvent.objects.create(
                    organization=organization,
                    store=store,
                    event_type=event_type,
                    payload=payload,
                )

                # 2. Opportunistic cleanup of stale events (> 24 hours)
                cutoff = timezone.now() - timedelta(hours=24)
                RealtimeEvent.objects.filter(
                    organization=organization,
                    created_at__lt=cutoff,
                ).delete()

                logger.debug(
                    "Realtime event published: %s for org %s",
                    event_type,
                    organization.name,
                )
                return event
            except Exception as e:
                logger.warning("Failed to publish realtime event %s: %s", event_type, e)

        conn = transaction.get_connection()
        if conn.in_atomic_block:
            transaction.on_commit(_commit_publisher)
        else:
            return _commit_publisher()
