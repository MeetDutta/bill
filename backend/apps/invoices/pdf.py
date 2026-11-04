import io
import logging
import os
from decimal import Decimal
from xml.sax.saxutils import escape as xml_escape

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Frame,
    HRFlowable,
    Image as RLImage,
    KeepTogether,
    PageTemplate,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from apps.invoices.gst_utils import get_place_of_supply, resolve_state_code
from apps.invoices.number_to_words import indian_number_to_words

logger = logging.getLogger(__name__)


def safe_str(val) -> str:
    """Escapes user input safely for ReportLab XML/HTML paragraphs."""
    if val is None:
        return ""
    return xml_escape(str(val))


def generate_invoice_pdf_bytes(invoice, format_type: str = "a4") -> bytes:
    """
    Renders pure PDF binary bytes for an Invoice model instance using ReportLab.
    Guarantees valid %PDF- output and never returns HTML.
    Supports standard 'a4' and compact 'thermal' (80mm) formats.
    """
    tx = invoice.transaction
    org = invoice.organization
    store = tx.store if tx else None
    customer = tx.customer if tx else None

    # Fetch related items and payments
    items = list(tx.items.all().select_related("product")) if tx else []
    payments = list(tx.payments.all()) if tx else []

    buffer = io.BytesIO()

    if format_type in ("thermal", "receipt"):
        _render_thermal_pdf(buffer, invoice, tx, org, store, customer, items, payments)
    else:
        _render_a4_pdf(buffer, invoice, tx, org, store, customer, items, payments)

    return buffer.getvalue()


def _render_a4_pdf(buffer, invoice, tx, org, store, customer, items, payments):
    """
    Renders an authoritative Indian GST Tax Invoice in formal A4 portrait layout
    matching the professional reference invoice standard.
    """
    # Load Business Configuration and branding snapshot
    from apps.billing.models import BusinessConfig
    from apps.billing.branding_utils import build_branding_snapshot
    config = None
    if org:
        config = BusinessConfig.objects.filter(organization=org).first()
    if not config and org:
        config, _ = BusinessConfig.objects.get_or_create(
            organization=org,
            defaults={"business_type": "retail"},
        )

    snap = getattr(invoice, "branding_snapshot", None)
    if not snap or not isinstance(snap, dict) or not snap.get("business_name"):
        snap = build_branding_snapshot(config, org, store)

    elements = snap.get("invoice_elements") or {}
    show_logo = elements.get("show_logo", True)
    show_addr = elements.get("show_address", True)
    show_gst = elements.get("show_gstin", True)
    show_tagline = elements.get("show_tagline", False)
    show_contact = elements.get("show_contact_details", True)
    show_phone = elements.get("show_phone", True)
    show_email = elements.get("show_email", True)
    show_website = elements.get("show_website", False)
    show_bill_to = elements.get("show_bill_to", True)
    show_ship_to = elements.get("show_ship_to", True)
    show_words = elements.get("show_amount_in_words", True)
    show_notes = elements.get("show_notes", True)
    show_terms = elements.get("show_terms", True)
    show_bank = elements.get("show_bank_details", True)
    show_sig = elements.get("show_authorized_signature", True)
    show_page_num = elements.get("show_page_number", True)
    logo_pos = snap.get("logo_position", "left")

    # Margin is 10mm so usable width is exactly 190mm (210 - 20)
    page_margin = 10 * mm
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=page_margin,
        rightMargin=page_margin,
        topMargin=page_margin,
        bottomMargin=page_margin,
    )

    # Frame with zero internal padding to perfectly fit 190mm width tables
    main_frame = Frame(
        page_margin,
        page_margin,
        doc.width,
        doc.height,
        id="normal",
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )

    def draw_page_frame(canvas, d):
        canvas.saveState()
        canvas.setStrokeColor(colors.black)
        canvas.setLineWidth(0.8)
        # Margin is page_margin (10mm)
        w = d.pagesize[0] - 2 * page_margin
        h = d.pagesize[1] - 2 * page_margin
        canvas.rect(page_margin, page_margin, w, h)
        # Page Number bottom-right outside outer border (if enabled)
        if show_page_num:
            canvas.setFont("Helvetica", 7.5)
            canvas.setFillColor(colors.black)
            canvas.drawRightString(d.pagesize[0] - page_margin - 2 * mm, page_margin - 4 * mm, str(canvas.getPageNumber()))
        canvas.restoreState()

    page_template = PageTemplate(id="invoice_page", frames=main_frame, onPage=draw_page_frame)
    doc.addPageTemplates([page_template])

    styles = getSampleStyleSheet()

    # Base typography styles
    def_font = "Helvetica"
    bold_font = "Helvetica-Bold"
    oblique_bold = "Helvetica-BoldOblique"

    title_company = ParagraphStyle(
        "CompanyTitle",
        parent=styles["Normal"],
        fontName=bold_font,
        fontSize=11.5,
        leading=14,
        textColor=colors.black,
    )
    company_meta = ParagraphStyle(
        "CompanyMeta",
        parent=styles["Normal"],
        fontName=def_font,
        fontSize=7.5,
        leading=10,
        textColor=colors.black,
    )
    doc_heading_style = ParagraphStyle(
        "DocHeading",
        parent=styles["Normal"],
        fontName=bold_font,
        fontSize=18,
        leading=21,
        alignment=2,  # Right-aligned
        textColor=colors.black,
    )
    section_title = ParagraphStyle(
        "SectionTitle",
        parent=styles["Normal"],
        fontName=bold_font,
        fontSize=8.5,
        leading=11,
        textColor=colors.black,
    )
    meta_label = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontName=def_font,
        fontSize=7.5,
        leading=10,
        textColor=colors.black,
    )
    meta_val = ParagraphStyle(
        "MetaVal",
        parent=styles["Normal"],
        fontName=def_font,
        fontSize=7.5,
        leading=10,
        textColor=colors.black,
    )
    party_bold = ParagraphStyle(
        "PartyBold",
        parent=styles["Normal"],
        fontName=bold_font,
        fontSize=9,
        leading=11.5,
        textColor=colors.black,
    )
    party_text = ParagraphStyle(
        "PartyText",
        parent=styles["Normal"],
        fontName=def_font,
        fontSize=7.5,
        leading=9.5,
        textColor=colors.black,
    )
    th_center = ParagraphStyle(
        "THCenter",
        parent=styles["Normal"],
        fontName=bold_font,
        fontSize=7.5,
        leading=9,
        alignment=1,
        textColor=colors.black,
    )
    th_left = ParagraphStyle(
        "THLeft",
        parent=styles["Normal"],
        fontName=bold_font,
        fontSize=7.5,
        leading=9,
        textColor=colors.black,
    )
    th_right = ParagraphStyle(
        "THRight",
        parent=styles["Normal"],
        fontName=bold_font,
        fontSize=7.5,
        leading=9,
        alignment=2,
        textColor=colors.black,
    )
    cell_center = ParagraphStyle(
        "CellCenter",
        parent=styles["Normal"],
        fontName=def_font,
        fontSize=7.5,
        leading=9.5,
        alignment=1,
        textColor=colors.black,
    )
    cell_left = ParagraphStyle(
        "CellLeft",
        parent=styles["Normal"],
        fontName=def_font,
        fontSize=7.5,
        leading=9.5,
        textColor=colors.black,
    )
    cell_right = ParagraphStyle(
        "CellRight",
        parent=styles["Normal"],
        fontName=def_font,
        fontSize=7.5,
        leading=9.5,
        alignment=2,
        textColor=colors.black,
    )
    words_style = ParagraphStyle(
        "WordsStyle",
        parent=styles["Normal"],
        fontName=oblique_bold,
        fontSize=8,
        leading=10.5,
        textColor=colors.black,
    )
    note_title = ParagraphStyle(
        "NoteTitle",
        parent=styles["Normal"],
        fontName=bold_font,
        fontSize=7.5,
        leading=9.5,
        textColor=colors.black,
    )
    note_body = ParagraphStyle(
        "NoteBody",
        parent=styles["Normal"],
        fontName=def_font,
        fontSize=7,
        leading=9,
        textColor=colors.black,
    )

    tagline_style = ParagraphStyle(
        "TaglineStyle",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=8,
        leading=10,
        textColor=colors.black,
    )

    story = []

    # ---------------------------------------------------------
    # 1. HEADER SECTION: Business Identity (Left) & Document Title (Right)
    # ---------------------------------------------------------
    seller_name = safe_str(snap.get("business_name") or getattr(org, "name", "") or getattr(config, "trade_name", "") or "BillMeet Store")
    seller_legal = safe_str(snap.get("legal_name") or seller_name)
    tagline_text = safe_str(snap.get("tagline") or "")
    seller_addr = safe_str(snap.get("address_line1") or getattr(store, "address_line1", "") or getattr(org, "address_line1", ""))
    seller_addr2 = safe_str(snap.get("address_line2") or getattr(store, "address_line2", "") or getattr(org, "address_line2", ""))
    seller_city = safe_str(snap.get("city") or getattr(store, "city", "") or getattr(org, "city", ""))
    seller_district = safe_str(snap.get("district") or "")
    seller_state = safe_str(snap.get("state") or getattr(store, "state", "") or getattr(org, "state", "Maharashtra"))
    seller_pin = safe_str(snap.get("pincode") or getattr(store, "postal_code", "") or getattr(org, "postal_code", ""))
    seller_gstin = safe_str(snap.get("gstin") or getattr(org, "gst_number", "") or getattr(config, "gstin", "") or "")
    seller_phone = safe_str(snap.get("phone") or getattr(store, "phone", "") or getattr(org, "phone", "") or "")
    seller_alt_phone = safe_str(snap.get("alternate_phone") or "")
    seller_email = safe_str(snap.get("email") or getattr(org, "email", "") or "")
    seller_website = safe_str(snap.get("website") or "")

    addr_parts = []
    if show_addr:
        if seller_addr:
            addr_parts.append(seller_addr)
        if seller_addr2:
            addr_parts.append(seller_addr2)
        city_pin = f"{seller_city} - {seller_pin}" if seller_pin else seller_city
        if city_pin:
            addr_parts.append(city_pin)
        if seller_district and seller_district != seller_city:
            addr_parts.append(seller_district)
        if seller_state:
            addr_parts.append(seller_state)
    addr_line = ", ".join(p for p in addr_parts if p)

    contact_parts = []
    if show_contact:
        if show_phone and seller_phone:
            contact_parts.append(f"Phone: {seller_phone}")
        if show_phone and seller_alt_phone:
            contact_parts.append(f"Alt: {seller_alt_phone}")
        if show_email and seller_email:
            contact_parts.append(f"Email: {seller_email}")
        if show_website and seller_website:
            contact_parts.append(f"Web: {seller_website}")
    contact_line = " | ".join(contact_parts)

    # Check for uploaded logo
    logo_flowable = None
    if show_logo:
        logo_path = None
        if org and org.logo and hasattr(org.logo, "path") and os.path.exists(org.logo.path):
            logo_path = org.logo.path
        elif snap and snap.get("logo_url"):
            l_url = snap.get("logo_url")
            cand = os.path.join(settings.MEDIA_ROOT, l_url.replace(settings.MEDIA_URL, "").lstrip("/"))
            if os.path.exists(cand):
                logo_path = cand

        if logo_path:
            try:
                from PIL import Image as PILImage
                with PILImage.open(logo_path) as p_img:
                    w, h = p_img.size
                    max_w, max_h = 36 * mm, 14 * mm
                    scale = min(max_w / w, max_h / h)
                    logo_flowable = RLImage(logo_path, width=w * scale, height=h * scale)
            except Exception:
                logo_flowable = None

    company_lines = []
    company_lines.append(Paragraph(f"<b>{seller_legal}</b>", title_company))
    if show_tagline and tagline_text:
        company_lines.append(Paragraph(f"<i>{tagline_text}</i>", tagline_style))
    if addr_line:
        company_lines.append(Paragraph(addr_line, company_meta))
    if show_gst and seller_gstin:
        company_lines.append(Paragraph(f"GSTIN: <b>{seller_gstin}</b>", company_meta))
    if contact_line:
        company_lines.append(Paragraph(contact_line, company_meta))

    is_gst = bool(seller_gstin and getattr(invoice, "invoice_type", "gst") != "non_gst")
    doc_heading = (snap.get("gst_invoice_title") or "TAX INVOICE") if is_gst else (snap.get("regular_invoice_title") or "INVOICE")

    if logo_flowable and logo_pos == "left":
        header_left_table = Table(
            [[logo_flowable, company_lines]],
            colWidths=[38 * mm, 82 * mm],
        )
        header_left_table.setStyle(
            TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ])
        )
        header_table = Table(
            [[header_left_table, Paragraph(doc_heading, doc_heading_style)]],
            colWidths=[120 * mm, 70 * mm],
        )
    elif logo_flowable and logo_pos == "right":
        header_right_table = Table(
            [[Paragraph(doc_heading, doc_heading_style), logo_flowable]],
            colWidths=[42 * mm, 28 * mm],
        )
        header_right_table.setStyle(
            TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ])
        )
        header_table = Table(
            [[company_lines, header_right_table]],
            colWidths=[120 * mm, 70 * mm],
        )
    elif logo_flowable and logo_pos == "center":
        header_table = Table(
            [[company_lines, logo_flowable, Paragraph(doc_heading, doc_heading_style)]],
            colWidths=[85 * mm, 35 * mm, 70 * mm],
        )
    else:
        # Graceful no-logo layout
        header_table = Table(
            [[company_lines, Paragraph(doc_heading, doc_heading_style)]],
            colWidths=[125 * mm, 65 * mm],
        )

    header_table.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(header_table)

    # ---------------------------------------------------------
    # 2. INVOICE INFORMATION: Number, Date, Terms, Place of Supply
    # ---------------------------------------------------------
    inv_number = safe_str(getattr(invoice, "invoice_number", "INV-000001"))
    if tx and tx.transaction_date:
        inv_date_str = tx.transaction_date.strftime("%d/%m/%Y")
    else:
        inv_date_str = invoice.created_at.strftime("%d/%m/%Y")

    due_date_str = tx.due_date.strftime("%d/%m/%Y") if (tx and tx.due_date) else inv_date_str
    payment_terms_str = "Due on Receipt"
    if tx and tx.due_date and tx.transaction_date and tx.due_date > tx.transaction_date.date():
        payment_terms_str = f"Net {(tx.due_date - tx.transaction_date.date()).days} Days"

    # Place of supply
    cust_state = getattr(customer, "state", "") if customer else ""
    cust_gstin = safe_str(getattr(customer, "gstin", "") or getattr(customer, "gst_number", "") or "")
    supply_state = cust_state or seller_state or "Maharashtra"
    place_of_supply_str = get_place_of_supply(supply_state, cust_gstin or seller_gstin)

    inv_meta_left = Table(
        [
            [Paragraph("#", meta_label), Paragraph(f": <b>{inv_number}</b>", meta_val)],
            [Paragraph("Invoice Date", meta_label), Paragraph(f": {inv_date_str}", meta_val)],
            [Paragraph("Terms", meta_label), Paragraph(f": {payment_terms_str}", meta_val)],
            [Paragraph("Due Date", meta_label), Paragraph(f": {due_date_str}", meta_val)],
        ],
        colWidths=[22 * mm, 71 * mm],
    )
    inv_meta_left.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 0.8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0.8),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ])
    )

    inv_meta_right = Table(
        [
            [Paragraph("Place Of Supply", meta_label), Paragraph(f": <b>{place_of_supply_str}</b>", meta_val)],
            [Paragraph("Reverse Charge", meta_label), Paragraph(": No", meta_val)],
        ],
        colWidths=[26 * mm, 67 * mm],
    )
    inv_meta_right.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 0.8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0.8),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ])
    )

    meta_table = Table(
        [[inv_meta_left, inv_meta_right]],
        colWidths=[95 * mm, 95 * mm],
    )
    meta_table.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.8, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    story.append(meta_table)

    # ---------------------------------------------------------
    # 3. BILL TO / SHIP TO SECTION
    # ---------------------------------------------------------
    cust_name = safe_str(getattr(customer, "full_name", "") or getattr(customer, "name", "") or "Walk-in Customer")
    cust_addr1 = safe_str(getattr(customer, "address_line1", "") or "")
    cust_city = safe_str(getattr(customer, "city", "") or "")
    cust_state_pin = safe_str(f"{getattr(customer, 'postal_code', '')} {cust_state}".strip())
    cust_phone = safe_str(getattr(customer, "phone", "") or "")

    bill_to_content = [
        Paragraph("<b>Bill To</b>", section_title),
        Spacer(1, 1 * mm),
        Paragraph(f"<b>{cust_name}</b>", party_bold),
    ]
    if cust_addr1:
        bill_to_content.append(Paragraph(cust_addr1, party_text))
    if cust_city:
        bill_to_content.append(Paragraph(cust_city, party_text))
    if cust_state_pin:
        bill_to_content.append(Paragraph(cust_state_pin, party_text))
    bill_to_content.append(Paragraph("India", party_text))
    if cust_gstin:
        bill_to_content.append(Paragraph(f"GSTIN <b>{cust_gstin}</b>", party_text))
    elif cust_phone and not getattr(customer, "is_walk_in", False):
        bill_to_content.append(Paragraph(f"Contact: {cust_phone}", party_text))

    ship_to_content = [
        Paragraph("<b>Ship To</b>", section_title),
        Spacer(1, 1 * mm),
        Paragraph(f"<b>{cust_name}</b>", party_bold),
    ]
    if cust_addr1:
        ship_to_content.append(Paragraph(cust_addr1, party_text))
    if cust_city:
        ship_to_content.append(Paragraph(cust_city, party_text))
    if cust_state_pin:
        ship_to_content.append(Paragraph(cust_state_pin, party_text))
    ship_to_content.append(Paragraph("India", party_text))
    if cust_gstin:
        ship_to_content.append(Paragraph(f"GSTIN <b>{cust_gstin}</b>", party_text))

    bill_ship_table = None
    if show_bill_to and show_ship_to:
        bill_ship_table = Table(
            [[bill_to_content, ship_to_content]],
            colWidths=[95 * mm, 95 * mm],
        )
        bill_ship_table.setStyle(
            TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.8, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ])
        )
    elif show_bill_to:
        bill_ship_table = Table(
            [[bill_to_content]],
            colWidths=[190 * mm],
        )
        bill_ship_table.setStyle(
            TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ])
        )
    elif show_ship_to:
        bill_ship_table = Table(
            [[ship_to_content]],
            colWidths=[190 * mm],
        )
        bill_ship_table.setStyle(
            TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ])
        )

    if bill_ship_table:
        story.append(bill_ship_table)

    # ---------------------------------------------------------
    # 4. STRUCTURED ITEM DESCRIPTION TABLE (GST GRID)
    # ---------------------------------------------------------
    # Detect Interstate transaction:
    is_interstate = False
    if tx:
        has_igst = tx.items.filter(igst_amount__gt=0).exists()
        tb = tx.tax_breakup or {}
        if has_igst or (isinstance(tb, dict) and Decimal(str(tb.get("igst", 0))) > 0):
            is_interstate = True
        elif cust_state and seller_state:
            s_code_seller = resolve_state_code(seller_state, seller_gstin)
            s_code_buyer = resolve_state_code(cust_state, cust_gstin)
            if s_code_seller and s_code_buyer and s_code_seller != s_code_buyer:
                is_interstate = True

    if is_gst and not is_interstate:
        # Standard Intra-state Layout: CGST + SGST grouped headers
        # Col widths: 8 + 56 + 20 + 14 + 18 + 12 + 17 + 12 + 17 + 16 = 190mm
        col_widths = [8 * mm, 56 * mm, 20 * mm, 14 * mm, 18 * mm, 12 * mm, 17 * mm, 12 * mm, 17 * mm, 16 * mm]
        header_row_0 = [
            Paragraph("#", th_center),
            Paragraph("Item &amp; Description", th_left),
            Paragraph("HSN<br/>/SAC", th_center),
            Paragraph("Qty", th_center),
            Paragraph("Rate", th_right),
            Paragraph("CGST", th_center),
            "",
            Paragraph("SGST", th_center),
            "",
            Paragraph("Amount", th_right),
        ]
        header_row_1 = [
            "",
            "",
            "",
            "",
            "",
            Paragraph("%", th_center),
            Paragraph("Amt", th_right),
            Paragraph("%", th_center),
            Paragraph("Amt", th_right),
            "",
        ]
        table_style_commands = [
            ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 2.5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2.5),
            ("SPAN", (0, 0), (0, 1)),
            ("SPAN", (1, 0), (1, 1)),
            ("SPAN", (2, 0), (2, 1)),
            ("SPAN", (3, 0), (3, 1)),
            ("SPAN", (4, 0), (4, 1)),
            ("SPAN", (5, 0), (6, 0)),
            ("SPAN", (7, 0), (8, 0)),
            ("SPAN", (9, 0), (9, 1)),
        ]
        rows = [header_row_0, header_row_1]

        total_qty_count = Decimal("0")
        for idx, it in enumerate(items, start=1):
            name = safe_str(it.name or (it.product.name if it.product else "Item"))
            hsn = safe_str(it.hsn_code or (it.product.hsn_code if it.product else "") or "-")
            qty = it.quantity
            total_qty_count += qty
            unit = safe_str((it.product.unit if it.product else "") or (it.attributes.get("unit") if isinstance(it.attributes, dict) else "") or "PCS")
            rate = it.unit_price
            tax_rate = it.tax_rate
            half_rate = tax_rate / Decimal("2") if tax_rate else Decimal("0")
            cgst = it.cgst_amount if it.cgst_amount > 0 else (it.tax / Decimal("2") if it.tax else Decimal("0"))
            sgst = it.sgst_amount if it.sgst_amount > 0 else (it.tax / Decimal("2") if it.tax else Decimal("0"))
            taxable_amt = (it.quantity * it.unit_price) - it.discount

            qty_display = f"{qty:g}<br/>{unit.upper()}"
            rows.append([
                Paragraph(str(idx), cell_center),
                Paragraph(name, cell_left),
                Paragraph(hsn, cell_center),
                Paragraph(qty_display, cell_center),
                Paragraph(f"{rate:,.2f}", cell_right),
                Paragraph(f"{half_rate:g}%", cell_center),
                Paragraph(f"{cgst:,.2f}", cell_right),
                Paragraph(f"{half_rate:g}%", cell_center),
                Paragraph(f"{sgst:,.2f}", cell_right),
                Paragraph(f"{taxable_amt:,.2f}", cell_right),
            ])

        repeat_rows = 2

    elif is_gst and is_interstate:
        # Interstate Layout: IGST grouped header
        # Col widths: 8 + 74 + 22 + 16 + 20 + 14 + 18 + 18 = 190mm
        col_widths = [8 * mm, 74 * mm, 22 * mm, 16 * mm, 20 * mm, 14 * mm, 18 * mm, 18 * mm]
        header_row_0 = [
            Paragraph("#", th_center),
            Paragraph("Item &amp; Description", th_left),
            Paragraph("HSN<br/>/SAC", th_center),
            Paragraph("Qty", th_center),
            Paragraph("Rate", th_right),
            Paragraph("IGST", th_center),
            "",
            Paragraph("Amount", th_right),
        ]
        header_row_1 = [
            "",
            "",
            "",
            "",
            "",
            Paragraph("%", th_center),
            Paragraph("Amt", th_right),
            "",
        ]
        table_style_commands = [
            ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 2.5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2.5),
            ("SPAN", (0, 0), (0, 1)),
            ("SPAN", (1, 0), (1, 1)),
            ("SPAN", (2, 0), (2, 1)),
            ("SPAN", (3, 0), (3, 1)),
            ("SPAN", (4, 0), (4, 1)),
            ("SPAN", (5, 0), (6, 0)),
            ("SPAN", (7, 0), (7, 1)),
        ]
        rows = [header_row_0, header_row_1]

        total_qty_count = Decimal("0")
        for idx, it in enumerate(items, start=1):
            name = safe_str(it.name or (it.product.name if it.product else "Item"))
            hsn = safe_str(it.hsn_code or (it.product.hsn_code if it.product else "") or "-")
            qty = it.quantity
            total_qty_count += qty
            unit = safe_str((it.product.unit if it.product else "") or (it.attributes.get("unit") if isinstance(it.attributes, dict) else "") or "PCS")
            rate = it.unit_price
            tax_rate = it.tax_rate
            igst = it.igst_amount if it.igst_amount > 0 else (it.tax if it.tax else Decimal("0"))
            taxable_amt = (it.quantity * it.unit_price) - it.discount

            qty_display = f"{qty:g}<br/>{unit.upper()}"
            rows.append([
                Paragraph(str(idx), cell_center),
                Paragraph(name, cell_left),
                Paragraph(hsn, cell_center),
                Paragraph(qty_display, cell_center),
                Paragraph(f"{rate:,.2f}", cell_right),
                Paragraph(f"{tax_rate:g}%", cell_center),
                Paragraph(f"{igst:,.2f}", cell_right),
                Paragraph(f"{taxable_amt:,.2f}", cell_right),
            ])

        repeat_rows = 2

    else:
        # Regular Non-GST layout
        # Col widths: 10 + 95 + 25 + 20 + 20 + 20 = 190mm
        col_widths = [10 * mm, 95 * mm, 25 * mm, 20 * mm, 20 * mm, 20 * mm]
        header_row = [
            Paragraph("#", th_center),
            Paragraph("Item &amp; Description", th_left),
            Paragraph("HSN /SAC", th_center),
            Paragraph("Qty", th_center),
            Paragraph("Rate", th_right),
            Paragraph("Amount", th_right),
        ]
        table_style_commands = [
            ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 2.5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2.5),
        ]
        rows = [header_row]

        total_qty_count = Decimal("0")
        for idx, it in enumerate(items, start=1):
            name = safe_str(it.name or (it.product.name if it.product else "Item"))
            hsn = safe_str(it.hsn_code or (it.product.hsn_code if it.product else "") or "-")
            qty = it.quantity
            total_qty_count += qty
            unit = safe_str((it.product.unit if it.product else "") or (it.attributes.get("unit") if isinstance(it.attributes, dict) else "") or "PCS")
            rate = it.unit_price
            taxable_amt = (it.quantity * it.unit_price) - it.discount

            qty_display = f"{qty:g} {unit.upper()}"
            rows.append([
                Paragraph(str(idx), cell_center),
                Paragraph(name, cell_left),
                Paragraph(hsn, cell_center),
                Paragraph(qty_display, cell_center),
                Paragraph(f"{rate:,.2f}", cell_right),
                Paragraph(f"{taxable_amt:,.2f}", cell_right),
            ])

        repeat_rows = 1

    items_table = Table(rows, colWidths=col_widths, repeatRows=repeat_rows)
    items_table.setStyle(TableStyle(table_style_commands))
    story.append(items_table)

    # ---------------------------------------------------------
    # 5. TOTALS, WORDS, NOTES, BANK DETAILS & AUTHORIZED SIGNATURE
    # ---------------------------------------------------------
    subtotal_val = tx.subtotal if tx else Decimal("0.00")
    total_val = tx.total if tx else Decimal("0.00")
    discount_val = tx.discount if tx else Decimal("0.00")
    round_off_val = tx.round_off if tx else Decimal("0.00")
    paid_val = tx.amount_paid if tx else total_val
    due_val = tx.outstanding_amount if tx else Decimal("0.00")

    # Aggregate tax values
    cgst_total = sum(it.cgst_amount for it in items) if items else Decimal("0.00")
    sgst_total = sum(it.sgst_amount for it in items) if items else Decimal("0.00")
    igst_total = sum(it.igst_amount for it in items) if items else Decimal("0.00")

    tb = tx.tax_breakup if (tx and isinstance(tx.tax_breakup, dict)) else {}
    if cgst_total == 0 and sgst_total == 0 and "cgst" in tb:
        cgst_total = Decimal(str(tb.get("cgst", 0)))
        sgst_total = Decimal(str(tb.get("sgst", 0)))
    if igst_total == 0 and "igst" in tb:
        igst_total = Decimal(str(tb.get("igst", 0)))

    # If tax is positive but breakup didn't split, split evenly for intra-state
    if is_gst and not is_interstate and cgst_total == 0 and sgst_total == 0 and tx and tx.tax > 0:
        cgst_total = tx.tax / Decimal("2")
        sgst_total = tx.tax / Decimal("2")

    # Left Column Elements
    left_elements = []

    # Total quantity display
    items_qty_text = f"Items in Total {int(total_qty_count) if total_qty_count == int(total_qty_count) else total_qty_count}"
    left_elements.append(Paragraph(f"<b>{items_qty_text}</b>", section_title))
    left_elements.append(Spacer(1, 1.5 * mm))

    # Amount in words
    if show_words:
        amt_words = indian_number_to_words(total_val)
        left_elements.append(Paragraph("Total In Words", meta_label))
        left_elements.append(Paragraph(f"<i><b>{amt_words}</b></i>", words_style))
        left_elements.append(Spacer(1, 2.5 * mm))

    # Notes
    if show_notes:
        custom_notes_text = invoice.custom_notes or snap.get("default_invoice_notes") or (tx.notes if tx else "") or "Looking forward for your business."
        left_elements.append(Paragraph("<b>Notes</b>", note_title))
        left_elements.append(Paragraph(safe_str(custom_notes_text), note_body))
        left_elements.append(Spacer(1, 2 * mm))

    # Terms & Conditions
    if show_terms:
        terms_text = invoice.terms_and_conditions or snap.get("terms_and_conditions") or getattr(config, "terms_and_conditions", "") or "Payment : 100% Advance"
        left_elements.append(Paragraph("<b>Terms &amp; Conditions</b>", note_title))
        left_elements.append(Paragraph(safe_str(terms_text), note_body))

    # Bank Details
    if show_bank:
        bank_name = snap.get("bank_name") or getattr(config, "bank_name", "") or ""
        bank_ac_name = snap.get("bank_account_name") or getattr(config, "bank_account_name", "") or seller_legal
        bank_ac_no = snap.get("bank_account_number") or getattr(config, "bank_account_number", "") or ""
        bank_ifsc = snap.get("bank_ifsc_code") or getattr(config, "bank_ifsc_code", "") or ""
        bank_branch = snap.get("bank_branch") or getattr(config, "bank_branch", "") or ""
        bank_upi = snap.get("bank_upi_id") or getattr(config, "bank_upi_id", "") or ""

        if bank_ac_no or bank_name or bank_ifsc or bank_upi:
            left_elements.append(Spacer(1, 2 * mm))
            left_elements.append(Paragraph("<b>Bank Details:</b>", note_title))
            if bank_ac_name:
                left_elements.append(Paragraph(f"Bank Account Name : {safe_str(bank_ac_name)}", note_body))
            if bank_ac_no:
                left_elements.append(Paragraph(f"Bank Account Number: {safe_str(bank_ac_no)}", note_body))
            if bank_ifsc:
                left_elements.append(Paragraph(f"IFS Code: {safe_str(bank_ifsc)}", note_body))
            if bank_name:
                left_elements.append(Paragraph(f"Bank Name : {safe_str(bank_name)}", note_body))
            if bank_branch:
                left_elements.append(Paragraph(f"Branch Address: {safe_str(bank_branch)}", note_body))
            if bank_upi:
                left_elements.append(Paragraph(f"UPI ID: {safe_str(bank_upi)}", note_body))

    # Right Column: Totals Calculation Table + Signature Block
    totals_rows = [
        [Paragraph("Sub Total", meta_label), Paragraph(f"{subtotal_val:,.2f}", cell_right)],
    ]

    # Average tax rate for label (e.g. CGST9 (9%))
    avg_rate = Decimal("0")
    if items:
        rates = [it.tax_rate for it in items if it.tax_rate > 0]
        if rates:
            avg_rate = max(rates)

    if is_gst and not is_interstate:
        half_lbl = f"{avg_rate / Decimal('2'):g}" if avg_rate else "9"
        totals_rows.append([Paragraph(f"CGST{half_lbl} ({half_lbl}%)", meta_label), Paragraph(f"{cgst_total:,.2f}", cell_right)])
        totals_rows.append([Paragraph(f"SGST{half_lbl} ({half_lbl}%)", meta_label), Paragraph(f"{sgst_total:,.2f}", cell_right)])
    elif is_gst and is_interstate:
        full_lbl = f"{avg_rate:g}" if avg_rate else "18"
        totals_rows.append([Paragraph(f"IGST{full_lbl} ({full_lbl}%)", meta_label), Paragraph(f"{igst_total:,.2f}", cell_right)])

    # Round-off / Balance Adjustment
    if round_off_val != Decimal("0.00"):
        round_lbl = "Balance Amount"
        if round_off_val < 0:
            round_val_str = f"(-) {abs(round_off_val):.2f}"
        else:
            round_val_str = f"(+) {round_off_val:.2f}"
        totals_rows.append([Paragraph(round_lbl, meta_label), Paragraph(round_val_str, cell_right)])

    # Grand Total
    grand_total_style = ParagraphStyle(
        "GrandTotalR",
        parent=styles["Normal"],
        fontName=bold_font,
        fontSize=11,
        leading=13,
        alignment=2,
        textColor=colors.black,
    )
    grand_total_label = ParagraphStyle(
        "GrandTotalL",
        parent=styles["Normal"],
        fontName=bold_font,
        fontSize=10,
        leading=12,
        textColor=colors.black,
    )
    totals_rows.append([
        Paragraph("Total", grand_total_label),
        Paragraph(f"<b>₹{total_val:,.2f}</b>", grand_total_style),
    ])

    # If partial payment
    if due_val > Decimal("0.00"):
        totals_rows.append([Paragraph("Amount Paid", meta_label), Paragraph(f"₹{paid_val:,.2f}", cell_right)])
        totals_rows.append([Paragraph("Balance Due", ParagraphStyle("DueL", parent=meta_label, fontName=bold_font)), Paragraph(f"₹{due_val:,.2f}", ParagraphStyle("DueR", parent=cell_right, fontName=bold_font))])

    right_totals_table = Table(
        totals_rows,
        colWidths=[40 * mm, 32 * mm],
    )
    totals_table_style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.black),
    ]
    right_totals_table.setStyle(TableStyle(totals_table_style))

    # Signature Block
    sig_content = []
    if show_sig:
        signatory_title = safe_str(snap.get("authorized_signatory_name") or getattr(config, "authorized_signatory_name", "") or "Authorized Signatory")
        sig_content = [
            Spacer(1, 1.5 * mm),
            HRFlowable(width="100%", thickness=0.8, color=colors.black, spaceBefore=1, spaceAfter=4),
            Paragraph(f"<b>For {seller_legal}</b>", ParagraphStyle("SigCo", parent=styles["Normal"], fontName=def_font, fontSize=8, leading=10, alignment=1)),
        ]

        # Signature Image if available
        sig_image_flowable = None
        sig_path = None
        if config and config.signature_image and hasattr(config.signature_image, "path") and os.path.exists(config.signature_image.path):
            sig_path = config.signature_image.path
        elif snap and snap.get("signature_url"):
            s_url = snap.get("signature_url")
            cand = os.path.join(settings.MEDIA_ROOT, s_url.replace(settings.MEDIA_URL, "").lstrip("/"))
            if os.path.exists(cand):
                sig_path = cand

        if sig_path:
            try:
                from PIL import Image as PILImage
                with PILImage.open(sig_path) as s_img:
                    sw, sh = s_img.size
                    max_sw, max_sh = 35 * mm, 12 * mm
                    scale = min(max_sw / sw, max_sh / sh)
                    sig_image_flowable = RLImage(sig_path, width=sw * scale, height=sh * scale)
            except Exception:
                sig_image_flowable = None

        if sig_image_flowable:
            sig_content.append(Spacer(1, 1 * mm))
            sig_content.append(sig_image_flowable)
            sig_content.append(Spacer(1, 1 * mm))
        else:
            sig_content.append(Spacer(1, 12 * mm))

        sig_content.append(Paragraph(signatory_title, ParagraphStyle("SigLbl", parent=styles["Normal"], fontName=def_font, fontSize=7.5, leading=9, alignment=1)))

    right_elements = [
        right_totals_table,
    ] + sig_content

    bottom_summary_table = Table(
        [[left_elements, right_elements]],
        colWidths=[116 * mm, 74 * mm],
    )
    bottom_summary_table.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.8, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ])
    )
    story.append(bottom_summary_table)

    doc.build(story)


def _render_thermal_pdf(buffer, invoice, tx, org, store, customer, items, payments):
    """
    Renders an 80mm thermal receipt format.
    Width: 80mm (approx 226.77 pt). Height: dynamic (minimum 160mm, expands with items).
    """
    roll_width = 80 * mm
    calc_height = max(160 * mm, (120 + len(items) * 12 + len(payments) * 8) * mm)

    doc = SimpleDocTemplate(
        buffer,
        pagesize=(roll_width, calc_height),
        leftMargin=3 * mm,
        rightMargin=3 * mm,
        topMargin=5 * mm,
        bottomMargin=5 * mm,
    )

    styles = getSampleStyleSheet()
    t_center = ParagraphStyle(
        "TCenter",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=13,
        alignment=1,
    )
    t_meta = ParagraphStyle(
        "TMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        alignment=1,
    )
    t_row_l = ParagraphStyle(
        "TRowL",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
    )
    t_row_r = ParagraphStyle(
        "TRowR",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        alignment=2,
    )
    t_bold_l = ParagraphStyle(
        "TBoldL",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
    )
    t_bold_r = ParagraphStyle(
        "TBoldR",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        alignment=2,
    )

    story = []
    seller_name = safe_str(getattr(org, "name", "BillMeet Retail"))
    store_name = safe_str(getattr(store, "name", "") if store else "")
    gst_num = safe_str(getattr(org, "gst_number", "") or "")

    story.append(Paragraph(seller_name, t_center))
    if store_name:
        story.append(Paragraph(store_name, t_meta))
    if gst_num:
        story.append(Paragraph(f"GSTIN: {gst_num}", t_meta))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.black, spaceBefore=2, spaceAfter=2))

    inv_date = tx.transaction_date.strftime("%d/%m/%Y %I:%M %p") if tx and tx.transaction_date else invoice.created_at.strftime("%d/%m/%Y %I:%M %p")
    story.append(Paragraph(f"Invoice: #{safe_str(invoice.invoice_number)}", t_row_l))
    story.append(Paragraph(f"Date: {inv_date}", t_row_l))
    if customer:
        story.append(Paragraph(f"Customer: {safe_str(customer.full_name or customer.name)}", t_row_l))

    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.black, spaceBefore=2, spaceAfter=2))

    # Items table
    item_rows = [
        [
            Paragraph("Item", t_bold_l),
            Paragraph("Qty", t_bold_r),
            Paragraph("Amt", t_bold_r),
        ]
    ]
    for it in items:
        name = safe_str(it.name or (it.product.name if it.product else "Item"))
        qty = f"{it.quantity:g}"
        tot = f"₹{it.total:,.2f}"
        item_rows.append([
            Paragraph(name, t_row_l),
            Paragraph(qty, t_row_r),
            Paragraph(tot, t_row_r),
        ])

    item_table = Table(item_rows, colWidths=[42 * mm, 12 * mm, 20 * mm])
    item_table.setStyle(
        TableStyle([
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING", (0, 0), (-1, -1), 1),
            ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ])
    )
    story.append(item_table)
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.black, spaceBefore=2, spaceAfter=2))

    # Totals
    subtotal_val = tx.subtotal if tx else Decimal("0.00")
    discount_val = tx.discount if tx else Decimal("0.00")
    tax_val = tx.tax if tx else Decimal("0.00")
    total_val = tx.total if tx else Decimal("0.00")

    totals_rows = [
        [Paragraph("Subtotal:", t_row_l), Paragraph(f"₹{subtotal_val:,.2f}", t_row_r)],
        [Paragraph("Discount:", t_row_l), Paragraph(f"-₹{discount_val:,.2f}", t_row_r)],
        [Paragraph("Tax:", t_row_l), Paragraph(f"₹{tax_val:,.2f}", t_row_r)],
        [Paragraph("TOTAL:", t_bold_l), Paragraph(f"₹{total_val:,.2f}", t_bold_r)],
    ]
    totals_table = Table(totals_rows, colWidths=[44 * mm, 30 * mm])
    totals_table.setStyle(
        TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 1.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 1),
            ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ])
    )
    story.append(totals_table)

    if payments:
        story.append(Spacer(1, 1 * mm))
        for p in payments:
            story.append(Paragraph(f"{safe_str(p.payment_method.upper())}: ₹{p.amount:,.2f}", t_meta))

    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("Thank You! Please Visit Again", t_meta))

    doc.build(story)


def generate_invoice_pdf(invoice, format_type: str = "a4") -> str:
    """
    Renders and saves a verified binary PDF for the given Invoice instance using ReportLab.
    Saves the file inside settings.MEDIA_ROOT/invoices/.
    Returns the media URL of the saved PDF.
    Guarantees no HTML fallbacks masquerading as PDF files.
    """
    invoices_dir = os.path.join(settings.MEDIA_ROOT, "invoices")
    os.makedirs(invoices_dir, exist_ok=True)

    suffix = f"_{format_type}" if format_type in ("thermal", "receipt") else ""
    pdf_filename = f"{invoice.invoice_number}{suffix}.pdf"
    pdf_filepath = os.path.join(invoices_dir, pdf_filename)

    pdf_bytes = generate_invoice_pdf_bytes(invoice, format_type=format_type)
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError("Generated PDF bytes do not match standard PDF file signature.")

    with open(pdf_filepath, "wb") as f:
        f.write(pdf_bytes)

    pdf_url = f"{settings.MEDIA_URL}invoices/{pdf_filename}"
    return pdf_url
