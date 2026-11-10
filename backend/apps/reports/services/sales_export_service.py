import io
import logging
from datetime import datetime, time
from decimal import Decimal
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from django.utils import timezone

from apps.transactions.models import Transaction
from apps.billing.services.reports_service import ReportsService

logger = logging.getLogger(__name__)


class SalesExportService:
    """
    Excel Export Engine for Universal POS Sales Reports.
    Generates styled, professional .xlsx workbooks with executive KPI summaries,
    tax breakdowns, and itemized transaction sheets.
    """

    @classmethod
    def generate_sales_excel(
        cls,
        organization,
        start_date: str = None,
        end_date: str = None,
        period: str = None,
        payment_method: str = None,
        store_id: str = None,
    ) -> tuple[bytes, str]:
        """
        Generates an in-memory .xlsx workbook for the specified organization and filters.
        Returns: (file_bytes, filename)
        """
        # 1. Resolve date range
        start_dt, end_dt = ReportsService._parse_date_range(period or "this_month", start_date, end_date)
        start_str = start_dt.strftime("%Y-%m-%d")
        end_str = end_dt.strftime("%Y-%m-%d")

        # 2. Query transactions scoped strictly to tenant organization
        qs = Transaction.objects.filter(
            organization=organization,
            transaction_date__range=(start_dt, end_dt),
        ).select_related("customer", "store").prefetch_related("items", "payments").order_by("-transaction_date")

        if payment_method and payment_method.strip() and payment_method.lower() != "all":
            qs = qs.filter(payment_method__iexact=payment_method.strip())

        if store_id and store_id.strip() and store_id.lower() != "all":
            qs = qs.filter(store_id=store_id.strip())

        transactions = list(qs)

        # 3. Compute KPI aggregates
        total_transactions = len(transactions)
        total_subtotal = Decimal("0.00")
        total_discounts = Decimal("0.00")
        total_net_sales = Decimal("0.00")
        total_taxable_value = Decimal("0.00")
        total_cgst = Decimal("0.00")
        total_sgst = Decimal("0.00")
        total_igst = Decimal("0.00")
        total_tax_collected = Decimal("0.00")

        rows_data = []

        for tx in transactions:
            items = list(tx.items.all())
            it_cgst = sum(it.cgst_amount for it in items)
            it_sgst = sum(it.sgst_amount for it in items)
            it_igst = sum(it.igst_amount for it in items)
            it_tax = sum(it.tax for it in items)

            if items and (it_cgst > 0 or it_sgst > 0 or it_igst > 0):
                cgst = it_cgst
                sgst = it_sgst
                igst = it_igst
            elif isinstance(tx.tax_breakup, dict) and tx.tax_breakup:
                cgst = Decimal(str(tx.tax_breakup.get("cgst", 0)))
                sgst = Decimal(str(tx.tax_breakup.get("sgst", 0)))
                igst = Decimal(str(tx.tax_breakup.get("igst", 0)))
            elif tx.tax > Decimal("0.00"):
                half = (tx.tax / Decimal("2.00")).quantize(Decimal("0.01"))
                cgst = half
                sgst = tx.tax - half
                igst = Decimal("0.00")
            else:
                cgst = Decimal("0.00")
                sgst = Decimal("0.00")
                igst = Decimal("0.00")

            if items:
                taxable = sum(it.total - it.tax for it in items)
            else:
                taxable = max(Decimal("0.00"), tx.total - tx.tax - tx.round_off)

            total_subtotal += tx.subtotal
            total_discounts += tx.discount
            total_net_sales += tx.total
            total_taxable_value += taxable
            total_cgst += cgst
            total_sgst += sgst
            total_igst += igst
            total_tax_collected += tx.tax

            dt_str = tx.transaction_date.strftime("%Y-%m-%d %H:%M")
            customer_name = tx.customer.full_name if tx.customer else "Walk-in Customer"
            customer_phone = tx.customer.phone if (tx.customer and tx.customer.phone) else "-"
            method_str = (tx.payment_method or "CASH").upper()
            status_str = tx.status.capitalize() if tx.status else "Completed"

            rows_data.append({
                "date_time": dt_str,
                "invoice_number": tx.invoice_number,
                "customer_name": customer_name,
                "customer_phone": customer_phone,
                "payment_method": method_str,
                "subtotal": float(tx.subtotal),
                "discount": float(tx.discount),
                "taxable_amount": float(taxable),
                "cgst": float(cgst),
                "sgst": float(sgst),
                "igst": float(igst),
                "total_tax": float(tx.tax),
                "grand_total": float(tx.total),
                "status": status_str,
            })

        # 4. Create Workbook
        wb = openpyxl.Workbook()

        # Sheet 1: Sales Transactions (Details & Top Summary Header)
        ws_details = wb.active
        ws_details.title = "Sales Transactions"
        ws_details.views.sheetView[0].showGridLines = True

        # Styles
        navy_header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        card_label_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
        white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
        total_fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")

        white_bold_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        title_font = Font(name="Calibri", size=16, bold=True, color="0F172A")
        sub_title_font = Font(name="Calibri", size=10, bold=False, color="64748B")
        section_font = Font(name="Calibri", size=12, bold=True, color="1E293B")
        kpi_value_font = Font(name="Calibri", size=12, bold=True, color="0F172A")
        kpi_label_font = Font(name="Calibri", size=9, bold=True, color="475569")
        bold_font = Font(name="Calibri", size=11, bold=True, color="0F172A")
        regular_font = Font(name="Calibri", size=11, bold=False, color="0F172A")

        thin_side = Side(style="thin", color="CBD5E1")
        border_all = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
        double_bottom_side = Side(style="double", color="0F172A")
        total_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=double_bottom_side)

        center_align = Alignment(horizontal="center", vertical="center")
        left_align = Alignment(horizontal="left", vertical="center")
        right_align = Alignment(horizontal="right", vertical="center")

        org_name = getattr(organization, "name", "BillMeet Business")
        currency_sym = "₹"
        export_time = timezone.now().strftime("%Y-%m-%d %H:%M:%S")

        # --- A. SUMMARY HEADER ---
        ws_details["A1"] = f"{org_name} — Sales Report"
        ws_details["A1"].font = title_font
        ws_details["A1"].alignment = left_align

        ws_details["A2"] = (
            f"Period: {start_str} to {end_str}  |  Exported: {export_time}  |  Currency: {currency_sym} INR"
        )
        ws_details["A2"].font = sub_title_font
        ws_details["A2"].alignment = left_align

        # KPI Summary Cards Block (Row 4 & 5)
        kpi_cards = [
            ("TOTAL GROSS SALES", float(total_subtotal), "A", "B"),
            ("TOTAL DISCOUNTS", float(total_discounts), "C", "D"),
            ("TOTAL NET SALES", float(total_net_sales), "E", "F"),
            ("TOTAL TAX (GST)", float(total_tax_collected), "G", "H"),
            ("TOTAL TRANSACTIONS", total_transactions, "I", "J"),
        ]

        for label, val, start_col, end_col in kpi_cards:
            start_idx = openpyxl.utils.column_index_from_string(start_col)
            end_idx = openpyxl.utils.column_index_from_string(end_col)

            # Label row (Row 4)
            ws_details.merge_cells(start_row=4, start_column=start_idx, end_row=4, end_column=end_idx)
            cell_lbl = ws_details.cell(row=4, column=start_idx, value=label)
            cell_lbl.font = kpi_label_font
            cell_lbl.fill = card_label_fill
            cell_lbl.alignment = center_align

            # Value row (Row 5)
            ws_details.merge_cells(start_row=5, start_column=start_idx, end_row=5, end_column=end_idx)
            cell_val = ws_details.cell(row=5, column=start_idx, value=val)
            cell_val.font = kpi_value_font
            cell_val.alignment = center_align

            if label == "TOTAL TRANSACTIONS":
                cell_val.number_format = "#,##0"
            else:
                cell_val.number_format = f"\"{currency_sym}\" #,##0.00"

            for r in range(4, 6):
                for c in range(start_idx, end_idx + 1):
                    ws_details.cell(row=r, column=c).border = border_all

        # --- B. SALES TRANSACTIONS TABLE ---
        table_start_row = 7
        columns = [
            ("Date & Time", left_align, "@"),
            ("Invoice / Receipt Number", left_align, "@"),
            ("Customer Name", left_align, "@"),
            ("Customer Phone", left_align, "@"),
            ("Payment Method", center_align, "@"),
            ("Subtotal", right_align, "#,##0.00"),
            ("Discount Amount", right_align, "#,##0.00"),
            ("Taxable Amount", right_align, "#,##0.00"),
            ("CGST", right_align, "#,##0.00"),
            ("SGST", right_align, "#,##0.00"),
            ("IGST", right_align, "#,##0.00"),
            ("Total Tax", right_align, "#,##0.00"),
            ("Grand Total", right_align, "#,##0.00"),
            ("Status", center_align, "@"),
        ]

        # Write Table Header
        for col_idx, (col_name, align, _) in enumerate(columns, start=1):
            cell = ws_details.cell(row=table_start_row, column=col_idx, value=col_name)
            cell.font = white_bold_font
            cell.fill = navy_header_fill
            cell.alignment = center_align
            cell.border = border_all
        ws_details.row_dimensions[table_start_row].height = 26

        # Write Data Rows
        current_row = table_start_row + 1
        for idx, row in enumerate(rows_data):
            row_fill = zebra_fill if idx % 2 == 1 else white_fill
            row_values = [
                row["date_time"],
                row["invoice_number"],
                row["customer_name"],
                row["customer_phone"],
                row["payment_method"],
                row["subtotal"],
                row["discount"],
                row["taxable_amount"],
                row["cgst"],
                row["sgst"],
                row["igst"],
                row["total_tax"],
                row["grand_total"],
                row["status"],
            ]

            for col_idx, (val, (_, align, num_fmt)) in enumerate(zip(row_values, columns), start=1):
                cell = ws_details.cell(row=current_row, column=col_idx, value=val)
                cell.font = regular_font
                cell.fill = row_fill
                cell.alignment = align
                cell.border = border_all
                if num_fmt != "@":
                    cell.number_format = num_fmt

            ws_details.row_dimensions[current_row].height = 20
            current_row += 1

        # Summary / Total Row at the bottom of the table
        total_row = current_row
        ws_details.cell(row=total_row, column=1, value="TOTAL")
        ws_details.cell(row=total_row, column=1).font = bold_font
        ws_details.cell(row=total_row, column=1).alignment = center_align

        # Leave non-numeric columns with total_fill
        for c_idx in range(1, 6):
            cell = ws_details.cell(row=total_row, column=c_idx)
            cell.fill = total_fill
            cell.border = total_border
            cell.font = bold_font

        total_values = {
            6: float(total_subtotal),
            7: float(total_discounts),
            8: float(total_taxable_value),
            9: float(total_cgst),
            10: float(total_sgst),
            11: float(total_igst),
            12: float(total_tax_collected),
            13: float(total_net_sales),
        }

        for c_idx, val in total_values.items():
            cell = ws_details.cell(row=total_row, column=c_idx, value=val)
            cell.font = bold_font
            cell.fill = total_fill
            cell.alignment = right_align
            cell.border = total_border
            cell.number_format = "#,##0.00"

        # Status cell in total row
        cell_status = ws_details.cell(row=total_row, column=14, value="")
        cell_status.fill = total_fill
        cell_status.border = total_border

        ws_details.row_dimensions[total_row].height = 24

        # Auto-fit column widths with padding
        for col_idx in range(1, len(columns) + 1):
            col_letter = get_column_letter(col_idx)
            max_len = 0
            for r in range(table_start_row, total_row + 1):
                val_str = str(ws_details.cell(row=r, column=col_idx).value or "")
                if len(val_str) > max_len:
                    max_len = len(val_str)
            ws_details.column_dimensions[col_letter].width = max(max_len + 4, 14)

        # Ensure first columns have comfortable width
        ws_details.column_dimensions["A"].width = 19  # Date & Time
        ws_details.column_dimensions["B"].width = 22  # Invoice #
        ws_details.column_dimensions["C"].width = 24  # Customer Name
        ws_details.column_dimensions["D"].width = 16  # Phone

        # Save workbook to memory buffer
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        file_bytes = buffer.getvalue()

        filename = f"sales_report_{start_str}_to_{end_str}.xlsx"
        return file_bytes, filename
