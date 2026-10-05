from datetime import datetime, time
from decimal import Decimal
from django.db.models import Sum, Count, F, Q
from django.utils import timezone

from apps.transactions.models import Transaction, TransactionItem, TransactionPayment, SalesReturn, CustomerCreditPayment
from apps.customers.models import Customer
from apps.billing.models import CashRegister
from apps.products.models import InventoryMovement
from .tax_engine import round_decimal


class ReportsService:
    """
    Comprehensive POS Reporting Engine for Universal POS.
    Generates Sales, Payments, Product sales, GST/Tax, Returns, Outstanding Credit,
    and Day Closing reports with multi-store filtering.
    """

    @classmethod
    def _parse_date_range(cls, period: str = "today", start_date: str = None, end_date: str = None):
        now = timezone.now()
        today = now.date()

        if period == "today":
            start_dt = timezone.make_aware(datetime.combine(today, time.min))
            end_dt = timezone.make_aware(datetime.combine(today, time.max))
        elif period == "yesterday":
            yest = today - timezone.timedelta(days=1)
            start_dt = timezone.make_aware(datetime.combine(yest, time.min))
            end_dt = timezone.make_aware(datetime.combine(yest, time.max))
        elif period == "this_week":
            start_of_week = today - timezone.timedelta(days=today.weekday())
            start_dt = timezone.make_aware(datetime.combine(start_of_week, time.min))
            end_dt = timezone.make_aware(datetime.combine(today, time.max))
        elif period == "this_month":
            start_of_month = today.replace(day=1)
            start_dt = timezone.make_aware(datetime.combine(start_of_month, time.min))
            end_dt = timezone.make_aware(datetime.combine(today, time.max))
        elif start_date and end_date:
            try:
                s_d = datetime.strptime(start_date, "%Y-%m-%d").date()
                e_d = datetime.strptime(end_date, "%Y-%m-%d").date()
                start_dt = timezone.make_aware(datetime.combine(s_d, time.min))
                end_dt = timezone.make_aware(datetime.combine(e_d, time.max))
            except Exception:
                start_dt = timezone.make_aware(datetime.combine(today, time.min))
                end_dt = timezone.make_aware(datetime.combine(today, time.max))
        else:
            start_dt = timezone.make_aware(datetime.combine(today, time.min))
            end_dt = timezone.make_aware(datetime.combine(today, time.max))

        return start_dt, end_dt

    @classmethod
    def get_sales_report(
        cls,
        organization,
        store_id: str = None,
        period: str = "today",
        start_date: str = None,
        end_date: str = None,
        payment_method: str = None,
    ) -> dict:
        start_dt, end_dt = cls._parse_date_range(period, start_date, end_date)
        qs = Transaction.objects.filter(
            organization=organization,
            transaction_date__range=(start_dt, end_dt),
        ).select_related("customer", "store")

        if store_id:
            qs = qs.filter(store_id=store_id)
        if payment_method:
            qs = qs.filter(payment_method=payment_method)

        aggregates = qs.aggregate(
            total_sales=Sum("total"),
            total_subtotal=Sum("subtotal"),
            total_discount=Sum("discount"),
            total_tax=Sum("tax"),
            bill_count=Count("id"),
        )

        rows = []
        for tx in qs.order_by("-transaction_date")[:200]:
            rows.append({
                "id": str(tx.id),
                "invoice_number": tx.invoice_number,
                "date": tx.transaction_date.isoformat(),
                "customer": tx.customer.full_name if tx.customer else "Walk-in",
                "customer_phone": tx.customer.phone if tx.customer else "",
                "subtotal": str(tx.subtotal),
                "discount": str(tx.discount),
                "tax": str(tx.tax),
                "total": str(tx.total),
                "payment_method": tx.payment_method,
                "payment_status": tx.payment_status,
                "store": tx.store.name if tx.store else "",
            })

        return {
            "period": period,
            "start_date": start_dt.isoformat(),
            "end_date": end_dt.isoformat(),
            "summary": {
                "total_sales": str(aggregates["total_sales"] or Decimal("0.00")),
                "total_subtotal": str(aggregates["total_subtotal"] or Decimal("0.00")),
                "total_discount": str(aggregates["total_discount"] or Decimal("0.00")),
                "total_tax": str(aggregates["total_tax"] or Decimal("0.00")),
                "bill_count": aggregates["bill_count"] or 0,
                "average_bill_value": str(
                    round_decimal(aggregates["total_sales"] / aggregates["bill_count"])
                    if aggregates["bill_count"]
                    else Decimal("0.00")
                ),
            },
            "transactions": rows,
        }

    @classmethod
    def get_payment_report(
        cls,
        organization,
        store_id: str = None,
        period: str = "today",
        start_date: str = None,
        end_date: str = None,
    ) -> dict:
        start_dt, end_dt = cls._parse_date_range(period, start_date, end_date)
        qs = TransactionPayment.objects.filter(
            organization=organization,
            created_at__range=(start_dt, end_dt),
            status="success",
        )
        if store_id:
            qs = qs.filter(transaction__store_id=store_id)

        by_method = qs.values("payment_method").annotate(
            total_amount=Sum("amount"),
            count=Count("id"),
        ).order_by("-total_amount")

        total_collected = qs.aggregate(t=Sum("amount"))["t"] or Decimal("0.00")

        return {
            "period": period,
            "total_collected": str(total_collected),
            "breakdown": [
                {
                    "method": item["payment_method"],
                    "total": str(item["total_amount"]),
                    "count": item["count"],
                    "percentage": str(round_decimal((item["total_amount"] / total_collected) * 100)) if total_collected else "0",
                }
                for item in by_method
            ],
        }

    @classmethod
    def get_product_sales_report(
        cls,
        organization,
        store_id: str = None,
        period: str = "today",
        start_date: str = None,
        end_date: str = None,
    ) -> dict:
        start_dt, end_dt = cls._parse_date_range(period, start_date, end_date)
        qs = TransactionItem.objects.filter(
            transaction__organization=organization,
            transaction__transaction_date__range=(start_dt, end_dt),
        )
        if store_id:
            qs = qs.filter(transaction__store_id=store_id)

        top_products = qs.values("name", "hsn_code").annotate(
            quantity_sold=Sum("quantity"),
            revenue=Sum("total"),
            discounts_given=Sum("discount"),
        ).order_by("-revenue")[:50]

        return {
            "period": period,
            "products": [
                {
                    "name": p["name"],
                    "hsn_code": p["hsn_code"],
                    "quantity_sold": str(p["quantity_sold"]),
                    "revenue": str(p["revenue"]),
                    "discounts": str(p["discounts_given"]),
                }
                for p in top_products
            ],
        }

    @classmethod
    def get_tax_report(
        cls,
        organization,
        store_id: str = None,
        period: str = "today",
        start_date: str = None,
        end_date: str = None,
    ) -> dict:
        start_dt, end_dt = cls._parse_date_range(period, start_date, end_date)
        qs = TransactionItem.objects.filter(
            transaction__organization=organization,
            transaction__transaction_date__range=(start_dt, end_dt),
        )
        if store_id:
            qs = qs.filter(transaction__store_id=store_id)

        by_rate = qs.values("tax_rate").annotate(
            total_tax=Sum("tax"),
            total_cgst=Sum("cgst_amount"),
            total_sgst=Sum("sgst_amount"),
            total_igst=Sum("igst_amount"),
            total_gross=Sum("total"),
            item_count=Count("id"),
        ).order_by("tax_rate")

        totals = qs.aggregate(
            tax=Sum("tax"),
            cgst=Sum("cgst_amount"),
            sgst=Sum("sgst_amount"),
            igst=Sum("igst_amount"),
            gross=Sum("total"),
        )

        return {
            "period": period,
            "totals": {
                "tax": str(totals["tax"] or Decimal("0.00")),
                "cgst": str(totals["cgst"] or Decimal("0.00")),
                "sgst": str(totals["sgst"] or Decimal("0.00")),
                "igst": str(totals["igst"] or Decimal("0.00")),
                "gross": str(totals["gross"] or Decimal("0.00")),
            },
            "by_tax_rate": [
                {
                    "tax_rate": str(r["tax_rate"]),
                    "total_tax": str(r["total_tax"] or 0),
                    "cgst": str(r["total_cgst"] or 0),
                    "sgst": str(r["total_sgst"] or 0),
                    "igst": str(r["total_igst"] or 0),
                    "gross": str(r["total_gross"] or 0),
                    "items_sold": r["item_count"],
                }
                for r in by_rate
            ],
        }

    @classmethod
    def get_outstanding_credit_report(cls, organization) -> dict:
        debtors = Customer.objects.filter(
            organization=organization,
            outstanding_credit__gt=Decimal("0.00"),
        ).order_by("-outstanding_credit")

        total_outstanding = debtors.aggregate(t=Sum("outstanding_credit"))["t"] or Decimal("0.00")

        return {
            "total_outstanding": str(total_outstanding),
            "customer_count": debtors.count(),
            "customers": [
                {
                    "id": str(c.id),
                    "name": c.full_name,
                    "phone": c.phone,
                    "credit_limit": str(c.credit_limit),
                    "outstanding_credit": str(c.outstanding_credit),
                    "last_purchase_at": c.last_purchase_at.isoformat() if c.last_purchase_at else None,
                }
                for c in debtors
            ],
        }

    @classmethod
    def get_returns_report(cls, organization, store_id: str = None, period: str = "today") -> dict:
        start_dt, end_dt = cls._parse_date_range(period)
        qs = SalesReturn.objects.filter(
            organization=organization,
            created_at__range=(start_dt, end_dt),
        ).select_related("original_transaction", "customer", "store")

        if store_id:
            qs = qs.filter(store_id=store_id)

        total_refunded = qs.aggregate(t=Sum("total_refund_amount"))["t"] or Decimal("0.00")

        return {
            "period": period,
            "total_refunded": str(total_refunded),
            "return_count": qs.count(),
            "returns": [
                {
                    "id": str(r.id),
                    "return_number": r.return_number,
                    "original_invoice": r.original_transaction.invoice_number if r.original_transaction else "-",
                    "customer": r.customer.full_name if r.customer else "Walk-in",
                    "refund_amount": str(r.total_refund_amount),
                    "refund_method": r.refund_method,
                    "created_at": r.created_at.isoformat(),
                    "notes": r.notes,
                }
                for r in qs.order_by("-created_at")
            ],
        }

    @classmethod
    def get_daily_closing_report(cls, organization, store_id: str = None) -> dict:
        qs = CashRegister.objects.filter(organization=organization).select_related("store", "cashier")
        if store_id:
            qs = qs.filter(store_id=store_id)

        registers = []
        for r in qs.order_by("-opened_at")[:30]:
            expected = r.calculate_expected_cash()
            diff = r.actual_cash - expected if r.status == "closed" else Decimal("0.00")
            registers.append({
                "id": str(r.id),
                "store": r.store.name if r.store else "",
                "opened_by": r.opened_by.get_full_name() if r.opened_by else "Cashier",
                "closed_by": r.closed_by.get_full_name() if r.closed_by else None,
                "opened_at": r.opened_at.isoformat(),
                "closed_at": r.closed_at.isoformat() if r.closed_at else None,
                "status": r.status,
                "opening_balance": str(r.opening_balance),
                "total_cash_sales": str(r.total_cash_sales),
                "total_cash_refunds": str(r.total_cash_refunds),
                "expected_cash": str(expected),
                "actual_cash": str(r.actual_cash),
                "difference": str(diff),
                "notes": r.notes,
            })

        return {"registers": registers}
