import json
from django.core.management.base import BaseCommand
from apps.billing.services.reconciliation_service import ReconciliationService


class Command(BaseCommand):
    help = "Reconcile invoices, transactions, inventory ledgers, and customer credit balances."

    def add_arguments(self, parser):
        parser.add_argument("--invoice", type=str, help="Verify specific invoice by ID or number")
        parser.add_argument("--transaction", type=str, help="Verify specific transaction by ID")
        parser.add_argument("--product", type=str, help="Verify product inventory integrity against movement ledger")
        parser.add_argument("--customer", type=str, help="Verify customer outstanding credit balance against invoices")
        parser.add_argument("--purchase", type=str, help="Verify purchase order integrity and inventory reception")
        parser.add_argument("--all", action="store_true", help="Run scan on latest records across all entities")
        parser.add_argument("--org", type=str, help="Filter by Organization ID")

    def handle(self, *args, **options):
        org_id = options.get("org")
        if options.get("invoice"):
            res = ReconciliationService.verify_invoice_integrity(options["invoice"])
            self._print_result("Invoice Integrity", res)
        elif options.get("transaction"):
            res = ReconciliationService.verify_transaction_integrity(options["transaction"])
            self._print_result("Transaction Integrity", res)
        elif options.get("product"):
            res = ReconciliationService.verify_inventory_integrity(options["product"])
            self._print_result("Inventory Integrity", res)
        elif options.get("customer"):
            res = ReconciliationService.verify_customer_balance(options["customer"])
            self._print_result("Customer Balance Integrity", res)
        elif options.get("purchase"):
            res = ReconciliationService.verify_purchase_integrity(options["purchase"])
            self._print_result("Purchase Order Integrity", res)
        elif options.get("all"):
            self.stdout.write(self.style.MIGRATE_HEADING("Running system-wide reconciliation audit..."))
            from apps.invoices.models import Invoice
            from apps.products.models import Product
            from apps.customers.models import Customer
            
            invoices = Invoice.objects.all()[:50]
            for inv in invoices:
                r = ReconciliationService.verify_invoice_integrity(str(inv.id))
                if not r.get("valid"):
                    self._print_result(f"Invoice {inv.invoice_number}", r)
            
            products = Product.objects.filter(track_inventory=True)[:50]
            for prod in products:
                r = ReconciliationService.verify_inventory_integrity(str(prod.id))
                if not r.get("valid"):
                    self._print_result(f"Product {prod.name}", r)
            
            customers = Customer.objects.filter(outstanding_credit__gt=0)[:50]
            for cust in customers:
                r = ReconciliationService.verify_customer_balance(str(cust.id))
                if not r.get("valid"):
                    self._print_result(f"Customer {cust.full_name}", r)
            
            self.stdout.write(self.style.SUCCESS("System-wide scan completed successfully."))
        else:
            self.stdout.write(self.style.WARNING("Please provide a flag: --invoice, --transaction, --product, --customer, --purchase, or --all."))


    def _print_result(self, title: str, res: dict):
        self.stdout.write(self.style.MIGRATE_HEADING(f"=== {title} ==="))
        self.stdout.write(json.dumps(res, indent=2))
        if res.get("valid"):
            self.stdout.write(self.style.SUCCESS("[PASS] Data is consistent."))
        else:
            self.stdout.write(self.style.ERROR("[FAIL] Inconsistencies detected!"))
