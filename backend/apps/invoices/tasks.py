import uuid

from celery import shared_task
from django.utils import timezone


@shared_task(name="apps.invoices.tasks.generate_invoice_task")
def generate_invoice_task(transaction_id):
    from apps.transactions.models import Transaction
    from apps.invoices.models import Invoice

    try:
        tx = Transaction.objects.get(id=transaction_id)
    except Transaction.DoesNotExist:
        return {"error": "Transaction not found"}

    if hasattr(tx, "invoice"):
        return {"message": "Invoice already exists", "invoice_id": str(tx.invoice.id)}

    secure_token = uuid.uuid4().hex
    invoice_number = f"INV-{timezone.now().strftime('%Y%m')}-{tx.invoice_number}"

    invoice = Invoice.objects.create(
        organization=tx.organization,
        transaction=tx,
        invoice_number=invoice_number,
        secure_token=secure_token,
        web_url=f"/bills/{secure_token}",
    )

    return {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "secure_token": secure_token,
    }
