from decimal import Decimal
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.billing.models import CashRegister
from .tax_engine import round_decimal


class RegisterService:
    """
    Cash Register and Day Close Service.
    Handles opening balance, day-long cash tracking, end-of-day reconciliation,
    and cash discrepancy audits.
    """

    @classmethod
    def get_active_register(cls, organization, store, user = None) -> CashRegister | None:
        qs = CashRegister.objects.filter(
            organization=organization,
            store=store,
            status="open",
        )
        if user and getattr(user, "is_authenticated", False):
            # Cashier-specific register if opened by this cashier, or store-level
            user_reg = qs.filter(cashier=user).first()
            if user_reg:
                return user_reg
        return qs.first()

    @classmethod
    def open_register(
        cls,
        organization,
        store,
        user,
        opening_balance: Decimal,
        notes: str = "",
    ) -> dict:
        opening_balance = Decimal(str(opening_balance or 0))
        if opening_balance < Decimal("0.00"):
            raise ValidationError("Opening balance cannot be negative.")

        existing = cls.get_active_register(organization, store, user)
        if existing:
            raise ValidationError(
                f"A register is already open for this store (Opened at {existing.opened_at.strftime('%Y-%m-%d %H:%M')}). "
                "Close the current register before opening a new one."
            )

        reg = CashRegister.objects.create(
            organization=organization,
            store=store,
            cashier=user if getattr(user, "is_authenticated", False) else None,
            opening_cash=opening_balance,
            notes=notes,
            status="open",
        )

        return cls._format_register(reg)

    @classmethod
    def add_cash_movement(
        cls,
        organization,
        store,
        user,
        amount: Decimal,
        movement_type: str,  # "add" or "withdraw"
        notes: str = "",
    ) -> dict:
        reg = cls.get_active_register(organization, store, user)
        if not reg:
            raise ValidationError("No open cash register found for this store.")

        amount = Decimal(str(amount))
        if amount <= Decimal("0.00"):
            raise ValidationError("Amount must be greater than zero.")

        if movement_type == "add":
            reg.cash_added += amount
        elif movement_type == "withdraw":
            reg.cash_withdrawn += amount
        else:
            raise ValidationError("Invalid cash movement type. Must be 'add' or 'withdraw'.")

        reg.save(update_fields=["cash_deposits", "cash_withdrawals"])
        return cls._format_register(reg)

    @classmethod
    def close_register(
        cls,
        organization,
        store,
        user,
        actual_cash: Decimal,
        notes: str = "",
    ) -> dict:
        reg = cls.get_active_register(organization, store, user)
        if not reg:
            raise ValidationError("No open register to close.")

        actual_cash = Decimal(str(actual_cash or 0))
        reg.close_register(
            actual_cash=actual_cash,
            closed_by_user=user if getattr(user, "is_authenticated", False) else None,
            notes=notes,
        )

        return cls._format_register(reg)

    @classmethod
    def _format_register(cls, reg: CashRegister) -> dict:
        expected = reg.calculate_expected_cash()
        diff = reg.actual_cash - expected if reg.status == "closed" else Decimal("0.00")
        return {
            "id": str(reg.id),
            "store_id": str(reg.store.id) if reg.store else None,
            "store_name": reg.store.name if reg.store else "",
            "opened_by": reg.opened_by.get_full_name() if reg.opened_by else "Cashier",
            "closed_by": reg.closed_by.get_full_name() if reg.closed_by else None,
            "opened_at": reg.opened_at.isoformat(),
            "closed_at": reg.closed_at.isoformat() if reg.closed_at else None,
            "status": reg.status,
            "opening_balance": str(reg.opening_balance),
            "total_cash_sales": str(reg.total_cash_sales),
            "total_cash_refunds": str(reg.total_cash_refunds),
            "cash_added": str(reg.cash_added),
            "cash_withdrawn": str(reg.cash_withdrawn),
            "expected_cash": str(expected),
            "actual_cash": str(reg.actual_cash),
            "difference": str(diff),
            "notes": reg.notes,
        }
