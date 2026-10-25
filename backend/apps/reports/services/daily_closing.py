import logging
from datetime import datetime, time
from decimal import Decimal
from typing import Any, Dict, Optional
import zoneinfo

from django.conf import settings
from django.utils import timezone
from django.db.models import Sum, Count

from apps.transactions.models import Transaction, TransactionPayment, SalesReturn
from apps.customers.models import CustomerTimeline
from apps.billing.models import CashRegister

logger = logging.getLogger(__name__)


class DailyBusinessClosingService:
    """
    Computes comprehensive end-of-day business closing and cash reconciliation.
    Separates sales revenue, actual payment collections, and customer credit.
    Enforces business timezone boundaries.
    """

    @classmethod
    def get_daily_closing_report(
        cls,
        organization,
        store=None,
        cashier=None,
        target_date: Optional[datetime.date] = None,
    ) -> Dict[str, Any]:
        # 1. Resolve Timezone & Date Bounds
        tz_name = getattr(settings, "BUSINESS_TIMEZONE", "Asia/Kolkata")
        try:
            biz_tz = zoneinfo.ZoneInfo(tz_name)
        except Exception:
            biz_tz = zoneinfo.ZoneInfo("UTC")

        now_biz = timezone.now().astimezone(biz_tz)
        if target_date is None:
            target_date = now_biz.date()

        start_dt = datetime.combine(target_date, time.min).replace(tzinfo=biz_tz)
        end_dt = datetime.combine(target_date, time.max).replace(tzinfo=biz_tz)

        # 2. Query Transactions
        tx_qs = Transaction.objects.filter(
            organization=organization,
            transaction_date__gte=start_dt,
            transaction_date__lte=end_dt,
            status="completed",
        )
        if store:
            tx_qs = tx_qs.filter(store=store)
        if cashier:
            tx_qs = tx_qs.filter(cashier=cashier)

        tx_stats = tx_qs.aggregate(
            gross_sales=Sum("total"),
            discounts=Sum("discount"),
            taxes=Sum("tax"),
            completed_count=Count("id"),
        )
        gross_sales = tx_stats["gross_sales"] or Decimal("0.00")
        discounts = tx_stats["discounts"] or Decimal("0.00")
        taxes = tx_stats["taxes"] or Decimal("0.00")
        completed_count = tx_stats["completed_count"] or 0

        # Returns
        returns_qs = SalesReturn.objects.filter(
            organization=organization,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        )
        if store:
            returns_qs = returns_qs.filter(store=store)
        returns_total = returns_qs.aggregate(s=Sum("total_refund_amount"))["s"] or Decimal("0.00")
        net_sales = max(Decimal("0.00"), gross_sales - returns_total)

        # 3. Payment Collections by Method
        payments_qs = TransactionPayment.objects.filter(
            organization=organization,
            status="success",
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        )
        if store:
            payments_qs = payments_qs.filter(transaction__store=store)
        if cashier:
            payments_qs = payments_qs.filter(transaction__cashier=cashier)

        method_totals: Dict[str, Decimal] = {
            "cash": Decimal("0.00"),
            "upi": Decimal("0.00"),
            "card": Decimal("0.00"),
            "credit": Decimal("0.00"),
            "net_banking": Decimal("0.00"),
            "other": Decimal("0.00"),
        }
        for p in payments_qs:
            m = (p.payment_method or "other").lower()
            if m in method_totals:
                method_totals[m] += p.amount
            else:
                method_totals["other"] += p.amount

        total_collected_funds = sum(
            amt for meth, amt in method_totals.items() if meth != "credit"
        )
        credit_extended_today = method_totals.get("credit", Decimal("0.00"))

        # 4. Customer Credit Repayments Received Today
        repayments_qs = CustomerTimeline.objects.filter(
            organization=organization,
            event_type__in=["repayment", "credit_payment"],
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        )
        repayments_total = Decimal("0.00")
        for r in repayments_qs:
            amt = (r.metadata or {}).get("repayment_amount") or (r.metadata or {}).get("amount")
            if amt:
                try:
                    repayments_total += Decimal(str(amt))
                except Exception:
                    pass

        # 5. Cash Register Reconciliation
        reg_qs = CashRegister.objects.filter(
            organization=organization,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        )
        if store:
            reg_qs = reg_qs.filter(store=store)
        if cashier:
            reg_qs = reg_qs.filter(cashier=cashier)

        active_or_closed_reg = reg_qs.first()

        opening_cash = Decimal("0.00")
        actual_cash_counted = Decimal("0.00")
        expected_closing_cash = Decimal("0.00")
        cash_shortage_excess = Decimal("0.00")
        register_status = "no_session"

        if active_or_closed_reg:
            register_status = active_or_closed_reg.status
            opening_cash = active_or_closed_reg.opening_cash or Decimal("0.00")
            expected_closing_cash = active_or_closed_reg.calculate_expected_cash()
            actual_cash_counted = active_or_closed_reg.actual_cash or Decimal("0.00")
            if active_or_closed_reg.status == "closed":
                cash_shortage_excess = active_or_closed_reg.difference or Decimal("0.00")
            else:
                cash_shortage_excess = actual_cash_counted - expected_closing_cash

        # 6. Exceptions & Inventory discrepancy summary
        exceptions_count = Transaction.objects.filter(
            organization=organization,
            transaction_date__gte=start_dt,
            transaction_date__lte=end_dt,
            status="failed",
        ).count()

        return {
            "date": target_date.isoformat(),
            "timezone": tz_name,
            "store_id": str(store.id) if store else None,
            "cashier_id": str(cashier.id) if cashier else None,
            "sales_summary": {
                "completed_transactions": completed_count,
                "gross_sales": float(gross_sales),
                "discounts": float(discounts),
                "taxes": float(taxes),
                "returns": float(returns_total),
                "net_sales": float(net_sales),
            },
            "payment_collections": {
                "total_collected_funds": float(total_collected_funds),
                "cash": float(method_totals["cash"]),
                "upi": float(method_totals["upi"]),
                "card": float(method_totals["card"]),
                "net_banking": float(method_totals["net_banking"]),
                "other": float(method_totals["other"]),
                "credit_extended": float(credit_extended_today),
                "customer_repayments": float(repayments_total),
            },
            "cash_drawer_reconciliation": {
                "register_status": register_status,
                "opening_cash": float(opening_cash),
                "cash_sales_applied": float(method_totals["cash"]),
                "expected_closing_cash": float(expected_closing_cash),
                "actual_counted_cash": float(actual_cash_counted),
                "shortage_or_excess": float(cash_shortage_excess),
            },
            "operational_status": {
                "exceptions_count": exceptions_count,
                "ready_for_close": register_status == "open",
                "is_closed": register_status == "closed",
            },
        }

    @classmethod
    def finalize_daily_closing(
        cls,
        organization,
        user,
        actual_counted_cash: Decimal,
        notes: str = "",
        store=None,
    ) -> Dict[str, Any]:
        """
        Signs off and finalizes the register cash session for the day.
        Records an auditable record of actual counted cash vs expected cash.
        """
        reg_qs = CashRegister.objects.filter(
            organization=organization,
            status="open",
        )
        if store:
            reg_qs = reg_qs.filter(store=store)

        register = reg_qs.first()
        if not register:
            raise ValueError("No open cash register session found to close.")

        register.close_register(
            actual_cash=actual_counted_cash,
            closed_by_user=user,
            notes=notes,
        )

        return {
            "register_id": str(register.id),
            "status": "closed",
            "expected_cash": float(register.expected_cash),
            "actual_cash": float(register.actual_cash),
            "difference": float(register.difference),
            "closed_at": register.closed_at.isoformat() if register.closed_at else None,
            "closed_by": user.email,
        }
