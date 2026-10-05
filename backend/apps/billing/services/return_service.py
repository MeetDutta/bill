import secrets
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.billing.models import CashRegister
from apps.products.models import Product, InventoryMovement
from apps.transactions.models import Transaction, TransactionItem, SalesReturn, SalesReturnItem
from apps.customers.models import CustomerTimeline
from .tax_engine import round_decimal


class ReturnService:
    """
    Sales Return and Refund Engine.
    Ensures safe partial or full sales returns, immutability of original transactions,
    quantity bounds verification, inventory restocking, and credit/cash adjustments.
    """

    @classmethod
    def process_return(
        cls,
        organization,
        user,
        original_transaction_id: str,
        items_to_return: list,
        refund_method: str = "cash",
        notes: str = "",
        restock_inventory: bool = True,
    ) -> dict:
        try:
            original_tx = Transaction.objects.select_related(
                "customer", "store", "organization"
            ).prefetch_related("items").get(
                id=original_transaction_id,
                organization=organization,
            )
        except Transaction.DoesNotExist:
            raise ValidationError("Original transaction not found.")

        if not items_to_return:
            raise ValidationError("No items specified for return.")

        # Map original transaction items
        orig_items_map = {str(item.id): item for item in original_tx.items.all()}

        total_refund_subtotal = Decimal("0.00")
        total_refund_tax = Decimal("0.00")
        total_refund_amount = Decimal("0.00")
        parsed_return_items = []

        for ret in items_to_return:
            item_id = str(ret.get("transaction_item_id"))
            if item_id not in orig_items_map:
                raise ValidationError(f"Transaction item {item_id} does not belong to this bill.")

            tx_item = orig_items_map[item_id]
            qty_to_return = Decimal(str(ret.get("quantity") or 0))

            if qty_to_return <= Decimal("0.00"):
                continue

            available_to_return = tx_item.remaining_returnable_quantity
            if qty_to_return > available_to_return:
                raise ValidationError(
                    f"Cannot return {qty_to_return} of '{tx_item.name}'. "
                    f"Purchased: {tx_item.quantity}, Already returned: {tx_item.returned_quantity}, "
                    f"Max returnable: {available_to_return}."
                )

            # Pro-rated refund calculation
            item_unit_net = round_decimal(tx_item.total / tx_item.quantity)
            item_refund_total = round_decimal(item_unit_net * qty_to_return)

            # Proportionate tax refund
            item_tax_rate = tx_item.tax_rate
            if item_tax_rate > Decimal("0.00"):
                item_refund_tax = round_decimal(item_refund_total * (item_tax_rate / (Decimal("100.00") + item_tax_rate)))
            else:
                item_refund_tax = Decimal("0.00")

            total_refund_amount += item_refund_total
            total_refund_tax += item_refund_tax
            total_refund_subtotal += (item_refund_total - item_refund_tax)

            parsed_return_items.append({
                "transaction_item": tx_item,
                "quantity": qty_to_return,
                "refund_amount": item_refund_total,
                "refund_tax": item_refund_tax,
                "reason": ret.get("reason", "Customer return"),
            })

        if not parsed_return_items:
            raise ValidationError("No valid items or quantities to return.")

        with transaction.atomic():
            seq = secrets.token_hex(2).upper()
            return_number = f"RET-{original_tx.invoice_number}-{seq}"

            sales_return = SalesReturn.objects.create(
                organization=organization,
                store=original_tx.store,
                original_transaction=original_tx,
                customer=original_tx.customer,
                created_by=user if getattr(user, "is_authenticated", False) else None,
                return_number=return_number,
                total_refund_amount=total_refund_amount,
                refund_method=refund_method,
                notes=notes,
                status="completed",
            )

            # Restock products & update returned_quantity
            for p_item in parsed_return_items:
                tx_item = p_item["transaction_item"]
                qty = p_item["quantity"]

                SalesReturnItem.objects.create(
                    sales_return=sales_return,
                    transaction_item=tx_item,
                    product=tx_item.product,
                    quantity=qty,
                    refund_amount=p_item["refund_amount"],
                    reason=p_item["reason"],
                    restock_inventory=restock_inventory,
                )

                # Update immutable transaction item's returned_quantity tracker
                tx_item.returned_quantity += qty
                tx_item.save(update_fields=["returned_quantity"])

                # Restock product inventory
                if restock_inventory and tx_item.product:
                    locked_prod = Product.objects.select_for_update().get(id=tx_item.product.id)
                    prev_stock = locked_prod.current_stock
                    new_stock = prev_stock + qty
                    locked_prod.current_stock = new_stock
                    locked_prod.save(update_fields=["current_stock"])

                    InventoryMovement.objects.create(
                        organization=organization,
                        product=locked_prod,
                        store=original_tx.store,
                        user=user if getattr(user, "is_authenticated", False) else None,
                        movement_type="RETURN",
                        quantity=qty,
                        previous_stock=prev_stock,
                        new_stock=new_stock,
                        reference_type="return",
                        reference_id=str(sales_return.id),
                        notes=f"Sales Return #{return_number} against Inv #{original_tx.invoice_number}",
                    )

            # Customer ledger / credit adjustment
            customer = original_tx.customer
            if customer and not customer.is_walk_in:
                # If transaction was on credit, reduce outstanding credit
                if original_tx.outstanding_amount > Decimal("0.00"):
                    credit_reduction = min(original_tx.outstanding_amount, total_refund_amount)
                    original_tx.outstanding_amount -= credit_reduction
                    if original_tx.outstanding_amount == Decimal("0.00"):
                        original_tx.payment_status = "paid"
                    original_tx.save(update_fields=["outstanding_amount", "payment_status"])

                    customer.outstanding_credit = max(Decimal("0.00"), customer.outstanding_credit - credit_reduction)
                    customer.save(update_fields=["outstanding_credit"])

                CustomerTimeline.objects.create(
                    organization=organization,
                    customer=customer,
                    event_type="sale_return",
                    reference_id=str(sales_return.id),
                    metadata={
                        "return_number": return_number,
                        "invoice_number": original_tx.invoice_number,
                        "refund_amount": str(total_refund_amount),
                    },
                )

            # Cash register refund tracking
            if refund_method == "cash" and original_tx.store:
                active_register = CashRegister.objects.filter(
                    organization=organization,
                    store=original_tx.store,
                    status="open",
                ).first()
                if active_register:
                    active_register.record_refund(total_refund_amount)

        return {
            "id": str(sales_return.id),
            "return_number": sales_return.return_number,
            "original_invoice_number": original_tx.invoice_number,
            "total_refund_amount": str(sales_return.total_refund_amount),
            "refund_method": sales_return.refund_method,
            "created_at": sales_return.created_at.isoformat(),
            "status": sales_return.status,
            "items_returned_count": len(parsed_return_items),
        }
