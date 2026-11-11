import re
import uuid
import zlib
from decimal import Decimal
from unittest.mock import Mock, patch

import requests
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.billing.models import BusinessConfig
from apps.invoices.models import Invoice
from apps.products.models import InventoryMovement
from apps.transactions.models import Transaction
from apps.whatsapp.models import WhatsAppConfig, WhatsAppMessage
from apps.whatsapp.service import (
    INVOICE_WHATSAPP_CAPTION,
    WhatsAppService,
    build_invoice_pdf_filename,
    deliver_invoice_pdf_via_whatsapp,
    format_whatsapp_phone,
)
from apps.whatsapp.tasks import send_digital_bill_task
from tests.factories import (
    CustomerFactory,
    OrganizationFactory,
    ProductFactory,
    StoreFactory,
    UserFactory,
)


def extract_pdf_text(pdf_bytes: bytes) -> str:
    """Decode ReportLab ASCII85 + FlateDecode content streams to inspect rendered PDF text."""
    import base64

    chunks = [pdf_bytes]
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\n?endstream", pdf_bytes, re.DOTALL):
        raw_stream = match.group(1).strip()
        decoded = raw_stream
        if decoded.endswith(b"~>"):
            decoded = base64.a85decode(b"<~" + decoded, adobe=True, ignorechars=b" \t\n\r\x0b")
        try:
            chunks.append(zlib.decompress(decoded))
        except zlib.error:
            chunks.append(decoded)
    return b"\n".join(chunks).decode("latin-1", errors="ignore")


def _make_mock_response(ok=True, status_code=200, json_data=None):
    resp = Mock()
    resp.ok = ok
    resp.status_code = status_code
    resp.json.return_value = json_data if json_data is not None else {}
    return resp


class WhatsAppInvoicePDFDeliveryTests(APITestCase):
    def setUp(self):
        self.org = OrganizationFactory(
            name="Acme Mart",
            legal_name="Acme Mart Private Limited",
            gst_number="27AABCA1234D1Z5",
            address_line1="101 Market Street",
            city="Mumbai",
            state="Maharashtra",
            phone="02223456789",
        )
        self.admin = UserFactory(organization=self.org, role="org_admin")
        self.staff = UserFactory(organization=self.org, role="cashier")
        self.store = StoreFactory(organization=self.org, name="Flagship Store")
        self.customer = CustomerFactory(
            organization=self.org,
            first_name="Aarav",
            last_name="Patel",
            phone="+91 98765 43210",
            whatsapp_opt_in=True,
            is_walk_in=False,
        )
        self.product = ProductFactory(
            organization=self.org,
            name="Artisan Espresso Beans",
            sku="ESP-500",
            unit_price=Decimal("400.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("20.00"),
            track_inventory=True,
        )
        self.config = BusinessConfig.objects.create(
            organization=self.org,
            tagline="Freshly Roasted Coffee",
            auto_send_whatsapp=True,
        )
        self.wa_config = WhatsAppConfig.objects.create(
            organization=self.org,
            business_account_id="WABA_999",
            phone_number_id="PNID_999",
            access_token="SECRET_META_TOKEN_XYZ_987",
            is_active=True,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _checkout_payload(self, *, unit_price=None, discount=0, customer=None, phone=None, is_walk_in=False):
        cust = customer or self.customer
        item = {
            "product_id": str(self.product.id),
            "quantity": 2,
            "discount": str(discount),
        }
        if unit_price is not None:
            item["unit_price"] = str(unit_price)
        payload = {
            "store_id": str(self.store.id),
            "items": [item],
            "payments": [{"payment_method": "upi", "amount": 999999}],
            "is_walk_in": is_walk_in,
            "idempotency_key": uuid.uuid4().hex,
        }
        if not is_walk_in:
            payload["customer"] = {
                "id": str(cust.id) if cust else None,
                "name": cust.full_name if cust else "Walk-in",
                "phone": phone if phone is not None else (cust.phone if cust else ""),
            }
        # Compute exact grand total first via calculate endpoint or let payment match after price edit
        calc_res = self.client.post("/api/v1/billing/calculate/", {"items": [item]}, format="json")
        self.assertEqual(calc_res.status_code, status.HTTP_200_OK)
        payload["payments"][0]["amount"] = calc_res.data["grand_total"]
        return payload

    @patch("apps.whatsapp.service.requests.post")
    def test_scenarios_1_to_11_checkout_pdf_upload_document_and_edited_prices(self, mock_post):
        """
        Covers scenarios 1-11:
        - Create successful bill with edited item unit price & discount
        - Final invoice created
        - Valid ReportLab PDF bytes generated matching canonical invoice download
        - MIME type application/pdf, safe filename Invoice_<number>.pdf
        - Official Meta media upload -> media_id -> document message with media_id & caption
        - Edited prices, taxes, discounts, invoice number, totals appear in PDF & uploaded payload
        - Product master selling_price remains unchanged
        """
        mock_post.side_effect = [
            _make_mock_response(True, 200, {"id": "MEDIA_INV_001"}),
            _make_mock_response(True, 200, {"messages": [{"id": "wamid.HBgM919876543210"}]}),
        ]

        # Checkout with edited unit_price 250.00 (master is 400.00) and discount 50.00
        payload = self._checkout_payload(unit_price="250.00", discount="50.00")
        checkout_res = self.client.post("/api/v1/billing/checkout/", payload, format="json")

        self.assertEqual(checkout_res.status_code, status.HTTP_201_CREATED, checkout_res.data)
        self.assertTrue(checkout_res.data["bill_sent"])
        self.assertEqual(checkout_res.data["whatsapp_delivery"]["status"], "sent")
        self.assertEqual(checkout_res.data["whatsapp_delivery"]["provider_message_id"], "wamid.HBgM919876543210")

        # Verify product master price remained untouched
        self.product.refresh_from_db()
        self.assertEqual(self.product.unit_price, Decimal("400.00"))

        tx = Transaction.objects.get(id=checkout_res.data["id"])
        invoice = Invoice.objects.get(transaction=tx)
        expected_filename = f"Invoice_{invoice.invoice_number}.pdf"

        # Exactly 2 Meta calls: (1) /media upload, (2) /messages document send (NOT called twice!)
        self.assertEqual(mock_post.call_count, 2)
        upload_call, msg_call = mock_post.call_args_list

        # Scenario 4, 5, 6, 7: Upload call checks
        self.assertEqual(upload_call.args[0], "https://graph.facebook.com/v20.0/PNID_999/media")
        self.assertEqual(upload_call.kwargs["data"], {"messaging_product": "whatsapp", "type": "application/pdf"})
        file_name, uploaded_bytes, mime_type = upload_call.kwargs["files"]["file"]
        self.assertEqual(file_name, expected_filename)
        self.assertEqual(mime_type, "application/pdf")
        self.assertTrue(uploaded_bytes.startswith(b"%PDF-"))
        self.assertIn(b"%%EOF", uploaded_bytes)
        self.assertGreater(len(uploaded_bytes), 1000)

        # Scenario 3, 9, 10, 11: Inspect rendered PDF text content (edited price 250, invoice number, store, customer, total)
        pdf_text = extract_pdf_text(uploaded_bytes)
        self.assertIn(invoice.invoice_number, pdf_text)
        self.assertIn("250.00", pdf_text)
        self.assertIn(str(tx.total), pdf_text)
        self.assertIn("Acme Mart", pdf_text)
        self.assertIn("Aarav Patel", pdf_text)

        # Scenario 4 & 16: Matches canonical BillMeet PDF download endpoint
        dl_res = self.client.get(f"/api/v1/invoices/{invoice.id}/pdf/?download=true")
        self.assertEqual(dl_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dl_res["Content-Type"], "application/pdf")
        self.assertTrue(dl_res.content.startswith(b"%PDF-"))
        self.assertEqual(extract_pdf_text(dl_res.content) != "", True)
        # Length shouldn't drift dramatically from identical invoice
        self.assertAlmostEqual(len(uploaded_bytes), len(dl_res.content), delta=250)

        # Scenario 7 & 8: Message call checks (DOCUMENT referencing media ID, never text/url fallback)
        self.assertEqual(msg_call.args[0], "https://graph.facebook.com/v20.0/PNID_999/messages")
        msg_payload = msg_call.kwargs["json"]
        self.assertEqual(msg_payload["messaging_product"], "whatsapp")
        self.assertEqual(msg_payload["to"], "919876543210")
        self.assertEqual(msg_payload["type"], "document")
        self.assertNotIn("text", msg_payload)
        self.assertEqual(msg_payload["document"]["id"], "MEDIA_INV_001")
        self.assertEqual(msg_payload["document"]["filename"], expected_filename)
        self.assertEqual(msg_payload["document"]["caption"], INVOICE_WHATSAPP_CAPTION)

        # Verify DB tracking
        wa_msg = WhatsAppMessage.objects.get(external_id=f"invoice:{invoice.id}")
        self.assertEqual(wa_msg.status, "sent")
        self.assertEqual(wa_msg.message_type, "document")
        self.assertEqual(wa_msg.provider_message_id, "wamid.HBgM919876543210")
        self.assertEqual(wa_msg.metadata["media_id"], "MEDIA_INV_001")

    @patch("apps.whatsapp.service.requests.post")
    def test_scenarios_12_and_13_whatsapp_failure_does_not_affect_billing_or_inventory(self, mock_post):
        """
        Scenario 12 & 13:
        If Meta WhatsApp API fails or times out:
        - Completed billing transaction succeeds & returns 201
        - Invoice exists and remains valid
        - Inventory deduction & InventoryMovement remain intact
        - WhatsAppMessage records status='failed' cleanly without exposing access token or filesystem paths
        """
        mock_post.side_effect = requests.exceptions.Timeout(
            "Connection timed out to graph.facebook.com using token SECRET_META_TOKEN_XYZ_987 at /var/app/invoices/test.pdf"
        )

        initial_stock = self.product.current_stock
        payload = self._checkout_payload(unit_price="350.00")
        checkout_res = self.client.post("/api/v1/billing/checkout/", payload, format="json")

        self.assertEqual(checkout_res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(checkout_res.data["bill_sent"])
        self.assertEqual(checkout_res.data["whatsapp_delivery"]["status"], "failed")

        # Token & local paths are redacted from failure_reason
        failure_reason = checkout_res.data["whatsapp_delivery"]["failure_reason"]
        self.assertNotIn("SECRET_META_TOKEN_XYZ_987", failure_reason)
        self.assertNotIn("/var/app/", failure_reason)

        # Transaction & Invoice remain valid
        tx = Transaction.objects.get(id=checkout_res.data["id"])
        self.assertEqual(tx.status, "completed")
        self.assertEqual(tx.payment_status, "paid")
        self.assertFalse(tx.bill_sent)
        invoice = Invoice.objects.get(transaction=tx)
        self.assertEqual(invoice.invoice_number, tx.invoice_number)

        # Inventory deducted properly & not rolled back
        self.product.refresh_from_db()
        self.assertEqual(self.product.current_stock, initial_stock - Decimal("2.00"))
        self.assertTrue(InventoryMovement.objects.filter(reference_id=str(tx.id), movement_type="SALE").exists())

        # Existing invoice download/view still works despite WhatsApp outage
        dl_res = self.client.get(f"/api/v1/invoices/{invoice.id}/pdf/?download=true")
        self.assertEqual(dl_res.status_code, status.HTTP_200_OK)
        self.assertTrue(dl_res.content.startswith(b"%PDF-"))

        pub_res = APIClient().get(f"/api/v1/invoices/view/{invoice.secure_token}/")
        self.assertEqual(pub_res.status_code, status.HTTP_200_OK)

    @patch("apps.whatsapp.service.requests.post")
    def test_scenarios_14_and_15_retries_no_duplicate_transaction_or_duplicate_pdf(self, mock_post):
        """
        Scenario 14 & 15:
        - Re-running send_digital_bill_task or calling POST /send-whatsapp/ (force=False)
          after successful send returns 'already_sent' and never calls Meta again.
        - Retrying a failed WhatsApp delivery does NOT create duplicate Transaction/Invoice rows,
          reuses failed WhatsAppMessage with incremented retry_count, and sends once.
        """
        # Part A: Initial API failure (500), then manual/task retry succeeds
        mock_post.side_effect = [
            _make_mock_response(False, 500, {"error": {"message": "Upstream error", "code": 2}}),
            _make_mock_response(True, 200, {"id": "MEDIA_RETRY_1"}),
            _make_mock_response(True, 200, {"messages": [{"id": "wamid.RETRY_OK"}]}),
        ]

        payload = self._checkout_payload()
        checkout_res = self.client.post("/api/v1/billing/checkout/", payload, format="json")
        self.assertEqual(checkout_res.status_code, status.HTTP_201_CREATED)
        tx = Transaction.objects.get(id=checkout_res.data["id"])
        invoice = Invoice.objects.get(transaction=tx)

        self.assertEqual(Transaction.objects.filter(organization=self.org).count(), 1)
        self.assertEqual(WhatsAppMessage.objects.filter(external_id=f"invoice:{invoice.id}").count(), 1)
        failed_msg = WhatsAppMessage.objects.get(external_id=f"invoice:{invoice.id}")
        self.assertEqual(failed_msg.status, "failed")

        # Retry via API endpoint
        retry_res = self.client.post(f"/api/v1/invoices/{invoice.id}/send-whatsapp/", {}, format="json")
        self.assertEqual(retry_res.status_code, status.HTTP_200_OK)
        self.assertEqual(retry_res.data["status"], "sent")
        self.assertEqual(mock_post.call_count, 3)

        # Still only 1 transaction, 1 invoice, and the same failed record updated with retry_count=1
        self.assertEqual(Transaction.objects.filter(organization=self.org).count(), 1)
        self.assertEqual(Invoice.objects.filter(organization=self.org).count(), 1)
        failed_msg.refresh_from_db()
        self.assertEqual(failed_msg.status, "sent")
        self.assertEqual(failed_msg.retry_count, 1)
        self.assertEqual(failed_msg.provider_message_id, "wamid.RETRY_OK")

        # Part B: Calling task again OR hitting endpoint without force=True prevents duplicate PDF send
        dup_task_res = send_digital_bill_task(str(tx.id))
        self.assertEqual(dup_task_res["status"], "already_sent")
        self.assertEqual(mock_post.call_count, 3)

        dup_api_res = self.client.post(f"/api/v1/invoices/{invoice.id}/send-whatsapp/", {}, format="json")
        self.assertEqual(dup_api_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dup_api_res.data["status"], "already_sent")
        self.assertEqual(mock_post.call_count, 3)

        # Explicit user resend (force=True) creates a fresh log entry and delivers again
        mock_post.side_effect = [
            _make_mock_response(True, 200, {"id": "MEDIA_RESEND_2"}),
            _make_mock_response(True, 200, {"messages": [{"id": "wamid.RESEND_OK"}]}),
        ]
        resend_res = self.client.post(f"/api/v1/invoices/{invoice.id}/send-whatsapp/", {"force": True}, format="json")
        self.assertEqual(resend_res.status_code, status.HTTP_200_OK)
        self.assertEqual(resend_res.data["status"], "sent")
        self.assertEqual(resend_res.data["provider_message_id"], "wamid.RESEND_OK")

    @patch("apps.whatsapp.service.requests.post")
    def test_scenario_17_invalid_or_missing_phone_and_phone_formatting(self, mock_post):
        """
        Scenario 17:
        - Walk-in customer or invalid/missing phone number does NOT crash checkout and does NOT call Meta API.
        - Manual API send rejects invalid phones cleanly with HTTP 400.
        - International & Indian phone normalization reuses existing normalize_phone.
        """
        self.assertEqual(format_whatsapp_phone("+91 98765-43210"), "919876543210")
        self.assertEqual(format_whatsapp_phone("09876543210"), "919876543210")
        self.assertEqual(format_whatsapp_phone("9876543210"), "919876543210")
        self.assertEqual(format_whatsapp_phone("+1 415 555 2671"), "14155552671")
        self.assertEqual(format_whatsapp_phone("0000000000"), "")
        self.assertEqual(format_whatsapp_phone("walkin-abc123"), "")
        self.assertEqual(format_whatsapp_phone("12345"), "")
        self.assertEqual(format_whatsapp_phone(""), "")

        # Walk-in checkout succeeds cleanly without triggering Meta API
        walkin_payload = self._checkout_payload(is_walk_in=True)
        res = self.client.post("/api/v1/billing/checkout/", walkin_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data["bill_sent"])
        mock_post.assert_not_called()

        # Manual send for walk-in without phone_override fails cleanly with 400
        invoice_id = res.data["invoice"]["id"]
        send_res = self.client.post(f"/api/v1/invoices/{invoice_id}/send-whatsapp/", {}, format="json")
        self.assertEqual(send_res.status_code, status.HTTP_400_BAD_REQUEST)
        mock_post.assert_not_called()

        # Manual send WITH valid walk-in override phone works without crashing nullable customer FK
        tx = Transaction.objects.get(id=res.data["id"])
        tx.customer = None
        tx.save(update_fields=["customer"])
        mock_post.side_effect = [
            _make_mock_response(True, 200, {"id": "MEDIA_WALKIN"}),
            _make_mock_response(True, 200, {"messages": [{"id": "wamid.WALKIN_OK"}]}),
        ]
        manual_res = self.client.post(
            f"/api/v1/invoices/{invoice_id}/send-whatsapp/",
            {"phone": "+91 91234 56789"},
            format="json",
        )
        self.assertEqual(manual_res.status_code, status.HTTP_200_OK, manual_res.data)
        self.assertEqual(manual_res.data["phone_number"], "919123456789")
        self.assertEqual(manual_res.data["status"], "sent")

    @patch("apps.whatsapp.service.requests.post")
    def test_permissions_tenant_isolation_and_retry_endpoint(self, mock_post):
        """
        Ensure:
        - Staff can send their own bill's invoice PDF via WhatsApp, but not another cashier's bill
        - Cross-organization access returns 404
        - /api/v1/whatsapp/messages/<id>/retry/ retries failed invoice messages
        - Filename sanitization prevents path traversal
        """
        self.assertEqual(build_invoice_pdf_filename("../../etc/INV/2026#1"), "Invoice_etc_INV_2026_1.pdf")

        # Turn off auto_send so staff checkout creates invoice silently first
        self.config.auto_send_whatsapp = False
        self.config.save(update_fields=["auto_send_whatsapp"])

        staff_client = APIClient()
        staff_client.force_authenticate(user=self.staff)
        payload = self._checkout_payload()
        calc_res = staff_client.post("/api/v1/billing/calculate/", payload, format="json")
        payload["payments"][0]["amount"] = calc_res.data["grand_total"]
        sale_res = staff_client.post("/api/v1/billing/checkout/", payload, format="json")
        self.assertEqual(sale_res.status_code, status.HTTP_201_CREATED)
        invoice_id = sale_res.data["invoice"]["id"]

        # First attempt fails upstream (502 Bad Gateway)
        mock_post.return_value = _make_mock_response(False, 502, {"error": {"message": "Meta gateway timeout", "code": 1}})
        fail_res = staff_client.post(f"/api/v1/invoices/{invoice_id}/send-whatsapp/", {}, format="json")
        self.assertEqual(fail_res.status_code, status.HTTP_502_BAD_GATEWAY)
        failed_msg_id = fail_res.data["message_id"]

        # Another cashier cannot trigger retry on first cashier's invoice
        other_staff = UserFactory(organization=self.org, role="cashier")
        other_staff_client = APIClient()
        other_staff_client.force_authenticate(user=other_staff)
        denied_res = other_staff_client.post(f"/api/v1/invoices/{invoice_id}/send-whatsapp/", {}, format="json")
        self.assertEqual(denied_res.status_code, status.HTTP_403_FORBIDDEN)

        # Cross-tenant user gets 404
        foreign_user = UserFactory(role="org_admin")
        foreign_client = APIClient()
        foreign_client.force_authenticate(user=foreign_user)
        not_found_res = foreign_client.post(f"/api/v1/invoices/{invoice_id}/send-whatsapp/", {}, format="json")
        self.assertEqual(not_found_res.status_code, status.HTTP_404_NOT_FOUND)

        # Retry endpoint succeeds
        mock_post.return_value = None
        mock_post.side_effect = [
            _make_mock_response(True, 200, {"id": "MEDIA_MSG_RETRY"}),
            _make_mock_response(True, 200, {"messages": [{"id": "wamid.MSG_RETRY_OK"}]}),
        ]
        retry_res = staff_client.post(f"/api/v1/whatsapp/messages/{failed_msg_id}/retry/", {}, format="json")
        self.assertEqual(retry_res.status_code, status.HTTP_200_OK)
        self.assertEqual(retry_res.data["status"], "sent")
        self.assertEqual(retry_res.data["provider_message_id"], "wamid.MSG_RETRY_OK")
        self.assertNotIn("SECRET_META_TOKEN_XYZ_987", str(retry_res.data))
