import re

def normalize_phone(phone: str) -> str:
    """
    Normalizes a phone number to standard format.
    Strips whitespace, hyphens, brackets, and international prefixes (e.g. +91 / 0) for standard 10-digit Indian numbers.
    """
    if not phone:
        return ""
    # Strip any non-digit character except leading +
    cleaned = re.sub(r"[^\d+]", "", str(phone).strip())
    if cleaned.startswith("+91"):
        cleaned = cleaned[3:]
    elif cleaned.startswith("91") and len(cleaned) == 12:
        cleaned = cleaned[2:]
    elif cleaned.startswith("0") and len(cleaned) == 11:
        cleaned = cleaned[1:]
    elif cleaned.startswith("+"):
        cleaned = cleaned.lstrip("+")
    return cleaned
