import re
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, time
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

from django.db import transaction as db_transaction
from django.db.models import Sum, Q
from django.utils import timezone

from apps.transactions.models import Transaction, TransactionItem, TransactionPayment, SalesReturn
from apps.customers.models import Customer
from apps.billing.models import TallyLedgerConfig, TallyExportLog, BusinessConfig

logger = logging.getLogger(__name__)

INDIAN_GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")

GST_STATE_CODES = {
    "01": "JAMMU AND KASHMIR",
    "02": "HIMACHAL PRADESH",
    "03": "PUNJAB",
    "04": "CHANDIGARH",
    "05": "UTTARAKHAND",
    "06": "HARYANA",
    "07": "DELHI",
    "08": "RAJASTHAN",
    "09": "UTTAR PRADESH",
    "10": "BIHAR",
    "11": "SIKKIM",
    "12": "ARUNACHAL PRADESH",
    "13": "NAGALAND",
    "14": "MANIPUR",
    "15": "MIZORAM",
    "16": "TRIPURA",
    "17": "MEGHALAYA",
    "18": "ASSAM",
    "19": "WEST BENGAL",
    "20": "JHARKHAND",
    "21": "ODISHA",
    "22": "CHHATTISGARH",
    "23": "MADHYA PRADESH",
    "24": "GUJARAT",
    "26": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
    "27": "MAHARASHTRA",
    "29": "KARNATAKA",
    "30": "GOA",
    "31": "LAKSHADWEEP",
    "32": "KERALA",
    "33": "TAMIL NADU",
    "34": "PUDUCHERRY",
    "35": "ANDAMAN AND NICOBAR ISLANDS",
    "36": "TELANGANA",
    "37": "ANDHRA PRADESH",
    "38": "LADAKH",
    "97": "OTHER TERRITORY",
}

STATUTORY_DISCLAIMER = (
    "Notice: This XML export is generated for internal accounting data transfer to Tally ERP/TallyPrime "
    "and does not constitute a statutory GST return (GSTR-1, GSTR-3B) or tax audit clearance. "
    "Tax liability and compliance must be reviewed by an authorized tax practitioner."
)


def round_cur(val: Decimal) -> Decimal:
    if val is None:
        return Decimal("0.00")
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class TallyExportService:
    """
    Indian GST-Aware Tally Accounting Export Engine.
    Generates balanced Tally-compatible XML vouchers for Sales, Receipts, and Credit Notes
    with place-of-supply validation, ledger mapping, and export tracking.
    """

    @classmethod
    def get_or_create_config(cls, organization) -> TallyLedgerConfig:
        config, _ = TallyLedgerConfig.objects.get_or_create(
            organization=organization,
            defaults={
                "company_name": organization.legal_name or organization.name,
                "sales_ledger": "Sales Account",
                "cgst_ledger": "Output CGST",
                "sgst_ledger": "Output SGST",
                "igst_ledger": "Output IGST",
                "cash_ledger": "Cash",
                "bank_ledger": "Bank Account",
                "upi_ledger": "UPI Collections",
                "card_ledger": "Card Collections",
                "debtor_ledger": "Sundry Debtors",
                "discount_ledger": "Discount Allowed",
                "round_off_ledger": "Round Off",
                "credit_note_ledger": "Sales Returns",
                "include_inventory_details": True,
            },
        )
        return config

    @classmethod
    def normalize_state(cls, state_val: str, gstin_val: str = None) -> tuple[str, str]:
        """
        Returns (state_code, state_name).
        """
        # Try gstin first if 15 chars
        if gstin_val and len(gstin_val) >= 2:
            code = gstin_val[:2]
            if code in GST_STATE_CODES:
                return code, GST_STATE_CODES[code]

        if not state_val:
            return "", ""

        clean = state_val.strip().upper()
        # Direct code match
        if clean in GST_STATE_CODES:
            return clean, GST_STATE_CODES[clean]

        # Match name
        for code, name in GST_STATE_CODES.items():
            if clean in name or name in clean:
                return code, name

        return "", clean

    @classmethod
    def resolve_seller_state(cls, store, organization) -> tuple[str, str, str]:
        """
        Returns (seller_code, seller_name, seller_gstin).
        """
        seller_gstin = (getattr(organization, "gst_number", "") or "").strip().upper()
        store_state = getattr(store, "state", "") if store else ""
        org_state = getattr(organization, "state", "")

        state_str = store_state or org_state
        code, name = cls.normalize_state(state_str, seller_gstin)
        return code, name, seller_gstin

    @classmethod
    def resolve_buyer_details(cls, customer, seller_code: str, seller_name: str) -> tuple[str, str, str, str, bool]:
        """
        Returns (buyer_name, place_of_supply, buyer_gstin, party_ledger, is_interstate).
        """
        if not customer or customer.is_walk_in:
            return "Cash Customer", seller_name or "Local", "", "Cash", False

        buyer_name = customer.full_name or "Customer"
        buyer_gstin = getattr(customer, "gstin", "") or ""
        buyer_gstin = buyer_gstin.strip().upper()

        code, name = cls.normalize_state(customer.state, buyer_gstin)

        if not code and not name:
            # Local walk-in / unregistered retail customer default to seller state
            code, name = seller_code, seller_name

        place_of_supply = name or seller_name or "Local"
        is_interstate = bool(seller_code and code and seller_code != code)
        party_ledger = buyer_name

        return buyer_name, place_of_supply, buyer_gstin, party_ledger, is_interstate

    @classmethod
    def get_payment_ledger(cls, method: str, ledger_config: TallyLedgerConfig) -> str:
        m = (method or "cash").strip().lower()
        if m in ["cash", "cod"]:
            return ledger_config.cash_ledger
        elif m in ["bank", "bank_transfer", "netbanking", "cheque", "neft", "rtgs", "imps"]:
            return ledger_config.bank_ledger
        elif m in ["upi", "qr", "wallet", "phonepe", "paytm", "gpay"]:
            return ledger_config.upi_ledger
        elif m in ["card", "credit_card", "debit_card", "pos"]:
            return ledger_config.card_ledger
        return ledger_config.cash_ledger

    @classmethod
    def validate_and_preview(
        cls,
        organization,
        store_id: str = None,
        period: str = "today",
        start_date: str = None,
        end_date: str = None,
        include_previously_exported: bool = False,
    ) -> dict:
        """
        Audits and previews accounting vouchers, GST calculations, and ledger mappings.
        Flags incomplete or invalid data and blocks export if mandatory information is invalid.
        """
        from .reports_service import ReportsService
        start_dt, end_dt = ReportsService._parse_date_range(period, start_date, end_date)
        ledger_config = cls.get_or_create_config(organization)
        biz_config = BusinessConfig.objects.filter(organization=organization).first()
        gst_enabled = biz_config.gst_enabled if biz_config else True

        # Query sales transactions
        tx_qs = Transaction.objects.filter(
            organization=organization,
            transaction_date__range=(start_dt, end_dt),
        ).select_related("customer", "store").prefetch_related("items", "payments")

        if store_id:
            tx_qs = tx_qs.filter(store_id=store_id)
        if not include_previously_exported:
            tx_qs = tx_qs.filter(tally_exported_at__isnull=True)

        # Query sales returns
        return_qs = SalesReturn.objects.filter(
            organization=organization,
            created_at__range=(start_dt, end_dt),
            status="completed",
        ).select_related("customer", "store", "original_transaction").prefetch_related("items")

        if store_id:
            return_qs = return_qs.filter(store_id=store_id)
        if not include_previously_exported:
            return_qs = return_qs.filter(tally_exported_at__isnull=True)

        blocking_errors = []
        warnings = []

        # Validate seller details
        store_sample = tx_qs.first().store if tx_qs.exists() else None
        seller_code, seller_name, seller_gstin = cls.resolve_seller_state(store_sample, organization)

        if gst_enabled:
            if not seller_gstin:
                warnings.append("Organization GSTIN is empty. Inter-state & B2B GST transactions require a valid seller GSTIN.")
            elif not INDIAN_GSTIN_REGEX.match(seller_gstin):
                warnings.append(f"Organization GSTIN '{seller_gstin}' does not match standard 15-character Indian GST format.")

            if not seller_name:
                warnings.append("Store or Organization State is not specified. Defaults to local intra-state place of supply.")

        # Validate mandatory ledger mappings
        mandatory_ledgers = [
            ("Sales Ledger", ledger_config.sales_ledger),
            ("CGST Ledger", ledger_config.cgst_ledger),
            ("SGST Ledger", ledger_config.sgst_ledger),
            ("IGST Ledger", ledger_config.igst_ledger),
            ("Cash Ledger", ledger_config.cash_ledger),
            ("Bank Ledger", ledger_config.bank_ledger),
            ("UPI Ledger", ledger_config.upi_ledger),
            ("Card Ledger", ledger_config.card_ledger),
            ("Debtor Ledger", ledger_config.debtor_ledger),
            ("Discount Ledger", ledger_config.discount_ledger),
            ("Round Off Ledger", ledger_config.round_off_ledger),
        ]
        for label, val in mandatory_ledgers:
            if not val or not val.strip():
                blocking_errors.append(f"Mandatory ledger '{label}' is not mapped.")

        # Aggregations
        sales_count = 0
        receipt_count = 0
        credit_notes_count = return_qs.count()

        total_taxable_value = Decimal("0.00")
        total_cgst = Decimal("0.00")
        total_sgst = Decimal("0.00")
        total_igst = Decimal("0.00")
        total_invoice_value = Decimal("0.00")
        total_recorded_payments = Decimal("0.00")
        outstanding_receivables = Decimal("0.00")
        total_refund_amount = Decimal("0.00")

        intra_state_sales = Decimal("0.00")
        inter_state_sales = Decimal("0.00")
        exempt_sales = Decimal("0.00")

        for ret in return_qs:
            total_refund_amount += round_cur(ret.total_refund_amount)

        for tx in tx_qs:
            sales_count += 1
            inv_total = round_cur(tx.total)
            total_invoice_value += inv_total
            total_recorded_payments += round_cur(tx.amount_paid)
            outstanding_receivables += round_cur(tx.outstanding_amount)

            # Check buyer & state
            buyer_name, place_of_supply, buyer_gstin, party_ledger, is_interstate = cls.resolve_buyer_details(
                tx.customer, seller_code, seller_name
            )

            if buyer_gstin and not INDIAN_GSTIN_REGEX.match(buyer_gstin):
                warnings.append(f"Invoice #{tx.invoice_number}: Customer GSTIN '{buyer_gstin}' is invalid.")

            # Line items tax analysis
            tx_taxable = Decimal("0.00")
            tx_cgst = Decimal("0.00")
            tx_sgst = Decimal("0.00")
            tx_igst = Decimal("0.00")
            has_tax = False

            for item in tx.items.all():
                item_tax = round_cur(item.tax)
                cgst = round_cur(item.cgst_amount)
                sgst = round_cur(item.sgst_amount)
                igst = round_cur(item.igst_amount)
                item_rate = round_cur(item.tax_rate)
                taxable = round_cur(item.total - item_tax)

                tx_taxable += taxable
                tx_cgst += cgst
                tx_sgst += sgst
                tx_igst += igst

                if item_tax > Decimal("0.00"):
                    has_tax = True

                if item_rate > Decimal("0.00") and not item.hsn_code:
                    warnings.append(f"Invoice #{tx.invoice_number}: Item '{item.name}' ({item_rate}%) is missing HSN/SAC code.")

            # Reconcile invoice subtotal & tax
            gross_sales = round_cur(tx.subtotal) if tx.subtotal > Decimal("0.00") else (tx_taxable + round_cur(tx.discount))
            tx_net_taxable = round_cur(gross_sales - round_cur(tx.discount))

            total_taxable_value += tx_net_taxable
            total_cgst += tx_cgst
            total_sgst += tx_sgst
            total_igst += tx_igst

            # Place of supply consistency check
            if tx_igst > Decimal("0.00"):
                inter_state_sales += inv_total
                if not is_interstate and seller_code:
                    warnings.append(
                        f"Invoice #{tx.invoice_number}: Charged IGST (₹{tx_igst}) but seller and customer appear intra-state."
                    )
            elif tx_cgst > Decimal("0.00") or tx_sgst > Decimal("0.00"):
                intra_state_sales += inv_total
                if is_interstate:
                    warnings.append(
                        f"Invoice #{tx.invoice_number}: Charged CGST/SGST but customer place of supply is inter-state ({place_of_supply})."
                    )
            else:
                exempt_sales += inv_total

            # Check voucher double-entry reconciliation:
            # Debit: Party (tx.total) + Discount (tx.discount)
            # Credit: Sales (gross_sales) + CGST + SGST + IGST + RoundOff
            calc_credit = gross_sales + tx_cgst + tx_sgst + tx_igst - round_cur(tx.discount) + round_cur(tx.round_off)
            diff = abs(inv_total - calc_credit)
            if diff > Decimal("0.05"):
                blocking_errors.append(
                    f"Invoice #{tx.invoice_number} fails double-entry balance check: Total ₹{inv_total} vs Calculated ₹{calc_credit}."
                )

            # Receipt count
            if tx.amount_paid > Decimal("0.00"):
                receipt_count += max(1, tx.payments.count())

        can_export = len(blocking_errors) == 0

        # Deduplicate warnings
        unique_warnings = list(dict.fromkeys(warnings))[:25]

        return {
            "period": period,
            "start_date": start_dt.isoformat(),
            "end_date": end_dt.isoformat(),
            "summary": {
                "sales_vouchers_count": sales_count,
                "receipt_vouchers_count": receipt_count,
                "credit_notes_count": credit_notes_count,
                "total_taxable_value": str(total_taxable_value),
                "total_cgst": str(total_cgst),
                "total_sgst": str(total_sgst),
                "total_igst": str(total_igst),
                "total_tax": str(total_cgst + total_sgst + total_igst),
                "total_invoice_value": str(total_invoice_value),
                "total_recorded_payments": str(total_recorded_payments),
                "outstanding_receivables": str(outstanding_receivables),
                "total_refund_amount": str(total_refund_amount),
            },
            "gst_breakdown": {
                "intra_state_sales": str(intra_state_sales),
                "inter_state_sales": str(inter_state_sales),
                "exempt_zero_rated_sales": str(exempt_sales),
                "seller_state": seller_name or "Not configured",
                "seller_gstin": seller_gstin or "Not configured",
            },
            "ledger_mapping": {
                "sales_ledger": ledger_config.sales_ledger,
                "cgst_ledger": ledger_config.cgst_ledger,
                "sgst_ledger": ledger_config.sgst_ledger,
                "igst_ledger": ledger_config.igst_ledger,
                "cash_ledger": ledger_config.cash_ledger,
                "bank_ledger": ledger_config.bank_ledger,
                "upi_ledger": ledger_config.upi_ledger,
                "card_ledger": ledger_config.card_ledger,
                "debtor_ledger": ledger_config.debtor_ledger,
                "discount_ledger": ledger_config.discount_ledger,
                "round_off_ledger": ledger_config.round_off_ledger,
                "credit_note_ledger": ledger_config.credit_note_ledger,
            },
            "validation": {
                "is_valid": can_export,
                "can_export": can_export,
                "blocking_errors": blocking_errors,
                "warnings": unique_warnings,
            },
            "disclaimer": STATUTORY_DISCLAIMER,
        }

    @classmethod
    def generate_tally_xml(
        cls,
        organization,
        user=None,
        store_id: str = None,
        period: str = "today",
        start_date: str = None,
        end_date: str = None,
        include_previously_exported: bool = False,
    ) -> tuple[str, str, dict]:
        """
        Generates full Tally-compatible XML voucher envelope.
        Returns (xml_content, filename, summary_dict).
        """
        from .reports_service import ReportsService
        start_dt, end_dt = ReportsService._parse_date_range(period, start_date, end_date)
        ledger_config = cls.get_or_create_config(organization)

        # 1. Run audit and preview first
        preview = cls.validate_and_preview(
            organization=organization,
            store_id=store_id,
            period=period,
            start_date=start_date,
            end_date=end_date,
            include_previously_exported=include_previously_exported,
        )

        if not preview["validation"]["can_export"]:
            err_msg = "; ".join(preview["validation"]["blocking_errors"][:3])
            raise ValueError(f"Export blocked by accounting validation errors: {err_msg}")

        # Query records
        tx_qs = Transaction.objects.filter(
            organization=organization,
            transaction_date__range=(start_dt, end_dt),
        ).select_related("customer", "store").prefetch_related("items", "payments")

        if store_id:
            tx_qs = tx_qs.filter(store_id=store_id)
        if not include_previously_exported:
            tx_qs = tx_qs.filter(tally_exported_at__isnull=True)

        return_qs = SalesReturn.objects.filter(
            organization=organization,
            created_at__range=(start_dt, end_dt),
            status="completed",
        ).select_related("customer", "store", "original_transaction").prefetch_related("items")

        if store_id:
            return_qs = return_qs.filter(store_id=store_id)
        if not include_previously_exported:
            return_qs = return_qs.filter(tally_exported_at__isnull=True)

        company_name = ledger_config.company_name or organization.legal_name or organization.name
        store_sample = tx_qs.first().store if tx_qs.exists() else None
        seller_code, seller_name, seller_gstin = cls.resolve_seller_state(store_sample, organization)

        xml_lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<ENVELOPE>',
            '  <HEADER>',
            '    <TALLYREQUEST>Import Data</TALLYREQUEST>',
            '  </HEADER>',
            '  <BODY>',
            '    <IMPORTDATA>',
            '      <REQUESTDESC>',
            '        <REPORTNAME>Vouchers</REPORTNAME>',
            '        <STATICVARIABLES>',
            f'          <SVCURRENTCOMPANY>{escape(company_name)}</SVCURRENTCOMPANY>',
            '        </STATICVARIABLES>',
            '      </REQUESTDESC>',
            '      <REQUESTDATA>',
        ]

        tx_ids_exported = []

        # --- A. SALES VOUCHERS ---
        for tx in tx_qs.order_by("transaction_date"):
            tx_ids_exported.append(str(tx.id))
            date_str = tx.transaction_date.strftime("%Y%m%d")
            inv_total = round_cur(tx.total)
            subtotal = round_cur(tx.subtotal)
            discount = round_cur(tx.discount)
            round_off = round_cur(tx.round_off)

            buyer_name, place_of_supply, buyer_gstin, party_ledger, is_interstate = cls.resolve_buyer_details(
                tx.customer, seller_code, seller_name
            )

            # Aggregate taxes from items
            tx_taxable = Decimal("0.00")
            tx_cgst = Decimal("0.00")
            tx_sgst = Decimal("0.00")
            tx_igst = Decimal("0.00")

            for it in tx.items.all():
                it_tax = round_cur(it.tax)
                tx_taxable += round_cur(it.total - it_tax)
                tx_cgst += round_cur(it.cgst_amount)
                tx_sgst += round_cur(it.sgst_amount)
                tx_igst += round_cur(it.igst_amount)

            gross_sales = round_cur(tx.subtotal) if tx.subtotal > Decimal("0.00") else (tx_taxable + discount)

            narration = f"POS Sale Invoice #{tx.invoice_number} | Mode: {(tx.payment_method or 'CASH').upper()}"

            xml_lines.append('        <TALLYMESSAGE xmlns:UDF="TallyUDF">')
            xml_lines.append('          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">')
            xml_lines.append(f'            <DATE>{date_str}</DATE>')
            xml_lines.append(f'            <EFFECTIVEDATE>{date_str}</EFFECTIVEDATE>')
            xml_lines.append(f'            <GUID>{tx.id}</GUID>')
            xml_lines.append('            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>')
            xml_lines.append(f'            <VOUCHERNUMBER>{escape(tx.invoice_number)}</VOUCHERNUMBER>')
            xml_lines.append(f'            <REFERENCE>{escape(tx.invoice_number)}</REFERENCE>')
            xml_lines.append(f'            <PARTYLEDGERNAME>{escape(party_ledger)}</PARTYLEDGERNAME>')
            xml_lines.append(f'            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>')
            xml_lines.append(f'            <BASICBUYERNAME>{escape(buyer_name)}</BASICBUYERNAME>')
            xml_lines.append(f'            <PLACEOFSUPPLY>{escape(place_of_supply)}</PLACEOFSUPPLY>')
            if buyer_gstin:
                xml_lines.append(f'            <PARTYGSTIN>{escape(buyer_gstin)}</PARTYGSTIN>')
            xml_lines.append(f'            <NARRATION>{escape(narration)}</NARRATION>')

            # 1. Debit Party Ledger (Debit amount is negative in Tally XML)
            xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
            xml_lines.append(f'              <LEDGERNAME>{escape(party_ledger)}</LEDGERNAME>')
            xml_lines.append('              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>')
            xml_lines.append(f'              <AMOUNT>-{inv_total:.2f}</AMOUNT>')
            xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

            # 2. Credit Sales Ledger
            xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
            xml_lines.append(f'              <LEDGERNAME>{escape(ledger_config.sales_ledger)}</LEDGERNAME>')
            xml_lines.append('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>')
            xml_lines.append(f'              <AMOUNT>{gross_sales:.2f}</AMOUNT>')
            xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

            # 3. Credit CGST (if applicable)
            if tx_cgst > Decimal("0.00"):
                xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
                xml_lines.append(f'              <LEDGERNAME>{escape(ledger_config.cgst_ledger)}</LEDGERNAME>')
                xml_lines.append('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>')
                xml_lines.append(f'              <AMOUNT>{tx_cgst:.2f}</AMOUNT>')
                xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

            # 4. Credit SGST (if applicable)
            if tx_sgst > Decimal("0.00"):
                xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
                xml_lines.append(f'              <LEDGERNAME>{escape(ledger_config.sgst_ledger)}</LEDGERNAME>')
                xml_lines.append('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>')
                xml_lines.append(f'              <AMOUNT>{tx_sgst:.2f}</AMOUNT>')
                xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

            # 5. Credit IGST (if applicable)
            if tx_igst > Decimal("0.00"):
                xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
                xml_lines.append(f'              <LEDGERNAME>{escape(ledger_config.igst_ledger)}</LEDGERNAME>')
                xml_lines.append('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>')
                xml_lines.append(f'              <AMOUNT>{tx_igst:.2f}</AMOUNT>')
                xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

            # 6. Debit Discount Allowed (if discount > 0)
            if discount > Decimal("0.00"):
                xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
                xml_lines.append(f'              <LEDGERNAME>{escape(ledger_config.discount_ledger)}</LEDGERNAME>')
                xml_lines.append('              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>')
                xml_lines.append(f'              <AMOUNT>-{discount:.2f}</AMOUNT>')
                xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

            # 7. Round off entry (if round_off != 0)
            if round_off != Decimal("0.00"):
                is_pos = "No" if round_off > Decimal("0.00") else "Yes"
                amt_str = f"{round_off:.2f}" if round_off > Decimal("0.00") else f"-{abs(round_off):.2f}"
                xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
                xml_lines.append(f'              <LEDGERNAME>{escape(ledger_config.round_off_ledger)}</LEDGERNAME>')
                xml_lines.append(f'              <ISDEEMEDPOSITIVE>{is_pos}</ISDEEMEDPOSITIVE>')
                xml_lines.append(f'              <AMOUNT>{amt_str}</AMOUNT>')
                xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

            # 8. Optional Item / Inventory details
            if ledger_config.include_inventory_details:
                for it in tx.items.all():
                    it_qty = round_cur(it.quantity)
                    it_rate = round_cur(it.unit_price)
                    it_tot = round_cur(it.total)
                    xml_lines.append('            <ALLINVENTORYENTRIES.LIST>')
                    xml_lines.append(f'              <STOCKITEMNAME>{escape(it.name)}</STOCKITEMNAME>')
                    xml_lines.append('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>')
                    xml_lines.append(f'              <RATE>{it_rate:.2f}</RATE>')
                    xml_lines.append(f'              <ACTUALQTY>{it_qty}</ACTUALQTY>')
                    xml_lines.append(f'              <BILLEDQTY>{it_qty}</BILLEDQTY>')
                    xml_lines.append(f'              <AMOUNT>{it_tot:.2f}</AMOUNT>')
                    if it.hsn_code:
                        xml_lines.append(f'              <HSNCODE>{escape(it.hsn_code)}</HSNCODE>')
                    xml_lines.append('            </ALLINVENTORYENTRIES.LIST>')

            xml_lines.append('          </VOUCHER>')
            xml_lines.append('        </TALLYMESSAGE>')

            # --- B. RECEIPT VOUCHERS FOR RECORDED PAYMENTS ---
            if tx.amount_paid > Decimal("0.00"):
                payments = list(tx.payments.all())
                if not payments:
                    # Create default payment row from tx summary
                    payments = [{
                        "payment_method": tx.payment_method or "cash",
                        "amount": tx.amount_paid,
                        "reference": tx.payment_reference,
                    }]

                for p_idx, p in enumerate(payments, start=1):
                    p_amt = round_cur(p.amount if hasattr(p, "amount") else p["amount"])
                    p_method = p.payment_method if hasattr(p, "payment_method") else p["payment_method"]
                    p_ref = p.reference if hasattr(p, "reference") else p.get("reference", "")
                    target_bank_cash = cls.get_payment_ledger(p_method, ledger_config)

                    rec_num = f"REC-{tx.invoice_number}-{p_idx}"
                    rec_narr = f"Receipt against Invoice #{tx.invoice_number} via {p_method.upper()}"
                    if p_ref:
                        rec_narr += f" (Ref: {p_ref})"

                    xml_lines.append('        <TALLYMESSAGE xmlns:UDF="TallyUDF">')
                    xml_lines.append('          <VOUCHER VCHTYPE="Receipt" ACTION="Create">')
                    xml_lines.append(f'            <DATE>{date_str}</DATE>')
                    xml_lines.append(f'            <EFFECTIVEDATE>{date_str}</EFFECTIVEDATE>')
                    xml_lines.append(f'            <GUID>{tx.id}-REC-{p_idx}</GUID>')
                    xml_lines.append('            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>')
                    xml_lines.append(f'            <VOUCHERNUMBER>{escape(rec_num)}</VOUCHERNUMBER>')
                    xml_lines.append(f'            <PARTYLEDGERNAME>{escape(party_ledger)}</PARTYLEDGERNAME>')
                    xml_lines.append(f'            <NARRATION>{escape(rec_narr)}</NARRATION>')

                    # Debit: Cash / Bank Account (Debit is negative amount)
                    xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
                    xml_lines.append(f'              <LEDGERNAME>{escape(target_bank_cash)}</LEDGERNAME>')
                    xml_lines.append('              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>')
                    xml_lines.append(f'              <AMOUNT>-{p_amt:.2f}</AMOUNT>')
                    xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

                    # Credit: Party / Debtor Ledger (Credit is positive amount)
                    xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
                    xml_lines.append(f'              <LEDGERNAME>{escape(party_ledger)}</LEDGERNAME>')
                    xml_lines.append('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>')
                    xml_lines.append(f'              <AMOUNT>{p_amt:.2f}</AMOUNT>')
                    xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

                    xml_lines.append('          </VOUCHER>')
                    xml_lines.append('        </TALLYMESSAGE>')

        # --- C. CREDIT NOTES / REFUNDS ---
        for ret in return_qs.order_by("created_at"):
            ret_date = ret.created_at.strftime("%Y%m%d")
            refund_amt = round_cur(ret.total_refund_amount)
            orig_tx = ret.original_transaction
            orig_inv = orig_tx.invoice_number if orig_tx else "N/A"

            ret_party = ret.customer.full_name if ret.customer and not ret.customer.is_walk_in else "Cash Customer"
            ret_narr = f"Credit Note against Return #{ret.return_number} (Original Inv: {orig_inv}). Reason: {ret.reason or 'Sales Return'}"

            xml_lines.append('        <TALLYMESSAGE xmlns:UDF="TallyUDF">')
            xml_lines.append('          <VOUCHER VCHTYPE="Credit Note" ACTION="Create">')
            xml_lines.append(f'            <DATE>{ret_date}</DATE>')
            xml_lines.append(f'            <GUID>{ret.id}</GUID>')
            xml_lines.append('            <VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>')
            xml_lines.append(f'            <VOUCHERNUMBER>{escape(ret.return_number)}</VOUCHERNUMBER>')
            xml_lines.append(f'            <REFERENCE>{escape(orig_inv)}</REFERENCE>')
            xml_lines.append(f'            <PARTYLEDGERNAME>{escape(ret_party)}</PARTYLEDGERNAME>')
            xml_lines.append(f'            <NARRATION>{escape(ret_narr)}</NARRATION>')

            # Debit: Sales Return Ledger (Debit is negative amount in Tally)
            xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
            xml_lines.append(f'              <LEDGERNAME>{escape(ledger_config.credit_note_ledger)}</LEDGERNAME>')
            xml_lines.append('              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>')
            xml_lines.append(f'              <AMOUNT>-{refund_amt:.2f}</AMOUNT>')
            xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

            # Credit: Party Ledger / Cash
            xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
            xml_lines.append(f'              <LEDGERNAME>{escape(ret_party)}</LEDGERNAME>')
            xml_lines.append('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>')
            xml_lines.append(f'              <AMOUNT>{refund_amt:.2f}</AMOUNT>')
            xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

            xml_lines.append('          </VOUCHER>')
            xml_lines.append('        </TALLYMESSAGE>')

        xml_lines.extend([
            '      </REQUESTDATA>',
            '    </IMPORTDATA>',
            '  </BODY>',
            '</ENVELOPE>',
        ])

        xml_content = "\n".join(xml_lines)

        # Validate that the generated XML is strictly well-formed
        try:
            ET.fromstring(xml_content.encode("utf-8"))
        except ET.ParseError as pe:
            logger.error("Generated Tally XML is not well-formed: %s", pe)
            raise ValueError(f"Generated Tally XML validation failed: {pe}")

        filename = f"Tally_GST_Sales_Export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xml"

        # Record Export Log and tag transactions atomically
        with db_transaction.atomic():
            log = TallyExportLog.objects.create(
                organization=organization,
                exported_by=user if getattr(user, "is_authenticated", False) else None,
                period=period,
                start_date=start_dt,
                end_date=end_dt,
                sales_vouchers_count=preview["summary"]["sales_vouchers_count"],
                receipt_vouchers_count=preview["summary"]["receipt_vouchers_count"],
                credit_notes_count=preview["summary"]["credit_notes_count"],
                total_taxable_value=Decimal(preview["summary"]["total_taxable_value"]),
                total_cgst=Decimal(preview["summary"]["total_cgst"]),
                total_sgst=Decimal(preview["summary"]["total_sgst"]),
                total_igst=Decimal(preview["summary"]["total_igst"]),
                total_invoice_amount=Decimal(preview["summary"]["total_invoice_value"]),
                total_recorded_payments=Decimal(preview["summary"]["total_recorded_payments"]),
                outstanding_receivables=Decimal(preview["summary"]["outstanding_receivables"]),
                total_refund_amount=Decimal(preview["summary"]["total_refund_amount"]),
                transaction_ids=tx_ids_exported,
                validation_warnings=preview["validation"]["warnings"],
                xml_filename=filename,
            )

            # Tag transactions with export timestamp
            tx_qs.update(tally_exported_at=timezone.now())
            return_qs.update(tally_exported_at=timezone.now())

        return xml_content, filename, preview
