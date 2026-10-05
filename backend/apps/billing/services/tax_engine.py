from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, List


TWO_PLACES = Decimal("0.01")


def round_decimal(val: Decimal) -> Decimal:
    return Decimal(str(val)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


class TaxEngine:
    """
    Universal Indian GST & Standard Tax Calculation Engine.
    Supports tax-inclusive, tax-exclusive, intra-state (CGST+SGST), inter-state (IGST),
    and non-taxable / exempt businesses.
    """

    @classmethod
    def calculate_item_tax(
        cls,
        unit_price: Decimal,
        quantity: Decimal,
        discount: Decimal = Decimal("0.00"),
        tax_rate: Decimal = Decimal("0.00"),
        is_tax_inclusive: bool = False,
        is_interstate: bool = False,
        gst_enabled: bool = True,
    ) -> Dict[str, Decimal]:
        """
        Calculates line item taxable value, CGST, SGST, IGST, total tax, and line total.
        """
        unit_price = Decimal(str(unit_price))
        quantity = Decimal(str(quantity))
        discount = Decimal(str(discount))
        tax_rate = Decimal(str(tax_rate)) if gst_enabled else Decimal("0.00")

        gross_line = max(Decimal("0.00"), (unit_price * quantity) - discount)

        if not gst_enabled or tax_rate <= Decimal("0.00"):
            taxable_amount = round_decimal(gross_line)
            return {
                "taxable_amount": taxable_amount,
                "tax_rate": Decimal("0.00"),
                "cgst_amount": Decimal("0.00"),
                "sgst_amount": Decimal("0.00"),
                "igst_amount": Decimal("0.00"),
                "total_tax": Decimal("0.00"),
                "line_total": taxable_amount,
            }

        if is_tax_inclusive:
            # gross_line already contains tax: taxable = gross_line / (1 + rate / 100)
            divisor = Decimal("1.00") + (tax_rate / Decimal("100.00"))
            taxable_amount = round_decimal(gross_line / divisor)
            total_tax = round_decimal(gross_line - taxable_amount)
            line_total = round_decimal(gross_line)
        else:
            # tax is added on top of line subtotal
            taxable_amount = round_decimal(gross_line)
            total_tax = round_decimal(taxable_amount * (tax_rate / Decimal("100.00")))
            line_total = round_decimal(taxable_amount + total_tax)

        if is_interstate:
            igst_amount = total_tax
            cgst_amount = Decimal("0.00")
            sgst_amount = Decimal("0.00")
        else:
            half_rate = round_decimal(total_tax / Decimal("2.00"))
            cgst_amount = half_rate
            sgst_amount = round_decimal(total_tax - half_rate)
            igst_amount = Decimal("0.00")

        return {
            "taxable_amount": taxable_amount,
            "tax_rate": tax_rate,
            "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount,
            "igst_amount": igst_amount,
            "total_tax": total_tax,
            "line_total": line_total,
        }

    @classmethod
    def aggregate_tax_breakup(cls, item_calculations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Aggregates calculated item taxes into a summary breakup (by tax rate and totals).
        """
        total_taxable = Decimal("0.00")
        total_cgst = Decimal("0.00")
        total_sgst = Decimal("0.00")
        total_igst = Decimal("0.00")
        total_tax = Decimal("0.00")
        rate_breakup: Dict[str, Dict[str, Decimal]] = {}

        for item in item_calculations:
            rate_key = f"{item['tax_rate']}%"
            taxable = item["taxable_amount"]
            cgst = item["cgst_amount"]
            sgst = item["sgst_amount"]
            igst = item["igst_amount"]
            item_tax = item["total_tax"]

            total_taxable += taxable
            total_cgst += cgst
            total_sgst += sgst
            total_igst += igst
            total_tax += item_tax

            if rate_key not in rate_breakup:
                rate_breakup[rate_key] = {
                    "rate": item["tax_rate"],
                    "taxable_amount": Decimal("0.00"),
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "total_tax": Decimal("0.00"),
                }
            rate_breakup[rate_key]["taxable_amount"] += taxable
            rate_breakup[rate_key]["cgst_amount"] += cgst
            rate_breakup[rate_key]["sgst_amount"] += sgst
            rate_breakup[rate_key]["igst_amount"] += igst
            rate_breakup[rate_key]["total_tax"] += item_tax

        return {
            "total_taxable": str(round_decimal(total_taxable)),
            "total_cgst": str(round_decimal(total_cgst)),
            "total_sgst": str(round_decimal(total_sgst)),
            "total_igst": str(round_decimal(total_igst)),
            "total_tax": str(round_decimal(total_tax)),
            "total_tax_decimal": round_decimal(total_tax),
            "rates": [
                {
                    "rate": str(v["rate"]),
                    "taxable_amount": str(round_decimal(v["taxable_amount"])),
                    "cgst_amount": str(round_decimal(v["cgst_amount"])),
                    "sgst_amount": str(round_decimal(v["sgst_amount"])),
                    "igst_amount": str(round_decimal(v["igst_amount"])),
                    "total_tax": str(round_decimal(v["total_tax"])),
                }
                for v in rate_breakup.values()
            ],
        }
