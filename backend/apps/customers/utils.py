import re


def normalize_phone(phone: str) -> str:
    """
    Normalizes a phone number to a canonical digit representation.
    Strips whitespace, hyphens, brackets, and common Indian prefixes (+91 / 0091 / 91 / leading 0).
    Preserves legacy synthetic walkin-* identifiers only if explicitly stored on old rows.
    """
    if not phone:
        return ""
    raw = str(phone).strip()
    if raw.lower().startswith("walkin-"):
        return raw.lower()
    cleaned = re.sub(r"[^\d+]", "", raw)
    if cleaned.startswith("+91") and len(cleaned) >= 13:
        cleaned = cleaned[3:]
    elif cleaned.startswith("+91"):
        cleaned = cleaned[3:]
    elif cleaned.startswith("0091") and len(cleaned) >= 14:
        cleaned = cleaned[4:]
    elif cleaned.startswith("91") and len(cleaned) == 12:
        cleaned = cleaned[2:]
    elif cleaned.startswith("0") and len(cleaned) == 11:
        cleaned = cleaned[1:]
    elif cleaned.startswith("+"):
        cleaned = cleaned.lstrip("+")
    return cleaned


def validate_mobile_number(phone: str) -> tuple[bool, str, str]:
    """
    Normalizes and validates a customer mobile number.
    Returns (is_valid, normalized_phone, error_message).
    """
    normalized = normalize_phone(phone)
    if not normalized or normalized.startswith("walkin-"):
        return False, "", "Please enter a valid mobile number."
    if not normalized.isdigit():
        return False, "", "Mobile number must contain digits only."
    if len(normalized) < 10 or len(normalized) > 15:
        return False, "", "Please enter a valid 10-digit mobile number."
    if len(normalized) == 10 and normalized[0] not in "6789":
        return False, "", "Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9."
    if len(set(normalized)) == 1 and normalized[0] == "0":
        return False, "", "Please enter a valid mobile number."
    return True, normalized, ""


def build_customer_address(
    address_line1: str = "",
    city: str = "",
    state: str = "",
    postal_code: str = "",
) -> str:
    """Formats a customer's independent address parts into a clean single display string."""
    parts = [
        str(address_line1 or "").strip(),
        str(city or "").strip(),
        str(state or "").strip(),
    ]
    base = ", ".join(p for p in parts if p)
    pin = str(postal_code or "").strip()
    if pin:
        return f"{base} - {pin}" if base else pin
    return base

