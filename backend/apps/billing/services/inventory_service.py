from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.products.models import Product, InventoryMovement, PurchaseOrder, PurchaseOrderItem
from .tax_engine import round_decimal


class InventoryService:
    """
    Inventory Management & Stock-in Ledger Engine.
    Handles physical stock adjustments, supplier purchase intake, and immutable audit logs.
    """

    @classmethod
    def adjust_stock(
        cls,
        organization,
        store,
        user,
        product_id: str,
        quantity_delta: Decimal,
        movement_type: str = "ADJUSTMENT",
        notes: str = "",
    ) -> dict:
        quantity_delta = Decimal(str(quantity_delta))
        if quantity_delta == Decimal("0.00"):
            raise ValidationError("Quantity delta cannot be zero.")

        valid_types = dict(getattr(InventoryMovement, "MOVEMENT_TYPES", getattr(InventoryMovement, "MOVEMENT_CHOICES", [])))
        if movement_type not in valid_types:
            raise ValidationError(f"Invalid movement type '{movement_type}'.")

        with transaction.atomic():
            try:
                product = Product.objects.select_for_update().get(id=product_id, organization=organization)
            except Product.DoesNotExist:
                raise ValidationError("Product not found.")
            prev_stock = product.current_stock
            new_stock = prev_stock + quantity_delta

            if new_stock < Decimal("0.00") and movement_type != "ADJUSTMENT":
                raise ValidationError(f"Stock cannot become negative ({new_stock}).")

            product.current_stock = new_stock
            product.save(update_fields=["current_stock"])

            movement = InventoryMovement.objects.create(
                organization=organization,
                product=product,
                store=store,
                user=user if getattr(user, "is_authenticated", False) else None,
                movement_type=movement_type,
                quantity=quantity_delta,
                previous_stock=prev_stock,
                new_stock=new_stock,
                reference_type="adjustment",
                notes=notes,
            )

        return {
            "product_id": str(product.id),
            "product_name": product.name,
            "sku": product.sku,
            "previous_stock": str(prev_stock),
            "quantity_delta": str(quantity_delta),
            "new_stock": str(new_stock),
            "movement_type": movement_type,
            "created_at": movement.created_at.isoformat(),
        }

    @classmethod
    def record_purchase_order(
        cls,
        organization,
        store,
        user,
        supplier: str,
        supplier_invoice_number: str,
        purchase_date,
        items: list,
        notes: str = "",
        supplier_id: str = None,
        status: str = "received",
        expected_delivery = None,
        due_date = None,
    ) -> dict:
        if not items:
            raise ValidationError("Purchase order must contain at least one item.")

        if not store:
            from apps.stores.models import Store
            store = Store.objects.filter(organization=organization).first()

        from apps.products.models import Supplier
        supplier_obj = None
        if supplier_id:
            supplier_obj = Supplier.objects.filter(id=supplier_id, organization=organization).first()
        elif supplier and supplier != "Supplier":
            supplier_obj = Supplier.objects.filter(name__iexact=supplier.strip(), organization=organization).first()

        supplier_name_val = supplier_obj.name if supplier_obj else (supplier or "Supplier")

        total_amount = Decimal("0.00")
        total_tax = Decimal("0.00")
        parsed_items = []

        for it in items:
            p_id = it.get("product_id")
            try:
                product = Product.objects.get(id=p_id, organization=organization)
            except Product.DoesNotExist:
                raise ValidationError(f"Product {p_id} not found.")

            qty = Decimal(str(it.get("quantity") or 0))
            if qty <= Decimal("0.00"):
                raise ValidationError(f"Invalid quantity for {product.name}.")

            unit_price = Decimal(str(it.get("purchase_price") or product.purchase_price or 0))
            tax_rate = Decimal(str(it.get("tax_rate") or product.tax_rate or 0))
            subtotal = round_decimal(unit_price * qty)
            tax_amount = round_decimal(subtotal * (tax_rate / Decimal("100.00")))
            line_total = subtotal + tax_amount

            total_amount += line_total
            total_tax += tax_amount

            parsed_items.append({
                "product": product,
                "quantity": qty,
                "purchase_price": unit_price,
                "tax_rate": tax_rate,
                "total": line_total,
            })

        po_status = status.lower() if status else "received"
        if po_status not in ["draft", "sent", "ordered", "partially_received", "received", "cancelled"]:
            po_status = "received"

        with transaction.atomic():
            import secrets
            po_number = f"PO-{timezone.now().strftime('%Y%m')}-{secrets.token_hex(3).upper()}"

            po = PurchaseOrder.objects.create(
                organization=organization,
                store=store,
                created_by=user if getattr(user, "is_authenticated", False) else None,
                po_number=po_number,
                supplier=supplier_name_val,
                supplier_ref=supplier_obj,
                supplier_invoice_number=supplier_invoice_number,
                purchase_date=purchase_date or timezone.now().date(),
                expected_delivery=expected_delivery,
                due_date=due_date,
                total_amount=total_amount,
                tax_amount=total_tax,
                status=po_status,
                notes=notes,
            )

            for p_it in parsed_items:
                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    product=p_it["product"],
                    quantity=p_it["quantity"],
                    purchase_price=p_it["purchase_price"],
                    tax_rate=p_it["tax_rate"],
                    total=p_it["total"],
                )

                # Only increase inventory if status is received
                if po_status == "received":
                    locked_prod = Product.objects.select_for_update().get(id=p_it["product"].id)
                    prev_stock = locked_prod.current_stock
                    new_stock = prev_stock + p_it["quantity"]
                    locked_prod.current_stock = new_stock
                    if p_it["purchase_price"] > Decimal("0.00"):
                        locked_prod.cost_price = p_it["purchase_price"]
                    locked_prod.save(update_fields=["current_stock", "cost_price"])

                    InventoryMovement.objects.create(
                        organization=organization,
                        product=locked_prod,
                        store=store,
                        user=user if getattr(user, "is_authenticated", False) else None,
                        movement_type="PURCHASE",
                        quantity=p_it["quantity"],
                        previous_stock=prev_stock,
                        new_stock=new_stock,
                        reference_type="purchase_order",
                        reference_id=str(po.id),
                        notes=f"Supplier Stock-in PO #{po_number} (Inv: {supplier_invoice_number})",
                    )

        return {
            "id": str(po.id),
            "po_number": po.po_number,
            "supplier": po.supplier,
            "supplier_invoice_number": po.supplier_invoice_number,
            "total_amount": str(po.total_amount),
            "items_count": len(parsed_items),
            "status": po.status,
            "created_at": po.created_at.isoformat(),
        }

    @classmethod
    def receive_purchase_order(
        cls,
        organization,
        purchase_order_id: str,
        user,
        supplier_invoice_number: str = None,
        notes: str = None,
    ) -> dict:
        """
        Receives goods for an existing Purchase Order, increasing stock and recording movements.
        """
        try:
            po = PurchaseOrder.objects.prefetch_related("items__product").get(
                id=purchase_order_id,
                organization=organization,
            )
        except PurchaseOrder.DoesNotExist:
            raise ValidationError("Purchase order not found.")

        if po.status == "received":
            raise ValidationError("Purchase order has already been received.")
        if po.status == "cancelled":
            raise ValidationError("Cannot receive a cancelled purchase order.")

        with transaction.atomic():
            if supplier_invoice_number:
                po.supplier_invoice_number = supplier_invoice_number
            if notes:
                po.notes = f"{po.notes}\n{notes}".strip() if po.notes else notes
            po.status = "received"
            po.save(update_fields=["status", "supplier_invoice", "notes"])

            for it in po.items.all():
                locked_prod = Product.objects.select_for_update().get(id=it.product_id)
                prev_stock = locked_prod.current_stock
                new_stock = prev_stock + it.quantity
                locked_prod.current_stock = new_stock
                if it.purchase_price > Decimal("0.00"):
                    locked_prod.cost_price = it.purchase_price
                locked_prod.save(update_fields=["current_stock", "cost_price"])

                InventoryMovement.objects.create(
                    organization=organization,
                    product=locked_prod,
                    store=po.store,
                    user=user if getattr(user, "is_authenticated", False) else None,
                    movement_type="PURCHASE",
                    quantity=it.quantity,
                    previous_stock=prev_stock,
                    new_stock=new_stock,
                    reference_type="purchase_order",
                    reference_id=str(po.id),
                    notes=f"Received PO #{po.po_number} (Inv: {po.supplier_invoice_number})",
                )

        return {
            "id": str(po.id),
            "po_number": po.po_number,
            "status": po.status,
            "supplier_invoice_number": po.supplier_invoice_number,
            "total_amount": str(po.total_amount),
        }

    @classmethod
    def cancel_purchase_order(cls, organization, purchase_order_id: str, user, reason: str = None) -> dict:
        try:
            po = PurchaseOrder.objects.get(id=purchase_order_id, organization=organization)
        except PurchaseOrder.DoesNotExist:
            raise ValidationError("Purchase order not found.")

        if po.status == "received":
            raise ValidationError("Cannot cancel a purchase order that has already been received.")

        po.status = "cancelled"
        if reason:
            po.notes = f"{po.notes}\nCancelled: {reason}".strip() if po.notes else f"Cancelled: {reason}"
        po.save(update_fields=["status", "notes"])

        return {"id": str(po.id), "po_number": po.po_number, "status": po.status}

