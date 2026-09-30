import secrets
from celery import shared_task
from django.utils import timezone


@shared_task(name="apps.invoices.tasks.generate_invoice_task")
def generate_invoice_task(transaction_id):
    from apps.transactions.models import Transaction
    from apps.invoices.models import Invoice
    from apps.invoices.pdf import generate_invoice_pdf

    try:
        tx = Transaction.objects.select_related("organization", "store", "customer").prefetch_related("items").get(id=transaction_id)
    except Transaction.DoesNotExist:
        return {"error": "Transaction not found"}

    # Check if invoice already exists for this transaction
    invoice = Invoice.objects.filter(transaction=tx).first()
    if not invoice:
        secure_token = secrets.token_urlsafe(24)
        base_num = f"INV-{timezone.now().strftime('%Y%m')}-{tx.invoice_number}"
        invoice_number = base_num
        counter = 1
        while Invoice.objects.filter(invoice_number=invoice_number).exists():
            invoice_number = f"{base_num}-{secrets.token_hex(3)}"
            counter += 1
            if counter > 5:
                break

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
        except Exception:
            invoice = Invoice.objects.filter(transaction=tx).first()
            if not invoice:
                raise

    if not invoice.pdf_url:
        pdf_url = generate_invoice_pdf(invoice)
        if pdf_url:
            invoice.pdf_url = pdf_url
            invoice.save(update_fields=["pdf_url"])

    from apps.whatsapp.tasks import send_digital_bill_task
    send_digital_bill_task.delay(str(tx.id))

    return {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "secure_token": invoice.secure_token,
        "pdf_url": invoice.pdf_url,
    }
