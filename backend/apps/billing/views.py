from decimal import Decimal
import secrets
from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status, renderers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import ValidationError

from apps.billing.models import BusinessConfig, HeldCart
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
from common.permissions import IsAdminOrManager, IsInventoryStaffOrAbove


class StandardPOSPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class BusinessConfigView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        org = request.user.organization
        if not org:
            from apps.organizations.models import Organization
            org = Organization.objects.first()
            if not org:
                org = Organization.objects.create(name="BillMeet Store")
            request.user.organization = org
            request.user.save(update_fields=["organization"])

        config, _ = BusinessConfig.objects.get_or_create(
            organization=org,
            defaults={"business_type": "retail"},
        )
        serializer = BusinessConfigSerializer(config)
        return Response(serializer.data)

    def post(self, request):
        return self._update(request, partial=True)

    def put(self, request):
        return self._update(request, partial=False)

    def patch(self, request):
        return self._update(request, partial=True)

    def _update(self, request, partial=True):
        from rest_framework.exceptions import PermissionDenied
        ADMIN_ROLES = ("super_admin", "org_admin", "owner", "store_manager", "manager")
        if request.user.role not in ADMIN_ROLES and not request.user.is_superuser:
            raise PermissionDenied("Only administrators and managers can modify business configuration.")

        org = request.user.organization
        if not org:
            from apps.organizations.models import Organization
            org = Organization.objects.first()
            if not org:
                org = Organization.objects.create(name="BillMeet Store")
            request.user.organization = org
            request.user.save(update_fields=["organization"])

        config, _ = BusinessConfig.objects.get_or_create(
            organization=org,
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
            products = products.filter(
                Q(category__name__iexact=category) | Q(category__id__iexact=category)
            )

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
    if not org:
        from apps.organizations.models import Organization
        org = Organization.objects.first()
        if not org:
            org = Organization.objects.create(name="BillMeet Store")
        request.user.organization = org
        request.user.save(update_fields=["organization"])

    from apps.stores.models import Store
    store_id = None
    if hasattr(request, "data") and isinstance(request.data, dict):
        store_id = request.data.get("store_id")
    if not store_id and hasattr(request, "GET"):
        store_id = request.GET.get("store_id")

    if store_id:
        s = Store.objects.filter(organization=org, id=store_id).first()
        if not s:
            # Fallback instead of crashing checkout
            s = Store.objects.filter(organization=org).first()
        if s:
            return s

    if hasattr(request.user, "stores"):
        s = request.user.stores.first()
        if s:
            return s

    store = Store.objects.filter(organization=org).first()
    if not store:
        store = Store.objects.create(
            organization=org,
            name=f"{org.name} Main Store",
            code="STR-MAIN",
            status="active",
        )
    return store


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

        try:
            from apps.billing.services.realtime_service import RealtimeService
            RealtimeService.publish_event(
                organization=org,
                event_type="product_created",
                payload={"product_id": str(product.id), "category": cat_obj.name},
            )
        except Exception:
            # The product write must succeed even if the optional event stream is unavailable.
            pass

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
        idempotency_key = (
            request.headers.get("Idempotency-Key")
            or request.headers.get("X-Idempotency-Key")
            or (request.data.get("idempotency_key") if isinstance(request.data, dict) else None)
        )

        try:
            store = resolve_request_store(request)
            result = CheckoutService.process_checkout(
                organization=org,
                store=store,
                user=request.user,
                cart_data=request.data,
                idempotency_key=idempotency_key,
            )
            return Response(result, status=status.HTTP_201_CREATED)
        except Exception as e:
            error_detail = e.detail if hasattr(e, "detail") else str(e)
            if isinstance(error_detail, list) and len(error_detail) == 1:
                error_detail = error_detail[0]
            return Response({"error": error_detail}, status=status.HTTP_400_BAD_REQUEST)


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
        try:
            from apps.billing.services.realtime_service import RealtimeService
            RealtimeService.publish_event(
                organization=request.user.organization,
                event_type="return_completed",
                payload={
                    "return_number": result.get("return_number"),
                    "refund_amount": str(result.get("total_refund_amount", "0.00")),
                    "refund_method": request.data.get("refund_method", "cash"),
                },
            )
        except Exception:
            pass
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
        try:
            from apps.billing.services.realtime_service import RealtimeService
            RealtimeService.publish_event(
                organization=request.user.organization,
                store=store,
                event_type="payment_recorded",
                payload={
                    "customer_id": str(request.data.get("customer_id")),
                    "amount": str(request.data.get("amount")),
                    "payment_method": request.data.get("payment_method", "cash"),
                    "remaining_balance": str(result.get("remaining_balance", "0.00")),
                },
            )
        except Exception:
            pass
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
    permission_classes = [permissions.IsAuthenticated, IsInventoryStaffOrAbove]

    def post(self, request):
        store = request.user.stores.first() if hasattr(request.user, "stores") else None
        qty_delta = request.data.get("quantity_delta")
        if qty_delta is None:
            qty_delta = request.data.get("quantity", 0)
        result = InventoryService.adjust_stock(
            organization=request.user.organization,
            store=store,
            user=request.user,
            product_id=request.data.get("product_id"),
            quantity_delta=Decimal(str(qty_delta)),
            movement_type=request.data.get("movement_type", "ADJUSTMENT"),
            notes=request.data.get("notes", ""),
        )
        try:
            from apps.billing.services.realtime_service import RealtimeService
            RealtimeService.publish_event(
                organization=request.user.organization,
                store=store,
                event_type="inventory_updated",
                payload={
                    "product_id": str(request.data.get("product_id")),
                    "quantity_delta": str(qty_delta),
                    "movement_type": request.data.get("movement_type", "ADJUSTMENT"),
                },
            )
        except Exception:
            pass
        return Response(result, status=status.HTTP_201_CREATED)


class POSPurchaseOrderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = PurchaseOrder.objects.filter(
            organization=request.user.organization
        ).prefetch_related("items__product").order_by("-created_at")

        status_param = request.GET.get("status")
        if status_param:
            qs = qs.filter(status=status_param.lower())

        supplier_id = request.GET.get("supplier_id")
        if supplier_id:
            qs = qs.filter(Q(supplier_ref_id=supplier_id) | Q(supplier_ref__id=supplier_id))

        search = request.GET.get("search")
        if search:
            qs = qs.filter(
                Q(po_number__icontains=search) |
                Q(supplier_invoice__icontains=search) |
                Q(supplier_name__icontains=search)
            )

        serializer = PurchaseOrderSerializer(qs[:100], many=True)
        return Response(serializer.data)

    def post(self, request):
        if not IsInventoryStaffOrAbove().has_permission(request, self):
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )
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
            expected_delivery=request.data.get("expected_delivery"),
            due_date=request.data.get("due_date"),
            status=request.data.get("status", "received"),
            items=request.data.get("items", []),
            notes=request.data.get("notes", ""),
        )
        return Response(result, status=status.HTTP_201_CREATED)


class POSPurchaseOrderDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            po = PurchaseOrder.objects.prefetch_related("items__product").get(
                id=pk, organization=request.user.organization
            )
        except PurchaseOrder.DoesNotExist:
            return Response({"error": "Purchase order not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = PurchaseOrderSerializer(po)
        return Response(serializer.data)


class POSPurchaseOrderReceiveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsInventoryStaffOrAbove]

    def post(self, request, pk):
        try:
            result = InventoryService.receive_purchase_order(
                organization=request.user.organization,
                purchase_order_id=str(pk),
                user=request.user,
                supplier_invoice_number=request.data.get("supplier_invoice_number"),
                notes=request.data.get("notes"),
            )
            try:
                from apps.billing.services.realtime_service import RealtimeService
                RealtimeService.publish_event(
                    organization=request.user.organization,
                    event_type="purchase_received",
                    payload={
                        "po_id": str(pk),
                        "supplier_invoice_number": request.data.get("supplier_invoice_number"),
                    },
                )
            except Exception:
                pass
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class POSPurchaseOrderCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsInventoryStaffOrAbove]

    def post(self, request, pk):
        try:
            result = InventoryService.cancel_purchase_order(
                organization=request.user.organization,
                purchase_order_id=str(pk),
                user=request.user,
                reason=request.data.get("reason"),
            )
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class POSManualAdjustmentsListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        manual_types = ["ADJUSTMENT", "DAMAGE", "LOSS", "FOUND", "CORRECTION", "COUNT_ADJUSTMENT", "OTHER", "OPENING_STOCK"]
        qs = InventoryMovement.objects.filter(
            organization=request.user.organization,
            movement_type__in=manual_types,
        ).select_related("product", "store", "user").order_by("-created_at")

        product_id = request.GET.get("product_id")
        if product_id:
            qs = qs.filter(product_id=product_id)

        movement_type = request.GET.get("movement_type")
        if movement_type:
            qs = qs.filter(movement_type=movement_type.upper())

        serializer = InventoryMovementSerializer(qs[:100], many=True)
        return Response(serializer.data)


class POSPaymentLedgerView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        from apps.transactions.models import TransactionPayment, CustomerCreditPayment
        from apps.products.models import SupplierPayment

        org = request.user.organization
        direction = request.GET.get("direction")  # incoming, outgoing, or all
        method = request.GET.get("payment_method")

        ledger = []

        # 1. Incoming: Transaction Payments (POS & Invoices)
        if direction != "outgoing":
            tx_pays = TransactionPayment.objects.filter(
                organization=org,
                status="success",
            ).select_related("transaction__customer", "transaction__store").order_by("-created_at")[:150]
            for p in tx_pays:
                if method and p.payment_method.lower() != method.lower():
                    continue
                tx = p.transaction
                cust = tx.customer.full_name if tx.customer else "Walk-in Customer"
                ledger.append({
                    "id": str(p.id),
                    "date": p.created_at.isoformat(),
                    "direction": "incoming",
                    "entity_type": "customer",
                    "entity_name": cust,
                    "invoice_or_ref": tx.invoice_number,
                    "payment_method": p.payment_method.upper(),
                    "amount": str(p.amount),
                    "reference": p.reference,
                    "status": p.status,
                    "notes": p.notes or f"Payment for invoice {tx.invoice_number}",
                    "cashier_name": tx.cashier.get_full_name() if tx.cashier else "Staff",
                })

            # 2. Incoming: Customer Udhaar / Credit Settlements
            credit_pays = CustomerCreditPayment.objects.filter(
                organization=org,
            ).select_related("customer", "received_by").order_by("-created_at")[:100]
            for cp in credit_pays:
                if method and cp.payment_method.lower() != method.lower():
                    continue
                ledger.append({
                    "id": str(cp.id),
                    "date": cp.created_at.isoformat(),
                    "direction": "incoming",
                    "entity_type": "customer",
                    "entity_name": cp.customer.full_name,
                    "invoice_or_ref": f"Udhaar Settlement ({cp.customer.phone})",
                    "payment_method": cp.payment_method.upper(),
                    "amount": str(cp.amount),
                    "reference": cp.reference,
                    "status": "success",
                    "notes": cp.notes or "Credit account settlement",
                    "cashier_name": cp.received_by.get_full_name() if cp.received_by else "Staff",
                })

        # 3. Outgoing: Supplier Payments
        if direction != "incoming":
            sup_pays = SupplierPayment.objects.filter(
                organization=org,
            ).select_related("supplier", "purchase_order", "created_by").order_by("-payment_date", "-created_at")[:100]
            for sp in sup_pays:
                if method and sp.payment_method.lower() != method.lower():
                    continue
                po_ref = sp.purchase_order.po_number if sp.purchase_order else "Vendor Payout"
                ledger.append({
                    "id": str(sp.id),
                    "date": sp.payment_date.isoformat(),
                    "direction": "outgoing",
                    "entity_type": "supplier",
                    "entity_name": sp.supplier.name,
                    "invoice_or_ref": po_ref,
                    "payment_method": sp.payment_method.upper(),
                    "amount": str(sp.amount),
                    "reference": sp.reference,
                    "status": "success",
                    "notes": sp.notes or f"Supplier payment to {sp.supplier.name}",
                    "cashier_name": sp.created_by.get_full_name() if sp.created_by else "Staff",
                })

        # Sort all combined transactions by date descending
        ledger.sort(key=lambda x: x["date"], reverse=True)
        return Response(ledger[:150])


class POSReceivablesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        from apps.transactions.models import Transaction
        from django.utils import timezone

        org = request.user.organization
        now = timezone.now().date()

        unpaid_txs = Transaction.objects.filter(
            organization=org,
            status="completed",
            outstanding_amount__gt=Decimal("0.00"),
        ).select_related("customer", "store").order_by("-transaction_date")

        results = []
        for tx in unpaid_txs[:100]:
            tx_date = tx.transaction_date.date() if hasattr(tx.transaction_date, "date") else tx.transaction_date
            days_overdue = max(0, (now - tx_date).days)
            aging_status = "CURRENT"
            if days_overdue > 30:
                aging_status = "OVERDUE"
            elif days_overdue > 7:
                aging_status = "DUE_SOON"

            results.append({
                "transaction_id": str(tx.id),
                "customer_id": str(tx.customer_id) if tx.customer else None,
                "customer_name": tx.customer.full_name if tx.customer else "Walk-in",
                "customer_phone": tx.customer.phone if tx.customer else "",
                "invoice_number": tx.invoice_number,
                "invoice_date": tx_date.isoformat(),
                "due_date": tx_date.isoformat(),
                "total": str(tx.total),
                "paid": str(tx.amount_paid),
                "outstanding": str(tx.outstanding_amount),
                "days_overdue": days_overdue,
                "status": aging_status,
                "store_name": tx.store.name if tx.store else "",
            })

        return Response(results)


class POSPayablesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        from django.utils import timezone
        org = request.user.organization
        now = timezone.now().date()

        pos = PurchaseOrder.objects.filter(
            organization=org,
            status="received",
        ).select_related("supplier_ref", "store").order_by("-purchase_date")

        results = []
        for po in pos:
            if po.outstanding_amount <= Decimal("0.00"):
                continue
            due_d = po.due_date or po.purchase_date
            days_overdue = max(0, (now - due_d).days) if due_d else 0
            aging_status = "CURRENT"
            if days_overdue > 30:
                aging_status = "OVERDUE"
            elif days_overdue > 7:
                aging_status = "DUE_SOON"

            results.append({
                "po_id": str(po.id),
                "po_number": po.po_number,
                "supplier_id": str(po.supplier_ref_id) if po.supplier_ref else None,
                "supplier_name": po.supplier,
                "supplier_invoice_number": po.supplier_invoice_number,
                "purchase_date": po.purchase_date.isoformat() if po.purchase_date else "",
                "due_date": due_d.isoformat() if due_d else "",
                "total": str(po.total_amount),
                "paid": str(po.paid_amount),
                "outstanding": str(po.outstanding_amount),
                "days_overdue": days_overdue,
                "status": aging_status,
            })

        return Response(results)


class POSSupplierPaymentCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def post(self, request):
        from apps.products.models import Supplier, PurchaseOrder, SupplierPayment
        from django.utils import timezone
        from rest_framework.exceptions import ValidationError

        supplier_id = request.data.get("supplier_id")
        po_id = request.data.get("purchase_order_id")
        amount = Decimal(str(request.data.get("amount") or 0))
        payment_method = request.data.get("payment_method", "bank_transfer")
        reference = request.data.get("reference", "")
        notes = request.data.get("notes", "")

        if amount <= Decimal("0.00"):
            raise ValidationError("Payment amount must be greater than zero.")

        supplier = Supplier.objects.filter(id=supplier_id, organization=request.user.organization).first()
        po = None
        if po_id:
            po = PurchaseOrder.objects.filter(id=po_id, organization=request.user.organization).first()
            if not supplier and po and po.supplier_ref:
                supplier = po.supplier_ref

        if not supplier:
            raise ValidationError("Valid supplier is required.")

        with transaction.atomic():
            payment = SupplierPayment.objects.create(
                organization=request.user.organization,
                supplier=supplier,
                purchase_order=po,
                amount=amount,
                payment_method=payment_method,
                payment_date=timezone.now().date(),
                reference=reference,
                notes=notes,
                created_by=request.user,
            )
            if po:
                po.paid_amount += amount
                po.save(update_fields=["paid_amount"])

        return Response({
            "id": str(payment.id),
            "supplier": supplier.name,
            "amount": str(payment.amount),
            "payment_method": payment.payment_method,
            "po_number": po.po_number if po else None,
        }, status=status.HTTP_201_CREATED)


class POSRegisterOperationalReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        from apps.billing.models import CashRegister
        org = request.user.organization
        store_id = request.GET.get("store_id")

        qs = CashRegister.objects.filter(organization=org).select_related("store", "cashier")
        if store_id:
            qs = qs.filter(store_id=store_id)

        rows = []
        for reg in qs.order_by("-opened_at")[:50]:
            expected = reg.calculate_expected_cash()
            actual = reg.actual_cash or Decimal("0.00")
            variance = actual - expected if reg.status == "closed" else Decimal("0.00")

            rows.append({
                "register_id": str(reg.id),
                "store_name": reg.store.name if reg.store else "Main Store",
                "cashier_name": reg.cashier.get_full_name() if reg.cashier else "Cashier",
                "status": reg.status,
                "opened_at": reg.opened_at.isoformat(),
                "closed_at": reg.closed_at.isoformat() if reg.closed_at else None,
                "opening_balance": str(reg.opening_balance),
                "cash_sales": str(reg.cash_sales),
                "cash_refunds": str(reg.cash_refunds),
                "expected_closing_cash": str(expected),
                "actual_closing_cash": str(actual),
                "cash_variance": str(variance),
                "notes": reg.notes,
            })

        return Response({"registers": rows})



# POS Reports Views
class POSSalesReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

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


class POSTallyPreviewView(APIView):
    """
    Validates and previews Tally XML accounting voucher data before export.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        from .services.tally_export_service import TallyExportService
        include_prev = request.GET.get("include_previously_exported", "false").lower() in ["true", "1"]
        preview = TallyExportService.validate_and_preview(
            organization=request.user.organization,
            store_id=request.GET.get("store_id"),
            period=request.GET.get("period", "today"),
            start_date=request.GET.get("start_date"),
            end_date=request.GET.get("end_date"),
            include_previously_exported=include_prev,
        )
        return Response(preview)


class POSTallyExportView(APIView):
    """
    Generates and downloads Tally-compatible XML vouchers.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def post(self, request):
        from django.http import HttpResponse
        from .services.tally_export_service import TallyExportService
        include_prev = request.data.get("include_previously_exported", False)
        if isinstance(include_prev, str):
            include_prev = include_prev.lower() in ["true", "1"]

        try:
            xml_content, filename, summary = TallyExportService.generate_tally_xml(
                organization=request.user.organization,
                user=request.user,
                store_id=request.data.get("store_id") or request.GET.get("store_id"),
                period=request.data.get("period") or request.GET.get("period", "today"),
                start_date=request.data.get("start_date") or request.GET.get("start_date"),
                end_date=request.data.get("end_date") or request.GET.get("end_date"),
                include_previously_exported=include_prev,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Download directly as XML file if requested
        if request.GET.get("download", "true").lower() in ["true", "1"] and not request.data.get("return_json"):
            resp = HttpResponse(xml_content, content_type="application/xml; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="{filename}"'
            return resp

        return Response({
            "status": "success",
            "filename": filename,
            "xml_content": xml_content,
            "summary": summary,
        })


class POSTallyConfigView(APIView):
    """
    Configurable Tally Ledger mappings.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        from .services.tally_export_service import TallyExportService
        cfg = TallyExportService.get_or_create_config(request.user.organization)
        return Response({
            "company_name": cfg.company_name,
            "sales_ledger": cfg.sales_ledger,
            "cgst_ledger": cfg.cgst_ledger,
            "sgst_ledger": cfg.sgst_ledger,
            "igst_ledger": cfg.igst_ledger,
            "cash_ledger": cfg.cash_ledger,
            "bank_ledger": cfg.bank_ledger,
            "upi_ledger": cfg.upi_ledger,
            "card_ledger": cfg.card_ledger,
            "debtor_ledger": cfg.debtor_ledger,
            "discount_ledger": cfg.discount_ledger,
            "round_off_ledger": cfg.round_off_ledger,
            "credit_note_ledger": cfg.credit_note_ledger,
            "include_inventory_details": cfg.include_inventory_details,
        })

    def post(self, request):
        from .services.tally_export_service import TallyExportService
        cfg = TallyExportService.get_or_create_config(request.user.organization)
        data = request.data
        fields = [
            "company_name", "sales_ledger", "cgst_ledger", "sgst_ledger", "igst_ledger",
            "cash_ledger", "bank_ledger", "upi_ledger", "card_ledger", "debtor_ledger",
            "discount_ledger", "round_off_ledger", "credit_note_ledger", "include_inventory_details",
        ]
        for f in fields:
            if f in data:
                setattr(cfg, f, data[f])
        cfg.save()
        return Response({"status": "success", "message": "Tally ledger configuration updated."})


class POSTallyHistoryView(APIView):
    """
    Audit log of previously executed Tally exports.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        from .models import TallyExportLog
        logs = TallyExportLog.objects.filter(
            organization=request.user.organization
        ).select_related("exported_by").order_by("-created_at")[:50]

        rows = []
        for l in logs:
            rows.append({
                "id": str(l.id),
                "created_at": l.created_at.isoformat(),
                "exported_by": l.exported_by.get_full_name() if l.exported_by else "System",
                "period": l.period,
                "start_date": l.start_date.isoformat(),
                "end_date": l.end_date.isoformat(),
                "sales_count": l.sales_vouchers_count,
                "receipts_count": l.receipt_vouchers_count,
                "credit_notes_count": l.credit_notes_count,
                "total_invoice_amount": str(l.total_invoice_amount),
                "total_taxable": str(l.total_taxable_value),
                "total_cgst": str(l.total_cgst),
                "total_sgst": str(l.total_sgst),
                "total_igst": str(l.total_igst),
                "total_payments": str(l.total_recorded_payments),
                "outstanding_receivables": str(l.outstanding_receivables),
                "total_refund_amount": str(l.total_refund_amount),
                "xml_filename": l.xml_filename,
                "warnings_count": len(l.validation_warnings or []),
            })
        return Response({"history": rows})


class POSPaymentReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

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
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

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
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

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
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        result = ReportsService.get_returns_report(
            organization=request.user.organization,
            store_id=request.GET.get("store_id"),
            period=request.GET.get("period", "today"),
        )
        return Response(result)


class POSOutstandingReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        result = ReportsService.get_outstanding_credit_report(
            organization=request.user.organization,
        )
        return Response(result)


class POSDailyClosingReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        result = ReportsService.get_daily_closing_report(
            organization=request.user.organization,
            store_id=request.GET.get("store_id"),
        )
        return Response(result)


class POSRealtimeTicketView(APIView):
    """
    Issues a short-lived (60s) single-use stream ticket for authenticated users
    to prevent exposing long-lived JWT access tokens in SSE query parameters.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.core.cache import cache
        ticket = f"stkt_{secrets.token_urlsafe(32)}"
        cache.set(
            f"sse_ticket:{ticket}",
            {"user_id": str(request.user.id), "org_id": str(request.user.organization.id)},
            timeout=60,
        )
        return Response({"ticket": ticket, "expires_in": 60})


class POSRealtimeEventStreamView(APIView):
    """
    Server-Sent Events (SSE) streaming endpoint for live dashboard & POS synchronization.
    Supports secure single-use stream ticket, standard Bearer header, or JWT query token,
    replay from Last-Event-ID, and automatic keepalive comments.
    """
    permission_classes = [permissions.AllowAny]
    renderer_classes = [renderers.JSONRenderer]

    def perform_content_negotiation(self, request, force=False):
        # Return JSONRenderer so error responses are rendered as application/json
        # while StreamingHttpResponse in get() directly returns text/event-stream.
        return (renderers.JSONRenderer(), "application/json")

    def get(self, request):
        import json
        import time
        from django.http import StreamingHttpResponse
        from django.utils import timezone
        from apps.billing.models import RealtimeEvent

        # Reject insecure query parameter token fallback
        if request.GET.get("token"):
            return Response(
                {"error": "Passing access tokens in URL query parameters is prohibited. Use short-lived stream tickets."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = request.user
        ticket = request.GET.get("ticket")
        if ticket:
            from django.core.cache import cache
            cached_data = cache.get(f"sse_ticket:{ticket}")
            if cached_data:
                cache.delete(f"sse_ticket:{ticket}")  # Single use enforcement
                from apps.users.models import User
                try:
                    user = User.objects.get(id=cached_data["user_id"], is_active=True)
                except User.DoesNotExist:
                    user = None

        if not user or not user.is_authenticated:
            return Response(
                {"error": "Authentication required. Provide a valid stream ticket or Bearer authorization header."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        org = user.organization
        # Standardize reconnection cursor: accept Last-Event-ID header, last_event_id, or legacy last_id
        last_event_id = (
            request.headers.get("Last-Event-ID")
            or request.GET.get("last_event_id")
            or request.GET.get("last_id")
        )

        def event_stream():
            last_check = timezone.now()
            seen_ids = set()

            # If last_event_id provided, replay missed events since that cursor
            if last_event_id:
                try:
                    prior_event = RealtimeEvent.objects.filter(id=last_event_id, organization=org).first()
                    if prior_event:
                        replays = RealtimeEvent.objects.filter(
                            organization=org,
                            created_at__gt=prior_event.created_at,
                        ).order_by("created_at")[:50]
                        for ev in replays:
                            seen_ids.add(str(ev.id))
                            data_json = json.dumps(ev.payload)
                            yield f"id: {ev.id}\nevent: {ev.event_type}\ndata: {data_json}\n\n"
                except Exception:
                    pass

            yield f"event: connected\ndata: {json.dumps({'status': 'connected', 'organization': org.name})}\n\n"

            # 40-second active stream loop before client safely reconnects
            start_time = time.time()
            while time.time() - start_time < 40:
                events = RealtimeEvent.objects.filter(
                    organization=org,
                    created_at__gt=last_check,
                ).order_by("created_at")[:20]

                for ev in events:
                    if str(ev.id) not in seen_ids:
                        seen_ids.add(str(ev.id))
                        data_json = json.dumps(ev.payload)
                        yield f"id: {ev.id}\nevent: {ev.event_type}\ndata: {data_json}\n\n"

                last_check = timezone.now()
                yield ":keepalive\n\n"
                time.sleep(2)

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class POSRealtimeRecentEventsView(APIView):
    """
    Returns recent events for fast initial hydration or polling fallback.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.billing.models import RealtimeEvent
        org = request.user.organization
        since = request.GET.get("since")
        qs = RealtimeEvent.objects.filter(organization=org)
        if since:
            qs = qs.filter(created_at__gt=since)
        events = qs.order_by("-created_at")[:50]
        data = [
            {
                "id": str(e.id),
                "event_type": e.event_type,
                "payload": e.payload,
                "created_at": e.created_at.isoformat(),
            }
            for e in reversed(list(events))
        ]
        return Response(data)

