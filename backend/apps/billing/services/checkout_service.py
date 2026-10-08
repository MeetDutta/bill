import uuid
import secrets
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.billing.models import BusinessConfig, CashRegister
from apps.products.models import Product, InventoryMovement
from apps.transactions.models import Transaction, TransactionItem, TransactionPayment
from apps.customers.models import Customer, CustomerTimeline
from apps.customers.utils import normalize_phone
import logging
from apps.invoices.models import Invoice
from .cart_engine import CartEngine, round_decimal
from .invoice_number_service import InvoiceNumberService

logger = logging.getLogger(__name__)


class CheckoutService:
    """
    Authoritative Universal POS Checkout Service.
    Coordinates stock validation, discount controls, tax computation,
    split payments, inventory deduction with row locks, invoice creation,
    customer loyalty and register cash accounting.
    """

    @classmethod
    def process_checkout(
        cls,
        organization,
        store,
        user,
        cart_data: dict,
        idempotency_key: str = None,
    ) -> dict:
        """
        Processes a full POS sale checkout atomically.
        """
        # 1. Idempotency Check
        if idempotency_key:
            existing = Transaction.objects.filter(
                organization=organization,
                external_transaction_id=idempotency_key,
            ).select_related("invoice", "customer", "store").first()
            if existing:
                return cls._format_checkout_response(existing)

        # 2. Load Business Configuration
        config, _ = BusinessConfig.objects.get_or_create(
            organization=organization,
            defaults={"business_type": "retail"},
        )

        items_input = cart_data.get("items", [])
        if not items_input:
            raise ValidationError("Cart cannot be empty.")

        # 3. Product Lookup & Cart Preparation
        prepared_items = []
        product_map = {}

        product_ids = [item.get("product_id") for item in items_input if item.get("product_id")]
        skus = [item.get("sku") for item in items_input if item.get("sku")]
        barcodes = [item.get("barcode") for item in items_input if item.get("barcode")]

        # Query existing products
        query = Product.objects.filter(organization=organization, is_active=True)
        products_qs = query.filter(
            id__in=product_ids
        ) | query.filter(
            sku__in=skus
        ) | query.filter(
            barcode__in=barcodes
        )
        for p in products_qs:
            product_map[str(p.id)] = p
            if p.sku:
                product_map[p.sku] = p
            if p.barcode:
                product_map[p.barcode] = p

        for item in items_input:
            p = None
            if item.get("product_id") and str(item.get("product_id")) in product_map:
                p = product_map[str(item.get("product_id"))]
            elif item.get("sku") and item.get("sku") in product_map:
                p = product_map[item.get("sku")]
            elif item.get("barcode") and item.get("barcode") in product_map:
                p = product_map[item.get("barcode")]

            qty = Decimal(str(item.get("quantity") or 1))
            if qty <= Decimal("0.00"):
                raise ValidationError(f"Invalid quantity {qty} for item {item.get('name')}.")

            # Price from product or override
            if p:
                unit_price = Decimal(str(item.get("unit_price") or p.selling_price))
                tax_rate = Decimal(str(item.get("tax_rate") if item.get("tax_rate") is not None else p.tax_rate))
                hsn_code = item.get("hsn_code") or p.hsn_code or ""
                name = item.get("name") or p.name
                product_id = p.id
            else:
                # Custom line item / quick item
                unit_price = Decimal(str(item.get("unit_price") or 0))
                tax_rate = Decimal(str(item.get("tax_rate") or config.default_tax_rate))
                hsn_code = item.get("hsn_code") or ""
                name = item.get("name") or "Custom Item"
                product_id = None

            attributes = item.get("attributes") or (p.product_attributes if p else {})

            prepared_items.append({
                "product": p,
                "product_id": product_id,
                "name": name,
                "quantity": qty,
                "unit_price": unit_price,
                "discount": Decimal(str(item.get("discount") or 0)),
                "discount_type": item.get("discount_type", "fixed"),
                "tax_rate": tax_rate,
                "hsn_code": hsn_code,
                "attributes": attributes,
            })

        # 4. Discount Permission Check
        overall_disc_val = Decimal(str(cart_data.get("overall_discount_value") or 0))
        overall_disc_type = cart_data.get("overall_discount_type", "fixed")
        # Check cashier limits if user is a cashier
        user_role = getattr(user, "role", "cashier") if user else "cashier"
        if user_role == "cashier":
            # Check % discount
            if overall_disc_type == "percentage" and overall_disc_val > config.max_cashier_discount_percent:
                raise ValidationError(
                    f"Cashier discount limit exceeded. Maximum allowed: {config.max_cashier_discount_percent}%"
                )

        # 5. Calculate Cart via CartEngine
        is_interstate = bool(cart_data.get("is_interstate", False))
        is_tax_inclusive = config.tax_mode == "inclusive"
        gst_enabled = config.gst_enabled

        cart_calc = CartEngine.calculate_cart(
            items=prepared_items,
            overall_discount_type=overall_disc_type,
            overall_discount_value=overall_disc_val,
            coupon_discount=Decimal(str(cart_data.get("coupon_discount") or 0)),
            gst_enabled=gst_enabled,
            is_tax_inclusive=is_tax_inclusive,
            is_interstate=is_interstate,
        )

        grand_total = cart_calc["grand_total"]

        # 6. Customer Identification
        customer_info = cart_data.get("customer") or {}
        customer = None
        is_walk_in = cart_data.get("is_walk_in", False) or not bool(customer_info.get("phone"))

        if is_walk_in:
            # Walk-in customer strategy: Single tenant-scoped walk-in record or null
            if config.require_customer:
                raise ValidationError("Customer information is required for this business.")
            customer = Customer.objects.filter(organization=organization, is_walk_in=True).first()
            if not customer:
                customer = Customer.objects.create(
                    organization=organization,
                    customer_id=f"WALKIN-{secrets.token_hex(4).upper()}",
                    first_name="Walk-in",
                    last_name="Customer",
                    phone=f"walkin-{organization.id.hex[:6]}",
                    is_walk_in=True,
                    source="pos",
                )
        else:
            raw_phone = customer_info.get("phone", "")
            phone = normalize_phone(raw_phone)
            if not phone:
                raise ValidationError("A valid customer phone number is required.")

            customer, created = Customer.objects.get_or_create(
                organization=organization,
                phone=phone,
                defaults={
                    "first_name": customer_info.get("first_name") or customer_info.get("name", "Customer").split()[0],
                    "last_name": customer_info.get("last_name") or " ".join(customer_info.get("name", "").split()[1:]),
                    "email": customer_info.get("email", ""),
                    "source": "pos",
                },
            )
            if created:
                from apps.loyalty.models import LoyaltyAccount
                LoyaltyAccount.objects.get_or_create(
                    organization=organization,
                    customer=customer,
                    defaults={"balance": 0, "total_earned": 0, "total_redeemed": 0},
                )
                CustomerTimeline.objects.create(
                    organization=organization,
                    customer=customer,
                    event_type="created",
                )

        # 7. Payment Validation & Split Payments
        payments_input = cart_data.get("payments", [])
        if not payments_input:
            default_method = cart_data.get("payment_method") or config.default_payment_method
            payments_input = [{"payment_method": default_method, "amount": grand_total}]

        total_paid_tendered = Decimal("0.00")
        credit_amount = Decimal("0.00")
        cash_paid = Decimal("0.00")

        parsed_payments = []
        for p_data in payments_input:
            amt = Decimal(str(p_data.get("amount") or 0))
            if amt <= Decimal("0.00"):
                continue
            method = p_data.get("payment_method", "cash").lower()
            ref = str(p_data.get("reference") or "")
            parsed_payments.append({
                "payment_method": method,
                "amount": amt,
                "reference": ref,
                "notes": str(p_data.get("notes") or ""),
            })
            total_paid_tendered += amt
            if method == "credit":
                credit_amount += amt
            if method == "cash":
                cash_paid += amt

        if total_paid_tendered < grand_total:
            raise ValidationError(
                f"Payment amount (₹{total_paid_tendered}) is less than bill total (₹{grand_total})."
            )

        # Credit validation
        if credit_amount > Decimal("0.00"):
            if not config.allow_credit_sales:
                raise ValidationError("Credit sales are not enabled for this business.")
            if is_walk_in or not customer or customer.is_walk_in:
                raise ValidationError("Credit sales require a registered customer.")
            if customer.credit_limit > Decimal("0.00"):
                new_outstanding = customer.outstanding_credit + credit_amount
                if new_outstanding > customer.credit_limit:
                    raise ValidationError(
                        f"Customer credit limit of ₹{customer.credit_limit} exceeded. "
                        f"Current: ₹{customer.outstanding_credit}, Requested: ₹{credit_amount}."
                    )

        # Determine overall payment status
        if credit_amount >= grand_total:
            payment_status = "credit"
            amount_paid = Decimal("0.00")
            outstanding_amount = grand_total
        elif credit_amount > Decimal("0.00"):
            payment_status = "partial"
            amount_paid = grand_total - credit_amount
            outstanding_amount = credit_amount
        else:
            payment_status = "paid"
            amount_paid = grand_total
            outstanding_amount = Decimal("0.00")

        # 8. ATOMIC DATABASE EXECUTION
        with transaction.atomic():
            # 8a. Lock & Validate Products Stock
            db_products = {}
            p_ids_to_lock = [item["product"].id for item in prepared_items if item.get("product")]
            if p_ids_to_lock:
                locked_qs = Product.objects.select_for_update().filter(
                    organization=organization,
                    id__in=p_ids_to_lock,
                )
                for lp in locked_qs:
                    db_products[lp.id] = lp

            # Validate stock availability
            if not config.allow_negative_stock:
                for item in prepared_items:
                    prod = item.get("product")
                    if prod and prod.id in db_products:
                        locked_prod = db_products[prod.id]
                        if locked_prod.track_inventory:
                            if locked_prod.current_stock < item["quantity"]:
                                raise ValidationError(
                                    f"Insufficient stock for '{locked_prod.name}'. "
                                    f"Available: {locked_prod.current_stock}, Requested: {item['quantity']}."
                                )

            # 8b. Safe Sequential Invoice Number Generation
            invoice_number = InvoiceNumberService.generate_invoice_number(
                organization=organization,
                store=store,
                prefix=config.invoice_prefix,
            )

            # 8c. Create Transaction
            primary_method = parsed_payments[0]["payment_method"] if parsed_payments else "cash"
            tx = Transaction.objects.create(
                organization=organization,
                store=store,
                customer=customer,
                cashier=user if getattr(user, "is_authenticated", False) else None,
                invoice_number=invoice_number,
                transaction_date=timezone.now(),
                subtotal=cart_calc["subtotal"],
                discount=cart_calc["total_discount"],
                tax=cart_calc["tax"],
                round_off=cart_calc["round_off"],
                total=grand_total,
                payment_method=primary_method,
                payment_status=payment_status,
                amount_paid=amount_paid,
                outstanding_amount=outstanding_amount,
                due_date=cart_data.get("due_date"),
                tax_breakup=cart_calc["tax_breakup"],
                external_source="pos",
                external_transaction_id=idempotency_key or "",
            )

            # 8d. Create Transaction Items & Deduct Inventory
            for calc_item in cart_calc["items"]:
                prod = calc_item.get("product")
                t_item = TransactionItem.objects.create(
                    transaction=tx,
                    product=prod,
                    external_product_id=str(prod.id) if prod else "",
                    name=calc_item["name"],
                    quantity=calc_item["quantity"],
                    unit_price=calc_item["unit_price"],
                    discount=calc_item["discount"],
                    tax=calc_item["tax"],
                    tax_rate=calc_item["tax_rate"],
                    cgst_amount=calc_item["cgst_amount"],
                    sgst_amount=calc_item["sgst_amount"],
                    igst_amount=calc_item["igst_amount"],
                    total=calc_item["total"],
                    hsn_code=calc_item["hsn_code"],
                    attributes=calc_item.get("attributes", {}),
                )

                # Deduct inventory & record movement
                if prod and prod.id in db_products:
                    locked_prod = db_products[prod.id]
                    if locked_prod.track_inventory:
                        prev_stock = locked_prod.current_stock
                        new_stock = prev_stock - calc_item["quantity"]
                        locked_prod.current_stock = new_stock
                        locked_prod.save(update_fields=["current_stock"])

                        InventoryMovement.objects.create(
                            organization=organization,
                            product=locked_prod,
                            store=store,
                            user=user if getattr(user, "is_authenticated", False) else None,
                            movement_type="SALE",
                            quantity=-calc_item["quantity"],
                            previous_stock=prev_stock,
                            new_stock=new_stock,
                            reference_type="transaction",
                            reference_id=str(tx.id),
                            notes=f"POS Sale Invoice #{invoice_number}",
                        )

            # 8e. Create Transaction Payment Records
            for p in parsed_payments:
                TransactionPayment.objects.create(
                    organization=organization,
                    transaction=tx,
                    payment_method=p["payment_method"],
                    amount=p["amount"],
                    reference=p["reference"],
                    notes=p["notes"],
                    status="success",
                )

            # 8f. Update Customer Outstanding & Stats
            if customer and not customer.is_walk_in:
                if credit_amount > Decimal("0.00"):
                    customer.outstanding_credit += credit_amount
                    customer.save(update_fields=["outstanding_credit"])

                    CustomerTimeline.objects.create(
                        organization=organization,
                        customer=customer,
                        event_type="credit_sale",
                        reference_id=str(tx.id),
                        metadata={
                            "invoice_number": tx.invoice_number,
                            "credit_amount": str(credit_amount),
                            "total": str(tx.total),
                        },
                    )

                customer.update_stats(tx.total)
                event_type = "repeat_purchase" if customer.total_purchases > 1 else "purchase"
                CustomerTimeline.objects.create(
                    organization=organization,
                    customer=customer,
                    event_type=event_type,
                    reference_id=str(tx.id),
                    metadata={"invoice_number": tx.invoice_number, "total": str(tx.total)},
                )

            # 8g. Create Invoice Record
            secure_token = secrets.token_urlsafe(24)
            invoice_type = "gst" if config.gst_enabled else "non_gst"
            invoice = Invoice.objects.create(
                organization=organization,
                transaction=tx,
                invoice_number=invoice_number,
                invoice_type=invoice_type,
                template_format=config.default_invoice_format or "a4",
                terms_and_conditions=config.invoice_terms_and_conditions or "",
                custom_notes=config.invoice_footer or "",
                secure_token=secure_token,
                web_url=f"/bills/{secure_token}",
            )

            # 8h. Update Open Cash Register if Cash Payment Involved
            if cash_paid > Decimal("0.00") and store:
                active_register = CashRegister.objects.filter(
                    organization=organization,
                    store=store,
                    status="open",
                ).first()
                if active_register:
                    active_register.record_sale(cash_paid)

        # 9. Asynchronous Pipeline / Background Tasks
        try:
            from apps.invoices.tasks import generate_invoice_task
            generate_invoice_task.delay(str(tx.id))
        except Exception as e:
            logger.warning("Failed to enqueue generate_invoice_task: %s", e)

        try:
            from apps.loyalty.tasks import calculate_loyalty_task
            calculate_loyalty_task.delay(str(tx.id), str(organization.id))
        except Exception as e:
            logger.warning("Failed to enqueue calculate_loyalty_task: %s", e)

        if config.auto_send_digital_bill:
            try:
                from apps.whatsapp.tasks import send_digital_bill_task
                send_digital_bill_task.delay(str(tx.id))
            except Exception as e:
                logger.warning("Failed to enqueue send_digital_bill_task: %s", e)

        return cls._format_checkout_response(tx)

    @classmethod
    def _format_checkout_response(cls, tx: Transaction) -> dict:
        invoice = getattr(tx, "invoice", None)
        items_data = []
        for it in tx.items.select_related("product").all():
            items_data.append({
                "id": str(it.id),
                "product_id": str(it.product.id) if it.product else None,
                "name": it.name,
                "quantity": str(it.quantity),
                "unit_price": str(it.unit_price),
                "discount": str(it.discount),
                "tax": str(it.tax),
                "tax_rate": str(it.tax_rate),
                "cgst_amount": str(it.cgst_amount),
                "sgst_amount": str(it.sgst_amount),
                "igst_amount": str(it.igst_amount),
                "total": str(it.total),
                "hsn_code": it.hsn_code,
                "attributes": it.attributes,
                "returned_quantity": str(it.returned_quantity),
            })

        payments_data = []
        for p in tx.payments.all():
            payments_data.append({
                "id": str(p.id),
                "payment_method": p.payment_method,
                "amount": str(p.amount),
                "reference": p.reference,
                "status": p.status,
            })

        return {
            "id": str(tx.id),
            "invoice_number": tx.invoice_number,
            "transaction_date": tx.transaction_date.isoformat(),
            "customer": {
                "id": str(tx.customer.id) if tx.customer else None,
                "name": tx.customer.full_name if tx.customer else "Walk-in Customer",
                "phone": tx.customer.phone if tx.customer else "",
                "outstanding_credit": str(tx.customer.outstanding_credit) if tx.customer else "0.00",
                "is_walk_in": tx.customer.is_walk_in if tx.customer else True,
            } if tx.customer else None,
            "store": {
                "id": str(tx.store.id) if tx.store else None,
                "name": tx.store.name if tx.store else "",
            } if tx.store else None,
            "subtotal": str(tx.subtotal),
            "discount": str(tx.discount),
            "tax": str(tx.tax),
            "round_off": str(tx.round_off),
            "total": str(tx.total),
            "amount_paid": str(tx.amount_paid),
            "outstanding_amount": str(tx.outstanding_amount),
            "payment_status": tx.payment_status,
            "payment_method": tx.payment_method,
            "tax_breakup": tx.tax_breakup,
            "items": items_data,
            "payments": payments_data,
            "invoice": {
                "id": str(invoice.id) if invoice else None,
                "invoice_number": invoice.invoice_number if invoice else tx.invoice_number,
                "invoice_type": invoice.invoice_type if invoice else "gst",
                "template_format": invoice.template_format if invoice else "a4",
                "web_url": invoice.web_url if invoice else "",
                "pdf_url": invoice.pdf_url if invoice else "",
                "secure_token": invoice.secure_token if invoice else "",
            } if invoice else None,
        }
