import threading
import time
import uuid
from decimal import Decimal
from unittest.mock import Mock, patch

import requests
from django.db import transaction
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.billing.models import BusinessConfig, CashRegister, RealtimeEvent
from apps.invoices.models import Invoice, Quotation, QuotationItem
from apps.products.models import InventoryMovement
from apps.transactions.models import Transaction
from apps.whatsapp.models import WhatsAppConfig, WhatsAppMessage
from apps.whatsapp.service import (
    INVOICE_WHATSAPP_CAPTION,
    deliver_invoice_pdf_via_whatsapp,
    prepare_and_dispatch_post_sale_invoice_whatsapp,
)
from apps.whatsapp.tasks import send_digital_bill_task
from tests.factories import (
    CustomerFactory,
    OrganizationFactory,
    ProductFactory,
    StoreFactory,
    UserFactory,
)


def _mock_resp(ok=True, status_code=200, json_data=None):
    resp = Mock()
    resp.ok = ok
    resp.status_code = status_code
    resp.json.return_value = json_data if json_data is not None else {}
    return resp


class WhatsAppAutomaticPostPurchaseDeliveryTests(APITestCase):
    def setUp(self):
        self.org = OrganizationFactory(
            name="AutoSend Retail Pvt Ltd",
            gst_number="27AABCA1234D1Z5",
            state="Maharashtra",
        )
        self.admin = UserFactory(organization=self.org, role="org_admin")
        self.cashier = UserFactory(organization=self.org, role="cashier")
        self.store = StoreFactory(organization=self.org, name="Main POS Branch")
        self.customer = CustomerFactory(
            organization=self.org,
            first_name="Priya",
            last_name="Verma",
            phone="+91 98200 12345",
            whatsapp_opt_in=True,
            is_walk_in=False,
            credit_limit=Decimal("25000.00"),
        )
        self.product = ProductFactory(
            organization=self.org,
            name="Wireless Barcode Scanner",
            sku="SCN-2026",
            unit_price=Decimal("1000.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("50.00"),
            track_inventory=True,
        )
        self.config = BusinessConfig.objects.create(
            organization=self.org,
            gst_enabled=True,
            default_tax_mode="exclusive",
            credit_sales_enabled=True,
            default_credit_limit=Decimal("25000.00"),
            auto_send_whatsapp=True,
        )
        self.wa_config = WhatsAppConfig.objects.create(
            organization=self.org,
            business_account_id="WABA_AUTO_01",
            phone_number_id="PNID_AUTO_01",
            access_token="TOKEN_AUTO_SECRET_999",
            is_active=True,
        )
        CashRegister.objects.create(
            organization=self.org,
            store=self.store,
            cashier=self.admin,
            opening_cash=Decimal("1000.00"),
            expected_cash=Decimal("1000.00"),
            status="open",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _compute_total(self, qty=1, unit_price="1000.00"):
        res = self.client.post(
            "/api/v1/billing/calculate/",
            {"items": [{"product_id": str(self.product.id), "quantity": qty, "unit_price": unit_price}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return res.data["grand_total"]

    def _checkout(self, payments, *, is_walk_in=False, customer=None, qty=1):
        cust = self.customer if customer is None else customer
        payload = {
            "store_id": str(self.store.id),
            "items": [{"product_id": str(self.product.id), "quantity": qty, "unit_price": "1000.00"}],
            "payments": payments,
            "is_walk_in": is_walk_in,
            "idempotency_key": uuid.uuid4().hex,
        }
        if not is_walk_in and cust is not None:
            payload["customer"] = {
                "id": str(cust.id),
                "name": cust.full_name,
                "phone": cust.phone,
            }
        return self.client.post("/api/v1/billing/checkout/", payload, format="json")

    @patch("apps.whatsapp.service.requests.post")
    def test_auto_send_triggers_across_cash_upi_card_split_and_credit_payments(self, mock_post):
        grand_total = self._compute_total(qty=1)
        half = Decimal(str(grand_total)) / 2

        payment_cases = [
            ("cash", [{"payment_method": "cash", "amount": grand_total}]),
            ("upi", [{"payment_method": "upi", "amount": grand_total, "reference": "UPI-01"}]),
            ("card", [{"payment_method": "card", "amount": grand_total, "reference": "CARD-01"}]),
            (
                "split",
                [
                    {"payment_method": "cash", "amount": str(half)},
                    {"payment_method": "upi", "amount": str(Decimal(str(grand_total)) - half), "reference": "UPI-SPLIT"},
                ],
            ),
            ("credit", [{"payment_method": "credit", "amount": grand_total}]),
        ]

        for idx, (label, payments) in enumerate(payment_cases, start=1):
            mock_post.side_effect = [
                _mock_resp(True, 200, {"id": f"MEDIA_{label}_{idx}"}),
                _mock_resp(True, 200, {"messages": [{"id": f"wamid.{label}.{idx}"}]}),
            ]
            res = self._checkout(payments)
            self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{label}: {res.data}")
            self.assertTrue(res.data["bill_sent"], f"{label} did not mark bill_sent")
            self.assertEqual(res.data["whatsapp_delivery"]["status"], "sent")
            self.assertEqual(res.data["whatsapp_delivery"]["provider_message_id"], f"wamid.{label}.{idx}")
            self.assertEqual(
                res.data["whatsapp_delivery"]["filename"],
                f"Invoice_{res.data['invoice_number']}.pdf",
            )

        self.assertEqual(mock_post.call_count, len(payment_cases) * 2)
        self.product.refresh_from_db()
        self.assertEqual(self.product.current_stock, Decimal("45.00"))

    @patch("apps.whatsapp.service.requests.post")
    def test_quotation_convert_automatically_sends_invoice_pdf_on_whatsapp(self, mock_post):
        mock_post.side_effect = [
            _mock_resp(True, 200, {"id": "MEDIA_QUOTE_01"}),
            _mock_resp(True, 200, {"messages": [{"id": "wamid.QUOTE.01"}]}),
        ]
        q_res = self.client.post(
            "/api/v1/quotations/",
            {
                "customer_id": str(self.customer.id),
                "items": [
                    {
                        "product_id": str(self.product.id),
                        "name": self.product.name,
                        "quantity": 2,
                        "unit_price": "1000.00",
                        "discount": "0.00",
                        "tax_rate": "18.00",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(q_res.status_code, status.HTTP_201_CREATED)
        q_id = q_res.data["id"]

        conv_res = self.client.post(f"/api/v1/quotations/{q_id}/convert/", {"payment_method": "upi"}, format="json")
        self.assertEqual(conv_res.status_code, status.HTTP_201_CREATED, conv_res.data)
        self.assertTrue(conv_res.data["bill_sent"])
        self.assertEqual(conv_res.data["whatsapp_delivery"]["status"], "sent")
        self.assertEqual(conv_res.data["whatsapp_delivery"]["provider_message_id"], "wamid.QUOTE.01")

        # Verify PDF attachment properties
        upload_call, msg_call = mock_post.call_args_list
        fname, fbytes, mime = upload_call.kwargs["files"]["file"]
        self.assertEqual(fname, f"Invoice_{conv_res.data['invoice_number']}.pdf")
        self.assertEqual(mime, "application/pdf")
        self.assertTrue(fbytes.startswith(b"%PDF-"))
        self.assertEqual(msg_call.kwargs["json"]["type"], "document")
        self.assertEqual(msg_call.kwargs["json"]["document"]["caption"], INVOICE_WHATSAPP_CAPTION)

        self.product.refresh_from_db()
        self.assertEqual(self.product.current_stock, Decimal("48.00"))

    @patch("apps.whatsapp.service.requests.post")
    def test_skipped_statuses_recorded_cleanly_without_blocking_sale(self, mock_post):
        grand_total = self._compute_total(qty=1)

        # 1. Walk-in without phone
        res_walkin = self._checkout([{"payment_method": "cash", "amount": grand_total}], is_walk_in=True)
        self.assertEqual(res_walkin.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res_walkin.data["bill_sent"])
        self.assertEqual(res_walkin.data["whatsapp_delivery"]["status"], "skipped")
        self.assertIn("Walk-in customer", res_walkin.data["whatsapp_delivery"]["skip_reason"])

        # Persists on GET /invoices/<id>/send-whatsapp/ across reload
        inv_id = res_walkin.data["invoice"]["id"]
        status_res = self.client.get(f"/api/v1/invoices/{inv_id}/send-whatsapp/")
        self.assertEqual(status_res.status_code, status.HTTP_200_OK)
        self.assertEqual(status_res.data["whatsapp_delivery"]["status"], "skipped")

        # 2. Customer with invalid phone
        bad_phone_cust = CustomerFactory(
            organization=self.org,
            first_name="NoPhone",
            phone="123",
            whatsapp_opt_in=True,
            is_walk_in=False,
        )
        res_bad = self._checkout([{"payment_method": "cash", "amount": grand_total}], customer=bad_phone_cust)
        self.assertEqual(res_bad.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_bad.data["whatsapp_delivery"]["status"], "skipped")

        # 3. Customer opted out
        optout_cust = CustomerFactory(
            organization=self.org,
            first_name="OptOut",
            phone="+91 98200 54321",
            whatsapp_opt_in=False,
            is_walk_in=False,
        )
        res_optout = self._checkout([{"payment_method": "cash", "amount": grand_total}], customer=optout_cust)
        self.assertEqual(res_optout.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_optout.data["whatsapp_delivery"]["status"], "skipped")
        self.assertIn("opted out", res_optout.data["whatsapp_delivery"]["failure_reason"].lower())

        # 4. auto_send_whatsapp disabled in BusinessConfig (via Settings API)
        cfg_res = self.client.patch("/api/v1/pos/config/", {"auto_send_digital_bill": False}, format="json")
        self.assertEqual(cfg_res.status_code, status.HTTP_200_OK)
        self.assertFalse(cfg_res.data["auto_send_digital_bill"])
        res_disabled = self._checkout([{"payment_method": "cash", "amount": grand_total}])
        self.assertEqual(res_disabled.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_disabled.data["whatsapp_delivery"]["status"], "skipped")
        self.assertIn("disabled in Settings", res_disabled.data["whatsapp_delivery"]["failure_reason"])

        # 5. Re-enable auto_send_whatsapp, but WhatsAppConfig is_active=False
        self.client.patch("/api/v1/pos/config/", {"auto_send_digital_bill": True}, format="json")
        self.client.patch("/api/v1/whatsapp/config/", {"is_active": False}, format="json")
        res_inactive = self._checkout([{"payment_method": "cash", "amount": grand_total}])
        self.assertEqual(res_inactive.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_inactive.data["whatsapp_delivery"]["status"], "skipped")
        self.assertIn("disabled in Settings", res_inactive.data["whatsapp_delivery"]["failure_reason"])

        # Meta API was never called across all skipped scenarios
        mock_post.assert_not_called()

    @patch("apps.whatsapp.service.requests.post")
    def test_idempotency_and_concurrent_processing_lock_prevent_double_send(self, mock_post):
        mock_post.side_effect = [
            _mock_resp(True, 200, {"id": "MEDIA_IDEM_1"}),
            _mock_resp(True, 200, {"messages": [{"id": "wamid.IDEM.1"}]}),
        ]
        grand_total = self._compute_total(qty=1)
        res = self._checkout([{"payment_method": "upi", "amount": grand_total}])
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        tx_id = res.data["id"]
        inv_id = res.data["invoice"]["id"]

        # Duplicate background trigger calls do NOT call Meta again
        dup1 = prepare_and_dispatch_post_sale_invoice_whatsapp(tx_id, dispatch_whatsapp=True)
        self.assertEqual(dup1["status"], "already_sent")
        dup2 = send_digital_bill_task(tx_id)
        self.assertEqual(dup2["status"], "already_sent")
        self.assertEqual(mock_post.call_count, 2)

        # Simulate active in-flight 'processing' lock -> concurrent trigger must NOT send
        tx2 = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            customer=self.customer,
            invoice_number=f"INV-LOCK-{uuid.uuid4().hex[:6]}",
            transaction_date=timezone.now(),
            subtotal=Decimal("100.00"),
            discount=Decimal("0.00"),
            tax=Decimal("18.00"),
            total=Decimal("118.00"),
            status="completed",
        )
        inv2 = Invoice.objects.create(
            organization=self.org,
            transaction=tx2,
            invoice_number=tx2.invoice_number,
            secure_token=uuid.uuid4().hex,
            web_url=f"/bills/{uuid.uuid4().hex}",
        )
        WhatsAppMessage.objects.create(
            organization=self.org,
            customer=self.customer,
            phone_number="919820012345",
            message_type="document",
            external_id=f"invoice:{inv2.id}",
            status="processing",
        )
        concurrent_res = deliver_invoice_pdf_via_whatsapp(transaction=tx2, force=False, record_failure=False)
        self.assertEqual(concurrent_res["status"], "processing")
        self.assertEqual(mock_post.call_count, 2)
        self.assertNotEqual(inv_id, str(inv2.id))

    @patch("apps.whatsapp.service.requests.post")
    def test_meta_failure_and_timeout_do_not_rollback_sale_or_leak_tokens_and_can_retry(self, mock_post):
        stock_before = self.product.current_stock
        mock_post.side_effect = requests.Timeout(
            "Timeout reaching Meta with Bearer TOKEN_AUTO_SECRET_999 at EAAXYZSECRET9876543210 /Users/meet/secret.pdf"
        )
        grand_total = self._compute_total(qty=2)
        res = self._checkout([{"payment_method": "card", "amount": grand_total}], qty=2)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Sale, inventory deduction, and invoice persisted cleanly despite WhatsApp timeout
        tx = Transaction.objects.get(id=res.data["id"])
        self.assertEqual(tx.status, "completed")
        self.assertFalse(tx.bill_sent)
        self.product.refresh_from_db()
        self.assertEqual(self.product.current_stock, stock_before - Decimal("2.00"))
        inv = Invoice.objects.get(transaction=tx)

        wa_msg = WhatsAppMessage.objects.get(external_id=f"invoice:{inv.id}")
        self.assertEqual(wa_msg.status, "failed")
        self.assertNotIn("TOKEN_AUTO_SECRET_999", wa_msg.failure_reason or "")
        self.assertNotIn("EAAXYZSECRET9876543210", wa_msg.failure_reason or "")
        self.assertNotIn("/Users/meet", wa_msg.failure_reason or "")

        # Manual retry endpoint succeeds cleanly and increments retry_count
        mock_post.side_effect = [
            _mock_resp(True, 200, {"id": "MEDIA_RETRY_OK"}),
            _mock_resp(True, 200, {"messages": [{"id": "wamid.RETRY.OK"}]}),
        ]
        retry_res = self.client.post(f"/api/v1/invoices/{inv.id}/send-whatsapp/", {}, format="json")
        self.assertEqual(retry_res.status_code, status.HTTP_200_OK)
        self.assertEqual(retry_res.data["whatsapp_delivery"]["status"], "sent")
        wa_msg.refresh_from_db()
        tx.refresh_from_db()
        self.assertEqual(wa_msg.status, "sent")
        self.assertEqual(wa_msg.retry_count, 1)
        self.assertTrue(tx.bill_sent)


class WhatsAppPostCommitAndAsyncTransactionTests(TransactionTestCase):
    def setUp(self):
        self.org = OrganizationFactory(name="PostCommit Org", state="Maharashtra")
        self.admin = UserFactory(organization=self.org, role="org_admin")
        self.store = StoreFactory(organization=self.org, name="Commit Store")
        self.customer = CustomerFactory(
            organization=self.org,
            first_name="Kiran",
            phone="9876501234",
            whatsapp_opt_in=True,
            is_walk_in=False,
        )
        self.product = ProductFactory(
            organization=self.org,
            name="Thermal Receipt Roll",
            sku="ROLL-01",
            unit_price=Decimal("200.00"),
            tax_rate=Decimal("18.00"),
            current_stock=Decimal("10.00"),
            track_inventory=True,
        )
        BusinessConfig.objects.create(
            organization=self.org,
            gst_enabled=True,
            default_tax_mode="exclusive",
            auto_send_whatsapp=True,
        )
        WhatsAppConfig.objects.create(
            organization=self.org,
            business_account_id="WABA_COMMIT",
            phone_number_id="PNID_COMMIT",
            access_token="TOKEN_COMMIT_SECRET",
            is_active=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    @patch("apps.whatsapp.service.requests.post")
    def test_failed_checkout_and_rolled_back_transaction_never_send_whatsapp(self, mock_post):
        # 1. Stock failure during checkout -> 400 error, no transaction, no Meta call
        fail_res = self.client.post(
            "/api/v1/billing/checkout/",
            {
                "store_id": str(self.store.id),
                "items": [{"product_id": str(self.product.id), "quantity": 999, "unit_price": "200.00"}],
                "payments": [{"payment_method": "cash", "amount": "999999.00"}],
                "is_walk_in": False,
                "customer": {"id": str(self.customer.id), "name": self.customer.full_name, "phone": self.customer.phone},
            },
            format="json",
        )
        self.assertEqual(fail_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Transaction.objects.filter(organization=self.org).count(), 0)
        self.assertEqual(WhatsAppMessage.objects.filter(organization=self.org).count(), 0)
        mock_post.assert_not_called()

        # 2. Outer atomic transaction rollback -> on_commit callback NEVER executes!
        tx_stub = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            customer=self.customer,
            invoice_number="INV-ROLLBACK-001",
            transaction_date=timezone.now(),
            subtotal=Decimal("200.00"),
            tax=Decimal("36.00"),
            total=Decimal("236.00"),
            status="completed",
        )
        try:
            with transaction.atomic():
                prepare_and_dispatch_post_sale_invoice_whatsapp(str(tx_stub.id), dispatch_whatsapp=True)
                mock_post.assert_not_called()
                raise RuntimeError("Simulated outer rollback after checkout!")
        except RuntimeError:
            pass

        mock_post.assert_not_called()
        self.assertEqual(WhatsAppMessage.objects.filter(organization=self.org).count(), 0)

    @override_settings(CELERY_TASK_ALWAYS_EAGER=False)
    @patch("apps.invoices.tasks.generate_invoice_task.delay")
    @patch("apps.whatsapp.service.requests.post")
    def test_celery_async_mode_queues_without_blocking_checkout_response(self, mock_post, mock_delay):
        calc = self.client.post(
            "/api/v1/billing/calculate/",
            {"items": [{"product_id": str(self.product.id), "quantity": 1, "unit_price": "200.00"}]},
            format="json",
        )
        res = self.client.post(
            "/api/v1/billing/checkout/",
            {
                "store_id": str(self.store.id),
                "items": [{"product_id": str(self.product.id), "quantity": 1, "unit_price": "200.00"}],
                "payments": [{"payment_method": "cash", "amount": calc.data["grand_total"]}],
                "is_walk_in": False,
                "customer": {"id": str(self.customer.id), "name": self.customer.full_name, "phone": self.customer.phone},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data["bill_sent"])
        self.assertEqual(res.data["whatsapp_delivery"]["status"], "queued")
        self.assertEqual(res.data["whatsapp_delivery"]["retry_count"], 0)
        # Meta API was not called synchronously inside checkout HTTP response
        mock_post.assert_not_called()
        mock_delay.assert_called_once_with(res.data["id"], dispatch_whatsapp=True)

        # Now simulate Celery worker executing delivery once; retry_count stays 0
        mock_post.side_effect = [
            _mock_resp(True, 200, {"id": "MEDIA_CELERY_01"}),
            _mock_resp(True, 200, {"messages": [{"id": "wamid.CELERY.01"}]}),
        ]
        result = deliver_invoice_pdf_via_whatsapp(transaction_id=res.data["id"], force=False, record_failure=False)
        self.assertEqual(result["status"], "sent")
        wa_msg = WhatsAppMessage.objects.get(id=res.data["whatsapp_delivery"]["message_id"])
        self.assertEqual(wa_msg.status, "sent")
        self.assertEqual(wa_msg.retry_count, 0)
        self.assertTrue(
            RealtimeEvent.objects.filter(
                organization=self.org,
                event_type="invoice_whatsapp_updated",
            ).exists()
        )
