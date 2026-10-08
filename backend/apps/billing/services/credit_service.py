from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.billing.models import CashRegister
from apps.customers.models import Customer, CustomerTimeline
from apps.transactions.models import Transaction, CustomerCreditPayment
from .tax_engine import round_decimal


class CreditService:
    """
    Udhaar / Customer Credit & Ledger Settlement Service.
    Tracks credit lines, customer balances, partial collections, and invoice settlement.
    """

    @classmethod
    def record_payment(
        cls,
        organization,
        customer_id: str,
        amount: Decimal,
        payment_method: str = "cash",
        reference: str = "",
        notes: str = "",
        user = None,
        transaction_id: str = None,
        store = None,
    ) -> dict:
        amount = Decimal(str(amount))
        if amount <= Decimal("0.00"):
            raise ValidationError("Payment amount must be greater than zero.")

        with transaction.atomic():
            try:
                customer = Customer.objects.select_for_update().get(id=customer_id, organization=organization)
            except Customer.DoesNotExist:
                raise ValidationError("Customer not found.")

            if customer.outstanding_credit <= Decimal("0.00"):
                raise ValidationError(f"Customer {customer.full_name} has no outstanding balance.")

            specific_tx = None
            if transaction_id:
                specific_tx = Transaction.objects.select_for_update().filter(
                    id=transaction_id,
                    organization=organization,
                    customer=customer,
                ).first()

            credit_payment = CustomerCreditPayment.objects.create(
                organization=organization,
                customer=customer,
                transaction=specific_tx,
                received_by=user if getattr(user, "is_authenticated", False) else None,
                amount=amount,
                payment_method=payment_method,
                reference=reference,
                notes=notes,
            )

            # Reduce customer outstanding credit
            customer.outstanding_credit = max(Decimal("0.00"), customer.outstanding_credit - amount)
            customer.save(update_fields=["outstanding_credit"])

            # Settle invoices: if specific transaction given, settle it; otherwise FIFO settle with row lock
            remaining_to_settle = amount
            tx_to_settle = [specific_tx] if specific_tx else list(
                Transaction.objects.select_for_update().filter(
                    organization=organization,
                    customer=customer,
                    outstanding_amount__gt=Decimal("0.00"),
                ).order_by("transaction_date")
            )

            for tx in tx_to_settle:
                if not tx or remaining_to_settle <= Decimal("0.00"):
                    break
                allocation = min(tx.outstanding_amount, remaining_to_settle)
                tx.outstanding_amount -= allocation
                tx.amount_paid += allocation
                remaining_to_settle -= allocation

                if tx.outstanding_amount == Decimal("0.00"):
                    tx.payment_status = "paid"
                else:
                    tx.payment_status = "partial"
                tx.save(update_fields=["outstanding_amount", "amount_paid", "payment_status"])

            # Timeline event
            CustomerTimeline.objects.create(
                organization=organization,
                customer=customer,
                event_type="credit_payment",
                reference_id=str(credit_payment.id),
                metadata={
                    "amount": str(amount),
                    "method": payment_method,
                    "remaining_outstanding": str(customer.outstanding_credit),
                },
            )

            # If cash received and register open
            if payment_method == "cash" and store:
                active_register = CashRegister.objects.filter(
                    organization=organization,
                    store=store,
                    status="open",
                ).first()
                if active_register:
                    active_register.record_sale(amount)

        return {
            "id": str(credit_payment.id),
            "customer_id": str(customer.id),
            "customer_name": customer.full_name,
            "amount_paid": str(credit_payment.amount),
            "payment_method": credit_payment.payment_method,
            "reference": credit_payment.reference,
            "remaining_outstanding": str(customer.outstanding_credit),
            "created_at": credit_payment.created_at.isoformat(),
        }

    @classmethod
    def get_customer_ledger(cls, organization, customer_id: str) -> dict:
        try:
            customer = Customer.objects.get(id=customer_id, organization=organization)
        except Customer.DoesNotExist:
            raise ValidationError("Customer not found.")

        # Invoices with credit
        invoices = Transaction.objects.filter(
            organization=organization,
            customer=customer,
        ).order_by("-transaction_date")[:50]

        payments = CustomerCreditPayment.objects.filter(
            organization=organization,
            customer=customer,
        ).order_by("-created_at")[:50]

        return {
            "customer": {
                "id": str(customer.id),
                "name": customer.full_name,
                "phone": customer.phone,
                "credit_limit": str(customer.credit_limit),
                "outstanding_credit": str(customer.outstanding_credit),
                "total_spend": str(customer.total_spend),
                "total_purchases": customer.total_purchases,
            },
            "unpaid_invoices": [
                {
                    "id": str(tx.id),
                    "invoice_number": tx.invoice_number,
                    "date": tx.transaction_date.isoformat(),
                    "total": str(tx.total),
                    "amount_paid": str(tx.amount_paid),
                    "outstanding_amount": str(tx.outstanding_amount),
                    "due_date": tx.due_date.isoformat() if tx.due_date else None,
                    "status": tx.payment_status,
                }
                for tx in invoices
                if tx.outstanding_amount > Decimal("0.00")
            ],
            "recent_payments": [
                {
                    "id": str(p.id),
                    "amount": str(p.amount),
                    "method": p.payment_method,
                    "reference": p.reference,
                    "date": p.created_at.isoformat(),
                    "notes": p.notes,
                }
                for p in payments
            ],
        }
