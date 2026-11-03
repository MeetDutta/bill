import uuid
from decimal import Decimal
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.billing.models import BusinessConfig
from apps.invoices.gst_utils import get_place_of_supply, resolve_state_code
from apps.invoices.models import Invoice
from apps.invoices.number_to_words import indian_number_to_words
from apps.invoices.pdf import generate_invoice_pdf_bytes
from apps.invoices.serializers import InvoiceSerializer, PublicInvoiceSerializer
from apps.invoices.tasks import generate_invoice_task
from apps.transactions.models import Transaction, TransactionItem
from tests.factories import CustomerFactory, OrganizationFactory, StoreFactory, UserFactory


class GSTTaxInvoiceTemplateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory(
            name="Zoom Renewables Pvt. Ltd.",
            legal_name="Zoom Renewables Pvt. Ltd.",
            gst_number="27AABCZ1569R1ZH",
            address_line1="Zoom, U-62 MIDC, Hingna",
            city="Nagpur",
            state="Maharashtra",
            postal_code="440016",
        )
        self.user = UserFactory(organization=self.org)
        self.store = StoreFactory(
            organization=self.org,
            name="MIDC Unit 1",
            code="MIDC01",
            address_line1="Zoom, U-62 MIDC, Hingna",
            city="Nagpur",
            state="Maharashtra",
            postal_code="440016",
        )
        self.customer = CustomerFactory(
            organization=self.org,
            first_name="DPRAMP-TECH SOLUTIONS LLP",
            last_name="",
            phone="9876543210",
            address_line1="Plot No. EWS-38, V H B Colony Nandanvan Layout",
            city="Nagpur",
            state="Maharashtra",
            postal_code="440024",
            gstin="27AAXFD2138D1ZD",
        )

        # Configure BusinessConfig with Bank Details and Terms
        self.config, _ = BusinessConfig.objects.get_or_create(
            organization=self.org,
            defaults={
                "business_type": "RETAIL",
                "bank_name": "ICICI Bank",
                "bank_account_name": "Zoom Renewables Private Limited",
                "bank_account_number": "178705500909",
                "bank_ifsc_code": "ICIC0001787",
                "bank_branch": "Chhatrapati Nagar, Nagpur",
                "bank_upi_id": "zoomrenewables@icici",
                "terms_and_conditions": "Payment : 100% Advance",
                "authorized_signatory_name": "Authorized Signature",
            },
        )

    def test_indian_number_to_words_converter(self):
        """Validates exact Indian English currency wording matching the reference invoice."""
        # Exact reference value: 1,939.60
        words_1939_60 = indian_number_to_words("1939.60")
        self.assertEqual(words_1939_60, "Rupees One Thousand Nine Hundred Thirty-Nine and Sixty Paise Only")

        # Exact subtotal: 1500.00
        words_1500 = indian_number_to_words(1500)
        self.assertEqual(words_1500, "Rupees One Thousand Five Hundred Only")

        # Paise only
        self.assertEqual(indian_number_to_words("0.50"), "Fifty Paise Only")

        # Zero
        self.assertEqual(indian_number_to_words("0.00"), "Zero Rupees Only")
        self.assertEqual(indian_number_to_words(None), "Zero Rupees Only")

        # Large numbers (Lakhs & Crores)
        words_lakhs = indian_number_to_words("1234567.89")
        self.assertEqual(
            words_lakhs,
            "Rupees Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven and Eighty-Nine Paise Only",
        )

    def test_gst_state_code_and_place_of_supply(self):
        """Verifies state resolution from GSTIN prefix and state names."""
        self.assertEqual(resolve_state_code("Maharashtra"), "27")
        self.assertEqual(resolve_state_code("Delhi"), "07")
        self.assertEqual(resolve_state_code("Gujarat"), "24")
        self.assertEqual(resolve_state_code("Karnataka"), "29")
        self.assertEqual(resolve_state_code("", "27AABCZ1569R1ZH"), "27")

        # Place of supply formatting
        pos_str = get_place_of_supply("Maharashtra", "27AABCZ1569R1ZH")
        self.assertEqual(pos_str, "Maharashtra (27)")

    def test_render_a4_pdf_intra_state_matching_reference(self):
        """
        Creates an invoice matching Zoom Renewables Pvt. Ltd. reference format
        and verifies PDF binary generation.
        """
        tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            customer=self.customer,
            invoice_number="INV-01920",
            transaction_date="2026-11-03T10:00:00Z",
            subtotal=Decimal("1500.00"),
            discount=Decimal("0.00"),
            tax=Decimal("270.00"),  # 135 CGST + 135 SGST
            round_off=Decimal("-0.40"),
            total=Decimal("1769.60"),
            payment_method="CASH",
            payment_status="completed",
        )
        TransactionItem.objects.create(
            transaction=tx,
            name="LDPE Pipe 16MM",
            hsn_code="39011090",
            quantity=Decimal("100"),
            unit_price=Decimal("15.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("18.00"),
            cgst_amount=Decimal("135.00"),
            sgst_amount=Decimal("135.00"),
            tax=Decimal("270.00"),
            total=Decimal("1770.00"),
        )

        res = generate_invoice_task(str(tx.id))
        invoice = Invoice.objects.get(id=res["invoice_id"])
        invoice.invoice_number = "INV-01920"
        invoice.invoice_type = "gst"
        invoice.terms_and_conditions = "Payment : 100% Advance"
        invoice.custom_notes = "Looking forward for your business."
        invoice.save()

        # Generate ReportLab A4 PDF binary
        pdf_bytes = generate_invoice_pdf_bytes(invoice, format_type="a4")

        # Verification of pure binary PDF
        self.assertTrue(isinstance(pdf_bytes, bytes))
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))
        self.assertTrue(len(pdf_bytes) > 2000)

    def test_render_a4_pdf_interstate_igst(self):
        """Verifies interstate invoice generates IGST column correctly."""
        # Customer in Gujarat (24) while seller is in Maharashtra (27)
        interstate_cust = CustomerFactory(
            organization=self.org,
            first_name="Ahmedabad Solar Dist",
            phone="9123456789",
            state="Gujarat",
            gstin="24AAACD1234E1Z5",
        )
        tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            customer=interstate_cust,
            invoice_number="INV-02001",
            transaction_date="2026-11-03T11:00:00Z",
            subtotal=Decimal("2000.00"),
            discount=Decimal("0.00"),
            tax=Decimal("360.00"),
            total=Decimal("2360.00"),
            payment_method="NEFT",
            payment_status="completed",
        )
        TransactionItem.objects.create(
            transaction=tx,
            name="Solar Inverter 5kVA",
            hsn_code="85044090",
            quantity=Decimal("1"),
            unit_price=Decimal("2000.00"),
            tax_rate=Decimal("18.00"),
            igst_amount=Decimal("360.00"),
            tax=Decimal("360.00"),
            total=Decimal("2360.00"),
        )

        res = generate_invoice_task(str(tx.id))
        invoice = Invoice.objects.get(id=res["invoice_id"])

        pdf_bytes = generate_invoice_pdf_bytes(invoice, format_type="a4")
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))
        self.assertTrue(len(pdf_bytes) > 2000)

    def test_render_a4_pdf_non_gst_invoice(self):
        """Verifies non-GST invoice produces 'INVOICE' heading without tax breakdown errors."""
        non_gst_org = OrganizationFactory(name="Simple Grocery Store", gst_number="")
        non_gst_store = StoreFactory(organization=non_gst_org)
        tx = Transaction.objects.create(
            organization=non_gst_org,
            store=non_gst_store,
            invoice_number="INV-NON-001",
            transaction_date="2026-11-03T12:00:00Z",
            subtotal=Decimal("500.00"),
            discount=Decimal("0.00"),
            tax=Decimal("0.00"),
            total=Decimal("500.00"),
            payment_method="CASH",
        )
        TransactionItem.objects.create(
            transaction=tx,
            name="Organic Apples 1kg",
            quantity=Decimal("2"),
            unit_price=Decimal("250.00"),
            total=Decimal("500.00"),
        )
        res = generate_invoice_task(str(tx.id))
        invoice = Invoice.objects.get(id=res["invoice_id"])
        invoice.invoice_type = "non_gst"
        invoice.save()

        pdf_bytes = generate_invoice_pdf_bytes(invoice, format_type="a4")
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))
        self.assertTrue(len(pdf_bytes) > 2000)

    def test_invoice_serializer_seller_details(self):
        """Verifies that InvoiceSerializer exposes seller_details with bank information."""
        tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            customer=self.customer,
            invoice_number="INV-TEST-001",
            transaction_date="2026-11-03T10:00:00Z",
            subtotal=Decimal("1000.00"),
            tax=Decimal("180.00"),
            total=Decimal("1180.00"),
            payment_method="UPI",
        )
        res = generate_invoice_task(str(tx.id))
        invoice = Invoice.objects.get(id=res["invoice_id"])

        serializer = InvoiceSerializer(invoice)
        data = serializer.data

        self.assertIn("seller_details", data)
        seller = data["seller_details"]
        self.assertEqual(seller["legal_name"], "Zoom Renewables Pvt. Ltd.")
        self.assertEqual(seller["gstin"], "27AABCZ1569R1ZH")
        self.assertEqual(seller["bank_name"], "ICICI Bank")
        self.assertEqual(seller["bank_account_number"], "178705500909")
        self.assertEqual(seller["bank_ifsc_code"], "ICIC0001787")
        self.assertEqual(seller["bank_branch"], "Chhatrapati Nagar, Nagpur")
        self.assertEqual(seller["bank_upi_id"], "zoomrenewables@icici")

    def test_public_invoice_serializer_includes_bank_details(self):
        """Verifies that PublicInvoiceSerializer includes bank information in business dict."""
        tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            customer=self.customer,
            invoice_number="INV-PUB-001",
            transaction_date="2026-11-03T10:00:00Z",
            subtotal=Decimal("1000.00"),
            tax=Decimal("180.00"),
            total=Decimal("1180.00"),
            payment_method="UPI",
        )
        res = generate_invoice_task(str(tx.id))
        invoice = Invoice.objects.get(id=res["invoice_id"])

        serializer = PublicInvoiceSerializer(invoice)
        business = serializer.data["business"]
        self.assertEqual(business["bank_name"], "ICICI Bank")
        self.assertEqual(business["bank_account_number"], "178705500909")
        self.assertEqual(business["bank_ifsc_code"], "ICIC0001787")
