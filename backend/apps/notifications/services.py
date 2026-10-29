import logging
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.notifications.models import Notification
from apps.products.models import Product, PurchaseOrderItem, InventoryMovement

logger = logging.getLogger(__name__)


def format_qty(val: Decimal) -> str:
    if val is None:
        return "0"
    if val == int(val):
        return str(int(val))
    return f"{val:.2f}".rstrip("0").rstrip(".")


class NotificationService:
    """
    Centralized Notification Engine for BillMeet.
    Orchestrates business event alerts, deduplication, intelligent low-stock
    detection with baseline replenishment tracking and hysteresis recovery.
    """

    DEFAULT_WARNING_THRESHOLD_PCT = Decimal("25.00")
    DEFAULT_CRITICAL_THRESHOLD_PCT = Decimal("20.00")
    DEFAULT_RECOVERY_THRESHOLD_PCT = Decimal("30.00")

    @classmethod
    def get_product_baseline(cls, product: Product) -> Decimal | None:
        """
        Establishes a valid replenishment baseline quantity for depletion measurement.
        Order of precedence:
        1. Explicitly configured product.baseline_stock (if > 0).
        2. Sum of historical received PurchaseOrderItem quantities.
        3. Sum of positive PURCHASE or OPENING_STOCK InventoryMovements.
        4. Documented fallback:
           - If min_stock > 0: min_stock * 4 (since warning is 25%).
           - If current_stock > 0: current_stock.
        5. Returns None if baseline cannot be established (requires configuration).
        """
        # 1. Explicit configuration
        if product.baseline_stock and product.baseline_stock > Decimal("0.00"):
            return Decimal(str(product.baseline_stock))

        # 2. Historical purchase receipts
        po_sum = PurchaseOrderItem.objects.filter(
            product=product,
            purchase_order__organization=product.organization,
            purchase_order__status__in=["received", "partially_received"],
        ).aggregate(total=Sum("quantity"))["total"]
        if po_sum and po_sum > Decimal("0.00"):
            return Decimal(str(po_sum))

        # 3. Inventory movements (PURCHASE or OPENING_STOCK)
        mov_sum = InventoryMovement.objects.filter(
            product=product,
            organization=product.organization,
            movement_type__in=["PURCHASE", "OPENING_STOCK"],
            quantity__gt=Decimal("0.00"),
        ).aggregate(total=Sum("quantity"))["total"]
        if mov_sum and mov_sum > Decimal("0.00"):
            return Decimal(str(mov_sum))

        # 4. Documented fallback mechanism
        if product.min_stock and product.min_stock > Decimal("0.00"):
            return Decimal(str(product.min_stock)) * Decimal("4.00")
        if product.current_stock and product.current_stock > Decimal("0.00"):
            return Decimal(str(product.current_stock))

        return None

    @classmethod
    def calculate_stock_percentage(cls, current_stock: Decimal, baseline: Decimal) -> Decimal:
        if not baseline or baseline <= Decimal("0.00"):
            return Decimal("0.00") if current_stock <= Decimal("0.00") else Decimal("100.00")
        pct = (current_stock / baseline) * Decimal("100.00")
        return pct.quantize(Decimal("0.1"))

    @classmethod
    def evaluate_product_low_stock(
        cls,
        product: Product,
        warning_threshold: Decimal = DEFAULT_WARNING_THRESHOLD_PCT,
        critical_threshold: Decimal = DEFAULT_CRITICAL_THRESHOLD_PCT,
        recovery_threshold: Decimal = DEFAULT_RECOVERY_THRESHOLD_PCT,
    ) -> Notification | None:
        """
        Intelligent low-stock notification evaluator.
        - Calculates Stock Percentage = (Current Available Stock / Baseline Purchased Quantity) * 100
        - Warning: <= 25%
        - Critical: <= 20%
        - Out of Stock: <= 0 available
        - Recovery: >= 30% resolves active alert with hysteresis
        - Concurrency-safe & idempotent: Uses dedup_key per active episode.
        """
        if not product or not product.track_inventory:
            return None

        # Refresh stock and evaluate within atomic transaction
        with transaction.atomic():
            prod = Product.objects.select_for_update().get(id=product.id)
            baseline = cls.get_product_baseline(prod)

            if baseline is None or baseline <= Decimal("0.00"):
                logger.info("Product '%s' (ID: %s) requires a valid baseline for low-stock tracking.", prod.name, prod.id)
                return None

            current_stock = prod.current_stock
            pct = cls.calculate_stock_percentage(current_stock, baseline)
            cur_str = format_qty(current_stock)
            base_str = format_qty(baseline)
            sku_label = prod.sku or prod.barcode or "N/A"
            dedup_key = f"low_stock:{prod.organization_id}:{prod.id}"

            active_alert = (
                Notification.objects.select_for_update()
                .filter(
                    organization=prod.organization,
                    dedup_key=dedup_key,
                    resolved_at__isnull=True,
                )
                .order_by("-created_at")
                .first()
            )

            # --- CASE 1: RECOVERY (>= 30% with hysteresis) ---
            if pct >= recovery_threshold:
                if active_alert:
                    active_alert.resolved_at = timezone.now()
                    active_alert.save(update_fields=["resolved_at"])

                    # Emit Stock Level Restored notification
                    restore_msg = (
                        f"{prod.name} (SKU: {sku_label}) stock replenished to {cur_str} units "
                        f"({pct:.1f}% of baseline {base_str} units). Alert resolved."
                    )
                    Notification.objects.create(
                        organization=prod.organization,
                        notification_type="in_app",
                        category="inventory",
                        severity="success",
                        title="Stock Level Restored",
                        message=restore_msg,
                        related_entity_type="product",
                        related_entity_id=str(prod.id),
                        audience="all",
                        data={
                            "product_id": str(prod.id),
                            "product_name": prod.name,
                            "sku": prod.sku,
                            "current_stock": str(current_stock),
                            "baseline": str(baseline),
                            "percentage": str(pct),
                            "alert_type": "resolved",
                            "action_url": f"/dashboard/inventory?search={prod.sku or prod.name}",
                            "action_label": "View Inventory",
                        },
                    )
                return None

            # --- CASE 2: HYSTERESIS BAND (Between warning and recovery threshold: 25% < pct < 30%) ---
            if pct > warning_threshold:
                if active_alert:
                    # Stock is between warning and recovery threshold: keep alert active, do not resolve yet
                    active_alert.data.update({
                        "current_stock": str(current_stock),
                        "percentage": str(pct),
                    })
                    active_alert.save(update_fields=["data"])
                    return active_alert
                return None

            # --- CASE 3: OUT OF STOCK (<= 0) ---
            if current_stock <= Decimal("0.00"):
                severity = "critical"
                title = "Product Out of Stock"
                message = f"{prod.name} (SKU: {sku_label}) is completely out of stock (0 units remaining). Immediate reorder required."
                alert_type = "out_of_stock"

                if active_alert:
                    active_alert.severity = severity
                    active_alert.title = title
                    active_alert.message = message
                    active_alert.is_read = False
                    active_alert.data.update({
                        "current_stock": str(current_stock),
                        "baseline": str(baseline),
                        "percentage": str(pct),
                        "alert_type": alert_type,
                    })
                    active_alert.save(update_fields=["severity", "title", "message", "is_read", "data"])
                    return active_alert
                else:
                    return Notification.objects.create(
                        organization=prod.organization,
                        notification_type="in_app",
                        category="inventory",
                        severity=severity,
                        title=title,
                        message=message,
                        related_entity_type="product",
                        related_entity_id=str(prod.id),
                        audience="all",
                        dedup_key=dedup_key,
                        data={
                            "product_id": str(prod.id),
                            "product_name": prod.name,
                            "sku": prod.sku,
                            "current_stock": str(current_stock),
                            "baseline": str(baseline),
                            "percentage": str(pct),
                            "alert_type": alert_type,
                            "action_url": f"/dashboard/inventory?search={prod.sku or prod.name}",
                            "action_label": "Reorder Product",
                        },
                    )

            # --- CASE 4: CRITICAL STOCK (0 < pct <= 20%) ---
            if pct <= critical_threshold:
                severity = "critical"
                title = "Critical Stock Level"
                message = (
                    f"{prod.name} (SKU: {sku_label}) is critically low: {cur_str} units remaining "
                    f"({pct:.1f}% of baseline {base_str} units). Immediate replenishment recommended."
                )
                alert_type = "critical"

                if active_alert:
                    was_warning = active_alert.data.get("alert_type") == "warning" or active_alert.severity != "critical"
                    active_alert.severity = severity
                    active_alert.title = title
                    active_alert.message = message
                    if was_warning:
                        active_alert.is_read = False  # Mark unread on escalation
                    active_alert.data.update({
                        "current_stock": str(current_stock),
                        "baseline": str(baseline),
                        "percentage": str(pct),
                        "alert_type": alert_type,
                    })
                    active_alert.save(update_fields=["severity", "title", "message", "is_read", "data"])
                    return active_alert
                else:
                    return Notification.objects.create(
                        organization=prod.organization,
                        notification_type="in_app",
                        category="inventory",
                        severity=severity,
                        title=title,
                        message=message,
                        related_entity_type="product",
                        related_entity_id=str(prod.id),
                        audience="all",
                        dedup_key=dedup_key,
                        data={
                            "product_id": str(prod.id),
                            "product_name": prod.name,
                            "sku": prod.sku,
                            "current_stock": str(current_stock),
                            "baseline": str(baseline),
                            "percentage": str(pct),
                            "alert_type": alert_type,
                            "action_url": f"/dashboard/inventory?search={prod.sku or prod.name}",
                            "action_label": "Reorder Product",
                        },
                    )

            # --- CASE 5: WARNING (20% < pct <= 25%) ---
            severity = "warning"
            title = "Low Stock Warning"
            message = (
                f"{prod.name} (SKU: {sku_label}) is down to {cur_str} units "
                f"({pct:.1f}% of purchased baseline {base_str} units). Consider reordering soon."
            )
            alert_type = "warning"

            if active_alert:
                active_alert.message = message
                active_alert.data.update({
                    "current_stock": str(current_stock),
                    "baseline": str(baseline),
                    "percentage": str(pct),
                    "alert_type": alert_type,
                })
                active_alert.save(update_fields=["message", "data"])
                return active_alert
            else:
                return Notification.objects.create(
                    organization=prod.organization,
                    notification_type="in_app",
                    category="inventory",
                    severity=severity,
                    title=title,
                    message=message,
                    related_entity_type="product",
                    related_entity_id=str(prod.id),
                    audience="all",
                    dedup_key=dedup_key,
                    data={
                        "product_id": str(prod.id),
                        "product_name": prod.name,
                        "sku": prod.sku,
                        "current_stock": str(current_stock),
                        "baseline": str(baseline),
                        "percentage": str(pct),
                        "alert_type": alert_type,
                        "action_url": f"/dashboard/inventory?search={prod.sku or prod.name}",
                        "action_label": "Reorder Product",
                    },
                )

    @classmethod
    def notify_sale(cls, organization, transaction_obj, cashier=None):
        """
        Generates a sale notification upon POS sale completion.
        """
        try:
            total_amt = Decimal(str(transaction_obj.total))
            is_large = total_amt >= Decimal("10000.00")
            severity = "success" if is_large else "info"
            title = f"Sale Completed: #{transaction_obj.invoice_number}"
            cashier_name = cashier.get_full_name() if cashier and hasattr(cashier, "get_full_name") else "Staff"
            method = (transaction_obj.payment_method or "CASH").upper()

            msg = (
                f"Sale #{transaction_obj.invoice_number} of ₹{total_amt:,.2f} completed via {method} "
                f"by {cashier_name}."
            )
            if transaction_obj.payment_status == "partial":
                msg += f" Outstanding credit: ₹{transaction_obj.outstanding_amount:,.2f}."

            return Notification.objects.create(
                organization=organization,
                notification_type="in_app",
                category="sales",
                severity=severity,
                title=title,
                message=msg,
                related_entity_type="invoice",
                related_entity_id=str(transaction_obj.invoice_number),
                audience="all",
                data={
                    "transaction_id": str(transaction_obj.id),
                    "invoice_number": transaction_obj.invoice_number,
                    "total": str(total_amt),
                    "payment_method": transaction_obj.payment_method,
                    "payment_status": transaction_obj.payment_status,
                    "action_url": f"/dashboard/billing?view=history&search={transaction_obj.invoice_number}",
                    "action_label": "View Invoice",
                },
            )
        except Exception as e:
            logger.warning("Failed to create sale notification: %s", e)
            return None

    @classmethod
    def notify_payment_received(cls, organization, customer, amount: Decimal, payment_method: str, invoice_number: str = None):
        """
        Generates a payment notification.
        """
        try:
            amt = Decimal(str(amount))
            cust_name = customer.full_name if customer else "Customer"
            title = f"Payment Received: ₹{amt:,.2f}"
            msg = f"Received ₹{amt:,.2f} via {payment_method.upper()} from {cust_name}."
            if invoice_number:
                msg += f" Applied towards Invoice #{invoice_number}."

            return Notification.objects.create(
                organization=organization,
                notification_type="in_app",
                category="payments",
                severity="success",
                title=title,
                message=msg,
                related_entity_type="payment",
                related_entity_id=invoice_number or "",
                audience="all",
                data={
                    "amount": str(amt),
                    "payment_method": payment_method,
                    "customer_name": cust_name,
                    "action_url": "/dashboard/finance/payments",
                    "action_label": "View Payments",
                },
            )
        except Exception as e:
            logger.warning("Failed to create payment notification: %s", e)
            return None

    @classmethod
    def notify_system_event(cls, organization, title: str, message: str, severity: str = "info", audience: str = "admin", data: dict = None):
        """
        Generates a system / security notification.
        """
        try:
            return Notification.objects.create(
                organization=organization,
                notification_type="in_app",
                category="system",
                severity=severity,
                title=title,
                message=message,
                audience=audience,
                data=data or {},
            )
        except Exception as e:
            logger.warning("Failed to create system notification: %s", e)
            return None
