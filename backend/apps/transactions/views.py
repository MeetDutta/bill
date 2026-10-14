import logging
import secrets
import uuid
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardPagination

from .models import Transaction, TransactionItem, TransactionPayment
from apps.invoices.models import Invoice

logger = logging.getLogger(__name__)
from .serializers import (
    TransactionIngestSerializer,
    TransactionListSerializer,
    TransactionSerializer,
)


class TransactionListView(generics.ListAPIView):
    serializer_class = TransactionListSerializer
    pagination_class = StandardPagination
    search_fields = ["invoice_number", "external_transaction_id"]
    filterset_fields = ["store", "status", "payment_method"]

    def get_queryset(self):
        return Transaction.objects.filter(
            organization=self.request.user.organization
        ).select_related("store", "customer")


class TransactionDetailView(generics.RetrieveAPIView):
    serializer_class = TransactionSerializer

    def get_queryset(self):
        return Transaction.objects.filter(
            organization=self.request.user.organization
        ).select_related("store", "customer").prefetch_related("items")


class TransactionIngestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # 1. Integration / User Authentication
        org = None
        if request.user and request.user.is_authenticated:
            org = request.user.organization
        else:
            api_key = request.headers.get("X-API-Key")
            if not api_key:
                auth_header = request.headers.get("Authorization", "")
                if auth_header.startswith("Api-Key "):
                    api_key = auth_header.split(" ", 1)[1].strip()

            if api_key:
                from apps.integrations.models import Integration
                integration = Integration.objects.filter(api_key=api_key, is_active=True).select_related("organization").first()
                if integration:
                    org = integration.organization

        if not org:
            return Response(
                {"error": "Authentication required. Provide a valid Bearer token or X-API-Key header."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = TransactionIngestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # 2. Store lookup scoped strictly to organization (by code or UUID)
        from apps.stores.models import Store
        store_val = str(data["store_id"]).strip()
        store_qs = Store.objects.filter(organization=org)
        store = None
        if len(store_val) == 36 and "-" in store_val:
            store = store_qs.filter(id=store_val).first()
        if not store:
            store = store_qs.filter(code=store_val).first()

        if not store:
            return Response(
                {"error": f"Store '{data['store_id']}' not found in your organization"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3. Idempotency Check
        external_tx_id = (data.get("external_transaction_id") or "").strip()
        if external_tx_id:
            existing = Transaction.objects.filter(
                organization=org,
                external_transaction_id=external_tx_id,
            ).first()
            if existing:
                return Response(
                    TransactionSerializer(existing).data,
                    status=status.HTTP_200_OK,
                )
        else:
            # If no external_transaction_id, check store + invoice_number
            existing = Transaction.objects.filter(
                organization=org,
                store=store,
                invoice_number=data["invoice_number"],
            ).first()
            if existing:
                return Response(
                    TransactionSerializer(existing).data,
                    status=status.HTTP_200_OK,
                )

        # 4. Atomic Execution
        with transaction.atomic():
            from apps.customers.models import Customer, CustomerTimeline
            from apps.customers.utils import normalize_phone
            from django.db import IntegrityError

            customer_data = data.get("customer") or {}
            raw_phone = customer_data.get("phone", "")
            phone = normalize_phone(raw_phone)
            customer = None
            customer_created = False

            if phone:
                try:
                    customer, customer_created = Customer.objects.get_or_create(
                        organization=org,
                        phone=phone,
                        defaults={
                            "customer_id": f"CUST-{uuid.uuid4().hex[:8].upper()}",
                            "first_name": customer_data.get("name", "Customer").split()[0],
                            "last_name": " ".join(customer_data.get("name", "Customer").split()[1:]),
                            "email": customer_data.get("email", ""),
                            "source": data.get("external_source") or "api",
                        },
                    )
                except IntegrityError:
                    # Concurrency safeguard: another request created customer concurrently
                    customer = Customer.objects.get(organization=org, phone=phone)
                    customer_created = False

                if customer_created:
                    from apps.loyalty.models import LoyaltyAccount
                    LoyaltyAccount.objects.get_or_create(
                        organization=org,
                        customer=customer,
                        defaults={"balance": 0, "total_earned": 0, "total_redeemed": 0},
                    )
                    CustomerTimeline.objects.create(
                        organization=org,
                        customer=customer,
                        event_type="created",
                    )

            subtotal_val = data["subtotal"]
            discount_val = data.get("discount", Decimal("0"))
            tax_val = data["tax"]
            total_val = data["total"]
            round_off_val = total_val - (subtotal_val - discount_val + tax_val)

            try:
                tx = Transaction.objects.create(
                    organization=org,
                    store=store,
                    customer=customer,
                    invoice_number=data["invoice_number"],
                    transaction_date=data["transaction_date"],
                    subtotal=subtotal_val,
                    discount=discount_val,
                    tax=tax_val,
                    round_off=round_off_val,
                    total=total_val,
                    amount_paid=total_val,
                    outstanding_amount=Decimal("0.00"),
                    tendered_amount=total_val,
                    change_amount=Decimal("0.00"),
                    payment_status="paid",
                    payment_method=data.get("payment_method", "cash"),
                    external_source=data.get("external_source", ""),
                    external_transaction_id=external_tx_id,
                )
            except IntegrityError:
                if external_tx_id:
                    existing = Transaction.objects.filter(organization=org, external_transaction_id=external_tx_id).first()
                    if existing:
                        return Response(TransactionSerializer(existing).data, status=status.HTTP_200_OK)
                raise

            from apps.products.models import Product, InventoryMovement

            for item_data in data.get("items", []):
                ext_prod_id = str(item_data.get("external_product_id") or "").strip()
                item_name = str(item_data.get("name") or "").strip()
                item_qty = Decimal(str(item_data.get("quantity") or 1))

                if item_qty <= Decimal("0"):
                    return Response(
                        {"error": f"Invalid item quantity '{item_qty}' for '{item_name}': must be greater than zero."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                prod = None
                if ext_prod_id:
                    prod_qs = Product.objects.select_for_update().filter(organization=org)
                    if len(ext_prod_id) == 36 and "-" in ext_prod_id:
                        prod = prod_qs.filter(id=ext_prod_id).first()
                    if not prod:
                        prod = prod_qs.filter(external_id=ext_prod_id).first()
                    if not prod:
                        prod = prod_qs.filter(sku=ext_prod_id).first()
                    if not prod:
                        prod = prod_qs.filter(barcode=ext_prod_id).first()

                if not prod and item_name:
                    name_candidates = Product.objects.select_for_update().filter(organization=org, name__iexact=item_name)
                    if name_candidates.count() == 1:
                        prod = name_candidates.first()
                    else:
                        # Ambiguous match (multiple products with same name): do not guess
                        prod = None

                TransactionItem.objects.create(
                    transaction=tx,
                    product=prod,
                    external_product_id=ext_prod_id,
                    name=item_data["name"],
                    quantity=item_qty,
                    unit_price=item_data["unit_price"],
                    discount=item_data.get("discount", Decimal("0")),
                    tax=item_data.get("tax", Decimal("0")),
                    total=item_data["total"],
                    hsn_code=item_data.get("hsn_code", ""),
                )

                if prod and prod.track_inventory:
                    prev_stock = prod.current_stock
                    new_stock = prev_stock - item_qty
                    prod.current_stock = new_stock
                    prod.save(update_fields=["current_stock"])

                    InventoryMovement.objects.create(
                        organization=org,
                        product=prod,
                        store=store,
                        movement_type="SALE",
                        quantity=-item_qty,
                        previous_stock=prev_stock,
                        new_stock=new_stock,
                        reference_type="transaction",
                        reference_id=str(tx.id),
                        notes=f"API Ingest Invoice #{tx.invoice_number}",
                    )

            # Create payment record
            TransactionPayment.objects.create(
                organization=org,
                transaction=tx,
                payment_method=data.get("payment_method") or "cash",
                amount=total_val,
                status="success",
                notes=f"API Ingest Invoice #{tx.invoice_number}",
            )

            # Synchronously create Invoice record to maintain immutable financial relationship
            secure_token = secrets.token_urlsafe(24)
            Invoice.objects.get_or_create(
                transaction=tx,
                defaults={
                    "organization": org,
                    "invoice_number": tx.invoice_number,
                    "secure_token": secure_token,
                    "web_url": f"/bills/{secure_token}",
                },
            )

            if customer:
                customer.update_stats(total_val)
                event_type = (
                    "repeat_purchase"
                    if not customer_created and customer.total_purchases > 1
                    else "purchase"
                )
                CustomerTimeline.objects.create(
                    organization=org,
                    customer=customer,
                    event_type=event_type,
                    reference_id=str(tx.id),
                    metadata={"invoice_number": tx.invoice_number, "total": str(tx.total)},
                )

        # 5. Background Pipeline
        try:
            from apps.invoices.tasks import generate_invoice_task
            generate_invoice_task.delay(str(tx.id))
        except Exception as e:
            logger.warning("Failed to enqueue generate_invoice_task: %s", e)

        try:
            from apps.loyalty.tasks import calculate_loyalty_task
            calculate_loyalty_task.delay(str(tx.id), str(org.id))
        except Exception as e:
            logger.warning("Failed to enqueue calculate_loyalty_task: %s", e)

        try:
            from apps.whatsapp.tasks import send_digital_bill_task
            send_digital_bill_task.delay(str(tx.id))
        except Exception as e:
            logger.warning("Failed to enqueue send_digital_bill_task: %s", e)

        try:
            from apps.billing.services.realtime_service import RealtimeService
            RealtimeService.publish_event(
                organization=org,
                store=store,
                event_type="sale_completed",
                payload={
                    "transaction_id": str(tx.id),
                    "invoice_number": tx.invoice_number,
                    "total": str(tx.total),
                    "amount_paid": str(tx.amount_paid),
                    "tendered_amount": str(tx.tendered_amount),
                    "change_amount": str(tx.change_amount),
                    "payment_status": tx.payment_status,
                    "payment_method": tx.payment_method,
                    "cashier": "API Ingest",
                    "customer_name": tx.customer.full_name if tx.customer else "Walk-in",
                    "items_count": tx.items.count(),
                    "created_at": tx.transaction_date.isoformat(),
                },
            )
        except Exception as e:
            logger.warning("Failed to publish sale_completed event: %s", e)

        return Response(
            TransactionSerializer(tx).data,
            status=status.HTTP_201_CREATED,
        )
