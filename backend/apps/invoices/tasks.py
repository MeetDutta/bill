import logging
import secrets
from celery import shared_task

logger = logging.getLogger(__name__)


def ensure_invoice_for_transaction(tx, generate_file=True):
    """
    Create or retrieve the canonical Invoice for a Transaction, optionally persisting its ReportLab PDF.
    Reused across invoice tasks and WhatsApp PDF delivery without duplicating invoice logic.
    """
    from apps.invoices.models import Invoice
    from apps.invoices.pdf import generate_invoice_pdf

    invoice = Invoice.objects.filter(transaction=tx).first()
    if not invoice:
        secure_token = secrets.token_urlsafe(24)
        invoice_number = tx.invoice_number
        if not invoice_number:
            from apps.billing.services.invoice_number_service import InvoiceNumberService
            invoice_number = InvoiceNumberService.generate_invoice_number(tx.organization, tx.store)
            tx.invoice_number = invoice_number
            tx.save(update_fields=["invoice_number"])

        try:
            invoice, created = Invoice.objects.get_or_create(
                transaction=tx,
                defaults={
                    "organization": tx.organization,
                    "invoice_number": invoice_number,
                    "secure_token": secure_token,
                    "web_url": f"/bills/{secure_token}",
                },
            )
        except Exception as e:
            logger.warning("Invoice get_or_create collision: %s. Fetching existing invoice.", e)
            invoice = Invoice.objects.filter(transaction=tx).first()
            if not invoice:
                raise

    if generate_file and not invoice.pdf_url:
        try:
            pdf_url = generate_invoice_pdf(invoice, format_type=getattr(invoice, "template_format", "a4") or "a4")
            if pdf_url:
                invoice.pdf_url = pdf_url
                invoice.save(update_fields=["pdf_url"])
        except Exception as e:
            logger.error("PDF generation failed for invoice %s: %s", invoice.invoice_number, e)

    return invoice


@shared_task(name="apps.invoices.tasks.generate_invoice_task")
def generate_invoice_task(transaction_id, dispatch_whatsapp=True):
    from apps.transactions.models import Transaction
    from apps.billing.models import BusinessConfig

    try:
        tx = Transaction.objects.select_related("organization", "store", "customer").prefetch_related("items").get(id=transaction_id)
    except Transaction.DoesNotExist:
        logger.error("Transaction %s not found in generate_invoice_task", transaction_id)
        return {"error": "Transaction not found"}

    invoice = ensure_invoice_for_transaction(tx, generate_file=True)

    config = BusinessConfig.objects.filter(organization=tx.organization).first()
    if dispatch_whatsapp and config and config.auto_send_whatsapp:
        try:
            from apps.whatsapp.tasks import send_digital_bill_task
            send_digital_bill_task.delay(str(tx.id))
        except Exception as e:
            logger.warning("Failed to dispatch send_digital_bill_task: %s", e)

    return {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "secure_token": invoice.secure_token,
        "pdf_url": invoice.pdf_url,
    }
