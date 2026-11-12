import calendar
from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Iterable, List, Optional
import zoneinfo

from django.conf import settings
from django.db.models import Count, Exists, Max, OuterRef, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.transactions.models import (
    CustomerCreditPayment,
    SalesReturn,
    Transaction,
    TransactionPayment,
)


ZERO_DEC = Decimal("0.00")

METHOD_DISPLAY_NAMES = {
    "cash": "Cash",
    "upi": "UPI",
    "card": "Card",
    "credit": "Credit",
    "net_banking": "Net Banking",
    "netbanking": "Net Banking",
    "bank_transfer": "Net Banking",
    "cheque": "Cheque",
    "wallet": "Wallet",
    "other": "Other",
}


def _to_money(val: Any) -> Decimal:
    if val is None:
        return ZERO_DEC
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _to_float(val: Any) -> float:
    return float(_to_money(val))


def resolve_organization_timezone(organization) -> zoneinfo.ZoneInfo:
    """Resolve the business timezone configured on the organization or settings."""
    tz_name = (
        getattr(organization, "timezone", None)
        or getattr(settings, "BUSINESS_TIMEZONE", "Asia/Kolkata")
        or "Asia/Kolkata"
    )
    try:
        return zoneinfo.ZoneInfo(tz_name)
    except Exception:
        return zoneinfo.ZoneInfo("Asia/Kolkata")


def get_period_bounds(organization, now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Compute exact Today, This Week (Monday-Sunday), This Month, and This Year
    timezone-aware boundaries using the organization's configured timezone.
    """
    biz_tz = resolve_organization_timezone(organization)
    ref_now = (now or timezone.now()).astimezone(biz_tz)
    today_date = ref_now.date()

    today_start = datetime.combine(today_date, time.min, tzinfo=biz_tz)
    today_end = datetime.combine(today_date, time.max, tzinfo=biz_tz)

    week_start_date = today_date - timedelta(days=today_date.weekday())
    week_end_date = week_start_date + timedelta(days=6)
    week_start = datetime.combine(week_start_date, time.min, tzinfo=biz_tz)
    week_end = datetime.combine(week_end_date, time.max, tzinfo=biz_tz)

    month_start_date = today_date.replace(day=1)
    last_month_day = calendar.monthrange(today_date.year, today_date.month)[1]
    month_end_date = today_date.replace(day=last_month_day)
    month_start = datetime.combine(month_start_date, time.min, tzinfo=biz_tz)
    month_end = datetime.combine(month_end_date, time.max, tzinfo=biz_tz)

    year_start = datetime.combine(today_date.replace(month=1, day=1), time.min, tzinfo=biz_tz)
    year_end = datetime.combine(today_date.replace(month=12, day=31), time.max, tzinfo=biz_tz)

    return {
        "timezone": str(biz_tz),
        "biz_tz": biz_tz,
        "now": ref_now,
        "today_date": today_date,
        "today": (today_start, today_end),
        "week": (week_start, week_end),
        "month": (month_start, month_end),
        "year": (year_start, year_end),
    }


def valid_completed_transactions_qs(organization, customer_ids: Optional[Iterable] = None):
    """Base queryset of valid completed purchase invoices (excludes cancelled, refunded, pending, returns)."""
    qs = Transaction.objects.filter(
        organization=organization,
        status="completed",
        is_return=False,
    )
    if customer_ids is not None:
        qs = qs.filter(customer_id__in=list(customer_ids))
    return qs


def valid_completed_returns_qs(organization, customer_ids: Optional[Iterable] = None):
    """
    Completed sales returns tied to still-completed transactions so refunds are
    never double-subtracted for already excluded refunded/cancelled invoices.
    """
    qs = SalesReturn.objects.filter(
        organization=organization,
        status="completed",
        original_transaction__status="completed",
        original_transaction__is_return=False,
    )
    if customer_ids is not None:
        qs = qs.filter(customer_id__in=list(customer_ids))
    return qs


def _empty_summary_kpis() -> Dict[str, Any]:
    return {
        "today_purchase_count": 0,
        "today_spend": 0.0,
        "week_purchase_count": 0,
        "week_spend": 0.0,
        "month_purchase_count": 0,
        "month_spend": 0.0,
        "year_purchase_count": 0,
        "year_spend": 0.0,
        "total_purchase_count": 0,
        "lifetime_spend": 0.0,
        "average_bill_value": 0.0,
        "last_purchase_date": None,
        "days_since_last_purchase": None,
    }


def _net_period_spend(gross: Decimal, refunds: Decimal) -> Decimal:
    return max(ZERO_DEC, _to_money(gross) - _to_money(refunds))


def format_payment_method_label(method: str) -> str:
    key = (method or "").strip().lower()
    return METHOD_DISPLAY_NAMES.get(key, key.replace("_", " ").title() if key else "Other")


def summarize_transaction_payment_methods(tx: Transaction) -> str:
    """Build clean non-duplicated display summary like 'Cash + UPI' from payment rows."""
    payments = list(tx.payments.all())
    if payments:
        seen = []
        for p in payments:
            if getattr(p, "status", "success") != "success":
                continue
            label = format_payment_method_label(p.payment_method)
            if label not in seen:
                seen.append(label)
        if seen:
            return " + ".join(seen)
    return format_payment_method_label(tx.payment_method or "cash")


def get_bulk_customer_summary_kpis(
    organization,
    customer_ids: List[Any],
    now: Optional[datetime] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Batch-compute summary purchase & spend KPIs for a page of customer IDs
    using 2 constant GROUP BY queries (zero N+1 queries regardless of list size).
    """
    id_strs = [str(cid) for cid in customer_ids if cid]
    if not id_strs:
        return {}

    bounds = get_period_bounds(organization, now=now)
    biz_tz = bounds["biz_tz"]
    today_date = bounds["today_date"]

    tx_agg_rows = (
        valid_completed_transactions_qs(organization, customer_ids=id_strs)
        .filter(customer__is_walk_in=False)
        .values("customer_id")
        .annotate(
            today_count=Count("id", filter=Q(transaction_date__range=bounds["today"])),
            today_gross=Coalesce(Sum("total", filter=Q(transaction_date__range=bounds["today"])), ZERO_DEC),
            week_count=Count("id", filter=Q(transaction_date__range=bounds["week"])),
            week_gross=Coalesce(Sum("total", filter=Q(transaction_date__range=bounds["week"])), ZERO_DEC),
            month_count=Count("id", filter=Q(transaction_date__range=bounds["month"])),
            month_gross=Coalesce(Sum("total", filter=Q(transaction_date__range=bounds["month"])), ZERO_DEC),
            year_count=Count("id", filter=Q(transaction_date__range=bounds["year"])),
            year_gross=Coalesce(Sum("total", filter=Q(transaction_date__range=bounds["year"])), ZERO_DEC),
            total_count=Count("id"),
            lifetime_gross=Coalesce(Sum("total"), ZERO_DEC),
            last_tx_at=Max("transaction_date"),
        )
    )
    tx_by_cid = {str(r["customer_id"]): r for r in tx_agg_rows}

    ret_agg_rows = (
        valid_completed_returns_qs(organization, customer_ids=id_strs)
        .filter(customer__is_walk_in=False)
        .values("customer_id")
        .annotate(
            today_ret=Coalesce(Sum("total_refund_amount", filter=Q(created_at__range=bounds["today"])), ZERO_DEC),
            week_ret=Coalesce(Sum("total_refund_amount", filter=Q(created_at__range=bounds["week"])), ZERO_DEC),
            month_ret=Coalesce(Sum("total_refund_amount", filter=Q(created_at__range=bounds["month"])), ZERO_DEC),
            year_ret=Coalesce(Sum("total_refund_amount", filter=Q(created_at__range=bounds["year"])), ZERO_DEC),
            lifetime_ret=Coalesce(Sum("total_refund_amount"), ZERO_DEC),
        )
    )
    ret_by_cid = {str(r["customer_id"]): r for r in ret_agg_rows}

    result: Dict[str, Dict[str, Any]] = {}
    for cid in id_strs:
        tx_row = tx_by_cid.get(cid)
        if not tx_row:
            result[cid] = _empty_summary_kpis()
            continue

        ret_row = ret_by_cid.get(cid) or {}
        total_count = int(tx_row["total_count"] or 0)
        today_spend = _net_period_spend(tx_row["today_gross"], ret_row.get("today_ret") or ZERO_DEC)
        week_spend = _net_period_spend(tx_row["week_gross"], ret_row.get("week_ret") or ZERO_DEC)
        month_spend = _net_period_spend(tx_row["month_gross"], ret_row.get("month_ret") or ZERO_DEC)
        year_spend = _net_period_spend(tx_row["year_gross"], ret_row.get("year_ret") or ZERO_DEC)
        lifetime_spend = _net_period_spend(tx_row["lifetime_gross"], ret_row.get("lifetime_ret") or ZERO_DEC)

        avg_bill = (
            (lifetime_spend / Decimal(total_count)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if total_count > 0
            else ZERO_DEC
        )

        last_dt = tx_row["last_tx_at"]
        days_since = None
        if last_dt is not None:
            local_last = last_dt.astimezone(biz_tz) if timezone.is_aware(last_dt) else timezone.make_aware(last_dt, biz_tz)
            days_since = max(0, (today_date - local_last.date()).days)

        result[cid] = {
            "today_purchase_count": int(tx_row["today_count"] or 0),
            "today_spend": float(today_spend),
            "week_purchase_count": int(tx_row["week_count"] or 0),
            "week_spend": float(week_spend),
            "month_purchase_count": int(tx_row["month_count"] or 0),
            "month_spend": float(month_spend),
            "year_purchase_count": int(tx_row["year_count"] or 0),
            "year_spend": float(year_spend),
            "total_purchase_count": total_count,
            "lifetime_spend": float(lifetime_spend),
            "average_bill_value": float(avg_bill),
            "last_purchase_date": last_dt.isoformat() if last_dt else None,
            "days_since_last_purchase": days_since,
        }

    return result


def _compute_payment_breakdown(organization, customer) -> Dict[str, Any]:
    """
    Aggregate actual payment allocations by method from TransactionPayment,
    with fallback for completed legacy transactions lacking child payment rows.
    """
    buckets = {
        "cash": ZERO_DEC,
        "upi": ZERO_DEC,
        "card": ZERO_DEC,
        "credit": ZERO_DEC,
        "other": ZERO_DEC,
    }

    pm_rows = (
        TransactionPayment.objects.filter(
            organization=organization,
            status="success",
            transaction__customer=customer,
            transaction__status="completed",
            transaction__is_return=False,
        )
        .values("payment_method")
        .annotate(total_amount=Coalesce(Sum("amount"), ZERO_DEC))
    )

    for row in pm_rows:
        raw_method = (row["payment_method"] or "other").strip().lower()
        amt = _to_money(row["total_amount"])
        if raw_method in buckets:
            buckets[raw_method] += amt
        else:
            buckets["other"] += amt

    # Legacy completed transactions created without TransactionPayment rows
    has_child_payment = TransactionPayment.objects.filter(transaction=OuterRef("pk"), status="success")
    legacy_txs = (
        valid_completed_transactions_qs(organization, customer_ids=[customer.id])
        .annotate(has_payments=Exists(has_child_payment))
        .filter(has_payments=False)
        .values("payment_method")
        .annotate(total_amount=Coalesce(Sum("total"), ZERO_DEC))
    )
    for row in legacy_txs:
        raw_method = (row["payment_method"] or "cash").strip().lower()
        amt = _to_money(row["total_amount"])
        if raw_method in buckets:
            buckets[raw_method] += amt
        else:
            buckets["other"] += amt

    total_allocated = sum(buckets.values(), ZERO_DEC)
    return {
        "cash": float(buckets["cash"]),
        "upi": float(buckets["upi"]),
        "card": float(buckets["card"]),
        "credit": float(buckets["credit"]),
        "other": float(buckets["other"]),
        "total_allocated": float(_to_money(total_allocated)),
    }


def _compute_credit_summary(organization, customer) -> Dict[str, Any]:
    """Calculate outstanding credit, total credit taken, and total credit paid independently."""
    credit_from_payments = (
        TransactionPayment.objects.filter(
            organization=organization,
            status="success",
            payment_method__iexact="credit",
            transaction__customer=customer,
            transaction__status="completed",
            transaction__is_return=False,
        ).aggregate(total=Coalesce(Sum("amount"), ZERO_DEC))["total"]
        or ZERO_DEC
    )

    has_credit_payment_row = TransactionPayment.objects.filter(
        transaction=OuterRef("pk"),
        status="success",
        payment_method__iexact="credit",
    )
    legacy_credit_outstanding = (
        valid_completed_transactions_qs(organization, customer_ids=[customer.id])
        .annotate(has_credit_row=Exists(has_credit_payment_row))
        .filter(has_credit_row=False, outstanding_amount__gt=ZERO_DEC)
        .aggregate(total=Coalesce(Sum("outstanding_amount"), ZERO_DEC))["total"]
        or ZERO_DEC
    )

    total_credit_paid = (
        CustomerCreditPayment.objects.filter(
            organization=organization,
            customer=customer,
        ).aggregate(total=Coalesce(Sum("amount"), ZERO_DEC))["total"]
        or ZERO_DEC
    )

    outstanding_balance = max(ZERO_DEC, _to_money(customer.outstanding_credit))
    total_credit_taken = _to_money(credit_from_payments + legacy_credit_outstanding)
    # If legacy transactions already had partial repayments, ensure credit_taken >= outstanding + paid
    if legacy_credit_outstanding > ZERO_DEC:
        total_credit_taken = max(total_credit_taken, outstanding_balance + _to_money(total_credit_paid))

    return {
        "outstanding_balance": float(outstanding_balance),
        "total_credit_taken": float(total_credit_taken),
        "total_credit_paid": float(_to_money(total_credit_paid)),
        "credit_limit": float(_to_money(customer.credit_limit)),
    }


def get_customer_detailed_analytics(
    organization,
    customer,
    purchase_limit: int = 50,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Compute complete customer-wise KPIs, payment method allocations, credit summary,
    and itemized completed purchase history from live database records.
    """
    bounds = get_period_bounds(organization, now=now)

    customer_info = {
        "id": str(customer.id),
        "customer_id": customer.customer_id,
        "name": customer.full_name,
        "full_name": customer.full_name,
        "phone": customer.phone,
        "mobile": customer.phone,
        "email": customer.email,
        "address_line1": customer.address_line1,
        "full_address": customer.full_address,
        "city": customer.city,
        "state": customer.state,
        "postal_code": customer.postal_code,
        "gstin": customer.gstin,
        "segment": customer.segment,
        "is_walk_in": bool(customer.is_walk_in),
        "customer_since": customer.created_at.isoformat() if customer.created_at else None,
        "portal_token": str(customer.portal_token) if customer.portal_token else None,
    }

    # Walk-in safeguard: do not present merged generic walk-in history as a single personal KPI profile
    if getattr(customer, "is_walk_in", False):
        return {
            "customer": customer_info,
            "is_walk_in": True,
            "walk_in_notice": "Generic Walk-in records are kept separate from permanent registered customer analytics.",
            "timezone": bounds["timezone"],
            "today": {"purchase_count": 0, "spend": 0.0},
            "week": {"purchase_count": 0, "spend": 0.0},
            "month": {"purchase_count": 0, "spend": 0.0},
            "year": {"purchase_count": 0, "spend": 0.0},
            "lifetime": {"purchase_count": 0, "spend": 0.0},
            "average_bill_value": 0.0,
            "last_purchase_date": None,
            "customer_since": customer.created_at.isoformat() if customer.created_at else None,
            "days_since_last_purchase": None,
            "payment_breakdown": {"cash": 0.0, "upi": 0.0, "card": 0.0, "credit": 0.0, "other": 0.0, "total_allocated": 0.0},
            "credit": {"outstanding_balance": 0.0, "total_credit_taken": 0.0, "total_credit_paid": 0.0, "credit_limit": 0.0},
            "purchase_history": [],
        }

    summary_map = get_bulk_customer_summary_kpis(organization, [customer.id], now=now)
    kpis = summary_map.get(str(customer.id), _empty_summary_kpis())

    payment_breakdown = _compute_payment_breakdown(organization, customer)
    credit_summary = _compute_credit_summary(organization, customer)

    history_txs = (
        valid_completed_transactions_qs(organization, customer_ids=[customer.id])
        .select_related("invoice", "store")
        .prefetch_related("payments", "items")
        .order_by("-transaction_date")[:purchase_limit]
    )

    purchase_history = []
    for tx in history_txs:
        inv = getattr(tx, "invoice", None)
        allocations = [
            {
                "payment_method": p.payment_method,
                "label": format_payment_method_label(p.payment_method),
                "amount": _to_float(p.amount),
                "reference": p.reference,
            }
            for p in tx.payments.all()
            if getattr(p, "status", "success") == "success"
        ]
        purchase_history.append({
            "id": str(tx.id),
            "invoice_id": str(inv.id) if inv else None,
            "invoice_number": tx.invoice_number,
            "date": tx.transaction_date.isoformat(),
            "total": _to_float(tx.total),
            "amount_paid": _to_float(tx.amount_paid),
            "outstanding_amount": _to_float(tx.outstanding_amount),
            "status": tx.status,
            "payment_status": tx.payment_status,
            "payment_method": tx.payment_method,
            "payment_method_summary": summarize_transaction_payment_methods(tx),
            "payment_allocations": allocations,
            "items_count": len(tx.items.all()),
            "store_name": tx.store.name if tx.store else "",
            "web_url": inv.web_url if inv else None,
            "pdf_url": f"/api/v1/invoices/{inv.id}/pdf/" if inv else None,
        })

    return {
        "customer": customer_info,
        "is_walk_in": False,
        "timezone": bounds["timezone"],
        "today": {
            "purchase_count": kpis["today_purchase_count"],
            "spend": kpis["today_spend"],
        },
        "week": {
            "purchase_count": kpis["week_purchase_count"],
            "spend": kpis["week_spend"],
        },
        "month": {
            "purchase_count": kpis["month_purchase_count"],
            "spend": kpis["month_spend"],
        },
        "year": {
            "purchase_count": kpis["year_purchase_count"],
            "spend": kpis["year_spend"],
        },
        "lifetime": {
            "purchase_count": kpis["total_purchase_count"],
            "spend": kpis["lifetime_spend"],
        },
        "average_bill_value": kpis["average_bill_value"],
        "last_purchase_date": kpis["last_purchase_date"],
        "customer_since": customer.created_at.isoformat() if customer.created_at else None,
        "days_since_last_purchase": kpis["days_since_last_purchase"],
        "payment_breakdown": payment_breakdown,
        "credit": credit_summary,
        "purchase_history": purchase_history,
    }


def reconcile_organization_customer_sales(organization, now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Reconcile registered-customer + walk-in completed sales against total organization
    completed sales across Today and Lifetime periods.
    """
    bounds = get_period_bounds(organization, now=now)
    base_tx = valid_completed_transactions_qs(organization)

    registered_tx = base_tx.filter(customer__isnull=False, customer__is_walk_in=False)
    walkin_tx = base_tx.filter(Q(customer__isnull=True) | Q(customer__is_walk_in=True))

    org_agg = base_tx.aggregate(
        today_count=Count("id", filter=Q(transaction_date__range=bounds["today"])),
        today_total=Coalesce(Sum("total", filter=Q(transaction_date__range=bounds["today"])), ZERO_DEC),
        lifetime_count=Count("id"),
        lifetime_total=Coalesce(Sum("total"), ZERO_DEC),
    )
    reg_agg = registered_tx.aggregate(
        today_count=Count("id", filter=Q(transaction_date__range=bounds["today"])),
        today_total=Coalesce(Sum("total", filter=Q(transaction_date__range=bounds["today"])), ZERO_DEC),
        lifetime_count=Count("id"),
        lifetime_total=Coalesce(Sum("total"), ZERO_DEC),
    )
    walk_agg = walkin_tx.aggregate(
        today_count=Count("id", filter=Q(transaction_date__range=bounds["today"])),
        today_total=Coalesce(Sum("total", filter=Q(transaction_date__range=bounds["today"])), ZERO_DEC),
        lifetime_count=Count("id"),
        lifetime_total=Coalesce(Sum("total"), ZERO_DEC),
    )

    return {
        "organization_total": {
            "today_count": int(org_agg["today_count"] or 0),
            "today_gross": _to_float(org_agg["today_total"]),
            "lifetime_count": int(org_agg["lifetime_count"] or 0),
            "lifetime_gross": _to_float(org_agg["lifetime_total"]),
        },
        "registered_customers": {
            "today_count": int(reg_agg["today_count"] or 0),
            "today_gross": _to_float(reg_agg["today_total"]),
            "lifetime_count": int(reg_agg["lifetime_count"] or 0),
            "lifetime_gross": _to_float(reg_agg["lifetime_total"]),
        },
        "walk_in": {
            "today_count": int(walk_agg["today_count"] or 0),
            "today_gross": _to_float(walk_agg["today_total"]),
            "lifetime_count": int(walk_agg["lifetime_count"] or 0),
            "lifetime_gross": _to_float(walk_agg["lifetime_total"]),
        },
    }

