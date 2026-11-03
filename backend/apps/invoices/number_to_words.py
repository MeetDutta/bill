"""
Authoritative Indian Currency Number-to-Words Converter.
Converts amounts to Indian numbering system: Crores, Lakhs, Thousands, Hundreds, and Paise.
Matches Indian GST invoice standards (e.g., 'Rupees One Thousand Nine Hundred Thirty-Nine and Sixty Paise Only').
"""

from decimal import Decimal, InvalidOperation
from typing import Union


ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]

TENS = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
]


def _two_digits_to_words(n: int) -> str:
    if n <= 0:
        return ""
    if n < 20:
        return ONES[n]
    tens_val = TENS[n // 10]
    ones_val = ONES[n % 10]
    return f"{tens_val}-{ones_val}" if ones_val else tens_val


def _three_digits_to_words(n: int) -> str:
    hundreds = n // 100
    rem = n % 100
    parts = []
    if hundreds:
        parts.append(f"{ONES[hundreds]} Hundred")
    if rem:
        parts.append(_two_digits_to_words(rem))
    return " ".join(parts)


def _integer_to_words_recursive(n: int) -> str:
    if n == 0:
        return ""
    parts = []
    crores = n // 10000000
    rem = n % 10000000
    lakhs = rem // 100000
    rem = rem % 100000
    thousands = rem // 1000
    rem = rem % 1000

    if crores:
        parts.append(f"{_integer_to_words_recursive(crores)} Crore")
    if lakhs:
        parts.append(f"{_two_digits_to_words(lakhs)} Lakh")
    if thousands:
        parts.append(f"{_two_digits_to_words(thousands)} Thousand")
    if rem:
        parts.append(_three_digits_to_words(rem))

    return " ".join(p for p in parts if p)


def indian_number_to_words(amount: Union[Decimal, float, int, str]) -> str:
    """
    Converts a monetary amount into authoritative Indian English currency words.
    Example:
        1939.60 -> 'Rupees One Thousand Nine Hundred Thirty-Nine and Sixty Paise Only'
        1500.00 -> 'Rupees One Thousand Five Hundred Only'
        0.50    -> 'Fifty Paise Only'
        0.00    -> 'Zero Rupees Only'
    """
    if amount is None or str(amount).strip() == "":
        return "Zero Rupees Only"

    try:
        dec = Decimal(str(amount)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return "Zero Rupees Only"

    is_negative = dec < 0
    dec = abs(dec)

    rupees = int(dec)
    paise = int((dec - rupees) * 100)

    if rupees == 0 and paise == 0:
        return "Zero Rupees Only"

    rupee_words = _integer_to_words_recursive(rupees)

    prefix = "Minus " if is_negative else ""
    if rupee_words:
        result = f"{prefix}Rupees {rupee_words}"
    else:
        result = ""

    if paise > 0:
        paise_str = f"{_two_digits_to_words(paise)} Paise"
        if result:
            result = f"{result} and {paise_str} Only"
        else:
            result = f"{prefix}{paise_str} Only"
    else:
        result = f"{result} Only"

    return result

