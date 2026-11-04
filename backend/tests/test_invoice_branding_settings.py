"""
Tests for Invoice Branding & Business Details Module (BILLMEET).
Covers:
1. Settings API serialization & retrieval of invoice branding fields.
2. Updating branding settings via JSON and multipart FormData.
3. Logo & Signature image upload and file validation (size, MIME type).
4. Logo & Signature removal workflows.
5. Historical invoice immutability via `branding_snapshot`.
6. Legacy invoice fallback rendering.
7. ReportLab PDF generation with dynamic branding snapshot.
"""

import io
import os
import json
import secrets
import pytest
from decimal import Decimal
from PIL import Image
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APIClient

from apps.authentication.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.billing.models import BusinessConfig
from apps.invoices.models import Invoice
from apps.transactions.models import Transaction, TransactionItem
from apps.billing.branding_utils import build_branding_snapshot
from apps.invoices.pdf import generate_invoice_pdf_bytes


def create_test_image(format="PNG", size=(100, 100), color=(255, 0, 0)):
    file_obj = io.BytesIO()
    image = Image.new("RGBA", size, color)
    image.save(file_obj, format=format)
    file_obj.seek(0)
    return file_obj.read()


def create_large_image(dim=1500):
    img = Image.frombytes("RGB", (dim, dim), os.urandom(dim * dim * 3))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=95)
    return out.getvalue()


@pytest.mark.django_db
class TestInvoiceBrandingSettingsModule:
    @pytest.fixture(autouse=True)
    def setup(self):
        self.client = APIClient()
        self.org = Organization.objects.create(
            name="Alpha Retail Solutions",
            legal_name="Alpha Retail Solutions Private Limited",
            email="admin@alpharetail.in",
            phone="+91 98765 11111",
            address_line1="Shop 101, Galaxy Complex",
            city="Nagpur",
            state="Maharashtra",
            postal_code="440010",
            gst_number="27AAACA1234A1Z5",
            pan_number="AAACA1234A",
        )
        self.store = Store.objects.create(
            organization=self.org,
            name="Alpha Main Store",
            code="STR-001",
            status="active",
        )
        self.user = User.objects.create_user(
            email="owner@alpharetail.in",
            password="StrongPassword123!",
            organization=self.org,
            role="admin",
            first_name="Rajesh",
            last_name="Sharma",
        )
        self.config = BusinessConfig.objects.create(
            organization=self.org,
            business_type="RETAIL",
            tagline="Premier Retail & POS",
            bank_name="HDFC Bank",
            bank_account_name="Alpha Retail Solutions Pvt Ltd",
            bank_account_number="50200012345678",
            bank_ifsc_code="HDFC0001234",
            bank_branch="Ramdaspeth, Nagpur",
            bank_upi_id="alpharetail@hdfc",
            authorized_signatory_name="Authorized Signatory",
            gst_invoice_title="TAX INVOICE",
            regular_invoice_title="RETAIL INVOICE",
            default_invoice_notes="Thank you for shopping at Alpha Retail!",
            terms_and_conditions="1. Goods once sold will not be accepted back. 2. 18% interest on overdue bills.",
        )
        self.client.force_authenticate(user=self.user)

    def test_get_config_includes_all_branding_fields(self):
        """GET /api/v1/billing/config/ returns complete branding metadata."""
        url = "/api/v1/billing/config/"
        resp = self.client.get(url)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()

        assert data["business_name"] == "Alpha Retail Solutions"
        assert data["legal_name"] == "Alpha Retail Solutions Private Limited"
        assert data["tagline"] == "Premier Retail & POS"
        assert data["gstin"] == "27AAACA1234A1Z5"
        assert data["pan_number"] == "AAACA1234A"
        assert data["bank_name"] == "HDFC Bank"
        assert data["bank_account_number"] == "50200012345678"
        assert data["gst_invoice_title"] == "TAX INVOICE"
        assert "invoice_elements" in data
        assert data["invoice_elements"]["show_logo"] is True
        assert data["invoice_elements"]["show_bank_details"] is True

    def test_update_branding_settings_json(self):
        """PUT /api/v1/billing/config/ updates branding with JSON payload."""
        url = "/api/v1/billing/config/"
        payload = {
            "business_name": "Alpha Supermart",
            "legal_name": "Alpha Supermart LLP",
            "tagline": "Fresh Everyday",
            "address_line1": "Plot 42, Central MIDC",
            "city": "Nagpur",
            "state": "Maharashtra",
            "pincode": "440028",
            "logo_position": "right",
            "gst_invoice_title": "TAX INVOICE / BILL OF SUPPLY",
            "invoice_elements": {
                "show_logo": True,
                "show_tagline": True,
                "show_address": True,
                "show_gstin": True,
                "show_contact_details": True,
                "show_bank_details": False,
                "show_terms": True,
                "show_notes": True,
                "show_amount_in_words": True,
                "show_authorized_signature": True,
                "show_page_number": True,
            },
        }

        resp = self.client.put(url, data=payload, format="json")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()

        assert data["business_name"] == "Alpha Supermart"
        assert data["legal_name"] == "Alpha Supermart LLP"
        assert data["tagline"] == "Fresh Everyday"
        assert data["logo_position"] == "right"
        assert data["gst_invoice_title"] == "TAX INVOICE / BILL OF SUPPLY"
        assert data["invoice_elements"]["show_bank_details"] is False
        assert data["invoice_elements"]["show_tagline"] is True

        # Verify synchronization with Organization model
        self.org.refresh_from_db()
        assert self.org.name == "Alpha Supermart"
        assert self.org.legal_name == "Alpha Supermart LLP"
        assert self.org.address_line1 == "Plot 42, Central MIDC"

    def test_logo_and_signature_upload_multipart(self):
        """Test logo and signature file upload via multipart/form-data."""
        url = "/api/v1/billing/config/"

        logo_bytes = create_test_image(format="PNG", size=(120, 40))
        sig_bytes = create_test_image(format="PNG", size=(80, 30))

        logo_file = SimpleUploadedFile("brand_logo.png", logo_bytes, content_type="image/png")
        sig_file = SimpleUploadedFile("brand_sig.png", sig_bytes, content_type="image/png")

        form_data = {
            "business_name": "Alpha Retail Solutions",
            "logo": logo_file,
            "signature_image": sig_file,
            "authorized_signatory_name": "Authorized Officer",
        }

        resp = self.client.put(url, data=form_data, format="multipart")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()

        assert data["logo_url"] is not None
        assert "brand_logo" in data["logo_url"]
        assert data["signature_url"] is not None
        assert "brand_sig" in data["signature_url"]
        assert data["authorized_signatory_name"] == "Authorized Officer"

        self.org.refresh_from_db()
        assert self.org.logo is not None
        self.config.refresh_from_db()
        assert self.config.signature_image is not None

    def test_logo_and_signature_removal(self):
        """Test remove_logo and remove_signature reset images and URLs."""
        # First upload
        logo_bytes = create_test_image(format="PNG")
        self.org.logo.save("temp_logo.png", io.BytesIO(logo_bytes))
        self.org.save()
        self.config.signature_image.save("temp_sig.png", io.BytesIO(logo_bytes))
        self.config.save()

        assert self.org.logo
        assert self.config.signature_image

        url = "/api/v1/billing/config/"
        resp = self.client.put(url, data={"remove_logo": "true", "remove_signature": "true"}, format="multipart")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()

        assert data["logo_url"] is None
        assert data["signature_url"] is None

        self.org.refresh_from_db()
        assert not self.org.logo
        self.config.refresh_from_db()
        assert not self.config.signature_image

    def test_logo_file_size_validation(self):
        """Reject logo upload if exceeds 2MB."""
        url = "/api/v1/billing/config/"
        # Create a valid JPEG image > 2MB
        large_bytes = create_large_image(dim=1500)
        large_file = SimpleUploadedFile("big_logo.jpg", large_bytes, content_type="image/jpeg")

        resp = self.client.put(url, data={"logo": large_file}, format="multipart")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "Logo image file size must not exceed 2MB." in str(resp.json())

    def test_signature_file_size_validation(self):
        """Reject signature upload if exceeds 1MB."""
        url = "/api/v1/billing/config/"
        # Create a valid JPEG image > 1MB
        large_bytes = create_large_image(dim=1000)
        large_file = SimpleUploadedFile("big_sig.jpg", large_bytes, content_type="image/jpeg")

        resp = self.client.put(url, data={"signature_image": large_file}, format="multipart")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "Signature image file size must not exceed 1MB." in str(resp.json())

    def test_historical_invoice_immutability(self):
        """
        Verify historical legal safety:
        An issued invoice preserves its branding_snapshot.
        Modifying the business settings afterwards MUST NOT alter the issued invoice.
        """
        # Create a transaction and invoice
        tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            transaction_date=timezone.now(),
            subtotal=Decimal("1000.00"),
            tax=Decimal("180.00"),
            total=Decimal("1180.00"),
            status="completed",
        )
        TransactionItem.objects.create(
            transaction=tx,
            name="Retail Item A",
            quantity=Decimal("2.00"),
            unit_price=Decimal("500.00"),
            tax=Decimal("180.00"),
            total=Decimal("1180.00"),
        )

        initial_snapshot = build_branding_snapshot(self.config, self.org, self.store)
        invoice = Invoice.objects.create(
            organization=self.org,
            transaction=tx,
            invoice_number="INV-2026-0001",
            secure_token=secrets.token_urlsafe(16),
            branding_snapshot=initial_snapshot,
        )

        assert invoice.branding_snapshot["business_name"] == "Alpha Retail Solutions"
        assert invoice.branding_snapshot["gstin"] == "27AAACA1234A1Z5"
        assert invoice.branding_snapshot["bank_name"] == "HDFC Bank"

        # Now, administrator completely rebrands the business
        self.client.put(
            "/api/v1/billing/config/",
            data={
                "business_name": "Beta Modern Hypermarket",
                "gstin": "27BBBCB9999B1Z0",
                "bank_name": "State Bank of India",
                "bank_account_number": "333300001111",
            },
            format="json",
        )

        # Refresh invoice from database
        invoice.refresh_from_db()

        # The historical invoice snapshot MUST remain exactly as it was when issued
        assert invoice.branding_snapshot["business_name"] == "Alpha Retail Solutions"
        assert invoice.branding_snapshot["gstin"] == "27AAACA1234A1Z5"
        assert invoice.branding_snapshot["bank_name"] == "HDFC Bank"
        assert invoice.branding_snapshot["bank_account_number"] == "50200012345678"

    def test_legacy_invoice_fallback(self):
        """
        Verify backward compatibility:
        An invoice with an empty branding_snapshot gracefully falls back to the current config.
        """
        tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            transaction_date=timezone.now(),
            subtotal=Decimal("500.00"),
            tax=Decimal("90.00"),
            total=Decimal("590.00"),
            status="completed",
        )
        TransactionItem.objects.create(
            transaction=tx,
            name="Legacy Item",
            quantity=Decimal("1.00"),
            unit_price=Decimal("500.00"),
            tax=Decimal("90.00"),
            total=Decimal("590.00"),
        )
        invoice = Invoice.objects.create(
            organization=self.org,
            transaction=tx,
            invoice_number="INV-LEGACY-001",
            secure_token=secrets.token_urlsafe(16),
            branding_snapshot={},
        )

        from apps.invoices.serializers import InvoiceSerializer
        serializer = InvoiceSerializer(invoice)
        seller = serializer.data.get("seller_details")

        assert seller is not None
        assert seller["name"] == "Alpha Retail Solutions"
        assert seller["gstin"] == "27AAACA1234A1Z5"
        assert seller["bank_name"] == "HDFC Bank"

    def test_reportlab_pdf_generation_with_branding_snapshot(self):
        """
        Test ReportLab PDF rendering with branding snapshot and custom toggles.
        """
        tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            transaction_date=timezone.now(),
            subtotal=Decimal("1500.00"),
            tax=Decimal("270.00"),
            total=Decimal("1770.00"),
            status="completed",
        )
        TransactionItem.objects.create(
            transaction=tx,
            name="LDPE Pipe 16MM",
            quantity=Decimal("100.00"),
            unit_price=Decimal("15.00"),
            tax=Decimal("270.00"),
            cgst_amount=Decimal("135.00"),
            sgst_amount=Decimal("135.00"),
            total=Decimal("1770.00"),
            hsn_code="39011090",
        )
        snapshot = build_branding_snapshot(self.config, self.org, self.store)
        snapshot["invoice_elements"]["show_website"] = True
        snapshot["logo_position"] = "left"

        invoice = Invoice.objects.create(
            organization=self.org,
            transaction=tx,
            invoice_number="INV-PDF-001",
            secure_token=secrets.token_urlsafe(16),
            branding_snapshot=snapshot,
        )

        pdf_bytes = generate_invoice_pdf_bytes(invoice, format_type="a4")
        assert pdf_bytes is not None
        assert len(pdf_bytes) > 500
        assert pdf_bytes.startswith(b"%PDF-")
