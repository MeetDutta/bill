"""
GST Utilities for Indian Invoicing.
Provides state codes, Place of Supply resolution, and GSTIN parsing.
"""

# Authoritative Indian GST State Codes (2-digit code: State / UT Name)
GST_STATE_CODES = {
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu",
    "27": "Maharashtra",
    "28": "Andhra Pradesh",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman & Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh (New)",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "Centre Jurisdiction",
}

# Reverse lookup: Normalized State Name -> Code
STATE_NAME_TO_CODE = {}
for code, name in GST_STATE_CODES.items():
    clean_name = name.lower().replace("&", "and").replace("-", " ")
    STATE_NAME_TO_CODE[clean_name] = code
    # Also index without suffixes or brackets
    base_name = name.split("(")[0].strip().lower().replace("&", "and")
    STATE_NAME_TO_CODE[base_name] = code


def resolve_state_code(state_name: str, gstin: str = "") -> str:
    """
    Resolves 2-digit GST state code from GSTIN prefix or state name.
    """
    gstin_clean = (gstin or "").strip()
    if len(gstin_clean) >= 2 and gstin_clean[:2].isdigit() and gstin_clean[:2] in GST_STATE_CODES:
        return gstin_clean[:2]

    if not state_name:
        return ""

    clean_state = state_name.strip().lower().replace("&", "and").replace("-", " ")
    if clean_state in STATE_NAME_TO_CODE:
        return STATE_NAME_TO_CODE[clean_state]

    for key, code in STATE_NAME_TO_CODE.items():
        if key in clean_state or clean_state in key:
            return code

    return ""


def get_place_of_supply(state_name: str, gstin: str = "") -> str:
    """
    Returns Place of Supply string formatted like 'Maharashtra (27)'.
    """
    code = resolve_state_code(state_name, gstin)
    resolved_state = state_name.strip() if state_name else ""
    if code and code in GST_STATE_CODES:
        resolved_state = GST_STATE_CODES[code].split("(")[0].strip()

    if resolved_state and code:
        return f"{resolved_state} ({code})"
    elif resolved_state:
        return resolved_state
    elif code:
        return f"State Code {code}"
    return "Local"

