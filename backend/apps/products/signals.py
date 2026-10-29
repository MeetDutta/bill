import logging
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import InventoryMovement

logger = logging.getLogger(__name__)


@receiver(post_save, sender=InventoryMovement)
def inventory_movement_post_save(sender, instance, created, **kwargs):
    if not created:
        return
    product = instance.product
    if not product or not product.track_inventory:
        return

    def _evaluate():
        try:
            from apps.notifications.services import NotificationService
            NotificationService.evaluate_product_low_stock(product)
        except Exception as e:
            logger.warning("Low stock evaluation failed for product %s: %s", product.id, e)

    transaction.on_commit(_evaluate)

