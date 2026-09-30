import uuid
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.whatsapp.models import WhatsAppConfig, WhatsAppMessage
from apps.whatsapp.service import send_digital_bill_task
from apps.whatsapp.tasks import process_webhook_task
from apps.transactions.models import Transaction, TransactionItem
from apps.invoices.models import Invoice
from tests.factories import CustomerFactory, OrganizationFactory, StoreFactory


class WhatsAppPipelineTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory()
        self.store = StoreFactory(organization=self.org)
        self.customer = CustomerFactory(organization=self.org, phone="9876543210", whatsapp_opt_in=True)

        self.tx = Transaction.objects.create(
            organization=self.org,
            store=self.store,
            customer=self.customer,
            invoice_number=f"INV-{uuid.uuid4().hex[:6].upper()}",
            transaction_date=timezone.now(),
            subtotal=Decimal("500.00"),
            discount=Decimal("0.00"),
            tax=Decimal("90.00"),
            total=Decimal("590.00"),
        )
        self.invoice = Invoice.objects.create(
            organization=self.org,
            transaction=self.tx,
            invoice_number=self.tx.invoice_number,
            secure_token=uuid.uuid4().hex,
            web_url=f"/bills/{uuid.uuid4().hex}",
        )

    def test_whatsapp_skipped_when_customer_opts_out(self):
        self.customer.whatsapp_opt_in = False
        self.customer.save()

        res = send_digital_bill_task(str(self.tx.id))
        self.assertIn("error", res)
        self.assertIn("opted out", res["error"])

    def test_whatsapp_config_missing_handled_gracefully(self):
        res = send_digital_bill_task(str(self.tx.id))
        self.assertIn("error", res)
        self.assertEqual(res["error"], "WhatsApp not configured")

    @patch("apps.whatsapp.service.WhatsAppService.send_text")
    def test_whatsapp_send_success_records_message(self, mock_send):
        mock_send.return_value = {"messages": [{"id": "wamid.TEST_12345"}]}

        WhatsAppConfig.objects.create(
            organization=self.org,
            business_account_id="WABA_123",
            phone_number_id="PNID_123",
            access_token="TEST_TOKEN",
            is_active=True,
        )

        res = send_digital_bill_task(str(self.tx.id))
        self.assertEqual(res["status"], "sent")

        msg = WhatsAppMessage.objects.get(provider_message_id="wamid.TEST_12345")
        self.assertEqual(msg.customer, self.customer)
        self.assertEqual(msg.status, "sent")
        self.assertIsNotNone(msg.sent_at)

    def test_webhook_processing_updates_delivered_and_read(self):
        msg = WhatsAppMessage.objects.create(
            organization=self.org,
            customer=self.customer,
            phone_number="919876543210",
            message_type="document",
            provider_message_id="wamid.RECEIPT_999",
            status="sent",
            sent_at=timezone.now(),
        )

        # 1. Delivery webhook
        payload_delivered = {
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "statuses": [
                                    {
                                        "id": "wamid.RECEIPT_999",
                                        "status": "delivered",
                                        "timestamp": "1695999999",
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        process_webhook_task(payload_delivered)

        msg.refresh_from_db()
        self.assertEqual(msg.status, "delivered")
        self.assertIsNotNone(msg.delivered_at)

        # 2. Read receipt webhook
        payload_read = {
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "statuses": [
                                    {
                                        "id": "wamid.RECEIPT_999",
                                        "status": "read",
                                        "timestamp": "1696000000",
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        process_webhook_task(payload_read)

        msg.refresh_from_db()
        self.assertEqual(msg.status, "read")
        self.assertIsNotNone(msg.read_at)
