import logging
import secrets
from decimal import Decimal
from django.db import models, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError

from common.pagination import StandardPagination
from apps.billing.models import BusinessConfig
from apps.billing.services.cart_engine import round_decimal
from apps.billing.services.tax_engine import TaxEngine
from apps.billing.services.invoice_number_service import InvoiceNumberService
from apps.products.models import Product, InventoryMovement
from apps.transactions.models import Transaction, TransactionItem, TransactionPayment
from apps.customers.models import Customer, CustomerTimeline
from apps.stores.models import Store

logger = logging.getLogger(__name__)

from .models import Invoice, Quotation, QuotationItem
from .serializers import (
    InvoiceListSerializer,
    InvoiceSerializer,
    PublicInvoiceSerializer,
    QuotationSerializer,
    QuotationListSerializer,
    QuotationItemSerializer,
)


class InvoiceListView(generics.ListAPIView):
    serializer_class = InvoiceListSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        user = self.request.user
        qs = Invoice.objects.filter(
            organization=user.organization
        ).select_related(
            "transaction__customer",
            "transaction__store",
            "origin_quotation",
        ).order_by("-created_at")

        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                models.Q(invoice_number__icontains=search) |
                models.Q(transaction__customer__full_name__icontains=search) |
                models.Q(transaction__customer__phone__icontains=search)
            )

        customer_id = self.request.query_params.get("customer_id")
        if customer_id:
            qs = qs.filter(transaction__customer_id=customer_id)

        payment_status = self.request.query_params.get("payment_status")
        if payment_status:
            qs = qs.filter(transaction__payment_status=payment_status)

        invoice_type = self.request.query_params.get("invoice_type")
        if invoice_type:
            qs = qs.filter(invoice_type=invoice_type)

        template_format = self.request.query_params.get("template_format")
        if template_format:
            qs = qs.filter(template_format=template_format)

        start_date = self.request.query_params.get("start_date")
        if start_date:
            qs = qs.filter(created_at__date__gte=start_date)
        end_date = self.request.query_params.get("end_date")
        if end_date:
            qs = qs.filter(created_at__date__lte=end_date)

        return qs


class InvoiceDetailView(generics.RetrieveAPIView):
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        return Invoice.objects.filter(
            organization=self.request.user.organization
        ).select_related(
            "organization",
            "transaction__customer",
            "transaction__store",
            "origin_quotation",
        ).prefetch_related("transaction__items")


class InvoicePDFView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        invoice = get_object_or_404(
            Invoice.objects.select_related("transaction__customer", "transaction__store", "organization"),
            id=pk,
            organization=request.user.organization,
        )
        from apps.invoices.pdf import generate_invoice_pdf
        pdf_url = generate_invoice_pdf(invoice)
        if pdf_url and invoice.pdf_url != pdf_url:
            invoice.pdf_url = pdf_url
            invoice.save(update_fields=["pdf_url"])
        return Response({
            "id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "pdf_url": invoice.pdf_url,
            "web_url": invoice.web_url,
        })

    def get(self, request, pk):
        return self.post(request, pk)


class InvoicePublicView(generics.RetrieveAPIView):
    serializer_class = PublicInvoiceSerializer
    permission_classes = [permissions.AllowAny]

    def get_object(self):
        token = self.kwargs.get("token")
        invoice = get_object_or_404(
            Invoice.objects.select_related(
                "organization",
                "transaction__store",
                "transaction__customer",
            ).prefetch_related("transaction__items"),
            secure_token=token,
        )
        if not invoice.is_viewed:
            invoice.is_viewed = True
            invoice.viewed_at = timezone.now()
            invoice.save(update_fields=["is_viewed", "viewed_at"])
        return invoice


# ============================================================================
# QUOTATIONS MANAGEMENT
# ============================================================================

class QuotationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Quotation.objects.filter(
            organization=request.user.organization
        ).select_related("customer", "store", "converted_invoice", "created_by").order_by("-created_at")

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                models.Q(quotation_number__icontains=search) |
                models.Q(customer__full_name__icontains=search) |
                models.Q(customer_name__icontains=search) |
                models.Q(customer_phone__icontains=search)
            )

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        customer_id = request.query_params.get("customer_id")
        if customer_id:
            qs = qs.filter(customer_id=customer_id)

        start_date = request.query_params.get("start_date")
        if start_date:
            qs = qs.filter(quotation_date__gte=start_date)
        end_date = request.query_params.get("end_date")
        if end_date:
            qs = qs.filter(quotation_date__lte=end_date)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        if page is not None:
            serializer = QuotationListSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = QuotationListSerializer(qs[:100], many=True)
        return Response(serializer.data)

    def post(self, request):
        org = request.user.organization
        data = request.data
        items_data = data.get("items", [])
        if not items_data:
            raise ValidationError({"items": "Quotation must contain at least one item."})

        # Customer resolution
        customer = None
        customer_id = data.get("customer_id") or data.get("customer")
        if customer_id:
            try:
                customer = Customer.objects.get(id=customer_id, organization=org)
            except Customer.DoesNotExist:
                pass

        customer_name = data.get("customer_name") or (customer.full_name if customer else "Walk-in Customer")
        customer_phone = data.get("customer_phone") or (customer.phone if customer else "")
        customer_email = data.get("customer_email") or (customer.email if customer else "")

        # Store resolution
        store = None
        store_id = data.get("store_id") or data.get("store")
        if store_id:
            store = Store.objects.filter(id=store_id, organization=org).first()
        if not store:
            store = Store.objects.filter(organization=org).first()

        # Parse items and compute totals
        parsed_items = []
        tot_subtotal = Decimal("0.00")
        tot_discount = Decimal("0.00")
        tot_tax = Decimal("0.00")
        tot_grand = Decimal("0.00")

        for it in items_data:
            p = None
            p_id = it.get("product_id") or it.get("product")
            if p_id:
                p = Product.objects.filter(id=p_id, organization=org).first()

            name = it.get("name") or (p.name if p else "Item")
            qty = Decimal(str(it.get("quantity") or 1))
            if qty <= Decimal("0.00"):
                raise ValidationError(f"Invalid quantity {qty} for item {name}.")

            unit_price = Decimal(str(it.get("unit_price") if it.get("unit_price") is not None else (p.selling_price if p else 0)))
            disc = Decimal(str(it.get("discount") or 0))
            tax_rate = Decimal(str(it.get("tax_rate") if it.get("tax_rate") is not None else (p.tax_rate if p else 0)))
            hsn_code = it.get("hsn_code") or (p.hsn_code if p else "")
            unit = it.get("unit") or (p.unit if p else "pcs")

            tax_calc = TaxEngine.calculate_item_tax(
                unit_price=unit_price,
                quantity=qty,
                discount=disc,
                tax_rate=tax_rate,
                is_tax_inclusive=False,
                is_interstate=False,
                gst_enabled=True,
            )

            tot_subtotal += (unit_price * qty)
            tot_discount += disc
            tot_tax += tax_calc["total_tax"]
            tot_grand += tax_calc["line_total"]

            parsed_items.append({
                "product": p,
                "name": name,
                "quantity": qty,
                "unit_price": unit_price,
                "discount": disc,
                "tax_rate": tax_rate,
                "tax": tax_calc["total_tax"],
                "total": tax_calc["line_total"],
                "hsn_code": hsn_code,
                "unit": unit,
            })

        prefix = "QT"
        date_part = timezone.now().strftime("%Y%m")
        seq = secrets.token_hex(3).upper()
        quotation_number = f"{prefix}-{date_part}-{seq}"

        with transaction.atomic():
            quotation = Quotation.objects.create(
                organization=org,
                store=store,
                quotation_number=quotation_number,
                customer=customer,
                customer_name=customer_name,
                customer_phone=customer_phone,
                customer_email=customer_email,
                quotation_date=data.get("quotation_date") or timezone.now().date(),
                valid_until=data.get("valid_until"),
                status=data.get("status", "draft"),
                subtotal=round_decimal(tot_subtotal),
                discount=round_decimal(tot_discount),
                tax=round_decimal(tot_tax),
                total=round_decimal(tot_grand),
                notes=data.get("notes", ""),
                terms_and_conditions=data.get("terms_and_conditions", ""),
                created_by=request.user,
            )

            for pit in parsed_items:
                QuotationItem.objects.create(
                    quotation=quotation,
                    product=pit["product"],
                    name=pit["name"],
                    quantity=pit["quantity"],
                    unit_price=pit["unit_price"],
                    discount=pit["discount"],
                    tax_rate=pit["tax_rate"],
                    tax=pit["tax"],
                    total=pit["total"],
                    hsn_code=pit["hsn_code"],
                    unit=pit["unit"],
                )

        serializer = QuotationSerializer(quotation)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class QuotationDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = QuotationSerializer

    def get_queryset(self):
        return Quotation.objects.filter(
            organization=self.request.user.organization
        ).select_related("customer", "store", "converted_invoice", "created_by").prefetch_related("items__product")

    def perform_destroy(self, instance):
        if instance.status == "converted" or instance.converted_invoice:
            raise ValidationError("Cannot delete a quotation that has already been converted into an invoice.")
        instance.delete()

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.status == "converted":
            raise ValidationError("Cannot modify a quotation that has already been converted into an invoice.")
        serializer.save()


class QuotationConvertView(APIView):
    """
    Converts an existing Quotation into an official Transaction + Invoice.
    Deducts inventory for tracked products, creates TransactionPayment records,
    updates customer statistics and credit ledger, and links the quotation.
    Prevents duplicate conversion and handles concurrency/idempotency.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        org = request.user.organization
        idempotency_key = request.headers.get("Idempotency-Key") or request.data.get("idempotency_key")

        quotation = get_object_or_404(
            Quotation.objects.select_related("customer", "store").prefetch_related("items__product"),
            id=pk,
            organization=org,
        )

        if quotation.status == "converted" or quotation.converted_invoice is not None:
            return Response(
                {"error": "This quotation has already been converted into an invoice."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment_method = (request.data.get("payment_method") or "cash").lower()
        store = quotation.store or Store.objects.filter(organization=org).first()

        config = BusinessConfig.objects.filter(organization=org).first()
        allow_negative_stock = config.allow_negative_stock if config else False

        with transaction.atomic():
            # 1. Validate Stock Availability
            if not allow_negative_stock:
                for q_item in quotation.items.all():
                    if q_item.product and q_item.product.track_inventory:
                        locked_prod = Product.objects.select_for_update().get(id=q_item.product.id)
                        if locked_prod.current_stock < q_item.quantity:
                            raise ValidationError(
                                f"Insufficient stock for '{locked_prod.name}'. "
                                f"Available: {locked_prod.current_stock}, Requested: {q_item.quantity}."
                            )

            # 2. Generate sequential organization-isolated Invoice Number
            invoice_number = InvoiceNumberService.generate_invoice_number(
                organization=org,
                store=store,
                prefix=config.invoice_prefix if config else "INV",
            )

            # 3. Create Transaction
            is_credit = payment_method == "credit"
            payment_status = "credit" if is_credit else "paid"
            amount_paid = Decimal("0.00") if is_credit else quotation.total
            outstanding_amount = quotation.total if is_credit else Decimal("0.00")

            tx = Transaction.objects.create(
                organization=org,
                store=store,
                customer=quotation.customer,
                cashier=request.user,
                invoice_number=invoice_number,
                transaction_date=timezone.now(),
                subtotal=quotation.subtotal,
                discount=quotation.discount,
                tax=quotation.tax,
                total=quotation.total,
                payment_method=payment_method,
                payment_status=payment_status,
                amount_paid=amount_paid,
                outstanding_amount=outstanding_amount,
                external_source="quotation",
                external_transaction_id=idempotency_key or "",
                notes=f"Converted from Quote #{quotation.quotation_number}. {quotation.notes}".strip(),
            )

            # 4. Create TransactionItems and deduct stock
            for q_item in quotation.items.all():
                prod = q_item.product
                TransactionItem.objects.create(
                    transaction=tx,
                    product=prod,
                    external_product_id=str(prod.id) if prod else "",
                    name=q_item.name,
                    quantity=q_item.quantity,
                    unit_price=q_item.unit_price,
                    discount=q_item.discount,
                    tax=q_item.tax,
                    tax_rate=q_item.tax_rate,
                    total=q_item.total,
                    hsn_code=q_item.hsn_code,
                )

                if prod and prod.track_inventory:
                    locked_prod = Product.objects.select_for_update().get(id=prod.id)
                    prev_stock = locked_prod.current_stock
                    new_stock = prev_stock - q_item.quantity
                    locked_prod.current_stock = new_stock
                    locked_prod.save(update_fields=["current_stock"])

                    InventoryMovement.objects.create(
                        organization=org,
                        product=locked_prod,
                        store=store,
                        user=request.user,
                        movement_type="SALE",
                        quantity=-q_item.quantity,
                        previous_stock=prev_stock,
                        new_stock=new_stock,
                        reference_type="transaction",
                        reference_id=str(tx.id),
                        notes=f"Converted from Quotation #{quotation.quotation_number}",
                    )

            # 5. Create Payment Record
            TransactionPayment.objects.create(
                organization=org,
                transaction=tx,
                payment_method=payment_method,
                amount=quotation.total,
                status="success" if not is_credit else "credit",
                notes=f"Converted from Quote #{quotation.quotation_number}",
            )

            # 6. Update Customer stats & credit ledger
            customer = quotation.customer
            if customer and not customer.is_walk_in:
                if is_credit:
                    customer.outstanding_credit += quotation.total
                    customer.save(update_fields=["outstanding_credit"])
                    CustomerTimeline.objects.create(
                        organization=org,
                        customer=customer,
                        event_type="credit_sale",
                        reference_id=str(tx.id),
                        metadata={"invoice_number": invoice_number, "credit_amount": str(quotation.total)},
                    )
                customer.update_stats(tx.total)
                CustomerTimeline.objects.create(
                    organization=org,
                    customer=customer,
                    event_type="purchase",
                    reference_id=str(tx.id),
                    metadata={"invoice_number": invoice_number, "total": str(tx.total)},
                )

            # 7. Create Invoice Record
            secure_token = secrets.token_urlsafe(24)
            invoice = Invoice.objects.create(
                organization=org,
                transaction=tx,
                invoice_number=invoice_number,
                invoice_type="gst" if getattr(org, "gst_number", "") else "non_gst",
                template_format="a4",
                terms_and_conditions=quotation.terms_and_conditions,
                custom_notes=quotation.notes,
                secure_token=secure_token,
                web_url=f"/bills/{secure_token}",
            )

            # 8. Link quotation and mark converted
            quotation.converted_invoice = invoice
            quotation.converted_at = timezone.now()
            quotation.status = "converted"
            quotation.save(update_fields=["converted_invoice", "converted_at", "status"])

            # 9. Generate PDF
            try:
                from apps.invoices.pdf import generate_invoice_pdf
                pdf_url = generate_invoice_pdf(invoice)
                if pdf_url:
                    invoice.pdf_url = pdf_url
                    invoice.save(update_fields=["pdf_url"])
            except Exception as e:
                logger.warning("PDF generation failed on quote conversion: %s", e)

        return Response(
            {
                "message": "Quotation converted to invoice successfully",
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "quotation_id": str(quotation.id),
                "quotation_number": quotation.quotation_number,
                "pdf_url": invoice.pdf_url,
                "web_url": invoice.web_url,
                "total": str(invoice.transaction.total),
            },
            status=status.HTTP_201_CREATED,
        )
