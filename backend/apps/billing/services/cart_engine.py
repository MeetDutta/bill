from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Dict, Any, List
from rest_framework.exceptions import ValidationError
from .tax_engine import TaxEngine, round_decimal


class CartEngine:
    """
    Common POS Cart Calculation Engine.
    Handles precise item totals, item discounts, order-level discounts,
    coupon application, tax calculations, and round-offs.
    All calculations use Decimal arithmetic.
    """

    @staticmethod
    def parse_decimal(
        value: Any,
        field_name: str,
        min_value: Decimal = Decimal("0.00"),
        allow_zero: bool = True,
        item_label: str = "",
    ) -> Decimal:
        target = f" for '{item_label}'" if item_label else ""
        try:
            dec = Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            raise ValidationError(f"Invalid {field_name}{target}: '{value}'.")

        if not dec.is_finite():
            raise ValidationError(f"Invalid {field_name}{target}: must be a finite number.")

        if allow_zero:
            if dec < min_value:
                raise ValidationError(f"Invalid {field_name.replace('_', ' ')}{target}: cannot be less than {min_value}.")
        else:
            if dec <= min_value:
                raise ValidationError(f"Invalid {field_name.replace('_', ' ')}{target}: must be greater than {min_value}.")
        return dec

    @classmethod
    def calculate_cart(
        cls,
        items: List[Dict[str, Any]],
        overall_discount_type: str = "fixed",  # "percentage" or "fixed"
        overall_discount_value: Decimal = Decimal("0.00"),
        coupon_discount: Decimal = Decimal("0.00"),
        gst_enabled: bool = True,
        is_tax_inclusive: bool = False,
        is_interstate: bool = False,
    ) -> Dict[str, Any]:
        overall_discount_value = cls.parse_decimal(
            overall_discount_value if overall_discount_value not in (None, "") else Decimal("0.00"),
            "overall_discount_value",
        )
        coupon_discount = cls.parse_decimal(
            coupon_discount if coupon_discount not in (None, "") else Decimal("0.00"),
            "coupon_discount",
        )

        calculated_items = []
        raw_subtotal = Decimal("0.00")
        total_item_discount = Decimal("0.00")

        # Step 1: Compute item line subtotal and line item discounts
        for item in items:
            label = str(item.get("name") or item.get("sku") or item.get("product_id") or "")
            raw_price = item.get("unit_price")
            unit_price = (
                cls.parse_decimal(raw_price, "unit_price", item_label=label)
                if raw_price is not None and str(raw_price).strip() != ""
                else Decimal("0.00")
            )
            raw_qty = item.get("quantity")
            quantity = (
                cls.parse_decimal(raw_qty, "quantity", min_value=Decimal("0.00"), allow_zero=False, item_label=label)
                if raw_qty is not None and str(raw_qty).strip() != ""
                else Decimal("1.00")
            )
            line_base = unit_price * quantity
            raw_subtotal += line_base

            # Item discount: can be fixed or percentage
            disc_type = item.get("discount_type", "fixed")
            raw_disc = item.get("discount")
            disc_val = (
                cls.parse_decimal(raw_disc, "discount", item_label=label)
                if raw_disc is not None and str(raw_disc).strip() != ""
                else Decimal("0.00")
            )
            if disc_type == "percentage":
                item_discount = round_decimal(line_base * (disc_val / Decimal("100.00")))
            else:
                item_discount = round_decimal(disc_val)
            item_discount = min(item_discount, line_base)
            total_item_discount += item_discount

            raw_tax_rate = item.get("tax_rate")
            tax_rate = (
                cls.parse_decimal(raw_tax_rate, "tax_rate", item_label=label)
                if raw_tax_rate is not None and str(raw_tax_rate).strip() != ""
                else Decimal("0.00")
            )
            hsn_code = str(item.get("hsn_code") or "")

            item_tax_calc = TaxEngine.calculate_item_tax(
                unit_price=unit_price,
                quantity=quantity,
                discount=item_discount,
                tax_rate=tax_rate,
                is_tax_inclusive=is_tax_inclusive,
                is_interstate=is_interstate,
                gst_enabled=gst_enabled,
            )

            calculated_items.append({
                **item,
                "unit_price": round_decimal(unit_price),
                "quantity": round_decimal(quantity),
                "line_subtotal": round_decimal(line_base),
                "discount": item_discount,
                "tax_rate": tax_rate,
                "hsn_code": hsn_code,
                "taxable_amount": item_tax_calc["taxable_amount"],
                "cgst_amount": item_tax_calc["cgst_amount"],
                "sgst_amount": item_tax_calc["sgst_amount"],
                "igst_amount": item_tax_calc["igst_amount"],
                "tax": item_tax_calc["total_tax"],
                "total_tax": item_tax_calc["total_tax"],
                "total": item_tax_calc["line_total"],
            })

        # Step 2: Compute overall order discount
        subtotal_after_item_disc = max(Decimal("0.00"), raw_subtotal - total_item_discount)
        if overall_discount_type == "percentage":
            order_discount = round_decimal(subtotal_after_item_disc * (overall_discount_value / Decimal("100.00")))
        else:
            order_discount = round_decimal(overall_discount_value)
        order_discount = min(order_discount, subtotal_after_item_disc)

        total_discount = total_item_discount + order_discount + coupon_discount

        # Step 3: Tax aggregation
        tax_summary = TaxEngine.aggregate_tax_breakup(calculated_items)
        total_tax = tax_summary.pop("total_tax_decimal", Decimal(str(tax_summary["total_tax"])))

        # Step 4: Grand total and Round-off
        if is_tax_inclusive:
            # Grand total without additional tax, minus overall discounts
            pre_round = max(Decimal("0.00"), raw_subtotal - total_discount)
        else:
            pre_round = max(Decimal("0.00"), raw_subtotal - total_discount + total_tax)

        rounded_total = pre_round.quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(Decimal("0.01"))
        round_off = round_decimal(rounded_total - pre_round)

        return {
            "items": calculated_items,
            "raw_subtotal": round_decimal(raw_subtotal),
            "subtotal": round_decimal(raw_subtotal),
            "item_discount": round_decimal(total_item_discount),
            "order_discount": round_decimal(order_discount),
            "coupon_discount": round_decimal(coupon_discount),
            "total_discount": round_decimal(total_discount),
            "taxable_amount": tax_summary["total_taxable"],
            "cgst": tax_summary["total_cgst"],
            "sgst": tax_summary["total_sgst"],
            "igst": tax_summary["total_igst"],
            "tax": total_tax,
            "tax_breakup": tax_summary,
            "pre_round_total": round_decimal(pre_round),
            "round_off": round_off,
            "grand_total": rounded_total,
        }
