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
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

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
    items = list(tx.items.all()) if tx else []
    payments = list(tx.payments.all()) if tx else []

    buffer = io.BytesIO()

    if format_type in ("thermal", "receipt"):
        _render_thermal_pdf(buffer, invoice, tx, org, store, customer, items, payments)
    else:
        _render_a4_pdf(buffer, invoice, tx, org, store, customer, items, payments)

    return buffer.getvalue()


def _render_a4_pdf(buffer, invoice, tx, org, store, customer, items, payments):
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    org_title_style = ParagraphStyle(
        "OrgTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#111827"),
    )
    store_meta_style = ParagraphStyle(
        "StoreMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#4b5563"),
    )
    badge_style = ParagraphStyle(
        "DocBadge",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        alignment=2,  # Right
        textColor=colors.HexColor("#111827"),
    )
    inv_meta_style = ParagraphStyle(
        "InvMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        alignment=2,  # Right
        textColor=colors.HexColor("#374151"),
    )
    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=10,
        textColor=colors.HexColor("#111827"),
    )
    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#1f2937"),
    )
    table_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=table_cell_style,
        fontName="Helvetica-Bold",
    )
    table_cell_right = ParagraphStyle(
        "TableCellRight",
        parent=table_cell_style,
        alignment=2,
    )
    table_cell_bold_right = ParagraphStyle(
        "TableCellBoldRight",
        parent=table_cell_bold,
        alignment=2,
    )
    footer_text = ParagraphStyle(
        "FooterText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        alignment=1,  # Center
        textColor=colors.HexColor("#6b7280"),
    )

    story = []

    # 1. Header (Org & Store on Left, Invoice meta on Right)
    org_name = safe_str(getattr(org, "name", "BillMeet Retail"))
    store_name = safe_str(getattr(store, "name", "Main Store") if store else "")
    store_addr = ""
    if store:
        addr_parts = [
            getattr(store, "address_line1", ""),
            getattr(store, "city", ""),
            getattr(store, "state", ""),
            getattr(store, "pincode", ""),
        ]
        store_addr = ", ".join(p for p in addr_parts if p)
    store_phone = safe_str(getattr(store, "phone", "") if store else "")

    gst_num = safe_str(getattr(org, "gst_number", "") or "")
    header_left = [
        Paragraph(org_name, org_title_style),
        Spacer(1, 2 * mm),
        Paragraph(f"<b>{store_name}</b>" if store_name else "", store_meta_style),
        Paragraph(store_addr, store_meta_style) if store_addr else Spacer(1, 0),
        Paragraph(f"GSTIN: <b>{gst_num}</b>" if gst_num else "GSTIN: Not Registered / Unregistered", store_meta_style),
        Paragraph(f"Phone: {store_phone}" if store_phone else "", store_meta_style) if store_phone else Spacer(1, 0),
    ]

    is_gst = bool(gst_num and getattr(invoice, "invoice_type", "") == "gst")
    doc_title = "TAX INVOICE" if is_gst else "RETAIL INVOICE"
    inv_date = tx.transaction_date.strftime("%d %b %Y, %I:%M %p") if tx and tx.transaction_date else invoice.created_at.strftime("%d %b %Y, %I:%M %p")
    cashier_name = safe_str(tx.cashier.get_full_name() or tx.cashier.email) if (tx and tx.cashier) else "Unknown / Legacy"

    header_right = [
        Paragraph(doc_title, badge_style),
        Spacer(1, 2 * mm),
        Paragraph(f"Invoice No: <b>#{safe_str(invoice.invoice_number)}</b>", inv_meta_style),
        Paragraph(f"Date: {inv_date}", inv_meta_style),
        Paragraph(f"Billed By: {cashier_name}", inv_meta_style),
        Paragraph(f"Payment Status: <b>{safe_str(tx.payment_status.upper()) if tx else 'PAID'}</b>", inv_meta_style),
    ]

    header_table = Table(
        [[header_left, header_right]],
        colWidths=[105 * mm, 77 * mm],
    )
    header_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ])
    )
    story.append(header_table)
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#111827"), spaceBefore=1, spaceAfter=8))

    # 2. Billed To (Customer Details)
    cust_name = safe_str(customer.full_name) if customer else "Walk-in Customer"
    cust_phone = safe_str(customer.phone) if customer else "-"
    cust_gstin = safe_str(getattr(customer, "gst_number", "") or "")
    cust_addr = safe_str(getattr(customer, "address_line1", "") or "")

    cust_info_text = f"<b>Billed To:</b> {cust_name} &nbsp;|&nbsp; <b>Phone:</b> {cust_phone}"
    if cust_gstin:
        cust_info_text += f" &nbsp;|&nbsp; <b>Customer GSTIN:</b> {cust_gstin}"
    if cust_addr:
        cust_info_text += f"<br/><b>Address:</b> {cust_addr}"

    billed_to_table = Table(
        [[Paragraph(cust_info_text, store_meta_style)]],
        colWidths=[182 * mm],
    )
    billed_to_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    story.append(billed_to_table)
    story.append(Spacer(1, 3 * mm))

    # 3. Items Table
    col_widths = [10 * mm, 60 * mm, 20 * mm, 16 * mm, 22 * mm, 22 * mm, 32 * mm]
    item_rows = [
        [
            Paragraph("#", table_header_style),
            Paragraph("Item Description", table_header_style),
            Paragraph("HSN/SAC", table_header_style),
            Paragraph("Qty", ParagraphStyle("HRight", parent=table_header_style, alignment=2)),
            Paragraph("Rate (₹)", ParagraphStyle("HRight", parent=table_header_style, alignment=2)),
            Paragraph("Discount (₹)", ParagraphStyle("HRight", parent=table_header_style, alignment=2)),
            Paragraph("Total (₹)", ParagraphStyle("HRight", parent=table_header_style, alignment=2)),
        ]
    ]

    for idx, it in enumerate(items, start=1):
        name = safe_str(it.name or (it.product.name if it.product else "Item"))
        hsn = safe_str(it.hsn_code or "-")
        qty = f"{it.quantity:g}"
        price = f"{it.unit_price:,.2f}"
        disc = f"{it.discount:,.2f}"
        tot = f"{it.total:,.2f}"
        item_rows.append([
            Paragraph(str(idx), table_cell_style),
            Paragraph(name, table_cell_style),
            Paragraph(hsn, table_cell_style),
            Paragraph(qty, table_cell_right),
            Paragraph(price, table_cell_right),
            Paragraph(disc, table_cell_right),
            Paragraph(tot, table_cell_bold_right),
        ])

    items_table = Table(item_rows, colWidths=col_widths, repeatRows=1)
    items_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
            ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#111827")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f3f4f6")),
            ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )
    story.append(items_table)
    story.append(Spacer(1, 3 * mm))

    # 4. Summary & Payment Breakdown (Two Columns)
    # Left: Payment Breakdown & Notes; Right: Subtotal, Taxes, Grand Total
    left_meta = []
    if payments:
        left_meta.append(Paragraph("<b>Payment Breakdown:</b>", table_header_style))
        for p in payments:
            method_name = safe_str(p.payment_method.upper())
            p_amt = f"₹{p.amount:,.2f}"
            ref_str = f" ({safe_str(p.reference)})" if p.reference else ""
            left_meta.append(Paragraph(f"• {method_name}: {p_amt}{ref_str}", table_cell_style))
    elif tx and tx.payment_method:
        left_meta.append(Paragraph(f"<b>Payment Method:</b> {safe_str(tx.payment_method.upper())}", table_cell_style))

    # Add tax breakup details if present
    if tx and tx.tax_breakup and isinstance(tx.tax_breakup, dict):
        tb = tx.tax_breakup
        left_meta.append(Spacer(1, 2 * mm))
        left_meta.append(Paragraph("<b>Tax Summary:</b>", table_header_style))
        if "cgst" in tb and "sgst" in tb:
            left_meta.append(Paragraph(f"CGST: ₹{Decimal(str(tb.get('cgst', 0))):,.2f} &nbsp;|&nbsp; SGST: ₹{Decimal(str(tb.get('sgst', 0))):,.2f}", table_cell_style))
        elif "igst" in tb:
            left_meta.append(Paragraph(f"IGST: ₹{Decimal(str(tb.get('igst', 0))):,.2f}", table_cell_style))

    # Notes
    terms_text = invoice.terms_and_conditions or (tx.notes if tx else "")
    if terms_text:
        left_meta.append(Spacer(1, 2 * mm))
        left_meta.append(Paragraph(f"<b>Notes & Terms:</b> {safe_str(terms_text)}", store_meta_style))

    # Right Totals
    subtotal_val = tx.subtotal if tx else Decimal("0.00")
    discount_val = tx.discount if tx else Decimal("0.00")
    tax_val = tx.tax if tx else Decimal("0.00")
    total_val = tx.total if tx else Decimal("0.00")
    paid_val = tx.amount_paid if tx else total_val
    due_val = tx.outstanding_amount if tx else Decimal("0.00")

    totals_rows = [
        [Paragraph("Subtotal:", table_cell_style), Paragraph(f"₹{subtotal_val:,.2f}", table_cell_right)],
        [Paragraph("Discount:", table_cell_style), Paragraph(f"- ₹{discount_val:,.2f}", table_cell_right)],
        [Paragraph("Taxes (GST):", table_cell_style), Paragraph(f"₹{tax_val:,.2f}", table_cell_right)],
        [Paragraph("<b>Grand Total:</b>", table_cell_bold), Paragraph(f"<b>₹{total_val:,.2f}</b>", table_cell_bold_right)],
        [Paragraph("Amount Paid:", table_cell_style), Paragraph(f"₹{paid_val:,.2f}", table_cell_right)],
    ]
    if due_val > Decimal("0.00"):
        totals_rows.append([
            Paragraph("<b>Balance Due:</b>", ParagraphStyle("RedDue", parent=table_cell_bold, textColor=colors.HexColor("#dc2626"))),
            Paragraph(f"<b>₹{due_val:,.2f}</b>", ParagraphStyle("RedDueR", parent=table_cell_bold_right, textColor=colors.HexColor("#dc2626"))),
        ])

    totals_table = Table(totals_rows, colWidths=[40 * mm, 45 * mm])
    totals_table.setStyle(
        TableStyle([
            ("LINEABOVE", (0, 3), (-1, 3), 1, colors.HexColor("#111827")),
            ("LINEBELOW", (0, 3), (-1, 3), 1, colors.HexColor("#111827")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ])
    )

    summary_split_table = Table(
        [[left_meta, totals_table]],
        colWidths=[97 * mm, 85 * mm],
    )
    summary_split_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ])
    )

    story.append(KeepTogether([summary_split_table]))
    story.append(Spacer(1, 10 * mm))

    # 5. Bottom legal disclaimer
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb"), spaceBefore=2, spaceAfter=4))
    story.append(Paragraph("Thank you for your business! This is an authentic computer-generated Tax Invoice.", footer_text))

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
        fontSize=10,
        leading=12,
        alignment=1,
        textColor=colors.black,
    )
    t_meta = ParagraphStyle(
        "TMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        leading=9,
        alignment=1,
        textColor=colors.black,
    )
    t_row_l = ParagraphStyle(
        "TRowL",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.black,
    )
    t_row_r = ParagraphStyle(
        "TRowR",
        parent=t_row_l,
        alignment=2,
    )
    t_bold_l = ParagraphStyle(
        "TBoldL",
        parent=t_row_l,
        fontName="Helvetica-Bold",
    )
    t_bold_r = ParagraphStyle(
        "TBoldR",
        parent=t_row_r,
        fontName="Helvetica-Bold",
    )

    story = []

    org_name = safe_str(getattr(org, "name", "BillMeet Retail"))
    store_name = safe_str(getattr(store, "name", "") if store else "")
    gst_num = safe_str(getattr(org, "gst_number", "") or "")

    story.append(Paragraph(org_name, t_center))
    if store_name:
        story.append(Paragraph(store_name, t_meta))
    if gst_num:
        story.append(Paragraph(f"GSTIN: {gst_num}", t_meta))

    story.append(Spacer(1, 2 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.black, spaceBefore=1, spaceAfter=2))

    inv_num = safe_str(invoice.invoice_number)
    inv_date = tx.transaction_date.strftime("%d/%m/%Y %H:%M") if tx and tx.transaction_date else invoice.created_at.strftime("%d/%m/%Y %H:%M")
    cashier = safe_str(tx.cashier.get_full_name() or tx.cashier.email) if (tx and tx.cashier) else "Staff"

    story.append(Paragraph(f"Bill: #{inv_num} &nbsp;|&nbsp; {inv_date}", t_meta))
    story.append(Paragraph(f"Cashier: {cashier}", t_meta))
    if customer:
        story.append(Paragraph(f"Customer: {safe_str(customer.full_name)} ({safe_str(customer.phone)})", t_meta))

    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.black, spaceBefore=2, spaceAfter=2))

    # Thermal Item Rows
    item_rows = [
        [Paragraph("Item", t_bold_l), Paragraph("Qty", t_bold_r), Paragraph("Amt", t_bold_r)]
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
