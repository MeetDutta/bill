from decimal import Decimal
from typing import Dict, Any, List
from django.db.models import Sum

from apps.invoices.models import Invoice
from apps.transactions.models import Transaction, TransactionPayment
from apps.products.models import Product, InventoryMovement, PurchaseOrder
from apps.customers.models import Customer


class ReconciliationService:
    """
    Authoritative Financial and Inventory Data Reconciliation Engine.
    Detects financial mismatches, unlinked invoices, stock ledger drift,
    and customer balance discrepancies without silently modifying records.
    """

    @classmethod
    def verify_invoice_integrity(cls, invoice_id_or_number: str, organization=None) -> Dict[str, Any]:
        import uuid
        qs = Invoice.objects.select_related("transaction", "organization")
        if organization:
            qs = qs.filter(organization=organization)

        is_uuid = False
        try:
            uuid.UUID(str(invoice_id_or_number))
            is_uuid = True
        except (ValueError, AttributeError):
            is_uuid = False

        if is_uuid:
            invoice = qs.filter(id=invoice_id_or_number).first()
        else:
            invoice = qs.filter(invoice_number=invoice_id_or_number).first()

        if not invoice:
            return {"valid": False, "error": f"Invoice '{invoice_id_or_number}' not found"}

        tx = invoice.transaction
        if not tx:
            return {"valid": False, "error": f"Invoice '{invoice.invoice_number}' has no linked Transaction!"}

        errors: List[str] = []
        items_total = tx.items.aggregate(s=Sum("total"))["s"] or Decimal("0.00")
        
        # Round-off check: tx.total should equal items_total + tx.round_off (or within tolerance)
        expected_total = items_total + (tx.round_off or Decimal("0.00"))
        if abs(tx.total - expected_total) > Decimal("0.05"):
            errors.append(f"Transaction total (₹{tx.total}) does not match items total + round_off (₹{expected_total})")

        # Payment reconciliation: amount_paid + outstanding_amount == total
        if abs((tx.amount_paid + tx.outstanding_amount) - tx.total) > Decimal("0.05"):
            errors.append(f"Amount paid (₹{tx.amount_paid}) + outstanding (₹{tx.outstanding_amount}) != Total (₹{tx.total})")

        payments_sum = tx.payments.filter(status="success").aggregate(s=Sum("amount"))["s"] or Decimal("0.00")
        if tx.payment_status == "paid" and abs(payments_sum - tx.amount_paid) > Decimal("0.05") and payments_sum > Decimal("0.00"):
            errors.append(f"Successful payments total (₹{payments_sum}) != Recorded amount paid (₹{tx.amount_paid})")

        return {
            "valid": len(errors) == 0,
            "invoice_number": invoice.invoice_number,
            "transaction_id": str(tx.id),
            "invoice_total": str(tx.total),
            "amount_paid": str(tx.amount_paid),
            "outstanding_amount": str(tx.outstanding_amount),
            "items_count": tx.items.count(),
            "errors": errors,
        }

    @classmethod
    def verify_transaction_integrity(cls, transaction_id: str, organization=None) -> Dict[str, Any]:
        qs = Transaction.objects.select_related("invoice", "customer", "store", "organization").prefetch_related("items", "payments")
        if organization:
            qs = qs.filter(organization=organization)

        tx = qs.filter(id=transaction_id).first()
        if not tx:
            return {"valid": False, "error": f"Transaction '{transaction_id}' not found"}

        errors: List[str] = []
        if not hasattr(tx, "invoice") or not tx.invoice:
            errors.append("Transaction has no linked Invoice record.")

        if tx.items.count() == 0:
            errors.append("Transaction has zero items.")

        # Inventory check: for tracked products sold, verify movement exists
        movements_count = InventoryMovement.objects.filter(
            reference_type="transaction",
            reference_id=str(tx.id),
        ).count()
        tracked_items_count = tx.items.filter(product__track_inventory=True).count()
        if tracked_items_count > 0 and movements_count == 0 and tx.status == "completed":
            errors.append(f"Tracked items sold ({tracked_items_count}) but 0 InventoryMovement records found.")

        return {
            "valid": len(errors) == 0,
            "invoice_number": tx.invoice_number,
            "total": str(tx.total),
            "items_count": tx.items.count(),
            "has_invoice": hasattr(tx, "invoice") and tx.invoice is not None,
            "movements_recorded": movements_count,
            "errors": errors,
        }

    @classmethod
    def verify_inventory_integrity(cls, product_id: str, organization=None) -> Dict[str, Any]:
        qs = Product.objects.filter(id=product_id)
        if organization:
            qs = qs.filter(organization=organization)
        product = qs.first()
        if not product:
            return {"valid": False, "error": f"Product '{product_id}' not found"}

        if not product.track_inventory:
            return {
                "valid": True,
                "product_name": product.name,
                "track_inventory": False,
                "current_stock": str(product.current_stock),
                "message": "Inventory tracking is disabled for this product.",
            }

        movements = InventoryMovement.objects.filter(product=product).order_by("created_at")
        net_quantity = movements.aggregate(s=Sum("quantity"))["s"] or Decimal("0.00")

        # Compare recorded stock vs movements ledger sum
        drift = product.current_stock - net_quantity
        errors: List[str] = []
        if abs(drift) > Decimal("0.01"):
            errors.append(
                f"Stock ledger drift detected! Product current_stock={product.current_stock}, "
                f"Movement ledger sum={net_quantity}, Drift={drift}."
            )

        return {
            "valid": len(errors) == 0,
            "product_id": str(product.id),
            "product_name": product.name,
            "sku": product.sku,
            "current_stock": str(product.current_stock),
            "ledger_sum": str(net_quantity),
            "drift": str(drift),
            "movements_count": movements.count(),
            "errors": errors,
        }

    @classmethod
    def verify_customer_balance(cls, customer_id: str, organization=None) -> Dict[str, Any]:
        qs = Customer.objects.filter(id=customer_id)
        if organization:
            qs = qs.filter(organization=organization)
        customer = qs.first()
        if not customer:
            return {"valid": False, "error": f"Customer '{customer_id}' not found"}

        errors: List[str] = []
        # Calculate real outstanding from unpaid transactions
        real_outstanding = Transaction.objects.filter(
            customer=customer,
            status="completed",
        ).aggregate(s=Sum("outstanding_amount"))["s"] or Decimal("0.00")

        if abs(customer.outstanding_credit - real_outstanding) > Decimal("0.05"):
            errors.append(
                f"Customer credit mismatch! Profile credit={customer.outstanding_credit}, "
                f"Sum of active unpaid invoices={real_outstanding}."
            )

        # Real total purchases and spend
        tx_stats = Transaction.objects.filter(
            customer=customer,
            status="completed",
        ).aggregate(count=Sum(1), total=Sum("total"))

        real_outstanding_dec = real_outstanding.quantize(Decimal("0.01"))
        return {
            "valid": len(errors) == 0,
            "customer_id": str(customer.id),
            "customer_name": customer.full_name,
            "recorded_outstanding": str(customer.outstanding_credit),
            "calculated_outstanding": str(real_outstanding_dec),
            "recorded_spend": str(customer.total_spend),
            "errors": errors,
        }

    @classmethod
    def verify_purchase_integrity(cls, purchase_id: str, organization=None) -> Dict[str, Any]:
        qs = PurchaseOrder.objects.prefetch_related("items").filter(id=purchase_id)
        if organization:
            qs = qs.filter(organization=organization)
        po = qs.first()
        if not po:
            return {"valid": False, "error": f"Purchase order '{purchase_id}' not found"}

        errors: List[str] = []
        items_total = po.items.aggregate(s=Sum("total"))["s"] or Decimal("0.00")
        if abs(po.total_amount - items_total) > Decimal("0.05"):
            errors.append(f"PO total amount (₹{po.total_amount}) != items sum (₹{items_total})")

        # Inventory verification
        movements = InventoryMovement.objects.filter(
            reference_type="purchase_order",
            reference_id=str(po.id),
            movement_type="PURCHASE",
        )
        if po.status == "received" and movements.count() == 0:
            errors.append("PO is marked received but has zero PURCHASE inventory movements.")

        return {
            "valid": len(errors) == 0,
            "po_number": po.po_number,
            "supplier": po.supplier,
            "total_amount": str(po.total_amount),
            "items_count": po.items.count(),
            "movements_count": movements.count(),
            "errors": errors,
        }
