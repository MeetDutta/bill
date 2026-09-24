import uuid
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardPagination

from .models import Transaction, TransactionItem
from .serializers import (
    TransactionIngestSerializer,
    TransactionListSerializer,
    TransactionSerializer,
)


class TransactionListView(generics.ListAPIView):
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
        serializer = TransactionIngestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        org = request.user.organization if request.user.is_authenticated else None
        if not org:
            from apps.stores.models import Store
            store_code = data.get("store_id")
            try:
                store = Store.objects.get(code=store_code)
                org = store.organization
            except Store.DoesNotExist:
                return Response({"error": "Store not found"}, status=status.HTTP_400_BAD_REQUEST)

        external_tx_id = data.get("external_transaction_id", "")
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

        with transaction.atomic():
            from apps.customers.models import Customer, CustomerTimeline
            customer_data = data.get("customer", {})
            phone = customer_data.get("phone", "")
            customer = None
            customer_created = False
            if phone:
                customer, customer_created = Customer.objects.get_or_create(
                    organization=org,
                    phone=phone,
                    defaults={
                        "customer_id": f"CUST-{uuid.uuid4().hex[:8].upper()}",
                        "first_name": customer_data.get("name", "Customer").split()[0],
                        "last_name": " ".join(customer_data.get("name", "Customer").split()[1:]),
                        "email": customer_data.get("email", ""),
                        "source": data.get("external_source", "api"),
                    },
                )
                if customer_created:
                    CustomerTimeline.objects.create(
                        organization=org,
                        customer=customer,
                        event_type="created",
                    )

            from apps.stores.models import Store
            try:
                store = Store.objects.get(organization=org, code=data["store_id"])
            except Store.DoesNotExist:
                return Response({"error": "Store not found"}, status=status.HTTP_400_BAD_REQUEST)

            tx = Transaction.objects.create(
                organization=org,
                store=store,
                customer=customer,
                invoice_number=data["invoice_number"],
                transaction_date=data["transaction_date"],
                subtotal=data["subtotal"],
                discount=data["discount"],
                tax=data["tax"],
                total=data["total"],
                payment_method=data.get("payment_method", ""),
                external_source=data.get("external_source", ""),
                external_transaction_id=external_tx_id,
            )

            for item_data in data.get("items", []):
                TransactionItem.objects.create(
                    transaction=tx,
                    external_product_id=item_data.get("external_product_id", ""),
                    name=item_data["name"],
                    quantity=item_data.get("quantity", 1),
                    unit_price=item_data["unit_price"],
                    discount=item_data.get("discount", 0),
                    tax=item_data.get("tax", 0),
                    total=item_data["total"],
                )

            if customer:
                customer.update_stats(Decimal(str(data["total"])))
                event_type = "repeat_purchase" if not customer_created and customer.total_purchases > 1 else "purchase"
                CustomerTimeline.objects.create(
                    organization=org,
                    customer=customer,
                    event_type=event_type,
                    reference_id=str(tx.id),
                    metadata={"invoice_number": tx.invoice_number, "total": str(tx.total)},
                )

        from apps.invoices.tasks import generate_invoice_task
        generate_invoice_task.delay(str(tx.id))

        from apps.loyalty.tasks import calculate_loyalty_task
        calculate_loyalty_task.delay(str(tx.id), str(org.id))

        from apps.whatsapp.tasks import send_digital_bill_task
        send_digital_bill_task.delay(str(tx.id))

        return Response(
            TransactionSerializer(tx).data,
            status=status.HTTP_201_CREATED,
        )
