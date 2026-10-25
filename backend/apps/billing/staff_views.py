import csv
from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Count, Max, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.invoices.models import Invoice, Quotation
from apps.invoices.serializers import InvoiceListSerializer, QuotationListSerializer
from apps.stores.models import Store
from apps.transactions.models import SalesReturn, Transaction, TransactionPayment
from common.pagination import StandardPagination

ADMIN_ROLES = ("super_admin", "org_admin", "owner", "store_manager", "manager")


class StaffBaseView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def check_active_staff(self, request):
        if not request.user.is_active:
            raise PermissionDenied("Inactive staff accounts cannot access staff services.")
        if not request.user.organization:
            raise PermissionDenied("User is not associated with an organization.")


class StaffOverviewView(StaffBaseView):
    """
    Dedicated Staff Dashboard Overview API.
    Scoped strictly to the authenticated user's transactions and store context.
    """

    def get(self, request):
        self.check_active_staff(request)
        user = request.user
        org = user.organization

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Store context
        store = Store.objects.filter(organization=org).first()

        # Personal transactions today
        tx_today = Transaction.objects.filter(
            organization=org,
            cashier=user,
            transaction_date__gte=today_start,
            status="completed",
        )

        today_stats = tx_today.aggregate(
            gross=Sum("total"),
            paid=Sum("amount_paid"),
            outstanding=Sum("outstanding_amount"),
            count=Count("id"),
        )

        today_gross = today_stats["gross"] or Decimal("0.00")
        today_bills_count = today_stats["count"] or 0
        today_outstanding = today_stats["outstanding"] or Decimal("0.00")

        # Today's actual collections by this staff member (non-credit payments)
        today_collected = TransactionPayment.objects.filter(
            organization=org,
            transaction__cashier=user,
            created_at__gte=today_start,
            status="success",
        ).exclude(payment_method__iexact="credit").aggregate(s=Sum("amount"))["s"] or Decimal("0.00")

        # Sales by payment method today for this staff member
        pm_qs = TransactionPayment.objects.filter(
            organization=org,
            transaction__cashier=user,
            created_at__gte=today_start,
            status="success",
        ).values("payment_method").annotate(
            total=Sum("amount"),
            count=Count("id"),
        ).order_by("-total")

        payment_methods = []
        for p in pm_qs:
            amt = p["total"] or Decimal("0.00")
            pct = (amt / today_collected * Decimal("100.00")) if today_collected > Decimal("0.00") else Decimal("0.00")
            payment_methods.append({
                "method": p["payment_method"].upper(),
                "payment_method": p["payment_method"],
                "amount": float(amt),
                "count": p["count"] or 0,
                "percentage": round(float(pct), 1),
            })

        # Recent 10 transactions by this staff member
        recent_txs = Transaction.objects.filter(
            organization=org,
            cashier=user,
            status="completed",
        ).select_related("customer", "invoice").prefetch_related("payments").order_by("-transaction_date")[:10]

        recent_bills = []
        for tx in recent_txs:
            recent_bills.append({
                "id": str(tx.id),
                "invoice_number": tx.invoice_number,
                "customer_name": tx.customer.full_name if tx.customer else "Walk-in Customer",
                "customer_phone": tx.customer.phone if tx.customer else "-",
                "date": tx.transaction_date.isoformat(),
                "total": float(tx.total),
                "amount_paid": float(tx.amount_paid),
                "outstanding_amount": float(tx.outstanding_amount),
                "payment_status": tx.payment_status,
                "payment_method": tx.payment_method,
                "pdf_url": tx.invoice.pdf_url if hasattr(tx, "invoice") and tx.invoice else "",
                "web_url": tx.invoice.web_url if hasattr(tx, "invoice") and tx.invoice else "",
            })

        return Response({
            "staff": {
                "id": str(user.id),
                "name": user.get_full_name() or user.email,
                "email": user.email,
                "role": user.role,
                "role_display": user.get_role_display(),
            },
            "organization": {
                "id": str(org.id),
                "name": org.name,
                "gst_number": getattr(org, "gst_number", ""),
            },
            "store": {
                "id": str(store.id) if store else "",
                "name": store.name if store else "Main Store",
            },
            "metrics": {
                "today_sales": float(today_gross),
                "today_bills_count": today_bills_count,
                "today_collected": float(today_collected),
                "today_outstanding": float(today_outstanding),
            },
            "payment_methods": payment_methods,
            "recent_bills": recent_bills,
        })


class StaffInvoiceListView(StaffBaseView):
    """
    Staff-scoped Invoice List API.
    Cashiers/staff can only view invoices generated by themselves.
    Admins can view all or filter by cashier.
    """

    def get(self, request):
        self.check_active_staff(request)
        user = request.user
        org = user.organization

        qs = Invoice.objects.filter(organization=org).select_related(
            "transaction__customer",
            "transaction__store",
            "transaction__cashier",
            "origin_quotation",
        ).order_by("-created_at")

        # Identity enforcement: cashiers are strictly scoped to their own transactions
        if user.role not in ("super_admin", "org_admin", "store_manager", "manager"):
            qs = qs.filter(transaction__cashier=user)
        else:
            cashier_id = request.query_params.get("cashier_id")
            if cashier_id:
                qs = qs.filter(transaction__cashier_id=cashier_id)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(invoice_number__icontains=search)
                | Q(transaction__customer__full_name__icontains=search)
                | Q(transaction__customer__phone__icontains=search)
            )

        payment_status = request.query_params.get("payment_status")
        if payment_status:
            qs = qs.filter(transaction__payment_status=payment_status)

        start_date = request.query_params.get("start_date")
        if start_date:
            qs = qs.filter(created_at__date__gte=start_date)
        end_date = request.query_params.get("end_date")
        if end_date:
            qs = qs.filter(created_at__date__lte=end_date)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        if page is not None:
            serializer = InvoiceListSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = InvoiceListSerializer(qs[:100], many=True)
        return Response(serializer.data)


class StaffQuotationListView(StaffBaseView):
    """
    Staff-scoped Quotation List API.
    Cashiers/staff can only view quotations created by themselves.
    """

    def get(self, request):
        self.check_active_staff(request)
        user = request.user
        org = user.organization

        qs = Quotation.objects.filter(organization=org).select_related(
            "customer", "store", "converted_invoice", "created_by"
        ).order_by("-created_at")

        if user.role not in ("super_admin", "org_admin", "store_manager", "manager"):
            qs = qs.filter(created_by=user)
        else:
            creator_id = request.query_params.get("created_by")
            if creator_id:
                qs = qs.filter(created_by_id=creator_id)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(quotation_number__icontains=search)
                | Q(customer__full_name__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(customer_phone__icontains=search)
            )

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

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


class StaffSalesProfileView(StaffBaseView):
    """
    Personal Sales Profile API.
    Calculates actual sales, collections, credit, and breakdown by payment method
    for the authenticated staff member over selected date ranges.
    """

    def get(self, request):
        self.check_active_staff(request)
        user = request.user
        org = user.organization

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Date range parsing (default: last 30 days)
        start_date_str = request.query_params.get("start_date")
        end_date_str = request.query_params.get("end_date")

        if start_date_str:
            try:
                start_dt = datetime.strptime(start_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                start_dt = today_start - timedelta(days=29)
        else:
            start_dt = today_start - timedelta(days=29)

        if end_date_str:
            try:
                end_dt = datetime.strptime(end_date_str, "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59, tzinfo=timezone.utc
                )
            except ValueError:
                end_dt = now
        else:
            end_dt = now

        # Today stats
        tx_today = Transaction.objects.filter(
            organization=org,
            cashier=user,
            transaction_date__gte=today_start,
            status="completed",
        )
        today_gross = tx_today.aggregate(s=Sum("total"))["s"] or Decimal("0.00")
        today_count = tx_today.count()
        today_collected = TransactionPayment.objects.filter(
            organization=org,
            transaction__cashier=user,
            created_at__gte=today_start,
            status="success",
        ).exclude(payment_method__iexact="credit").aggregate(s=Sum("amount"))["s"] or Decimal("0.00")

        # Range stats
        tx_range = Transaction.objects.filter(
            organization=org,
            cashier=user,
            transaction_date__gte=start_dt,
            transaction_date__lte=end_dt,
            status="completed",
        )

        range_stats = tx_range.aggregate(
            gross=Sum("total"),
            discounts=Sum("discount"),
            paid=Sum("amount_paid"),
            outstanding=Sum("outstanding_amount"),
            count=Count("id"),
        )

        range_gross = range_stats["gross"] or Decimal("0.00")
        range_discounts = range_stats["discounts"] or Decimal("0.00")
        range_count = range_stats["count"] or 0
        range_outstanding = range_stats["outstanding"] or Decimal("0.00")

        # Range collections (actual money collected, excluding credit allocations)
        range_collected = TransactionPayment.objects.filter(
            organization=org,
            transaction__cashier=user,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
            status="success",
        ).exclude(payment_method__iexact="credit").aggregate(s=Sum("amount"))["s"] or Decimal("0.00")

        # Breakdown by payment method
        pm_qs = TransactionPayment.objects.filter(
            organization=org,
            transaction__cashier=user,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
            status="success",
        ).values("payment_method").annotate(
            total=Sum("amount"),
            count=Count("id"),
        ).order_by("-total")

        payment_methods = []
        for p in pm_qs:
            amt = p["total"] or Decimal("0.00")
            pct = (amt / range_collected * Decimal("100.00")) if range_collected > Decimal("0.00") else Decimal("0.00")
            payment_methods.append({
                "method": p["payment_method"].upper(),
                "payment_method": p["payment_method"],
                "amount": float(amt),
                "count": p["count"] or 0,
                "percentage": round(float(pct), 1),
            })

        # Recent 20 personal invoices
        recent_txs = tx_range.select_related("customer", "invoice").order_by("-transaction_date")[:20]
        recent_invoices = []
        for tx in recent_txs:
            recent_invoices.append({
                "id": str(tx.id),
                "invoice_number": tx.invoice_number,
                "date": tx.transaction_date.isoformat(),
                "customer": tx.customer.full_name if tx.customer else "Walk-in Customer",
                "total": float(tx.total),
                "amount_paid": float(tx.amount_paid),
                "outstanding_amount": float(tx.outstanding_amount),
                "payment_status": tx.payment_status,
                "payment_method": tx.payment_method,
                "pdf_url": tx.invoice.pdf_url if hasattr(tx, "invoice") and tx.invoice else "",
                "web_url": tx.invoice.web_url if hasattr(tx, "invoice") and tx.invoice else "",
            })

        return Response({
            "staff": {
                "id": str(user.id),
                "name": user.get_full_name() or user.email,
                "email": user.email,
                "role": user.role,
                "role_display": user.get_role_display(),
            },
            "date_range": {
                "start_date": start_dt.strftime("%Y-%m-%d"),
                "end_date": end_dt.strftime("%Y-%m-%d"),
            },
            "today": {
                "sales": float(today_gross),
                "invoices_count": today_count,
                "collected": float(today_collected),
            },
            "range_summary": {
                "gross_sales": float(range_gross),
                "discounts": float(range_discounts),
                "net_sales": float(max(Decimal("0.00"), range_gross - range_discounts)),
                "invoices_count": range_count,
                "actual_collected": float(range_collected),
                "outstanding_credit": float(range_outstanding),
            },
            "payment_methods": payment_methods,
            "recent_invoices": recent_invoices,
        })


class AdminStaffSalesBreakdownView(APIView):
    """
    Administrator-Wide Sales Report with Staff Attribution.
    Enforces server-side aggregation, date filtering, payment breakdown,
    and returns attribution for both authenticated staff and historical "Unknown / Legacy" transactions.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        org = user.organization

        if user.role not in ADMIN_ROLES and not user.is_superuser:
            raise PermissionDenied("Only administrators and managers can access organization-wide staff sales reports.")

        # Date range filters
        start_date_str = request.query_params.get("start_date")
        end_date_str = request.query_params.get("end_date")

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        if start_date_str:
            try:
                start_dt = datetime.strptime(start_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                start_dt = today_start - timedelta(days=29)
        else:
            start_dt = today_start - timedelta(days=29)

        if end_date_str:
            try:
                end_dt = datetime.strptime(end_date_str, "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59, tzinfo=timezone.utc
                )
            except ValueError:
                end_dt = now
        else:
            end_dt = now

        # Base transaction queryset
        tx_qs = Transaction.objects.filter(
            organization=org,
            transaction_date__gte=start_dt,
            transaction_date__lte=end_dt,
            status="completed",
        )

        staff_filter = request.query_params.get("staff_id")
        if staff_filter:
            if staff_filter.lower() in ("unknown", "legacy", "null", "none"):
                tx_qs = tx_qs.filter(cashier__isnull=True)
            else:
                tx_qs = tx_qs.filter(cashier_id=staff_filter)

        search = request.query_params.get("search", "").strip()
        if search:
            tx_qs = tx_qs.filter(
                Q(cashier__first_name__icontains=search)
                | Q(cashier__last_name__icontains=search)
                | Q(cashier__email__icontains=search)
                | Q(invoice_number__icontains=search)
            )

        # Server-side grouping by cashier
        grouped_stats = tx_qs.values(
            "cashier__id",
            "cashier__first_name",
            "cashier__last_name",
            "cashier__email",
            "cashier__role",
        ).annotate(
            completed_sales=Count("id"),
            gross_sales=Sum("total"),
            discounts=Sum("discount"),
            paid_amount=Sum("amount_paid"),
            outstanding_credit=Sum("outstanding_amount"),
            last_transaction=Max("transaction_date"),
        ).order_by("-gross_sales")

        # Returns in range grouped by cashier (if cashier was associated with original tx)
        returns_qs = SalesReturn.objects.filter(
            organization=org,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        ).values("original_transaction__cashier__id").annotate(
            returns_sum=Sum("total_refund_amount")
        )
        returns_by_cashier = {r["original_transaction__cashier__id"]: r["returns_sum"] or Decimal("0.00") for r in returns_qs}

        # Actual collections (payments) in range grouped by transaction__cashier
        payments_qs = TransactionPayment.objects.filter(
            organization=org,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
            status="success",
        ).exclude(payment_method__iexact="credit").values("transaction__cashier__id").annotate(
            collected_sum=Sum("amount")
        )
        collections_by_cashier = {p["transaction__cashier__id"]: p["collected_sum"] or Decimal("0.00") for p in payments_qs}

        staff_rows = []
        overall_gross = Decimal("0.00")
        overall_discounts = Decimal("0.00")
        overall_returns = Decimal("0.00")
        overall_net = Decimal("0.00")
        overall_collected = Decimal("0.00")
        overall_credit = Decimal("0.00")
        overall_sales_count = 0

        for row in grouped_stats:
            cid = row["cashier__id"]
            if cid:
                name = f"{row['cashier__first_name'] or ''} {row['cashier__last_name'] or ''}".strip() or row["cashier__email"]
                email = row["cashier__email"]
                role = row["cashier__role"] or "staff"
            else:
                name = "Unknown / Legacy"
                email = "N/A"
                role = "Legacy / System"

            gross = row["gross_sales"] or Decimal("0.00")
            disc = row["discounts"] or Decimal("0.00")
            ret = returns_by_cashier.get(cid, Decimal("0.00"))
            net = max(Decimal("0.00"), gross - ret)
            coll = collections_by_cashier.get(cid, row["paid_amount"] or Decimal("0.00"))
            cred = row["outstanding_credit"] or Decimal("0.00")
            count = row["completed_sales"] or 0
            last_tx = row["last_transaction"].isoformat() if row["last_transaction"] else None

            overall_gross += gross
            overall_discounts += disc
            overall_returns += ret
            overall_net += net
            overall_collected += coll
            overall_credit += cred
            overall_sales_count += count

            staff_rows.append({
                "staff_id": str(cid) if cid else None,
                "name": name,
                "email": email,
                "role": role,
                "completed_sales": count,
                "gross_sales": float(gross),
                "discounts": float(disc),
                "returns": float(ret),
                "net_sales": float(net),
                "collected_amount": float(coll),
                "outstanding_credit": float(cred),
                "last_transaction": last_tx,
            })

        # CSV Export Support
        if request.query_params.get("export") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="staff_sales_breakdown_{start_dt.strftime("%Y%m%d")}_{end_dt.strftime("%Y%m%d")}.csv"'
            writer = csv.writer(response)
            writer.writerow([
                "Staff Name", "Role", "Completed Sales", "Gross Sales",
                "Discounts", "Returns", "Net Sales", "Collected Amount", "Outstanding Credit", "Last Transaction"
            ])
            for r in staff_rows:
                writer.writerow([
                    r["name"], r["role"], r["completed_sales"], r["gross_sales"],
                    r["discounts"], r["returns"], r["net_sales"], r["collected_amount"],
                    r["outstanding_credit"], r["last_transaction"] or ""
                ])
            writer.writerow([])
            writer.writerow([
                "TOTALS", "", overall_sales_count, float(overall_gross),
                float(overall_discounts), float(overall_returns), float(overall_net),
                float(overall_collected), float(overall_credit), ""
            ])
            return response

        return Response({
            "date_range": {
                "start_date": start_dt.strftime("%Y-%m-%d"),
                "end_date": end_dt.strftime("%Y-%m-%d"),
            },
            "summary": {
                "completed_sales": overall_sales_count,
                "gross_sales": float(overall_gross),
                "discounts": float(overall_discounts),
                "returns": float(overall_returns),
                "net_sales": float(overall_net),
                "collected_amount": float(overall_collected),
                "outstanding_credit": float(overall_credit),
            },
            "staff_breakdown": staff_rows,
        })
