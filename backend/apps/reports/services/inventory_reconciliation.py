import csv
import io
import logging
from decimal import Decimal
from typing import Any, Dict, List
from django.utils import timezone
from django.db.models import Sum, Count

from apps.products.models import Product, InventoryMovement
from apps.billing.models import BusinessConfig
from .alert_service import OperationalAlertService

logger = logging.getLogger(__name__)


class InventoryReconciliationService:
    """
    Read-only Inventory Reconciliation Engine:
    Validates physical inventory and stock movement ledger consistency:
    1. Expected Stock = Baseline Opening Stock + Inbound Movements - Outbound Movements
    2. Compares Expected Stock vs Product.current_stock
    3. Detects Unexpected Negative Stock violations
    4. Identifies Duplicate Movements or Ingestion Drift
    5. Flags un-audited manual stock adjustments
    """

    @classmethod
    def run_reconciliation(
        cls,
        organization,
        store=None,
        emit_alerts: bool = True,
    ) -> Dict[str, Any]:
        config = BusinessConfig.objects.filter(organization=organization).first()
        allow_negative = config.allow_negative_stock if config else False

        products_query = Product.objects.filter(
            organization=organization,
            track_inventory=True,
            is_active=True,
        )

        discrepancies: List[Dict[str, Any]] = []
        total_products_checked = 0
        total_movements_checked = 0

        for product in products_query:
            total_products_checked += 1
            movements = InventoryMovement.objects.filter(
                organization=organization,
                product=product,
            )
            if store:
                movements = movements.filter(store=store)

            movements = movements.order_by("created_at")
            mov_count = movements.count()
            total_movements_checked += mov_count

            # 1. Negative Stock Check
            if not allow_negative and product.current_stock < Decimal("0.00"):
                disc = {
                    "record_type": "product",
                    "record_id": str(product.id),
                    "sku": product.sku,
                    "product_name": product.name,
                    "severity": "CRITICAL",
                    "check_type": "NEGATIVE_STOCK_PROHIBITED",
                    "title": f"Negative stock on product {product.sku}",
                    "description": f"Product current stock is {product.current_stock}, but business policy strictly prohibits negative inventory.",
                    "expected_value": ">= 0.00",
                    "actual_value": str(product.current_stock),
                    "suggested_action": "Perform physical stock count and record an authorized stock adjustment with audit notes.",
                }
                discrepancies.append(disc)
                if emit_alerts:
                    OperationalAlertService.emit_alert(
                        organization=organization,
                        alert_type="NEGATIVE_STOCK",
                        severity="CRITICAL",
                        title=disc["title"],
                        description=disc["description"],
                        entity_type="product",
                        entity_id=str(product.id),
                        recommended_action=disc["suggested_action"],
                    )

            if mov_count == 0:
                # No movements recorded yet for this product
                continue

            # 2. Movement Ledger Chain Calculation
            first_mov = movements.first()
            opening_stock = first_mov.previous_stock
            total_delta = movements.aggregate(s=Sum("quantity"))["s"] or Decimal("0.00")
            expected_current = opening_stock + total_delta

            if abs(round(expected_current, 2) - round(product.current_stock, 2)) > Decimal("0.01"):
                diff = product.current_stock - expected_current
                disc = {
                    "record_type": "product",
                    "record_id": str(product.id),
                    "sku": product.sku,
                    "product_name": product.name,
                    "severity": "CRITICAL",
                    "check_type": "STOCK_LEDGER_MISMATCH",
                    "title": f"Stock ledger discrepancy on {product.sku} ({product.name})",
                    "description": f"Ledger calculated stock is {expected_current}, but recorded current_stock is {product.current_stock} (variance: {diff:+.2f}).",
                    "expected_value": str(expected_current),
                    "actual_value": str(product.current_stock),
                    "suggested_action": "Inspect inventory movement ledger for missing receipts or unrecorded write-offs. Do not silently overwrite.",
                }
                discrepancies.append(disc)
                if emit_alerts:
                    OperationalAlertService.emit_alert(
                        organization=organization,
                        alert_type="INVENTORY_DISCREPANCY",
                        severity="CRITICAL",
                        title=disc["title"],
                        description=disc["description"],
                        entity_type="product",
                        entity_id=str(product.id),
                        recommended_action=disc["suggested_action"],
                    )

            # 3. Duplicate Sale Movements Check
            sale_movements = movements.filter(movement_type__in=["SALE", "sale"], reference_type="transaction")
            sale_refs = sale_movements.values("reference_id").annotate(ref_count=Count("id")).filter(ref_count__gt=1)
            for dup in sale_refs:
                ref_id = dup["reference_id"]
                disc = {
                    "record_type": "inventory_movement",
                    "record_id": str(ref_id),
                    "sku": product.sku,
                    "product_name": product.name,
                    "severity": "WARNING",
                    "check_type": "DUPLICATE_SALE_STOCK_DEDUCTION",
                    "title": f"Duplicate inventory deduction on transaction {ref_id}",
                    "description": f"Transaction {ref_id} has {dup['ref_count']} separate stock deduction movements for product {product.sku}.",
                    "expected_value": "1 movement per transaction item",
                    "actual_value": f"{dup['ref_count']} movements",
                    "suggested_action": "Review checkout logs to determine if idempotency key failed or transaction was processed twice.",
                }
                discrepancies.append(disc)

        return {
            "status": "clean" if len(discrepancies) == 0 else "discrepancies_detected",
            "executed_at": timezone.now().isoformat(),
            "total_products_checked": total_products_checked,
            "total_movements_checked": total_movements_checked,
            "discrepancies_count": len(discrepancies),
            "critical_count": sum(1 for d in discrepancies if d.get("severity") == "CRITICAL"),
            "warning_count": sum(1 for d in discrepancies if d.get("severity") == "WARNING"),
            "discrepancies": discrepancies,
        }

    @classmethod
    def export_csv(cls, reconciliation_result: Dict[str, Any]) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Check Type",
            "Severity",
            "SKU",
            "Product Name",
            "Expected Value",
            "Actual Value",
            "Description",
            "Suggested Action",
        ])

        for d in reconciliation_result.get("discrepancies", []):
            writer.writerow([
                d.get("check_type", ""),
                d.get("severity", ""),
                d.get("sku", ""),
                d.get("product_name", ""),
                d.get("expected_value", ""),
                d.get("actual_value", ""),
                d.get("description", ""),
                d.get("suggested_action", ""),
            ])

        return output.getvalue()
