import csv
import io
import logging
from decimal import Decimal
from typing import Any, Dict, List
from django.utils import timezone

from apps.transactions.models import Transaction
from apps.customers.models import Customer, CustomerTimeline
from apps.billing.models import CashRegister
from .alert_service import OperationalAlertService

logger = logging.getLogger(__name__)


class FinancialReconciliationService:
    """
    Read-only Financial Reconciliation Engine:
    Validates mathematical and transactional agreement across:
    1. Invoices vs Line Items (totals, taxes, discounts)
    2. Invoices vs Applied Payments (multi-method allocations, cash change deduction)
    3. Customer Outstanding Balances vs Khata Ledger
    4. Cash Register Sessions (opening, sales, change returned, deposits, withdrawals)
    """

    @classmethod
    def run_reconciliation(
        cls,
        organization,
        store=None,
        start_date=None,
        end_date=None,
        emit_alerts: bool = True,
    ) -> Dict[str, Any]:
        discrepancies: List[Dict[str, Any]] = []

        # ---------------------------------------------------------------------
        # 1. Invoices & Transactions vs Line Items
        # ---------------------------------------------------------------------
        tx_query = Transaction.objects.filter(
            organization=organization,
            status="completed",
        ).select_related("invoice", "customer", "store").prefetch_related("items", "payments")

        if store:
            tx_query = tx_query.filter(store=store)
        if start_date:
            tx_query = tx_query.filter(transaction_date__date__gte=start_date)
        if end_date:
            tx_query = tx_query.filter(transaction_date__date__lte=end_date)

        total_tx_checked = 0
        total_volume_checked = Decimal("0.00")

        for tx in tx_query:
            total_tx_checked += 1
            total_volume_checked += tx.total

            # Item Total Calculation
            items = list(tx.items.all())
            items_sum = Decimal("0.00")
            for item in items:
                line_sub = (item.unit_price * item.quantity) - (item.discount or Decimal("0.00")) + (item.tax or Decimal("0.00"))
                items_sum += line_sub

            # Round to 2 decimal places for comparison
            items_rounded = round(items_sum, 2)
            tx_total_rounded = round(tx.total, 2)

            if abs(items_rounded - tx_total_rounded) > Decimal("0.02"):
                disc = {
                    "record_type": "transaction",
                    "record_id": str(tx.id),
                    "invoice_number": tx.invoice_number,
                    "severity": "CRITICAL",
                    "check_type": "LINE_ITEMS_TOTAL_MISMATCH",
                    "title": f"Invoice #{tx.invoice_number} item total mismatch",
                    "description": f"Sum of line items (₹{items_rounded}) differs from transaction total (₹{tx_total_rounded}) by ₹{items_rounded - tx_total_rounded}.",
                    "expected_value": str(tx_total_rounded),
                    "actual_value": str(items_rounded),
                    "suggested_action": "Audit transaction line discounts and tax calculations. Do not modify historical record.",
                }
                discrepancies.append(disc)
                if emit_alerts:
                    OperationalAlertService.emit_alert(
                        organization=organization,
                        alert_type="FINANCIAL_DISCREPANCY",
                        severity="CRITICAL",
                        title=disc["title"],
                        description=disc["description"],
                        entity_type="transaction",
                        entity_id=str(tx.id),
                        recommended_action=disc["suggested_action"],
                    )

            # Invoice record agreement
            if hasattr(tx, "invoice") and tx.invoice:
                inv = tx.invoice
                if inv.invoice_number != tx.invoice_number:
                    discrepancies.append({
                        "record_type": "invoice",
                        "record_id": str(inv.id),
                        "invoice_number": tx.invoice_number,
                        "severity": "CRITICAL",
                        "check_type": "INVOICE_NUMBER_MISMATCH",
                        "title": f"Invoice number mismatch on tx {tx.id}",
                        "description": f"Invoice record has #{inv.invoice_number} while Transaction has #{tx.invoice_number}.",
                        "expected_value": tx.invoice_number,
                        "actual_value": inv.invoice_number,
                        "suggested_action": "Verify sequence counter integrity and invoice link.",
                    })

            # Applied Payment Allocations Check
            successful_payments = [p for p in tx.payments.all() if p.status == "success"]
            payments_sum = sum((p.amount for p in successful_payments), Decimal("0.00"))
            expected_paid = tx.amount_paid or Decimal("0.00")

            if abs(round(payments_sum, 2) - round(expected_paid, 2)) > Decimal("0.02"):
                disc = {
                    "record_type": "transaction",
                    "record_id": str(tx.id),
                    "invoice_number": tx.invoice_number,
                    "severity": "CRITICAL",
                    "check_type": "PAYMENT_ALLOCATION_MISMATCH",
                    "title": f"Invoice #{tx.invoice_number} payment allocations do not match amount paid",
                    "description": f"Sum of applied payments (₹{payments_sum}) does not equal recorded amount paid (₹{expected_paid}).",
                    "expected_value": str(expected_paid),
                    "actual_value": str(payments_sum),
                    "suggested_action": "Inspect payment allocations for missing gateway references or change deductions.",
                }
                discrepancies.append(disc)
                if emit_alerts:
                    OperationalAlertService.emit_alert(
                        organization=organization,
                        alert_type="FINANCIAL_DISCREPANCY",
                        severity="CRITICAL",
                        title=disc["title"],
                        description=disc["description"],
                        entity_type="transaction",
                        entity_id=str(tx.id),
                        recommended_action=disc["suggested_action"],
                    )

        # ---------------------------------------------------------------------
        # 2. Customer Khata & Credit Ledger Check
        # ---------------------------------------------------------------------
        cust_query = Customer.objects.filter(
            organization=organization,
            is_active=True,
        ).exclude(is_walk_in=True)

        for cust in cust_query:
            # Calculate credit movements from timeline
            credit_timeline_sum = CustomerTimeline.objects.filter(
                organization=organization,
                customer=cust,
                event_type="credit_sale",
            )
            calc_credit = Decimal("0.00")
            for t in credit_timeline_sum:
                amt_str = (t.metadata or {}).get("credit_amount")
                if amt_str:
                    try:
                        calc_credit += Decimal(str(amt_str))
                    except Exception:
                        pass

            # Repayments
            repayment_timeline = CustomerTimeline.objects.filter(
                organization=organization,
                customer=cust,
                event_type__in=["repayment", "credit_payment"],
            )
            calc_repaid = Decimal("0.00")
            for t in repayment_timeline:
                amt_str = (t.metadata or {}).get("repayment_amount") or (t.metadata or {}).get("amount")
                if amt_str:
                    try:
                        calc_repaid += Decimal(str(amt_str))
                    except Exception:
                        pass

            # Net calculated credit
            expected_outstanding = max(Decimal("0.00"), calc_credit - calc_repaid)
            actual_outstanding = cust.outstanding_credit or Decimal("0.00")

            if abs(round(expected_outstanding, 2) - round(actual_outstanding, 2)) > Decimal("1.00"):
                discrepancies.append({
                    "record_type": "customer",
                    "record_id": str(cust.id),
                    "customer_name": f"{cust.first_name} {cust.last_name}".strip(),
                    "customer_phone": cust.phone,
                    "severity": "WARNING",
                    "check_type": "CUSTOMER_LEDGER_VARIANCE",
                    "title": f"Customer {cust.phone} credit ledger variance",
                    "description": f"Ledger calculated outstanding is ₹{expected_outstanding}, but customer record shows ₹{actual_outstanding}.",
                    "expected_value": str(expected_outstanding),
                    "actual_value": str(actual_outstanding),
                    "suggested_action": "Audit customer payment history and credit timeline entries.",
                })

        # ---------------------------------------------------------------------
        # 3. Cash Register Sessions
        # ---------------------------------------------------------------------
        register_query = CashRegister.objects.filter(organization=organization)
        if store:
            register_query = register_query.filter(store=store)

        for reg in register_query:
            calc_expected = reg.calculate_expected_cash()
            if reg.status == "closed":
                expected_stored = reg.expected_cash or Decimal("0.00")
                if abs(calc_expected - expected_stored) > Decimal("0.02"):
                    discrepancies.append({
                        "record_type": "cash_register",
                        "record_id": str(reg.id),
                        "cashier": reg.cashier.email if reg.cashier else "Unknown",
                        "severity": "WARNING",
                        "check_type": "REGISTER_EXPECTED_CASH_DRIFT",
                        "title": f"Register session {reg.id} expected cash drift",
                        "description": f"Calculated expected cash (₹{calc_expected}) differs from recorded expected cash (₹{expected_stored}).",
                        "expected_value": str(calc_expected),
                        "actual_value": str(expected_stored),
                        "suggested_action": "Inspect cash movement logs for this register session.",
                    })

                # Check large cash difference on closing
                diff = reg.difference or Decimal("0.00")
                if abs(diff) > Decimal("100.00"):
                    discrepancies.append({
                        "record_type": "cash_register",
                        "record_id": str(reg.id),
                        "cashier": reg.cashier.email if reg.cashier else "Unknown",
                        "severity": "WARNING" if abs(diff) < Decimal("500.00") else "CRITICAL",
                        "check_type": "REGISTER_CASH_SHORTAGE_OR_EXCESS",
                        "title": f"Register session closing cash variance: {'Shortage' if diff < 0 else 'Excess'} of ₹{abs(diff)}",
                        "description": f"Actual cash counted was ₹{reg.actual_cash} against expected ₹{reg.expected_cash}. Notes: {reg.notes}",
                        "expected_value": str(reg.expected_cash),
                        "actual_value": str(reg.actual_cash),
                        "suggested_action": "Manager review required for cashier cash reconciliation.",
                    })

        return {
            "status": "clean" if len(discrepancies) == 0 else "discrepancies_detected",
            "executed_at": timezone.now().isoformat(),
            "total_transactions_checked": total_tx_checked,
            "total_volume_checked": float(total_volume_checked),
            "discrepancies_count": len(discrepancies),
            "critical_count": sum(1 for d in discrepancies if d.get("severity") == "CRITICAL"),
            "warning_count": sum(1 for d in discrepancies if d.get("severity") == "WARNING"),
            "discrepancies": discrepancies,
        }

    @classmethod
    def export_csv(cls, reconciliation_result: Dict[str, Any]) -> str:
        """
        Exports reconciliation discrepancies to CSV format.
        """
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Check Type",
            "Severity",
            "Record Type",
            "Record ID",
            "Title",
            "Expected Value",
            "Actual Value",
            "Description",
            "Suggested Action",
        ])

        for d in reconciliation_result.get("discrepancies", []):
            writer.writerow([
                d.get("check_type", ""),
                d.get("severity", ""),
                d.get("record_type", ""),
                d.get("record_id", ""),
                d.get("title", ""),
                d.get("expected_value", ""),
                d.get("actual_value", ""),
                d.get("description", ""),
                d.get("suggested_action", ""),
            ])

        return output.getvalue()
