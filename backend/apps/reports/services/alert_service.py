import logging
from datetime import timedelta
from django.utils import timezone
from apps.analytics.models import BusinessAlert

logger = logging.getLogger(__name__)


class OperationalAlertService:
    """
    Centralized service for emitting and deduplicating actionable operational alerts:
    - Checkout failures
    - Payment inconsistencies
    - Unreconciled financial discrepancies
    - Inventory mismatches
    - Database/Worker connectivity degradation
    - Backup and restoration failures
    """

    ALERT_TYPES = {
        "CHECKOUT_FAILURE": "Checkout Failure",
        "PAYMENT_FAILURE": "Payment Processing Failure",
        "FINANCIAL_DISCREPANCY": "Financial Reconciliation Discrepancy",
        "INVENTORY_DISCREPANCY": "Inventory Movement Discrepancy",
        "NEGATIVE_STOCK": "Negative Stock Violation",
        "DB_CONNECTIVITY_DEGRADED": "Database Connectivity Degraded",
        "WORKER_UNAVAILABLE": "Background Worker Unavailable",
        "SSE_DELIVERY_FAILURE": "Realtime SSE Stream Delivery Failure",
        "BACKUP_FAILED": "Automated Backup Failure",
        "RESTORE_DRILL_FAILED": "Backup Restoration Drill Failure",
    }

    @classmethod
    def emit_alert(
        cls,
        organization,
        alert_type: str,
        severity: str = "WARNING",
        title: str = "",
        description: str = "",
        entity_type: str = "system",
        entity_id: str = "",
        recommended_action: str = "",
        dedup_window_minutes: int = 15,
    ) -> BusinessAlert:
        """
        Emits an operational alert.
        Deduplicates against active unacknowledged alerts within `dedup_window_minutes`
        to prevent alert fatigue and notification storms.
        """
        if not title:
            title = cls.ALERT_TYPES.get(alert_type, alert_type)

        severity = severity.upper()
        if severity not in ("INFO", "WARNING", "CRITICAL"):
            severity = "WARNING"

        now = timezone.now()
        window_start = now - timedelta(minutes=dedup_window_minutes)

        # Check for existing duplicate active alert
        existing_alert = BusinessAlert.objects.filter(
            organization=organization,
            alert_type=alert_type,
            entity_id=str(entity_id),
            is_acknowledged=False,
            is_dismissed=False,
            created_at__gte=window_start,
        ).first()

        if existing_alert:
            # Update existing alert description and action if changed
            existing_alert.description = description
            if recommended_action:
                existing_alert.recommended_action = recommended_action
            existing_alert.severity = severity
            existing_alert.save(update_fields=["description", "recommended_action", "severity", "updated_at"])
            logger.info(f"[AlertService] Deduplicated alert {alert_type} for org {organization.id}")
            return existing_alert

        # Create new actionable alert
        alert = BusinessAlert.objects.create(
            organization=organization,
            alert_type=alert_type,
            severity=severity,
            title=title,
            description=description,
            entity_type=entity_type,
            entity_id=str(entity_id),
            recommended_action=recommended_action,
        )
        logger.warning(f"[AlertService] Emitted {severity} alert: {title} (Org: {organization.id})")
        return alert
