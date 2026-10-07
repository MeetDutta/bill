from decimal import Decimal
import secrets
from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from apps.billing.models import BusinessConfig, HeldCart, CashRegister
from apps.billing.business_types import BUSINESS_TYPES
from apps.products.models import Product, InventoryMovement, PurchaseOrder
from apps.billing.serializers import (
    BusinessConfigSerializer,
    HeldCartSerializer,
    POSProductSerializer,
    POSProductQuickCreateSerializer,
    InventoryMovementSerializer,
    PurchaseOrderSerializer,
)
from apps.billing.services.cart_engine import CartEngine
from apps.billing.services.checkout_service import CheckoutService
from apps.billing.services.return_service import ReturnService
from apps.billing.services.credit_service import CreditService
from apps.billing.services.register_service import RegisterService
from apps.billing.services.inventory_service import InventoryService
from apps.billing.services.reports_service import ReportsService


class StandardPOSPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class BusinessConfigView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        config, _ = BusinessConfig.objects.get_or_create(
            organization=request.user.organization,
            defaults={"business_type": "retail"},
        )
        serializer = BusinessConfigSerializer(config)
        return Response(serializer.data)

    def put(self, request):
        return self._update(request, partial=False)

    def patch(self, request):
        return self._update(request, partial=True)

    def _update(self, request, partial=True):
        config, _ = BusinessConfig.objects.get_or_create(
            organization=request.user.organization,
            defaults={"business_type": "retail"},
        )
        serializer = BusinessConfigSerializer(config, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class BusinessTypesListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        types_list = [
            {
                "key": k,
                "label": v["label"],
                "description": v["description"],
                "default_tax_rate": v["default_tax_rate"],
                "supported_units": v["supported_units"],
                "custom_fields": v["custom_fields"],
            }
            for k, v in BUSINESS_TYPES.items()
        ]
        return Response(types_list)


class POSProductSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        org = request.user.organization
        query = request.GET.get("q", "").strip()
        category = request.GET.get("category", "").strip()
        low_stock_only = request.GET.get("low_stock") == "true"

        products = Product.objects.filter(organization=org, is_active=True)

        if query:
            products = products.filter(
                Q(name__icontains=query)
                | Q(sku__icontains=query)
                | Q(barcode__icontains=query)
                | Q(brand__icontains=query)
                | Q(hsn_code__icontains=query)
            )

        if category and category != "all":
            products = products.filter(category__iexact=category)

        if low_stock_only:
            products = products.filter(
                track_inventory=True,
                current_stock__lte=Decimal("5.00"),
            )

        # Order by recently used/created
        products = products.order_by("name")

        paginator = StandardPOSPagination()
        page = paginator.paginate_queryset(products, request)
        serializer = POSProductSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


def resolve_request_store(request):
    org = request.user.organization
    store_id = None
    if hasattr(request, "data") and isinstance(request.data, dict):
        store_id = request.data.get("store_id")
    if not store_id and hasattr(request, "GET"):
        store_id = request.GET.get("store_id")
    from apps.stores.models import Store
    if store_id:
        s = Store.objects.filter(organization=org, id=store_id).first()
        if s:
            return s
    if hasattr(request.user, "stores"):
        s = request.user.stores.first()
        if s:
            return s
    return Store.objects.filter(organization=org).first()


class POSProductQuickCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = POSProductQuickCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        org = request.user.organization

        sku = data.get("sku") or f"SKU-{secrets.token_hex(4).upper()}"
        barcode = data.get("barcode") or sku
        mrp = data.get("mrp") or data["selling_price"]
        opening_stock = data.get("opening_stock", Decimal("0.00"))
        cat_name = data.get("category") or "General"
        from apps.products.models import ProductCategory
        cat_obj, _ = ProductCategory.objects.get_or_create(
            organization=org,
            name=cat_name,
        )

        with transaction.atomic():
            product = Product.objects.create(
                organization=org,
                name=data["name"],
                sku=sku,
                barcode=barcode,
                category=cat_obj,
                brand=data.get("brand", ""),
                selling_price=data["selling_price"],
                purchase_price=data.get("purchase_price", Decimal("0.00")),
                mrp=mrp,
                tax_rate=data.get("tax_rate", Decimal("0.00")),
                hsn_code=data.get("hsn_code", ""),
                unit=data.get("unit", "pcs"),
                current_stock=opening_stock,
                min_stock=data.get("min_stock", Decimal("0.00")),
                track_inventory=True,
                product_attributes=data.get("product_attributes", {}),
            )

            if opening_stock > Decimal("0.00"):
                store = resolve_request_store(request)
                InventoryMovement.objects.create(
                    organization=org,
                    product=product,
                    store=store,
                    user=request.user,
                    movement_type="OPENING_STOCK",
                    quantity=opening_stock,
                    previous_stock=Decimal("0.00"),
                    new_stock=opening_stock,
                    reference_type="manual",
                    notes="Quick Product Create Opening Stock",
                )

        return Response(POSProductSerializer(product).data, status=status.HTTP_201_CREATED)


class POSCalculateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        org = request.user.organization
        config, _ = BusinessConfig.objects.get_or_create(
            organization=org,
            defaults={"business_type": "retail"},
        )

        items = request.data.get("items", [])
        overall_disc_type = request.data.get("overall_discount_type", "fixed")
        overall_disc_val = Decimal(str(request.data.get("overall_discount_value") or 0))
        coupon_discount = Decimal(str(request.data.get("coupon_discount") or 0))
        is_interstate = bool(request.data.get("is_interstate", False))

        result = CartEngine.calculate_cart(
            items=items,
            overall_discount_type=overall_disc_type,
            overall_discount_value=overall_disc_val,
            coupon_discount=coupon_discount,
            gst_enabled=config.gst_enabled,
            is_tax_inclusive=config.tax_mode == "inclusive",
            is_interstate=is_interstate,
        )

        return Response(result)


class POSCheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        org = request.user.organization
        idempotency_key = request.headers.get("Idempotency-Key") or request.data.get("idempotency_key")
        store = resolve_request_store(request)

        result = CheckoutService.process_checkout(
            organization=org,
            store=store,
            user=request.user,
            cart_data=request.data,
            idempotency_key=idempotency_key,
        )

        return Response(result, status=status.HTTP_201_CREATED)


class POSHeldCartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        held = HeldCart.objects.filter(organization=request.user.organization).select_related("store", "cashier")
        serializer = HeldCartSerializer(held, many=True)
        return Response(serializer.data)

    def post(self, request):
        org = request.user.organization
        store = resolve_request_store(request)
        ref = request.data.get("hold_reference") or f"HOLD-{secrets.token_hex(3).upper()}"
        held = HeldCart.objects.create(
            organization=org,
            store=store,
            cashier=request.user,
            reference=ref,
            customer_name=request.data.get("customer_name", ""),
            customer_phone=request.data.get("customer_phone", ""),
            cart_data=request.data.get("cart_data", {}),
            subtotal=Decimal(str(request.data.get("subtotal") or 0)),
            notes=request.data.get("notes", ""),
        )

        return Response(HeldCartSerializer(held).data, status=status.HTTP_201_CREATED)


class POSHeldCartDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            held = HeldCart.objects.get(id=pk, organization=request.user.organization)
            return Response(HeldCartSerializer(held).data)
        except HeldCart.DoesNotExist:
            return Response({"error": "Held cart not found"}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, pk):
        try:
            held = HeldCart.objects.get(id=pk, organization=request.user.organization)
            held.delete()
            return Response({"message": "Held cart removed"}, status=status.HTTP_200_OK)
        except HeldCart.DoesNotExist:
            return Response({"error": "Held cart not found"}, status=status.HTTP_404_NOT_FOUND)


class POSReturnProcessView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        result = ReturnService.process_return(
            organization=request.user.organization,
            user=request.user,
            original_transaction_id=request.data.get("transaction_id"),
            items_to_return=request.data.get("items", []),
            refund_method=request.data.get("refund_method", "cash"),
            notes=request.data.get("notes", ""),
            restock_inventory=request.data.get("restock_inventory", True),
        )
        return Response(result, status=status.HTTP_201_CREATED)


class POSCreditPaymentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        store = resolve_request_store(request)
        result = CreditService.record_payment(
            organization=request.user.organization,
            customer_id=request.data.get("customer_id"),
            amount=Decimal(str(request.data.get("amount") or 0)),
            payment_method=request.data.get("payment_method", "cash"),
            reference=request.data.get("reference", ""),
            notes=request.data.get("notes", ""),
            user=request.user,
            transaction_id=request.data.get("transaction_id"),
            store=store,
        )
        return Response(result, status=status.HTTP_201_CREATED)


class POSCustomerLedgerView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, customer_id):
        result = CreditService.get_customer_ledger(
            organization=request.user.organization,
            customer_id=customer_id,
        )
        return Response(result)


class POSRegisterStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        org = request.user.organization
        store = resolve_request_store(request)

        reg = RegisterService.get_active_register(org, store, request.user)
        if not reg:
            return Response({"is_open": False, "register": None})

        return Response({
            "is_open": True,
            "register": RegisterService._format_register(reg),
        })


class POSRegisterOpenView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        org = request.user.organization
        store = resolve_request_store(request)

        result = RegisterService.open_register(
            organization=org,
            store=store,
            user=request.user,
            opening_balance=Decimal(str(request.data.get("opening_balance") or 0)),
            notes=request.data.get("notes", ""),
        )
        return Response(result, status=status.HTTP_201_CREATED)


class POSRegisterMovementView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        org = request.user.organization
        store = resolve_request_store(request)
        result = RegisterService.add_cash_movement(
            organization=org,
            store=store,
            user=request.user,
            amount=Decimal(str(request.data.get("amount") or 0)),
            movement_type=request.data.get("type", "add"),
            notes=request.data.get("notes", ""),
        )
        return Response(result)


class POSRegisterCloseView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        org = request.user.organization
        store = resolve_request_store(request)
        result = RegisterService.close_register(
            organization=org,
            store=store,
            user=request.user,
            actual_cash=Decimal(str(request.data.get("actual_cash") or 0)),
            notes=request.data.get("notes", ""),
        )
        return Response(result)


class POSInventoryMovementListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = InventoryMovement.objects.filter(
            organization=request.user.organization
        ).select_related("product", "store", "user").order_by("-created_at")

        movement_type = request.GET.get("type")
        if movement_type:
            qs = qs.filter(movement_type=movement_type)

        product_id = request.GET.get("product_id")
        if product_id:
            qs = qs.filter(product_id=product_id)

        paginator = StandardPOSPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = InventoryMovementSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class POSInventoryAdjustView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        store = request.user.stores.first() if hasattr(request.user, "stores") else None
        result = InventoryService.adjust_stock(
            organization=request.user.organization,
            store=store,
            user=request.user,
            product_id=request.data.get("product_id"),
            quantity_delta=Decimal(str(request.data.get("quantity_delta") or 0)),
            movement_type=request.data.get("movement_type", "ADJUSTMENT"),
            notes=request.data.get("notes", ""),
        )
        return Response(result, status=status.HTTP_201_CREATED)


class POSPurchaseOrderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = PurchaseOrder.objects.filter(
            organization=request.user.organization
        ).prefetch_related("items__product").order_by("-created_at")
        serializer = PurchaseOrderSerializer(qs[:100], many=True)
        return Response(serializer.data)

    def post(self, request):
        from apps.stores.models import Store
        store = None
        store_id = request.data.get("store_id")
        if store_id:
            store = Store.objects.filter(id=store_id, organization=request.user.organization).first()
        if not store and hasattr(request.user, "stores") and request.user.stores.exists():
            store = request.user.stores.first()
        if not store:
            store = Store.objects.filter(organization=request.user.organization).first()
        result = InventoryService.record_purchase_order(
            organization=request.user.organization,
            store=store,
            user=request.user,
            supplier=request.data.get("supplier", "Supplier"),
            supplier_id=request.data.get("supplier_id") or request.data.get("supplier_ref"),
            supplier_invoice_number=request.data.get("supplier_invoice_number", ""),
            purchase_date=request.data.get("purchase_date"),
            items=request.data.get("items", []),
            notes=request.data.get("notes", ""),
        )
        return Response(result, status=status.HTTP_201_CREATED)


# POS Reports Views
class POSSalesReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        result = ReportsService.get_sales_report(
            organization=request.user.organization,
            store_id=request.GET.get("store_id"),
            period=request.GET.get("period", "today"),
            start_date=request.GET.get("start_date"),
            end_date=request.GET.get("end_date"),
            payment_method=request.GET.get("payment_method"),
        )
        return Response(result)


class POSPaymentReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        result = ReportsService.get_payment_report(
            organization=request.user.organization,
            store_id=request.GET.get("store_id"),
            period=request.GET.get("period", "today"),
            start_date=request.GET.get("start_date"),
            end_date=request.GET.get("end_date"),
        )
        return Response(result)


class POSProductSalesReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        result = ReportsService.get_product_sales_report(
            organization=request.user.organization,
            store_id=request.GET.get("store_id"),
            period=request.GET.get("period", "today"),
            start_date=request.GET.get("start_date"),
            end_date=request.GET.get("end_date"),
        )
        return Response(result)


class POSTaxReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        result = ReportsService.get_tax_report(
            organization=request.user.organization,
            store_id=request.GET.get("store_id"),
            period=request.GET.get("period", "today"),
            start_date=request.GET.get("start_date"),
            end_date=request.GET.get("end_date"),
        )
        return Response(result)


class POSReturnsReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        result = ReportsService.get_returns_report(
            organization=request.user.organization,
            store_id=request.GET.get("store_id"),
            period=request.GET.get("period", "today"),
        )
        return Response(result)


class POSOutstandingReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        result = ReportsService.get_outstanding_credit_report(
            organization=request.user.organization,
        )
        return Response(result)


class POSDailyClosingReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        result = ReportsService.get_daily_closing_report(
            organization=request.user.organization,
            store_id=request.GET.get("store_id"),
        )
        return Response(result)
