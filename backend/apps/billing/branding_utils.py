from apps.invoices.gst_utils import resolve_state_code


def build_branding_snapshot(config, organization, store=None):
    """
    Builds a frozen snapshot of business branding, identity, contact info, bank details,
    and invoice display toggles for immutable historical invoice records.
    """
    if not organization and config:
        organization = config.organization

    seller_name = (
        getattr(organization, "name", "")
        or getattr(config, "trade_name", "")
        or "BillMeet Store"
    )
    seller_legal = getattr(organization, "legal_name", "") or seller_name
    seller_gstin = getattr(organization, "gst_number", "") or ""
    seller_pan = getattr(organization, "pan_number", "") or ""

    # Location resolution: store takes precedence if assigned
    addr1 = getattr(store, "address_line1", "") or getattr(organization, "address_line1", "")
    addr2 = getattr(store, "address_line2", "") or getattr(organization, "address_line2", "")
    city = getattr(store, "city", "") or getattr(organization, "city", "")
    state = getattr(store, "state", "") or getattr(organization, "state", "")
    pincode = getattr(store, "postal_code", "") or getattr(organization, "postal_code", "")
    phone = getattr(store, "phone", "") or getattr(organization, "phone", "")
    email = getattr(organization, "email", "")
    country = getattr(organization, "country", "India") or "India"

    logo_url = None
    if organization and organization.logo:
        try:
            logo_url = organization.logo.url
        except Exception:
            logo_url = None

    sig_url = None
    if config and config.signature_image:
        try:
            sig_url = config.signature_image.url
        except Exception:
            sig_url = None

    state_code = getattr(config, "state_code", "")
    if not state_code and state:
        state_code = resolve_state_code(state, seller_gstin)

    # Merge invoice elements
    elements = getattr(config, "invoice_elements", None) or {}
    default_elems = {
        "show_logo": True,
        "show_address": True,
        "show_gstin": True,
        "show_contact_details": True,
        "show_phone": True,
        "show_email": True,
        "show_website": False,
        "show_tagline": False,
        "show_bill_to": True,
        "show_ship_to": True,
        "show_bank_details": True,
        "show_terms": True,
        "show_notes": True,
        "show_amount_in_words": True,
        "show_authorized_signature": True,
        "show_page_number": True,
    }
    merged_elements = {**default_elems, **elements}

    return {
        "name": seller_name,
        "business_name": seller_name,
        "legal_name": seller_legal,
        "tagline": getattr(config, "tagline", ""),
        "gstin": seller_gstin,
        "pan_number": seller_pan,
        "address_line1": addr1,
        "address_line2": addr2,
        "city": city,
        "district": getattr(config, "district", ""),
        "state": state,
        "state_code": state_code,
        "country": country,
        "pincode": pincode,
        "phone": phone,
        "alternate_phone": getattr(config, "alternate_phone", ""),
        "email": email,
        "website": getattr(config, "website", ""),
        "logo_url": logo_url,
        "logo_position": getattr(config, "logo_position", "left"),
        "paper_size": getattr(config, "paper_size", "a4"),
        "invoice_template": getattr(config, "invoice_template", "classic_gst"),
        "gst_invoice_title": getattr(config, "gst_invoice_title", "TAX INVOICE"),
        "regular_invoice_title": getattr(config, "regular_invoice_title", "INVOICE"),
        "bank_name": getattr(config, "bank_name", ""),
        "bank_account_name": getattr(config, "bank_account_name", "") or seller_legal,
        "bank_account_number": getattr(config, "bank_account_number", ""),
        "bank_ifsc_code": getattr(config, "bank_ifsc_code", ""),
        "bank_branch": getattr(config, "bank_branch", ""),
        "bank_upi_id": getattr(config, "bank_upi_id", ""),
        "authorized_signatory_name": getattr(config, "authorized_signatory_name", "Authorized Signatory"),
        "signature_url": sig_url,
        "terms_and_conditions": getattr(config, "terms_and_conditions", ""),
        "default_invoice_notes": getattr(config, "default_invoice_notes", "") or getattr(config, "invoice_footer", ""),
        "invoice_elements": merged_elements,
    }
