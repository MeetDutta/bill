import logging
import os
from decimal import Decimal
from django.conf import settings

logger = logging.getLogger(__name__)


def generate_invoice_pdf(invoice) -> str:
    """
    Renders and saves a PDF invoice for the given Invoice model instance.
    Returns the media URL of the saved PDF or empty string if generation failed.
    """
    tx = invoice.transaction
    org = invoice.organization
    store = tx.store
    customer = tx.customer

    # Create directory if needed
    invoices_dir = os.path.join(settings.MEDIA_ROOT, "invoices")
    os.makedirs(invoices_dir, exist_ok=True)
    pdf_filename = f"{invoice.invoice_number}.pdf"
    pdf_filepath = os.path.join(invoices_dir, pdf_filename)

    items = tx.items.all()
    items_html = ""
    for item in items:
        name = item.name or (item.product.name if item.product else "Item")
        hsn = item.hsn_code or "-"
        qty = item.quantity
        price = item.unit_price
        disc = item.discount
        tax = item.tax
        tot = item.total
        items_html += f"""
        <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">{name}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">{hsn}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">{qty}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">₹{price:,.2f}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">₹{disc:,.2f}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">₹{tax:,.2f}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">₹{tot:,.2f}</td>
        </tr>
        """

    cust_name = customer.full_name if customer else "Walk-in Customer"
    cust_phone = customer.phone if customer else "-"
    gst_num = getattr(org, "gst_number", "") or "-"
    payment_method = tx.payment_method or "Cash / UPI"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Tax Invoice - {invoice.invoice_number}</title>
    <style>
        body {{
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1f2937;
            margin: 0;
            padding: 30px;
            font-size: 13px;
            line-height: 1.5;
        }}
        .header {{
            display: flex;
            justify-content: space-between;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }}
        .company-title {{
            font-size: 20px;
            font-weight: bold;
            color: #111827;
        }}
        .badge {{
            display: inline-block;
            background: #dbeafe;
            color: #1e40af;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }}
        th {{
            background: #f3f4f6;
            color: #374151;
            font-weight: 600;
            padding: 10px 12px;
            text-align: left;
            font-size: 12px;
            border-bottom: 1px solid #d1d5db;
        }}
        .totals-table td {{
            padding: 6px 12px;
        }}
        .grand-total {{
            font-size: 16px;
            font-weight: bold;
            color: #2563eb;
            border-top: 2px solid #e5e7eb;
        }}
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="company-title">{org.name}</div>
            <div style="color: #4b5563;">{store.name}</div>
            <div style="color: #6b7280; font-size: 11px;">{store.address_line1 or ''} {store.city or ''} {store.state or ''}</div>
            <div style="color: #6b7280; font-size: 11px;">GSTIN: {gst_num}</div>
        </div>
        <div style="text-align: right;">
            <span class="badge">TAX INVOICE</span>
            <div style="font-weight: bold; margin-top: 6px;">#{invoice.invoice_number}</div>
            <div style="color: #6b7280; font-size: 11px;">Date: {tx.transaction_date.strftime('%d %b %Y %H:%M')}</div>
            <div style="color: #6b7280; font-size: 11px;">Payment: {payment_method}</div>
        </div>
    </div>

    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; margin-bottom: 20px;">
        <strong style="color: #374151;">Billed To:</strong><br>
        <span>{cust_name}</span> &nbsp;|&nbsp; <span>Phone: {cust_phone}</span>
    </div>

    <table>
        <thead>
            <tr>
                <th>Item Details</th>
                <th style="text-align: center;">HSN</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Rate</th>
                <th style="text-align: right;">Discount</th>
                <th style="text-align: right;">Tax</th>
                <th style="text-align: right;">Amount</th>
            </tr>
        </thead>
        <tbody>
            {items_html}
        </tbody>
    </table>

    <table class="totals-table" style="width: 45%; margin-left: auto;">
        <tr>
            <td style="color: #4b5563;">Subtotal:</td>
            <td style="text-align: right;">₹{tx.subtotal:,.2f}</td>
        </tr>
        <tr>
            <td style="color: #4b5563;">Discount:</td>
            <td style="text-align: right; color: #16a34a;">- ₹{tx.discount:,.2f}</td>
        </tr>
        <tr>
            <td style="color: #4b5563;">Taxes (GST):</td>
            <td style="text-align: right;">₹{tx.tax:,.2f}</td>
        </tr>
        <tr class="grand-total">
            <td>Grand Total:</td>
            <td style="text-align: right;">₹{tx.total:,.2f}</td>
        </tr>
    </table>

    <div style="margin-top: 40px; text-align: center; color: #9ca3af; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
        Thank you for your business! This is a computer-generated tax invoice.
    </div>
</body>
</html>
"""

    try:
        from weasyprint import HTML
        HTML(string=html_content).write_pdf(pdf_filepath)
        pdf_url = f"{settings.MEDIA_URL}invoices/{pdf_filename}"
        return pdf_url
    except Exception as e:
        logger.warning(f"WeasyPrint PDF generation unavailable or failed: {e}. Saving HTML fallback.")
        html_filepath = os.path.join(invoices_dir, f"{invoice.invoice_number}.html")
        with open(html_filepath, "w", encoding="utf-8") as f:
            f.write(html_content)
        return f"{settings.MEDIA_URL}invoices/{invoice.invoice_number}.html"
