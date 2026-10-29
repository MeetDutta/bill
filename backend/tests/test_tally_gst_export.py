import pytest
import xml.etree.ElementTree as ET
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient

from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.users.models import User
from apps.products.models import Product, ProductCategory
from apps.customers.models import Customer
from apps.transactions.models import Transaction, TransactionItem, TransactionPayment, SalesReturn
from apps.billing.models import TallyLedgerConfig, TallyExportLog, BusinessConfig
from apps.billing.services.tally_export_service import TallyExportService


@pytest.fixture
def tally_setup(db):
    org = Organization.objects.create(
        name="Apex Retail Traders",
        legal_name="Apex Retail Private Limited",
        gst_number="27ABCDE1234F1Z5",  # Maharashtra (27)
        state="Maharashtra",
    )
    store = Store.objects.create(
        organization=org,
        name="Mumbai Flagship Store",
        code="MUM-01",
        state="Maharashtra",
    )
    admin = User.objects.create_user(
        email="tallyadmin@apex.local",
        password="Password@123",
        organization=org,
        role="org_admin",
        first_name="Tally",
        last_name="Admin",
    )
    category = ProductCategory.objects.create(organization=org, name="Computers")
    ledger_config = TallyExportService.get_or_create_config(org)
    return {
        "org": org,
        "store": store,
        "admin": admin,
        "category": category,
        "ledger_config": ledger_config,
    }


@pytest.mark.django_db
class TestTallyGSTAccountingExport:
    def test_intra_state_sales_and_receipt_voucher(self, tally_setup):
        """
        Intra-state transaction in Maharashtra (Seller 27 -> Buyer 27):
        Should charge CGST + SGST, generate balanced Sales Voucher and Receipt Voucher.
        """
        org = tally_setup["org"]
        store = tally_setup["store"]
        admin = tally_setup["admin"]

        customer = Customer.objects.create(
            organization=org,
            first_name="Rahul",
            last_name="Sharma",
            phone="9820011223",
            state="Maharashtra",
            gstin="27AABCR1234D1ZP",  # Maharashtra B2B GSTIN
        )

        prod = Product.objects.create(
            organization=org,
            name="Office Desk Monitor",
            sku="MON-001",
            selling_price=Decimal("10000.00"),
            tax_rate=Decimal("18.00"),
            hsn_code="8528",
        )

        # Total: 10,000 + 9% CGST (900) + 9% SGST (900) = 11,800
        tx = Transaction.objects.create(
            organization=org,
            store=store,
            customer=customer,
            cashier=admin,
            invoice_number="INV-2026-001",
            transaction_date=timezone.now(),
            subtotal=Decimal("10000.00"),
            discount=Decimal("0.00"),
            tax=Decimal("1800.00"),
            round_off=Decimal("0.00"),
            total=Decimal("11800.00"),
            amount_paid=Decimal("11800.00"),
            outstanding_amount=Decimal("0.00"),
            payment_method="bank",
            payment_status="paid",
        )
        TransactionItem.objects.create(
            transaction=tx,
            product=prod,
            name=prod.name,
            quantity=Decimal("1.00"),
            unit_price=Decimal("10000.00"),
            discount=Decimal("0.00"),
            tax=Decimal("1800.00"),
            tax_rate=Decimal("18.00"),
            cgst_amount=Decimal("900.00"),
            sgst_amount=Decimal("900.00"),
            igst_amount=Decimal("0.00"),
            total=Decimal("11800.00"),
            hsn_code="8528",
        )
        TransactionPayment.objects.create(
            organization=org,
            transaction=tx,
            payment_method="bank_transfer",
            amount=Decimal("11800.00"),
            reference="NEFT998811",
        )

        xml_str, filename, preview = TallyExportService.generate_tally_xml(organization=org, user=admin)
        assert "Tally_GST_Sales_Export" in filename

        # Verify XML structure and parseability
        root = ET.fromstring(xml_str.encode("utf-8"))
        vouchers = root.findall(".//VOUCHER")
        assert len(vouchers) == 2  # 1 Sales Voucher + 1 Receipt Voucher

        sales_vch = vouchers[0]
        assert sales_vch.attrib["VCHTYPE"] == "Sales"
        assert sales_vch.find("VOUCHERNUMBER").text == "INV-2026-001"
        assert sales_vch.find("PLACEOFSUPPLY").text == "MAHARASHTRA"
        assert sales_vch.find("PARTYGSTIN").text == "27AABCR1234D1ZP"

        # Check ledger balance in sales voucher: sum(amounts) == 0.00
        sales_amounts = [Decimal(node.text) for node in sales_vch.findall(".//ALLLEDGERENTRIES.LIST/AMOUNT")]
        assert sum(sales_amounts) == Decimal("0.00")
        # Debit: -11800, Credits: +10000, +900, +900
        assert Decimal("-11800.00") in sales_amounts
        assert Decimal("10000.00") in sales_amounts
        assert Decimal("900.00") in sales_amounts

        # Receipt voucher
        rec_vch = vouchers[1]
        assert rec_vch.attrib["VCHTYPE"] == "Receipt"
        assert "REC-INV-2026-001-1" in rec_vch.find("VOUCHERNUMBER").text
        rec_amounts = [Decimal(node.text) for node in rec_vch.findall(".//ALLLEDGERENTRIES.LIST/AMOUNT")]
        assert sum(rec_amounts) == Decimal("0.00")
        assert Decimal("-11800.00") in rec_amounts
        assert Decimal("11800.00") in rec_amounts

    def test_inter_state_sales_voucher_igst(self, tally_setup):
        """
        Inter-state transaction (Seller in Maharashtra 27 -> Buyer in Gujarat 24):
        Should charge IGST (18%), place of supply Gujarat.
        """
        org = tally_setup["org"]
        store = tally_setup["store"]
        admin = tally_setup["admin"]

        customer = Customer.objects.create(
            organization=org,
            first_name="Ahmedabad",
            last_name="Enterprises",
            phone="9720055443",
            state="Gujarat",
            gstin="24ABCDE9999F1Z1",  # Gujarat (24)
        )

        tx = Transaction.objects.create(
            organization=org,
            store=store,
            customer=customer,
            cashier=admin,
            invoice_number="INV-2026-INTER-01",
            transaction_date=timezone.now(),
            subtotal=Decimal("20000.00"),
            discount=Decimal("0.00"),
            tax=Decimal("3600.00"),
            round_off=Decimal("0.00"),
            total=Decimal("23600.00"),
            amount_paid=Decimal("23600.00"),
            payment_method="upi",
            payment_status="paid",
        )
        TransactionItem.objects.create(
            transaction=tx,
            name="Server Equipment",
            quantity=Decimal("1.00"),
            unit_price=Decimal("20000.00"),
            discount=Decimal("0.00"),
            tax=Decimal("3600.00"),
            tax_rate=Decimal("18.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=Decimal("3600.00"),
            total=Decimal("23600.00"),
            hsn_code="8471",
        )

        xml_str, _, preview = TallyExportService.generate_tally_xml(organization=org, user=admin)
        root = ET.fromstring(xml_str.encode("utf-8"))

        sales_vch = root.find(".//VOUCHER[@VCHTYPE='Sales']")
        assert sales_vch is not None
        assert sales_vch.find("PLACEOFSUPPLY").text == "GUJARAT"

        ledger_names = [node.text for node in sales_vch.findall(".//ALLLEDGERENTRIES.LIST/LEDGERNAME")]
        assert "Output IGST" in ledger_names
        assert "Output CGST" not in ledger_names
        assert "Output SGST" not in ledger_names

        amounts = [Decimal(node.text) for node in sales_vch.findall(".//ALLLEDGERENTRIES.LIST/AMOUNT")]
        assert sum(amounts) == Decimal("0.00")
        assert Decimal("-23600.00") in amounts  # Debit Debtor
        assert Decimal("20000.00") in amounts   # Credit Sales
        assert Decimal("3600.00") in amounts    # Credit IGST

    def test_credit_sale_and_partial_payment(self, tally_setup):
        """
        Credit sale with partial payment:
        Total: 5000, Paid: 2000 (Cash), Outstanding: 3000.
        Sales voucher = 5000; Receipt voucher = 2000; Outstanding = 3000.
        """
        org = tally_setup["org"]
        store = tally_setup["store"]
        admin = tally_setup["admin"]

        customer = Customer.objects.create(
            organization=org,
            first_name="Vikram",
            last_name="Mehta",
            phone="9811122233",
            state="Maharashtra",
        )

        tx = Transaction.objects.create(
            organization=org,
            store=store,
            customer=customer,
            cashier=admin,
            invoice_number="INV-2026-CREDIT-01",
            transaction_date=timezone.now(),
            subtotal=Decimal("5000.00"),
            tax=Decimal("0.00"),
            total=Decimal("5000.00"),
            amount_paid=Decimal("2000.00"),
            outstanding_amount=Decimal("3000.00"),
            payment_method="cash",
            payment_status="partial",
        )
        TransactionItem.objects.create(
            transaction=tx,
            name="Exempt Stationery Goods",
            quantity=Decimal("50.00"),
            unit_price=Decimal("100.00"),
            tax=Decimal("0.00"),
            tax_rate=Decimal("0.00"),
            total=Decimal("5000.00"),
            hsn_code="4901",
        )
        TransactionPayment.objects.create(
            organization=org,
            transaction=tx,
            payment_method="cash",
            amount=Decimal("2000.00"),
        )

        xml_str, _, preview = TallyExportService.generate_tally_xml(organization=org, user=admin)
        assert preview["summary"]["outstanding_receivables"] == "3000.00"
        assert preview["summary"]["total_recorded_payments"] == "2000.00"

        root = ET.fromstring(xml_str.encode("utf-8"))
        sales_vch = root.find(".//VOUCHER[@VCHTYPE='Sales']")
        receipt_vch = root.find(".//VOUCHER[@VCHTYPE='Receipt']")

        # Sales debits full 5000
        sales_amounts = [Decimal(n.text) for n in sales_vch.findall(".//ALLLEDGERENTRIES.LIST/AMOUNT")]
        assert sum(sales_amounts) == Decimal("0.00")
        assert Decimal("-5000.00") in sales_amounts
        assert Decimal("5000.00") in sales_amounts

        # Receipt debits Cash for 2000, credits Debtor for 2000
        rec_amounts = [Decimal(n.text) for n in receipt_vch.findall(".//ALLLEDGERENTRIES.LIST/AMOUNT")]
        assert sum(rec_amounts) == Decimal("0.00")
        assert Decimal("-2000.00") in rec_amounts
        assert Decimal("2000.00") in rec_amounts

    def test_sales_return_credit_note_voucher(self, tally_setup):
        """
        Sales return generates a balanced Credit Note voucher in Tally XML.
        """
        org = tally_setup["org"]
        store = tally_setup["store"]
        admin = tally_setup["admin"]

        customer = Customer.objects.create(
            organization=org,
            first_name="Anita",
            last_name="Roy",
            phone="9830012345",
            state="Maharashtra",
        )

        orig_tx = Transaction.objects.create(
            organization=org,
            store=store,
            customer=customer,
            invoice_number="INV-ORIG-001",
            transaction_date=timezone.now(),
            total=Decimal("1500.00"),
            subtotal=Decimal("1500.00"),
            payment_status="paid",
        )

        SalesReturn.objects.create(
            organization=org,
            store=store,
            customer=customer,
            original_transaction=orig_tx,
            return_number="RET-2026-001",
            total_refund_amount=Decimal("1500.00"),
            refund_method="cash",
            status="completed",
            reason="Damaged item returned",
        )

        xml_str, _, preview = TallyExportService.generate_tally_xml(organization=org, user=admin)
        assert preview["summary"]["credit_notes_count"] == 1
        assert preview["summary"]["total_refund_amount"] == "1500.00"

        root = ET.fromstring(xml_str.encode("utf-8"))
        cn_vch = root.find(".//VOUCHER[@VCHTYPE='Credit Note']")
        assert cn_vch is not None
        assert cn_vch.find("VOUCHERNUMBER").text == "RET-2026-001"
        assert cn_vch.find("REFERENCE").text == "INV-ORIG-001"

        cn_amounts = [Decimal(n.text) for n in cn_vch.findall(".//ALLLEDGERENTRIES.LIST/AMOUNT")]
        assert sum(cn_amounts) == Decimal("0.00")
        assert Decimal("-1500.00") in cn_amounts  # Debit Sales Returns
        assert Decimal("1500.00") in cn_amounts   # Credit Party

    def test_export_idempotency_and_history(self, tally_setup):
        """
        Exporting tags transactions with tally_exported_at; subsequent exports do not duplicate.
        """
        org = tally_setup["org"]
        store = tally_setup["store"]
        admin = tally_setup["admin"]

        tx = Transaction.objects.create(
            organization=org,
            store=store,
            invoice_number="INV-IDEMP-01",
            transaction_date=timezone.now(),
            total=Decimal("800.00"),
            subtotal=Decimal("800.00"),
            payment_status="paid",
        )

        # 1. First Export
        xml_1, _, preview_1 = TallyExportService.generate_tally_xml(organization=org, user=admin)
        assert preview_1["summary"]["sales_vouchers_count"] == 1

        tx.refresh_from_db()
        assert tx.tally_exported_at is not None
        assert TallyExportLog.objects.filter(organization=org).count() == 1

        # 2. Second Export (default: include_previously_exported=False)
        preview_2 = TallyExportService.validate_and_preview(organization=org, include_previously_exported=False)
        assert preview_2["summary"]["sales_vouchers_count"] == 0

        # 3. Repeatable export when requested (include_previously_exported=True)
        preview_3 = TallyExportService.validate_and_preview(organization=org, include_previously_exported=True)
        assert preview_3["summary"]["sales_vouchers_count"] == 1

    def test_api_endpoints_preview_config_and_export(self, tally_setup):
        """
        Tests REST API endpoints for preview, config update, export download, and history.
        """
        org = tally_setup["org"]
        admin = tally_setup["admin"]

        client = APIClient()
        client.force_authenticate(user=admin)

        # 1. Preview API
        res_prev = client.get("/api/v1/pos/reports/sales/tally-preview/?period=today")
        assert res_prev.status_code == 200
        assert "summary" in res_prev.data
        assert "disclaimer" in res_prev.data
        assert "ledger_mapping" in res_prev.data

        # 2. Config GET & POST
        res_cfg = client.get("/api/v1/pos/reports/sales/tally-config/")
        assert res_cfg.status_code == 200
        assert res_cfg.data["sales_ledger"] == "Sales Account"

        res_update = client.post(
            "/api/v1/pos/reports/sales/tally-config/",
            {"sales_ledger": "Domestic Sales Account", "cgst_ledger": "Central GST Output"},
            format="json",
        )
        assert res_update.status_code == 200
        cfg_db = TallyLedgerConfig.objects.get(organization=org)
        assert cfg_db.sales_ledger == "Domestic Sales Account"
        assert cfg_db.cgst_ledger == "Central GST Output"

        # 3. Export API (JSON response format)
        res_exp = client.post(
            "/api/v1/pos/reports/sales/tally-export/",
            {"period": "this_month", "include_previously_exported": True, "return_json": True},
            format="json",
        )
        assert res_exp.status_code == 200
        assert res_exp.data["status"] == "success"
        assert "<ENVELOPE>" in res_exp.data["xml_content"]

        # 4. History API
        res_hist = client.get("/api/v1/pos/reports/sales/tally-history/")
        assert res_hist.status_code == 200
        assert len(res_hist.data["history"]) >= 1

    def test_validation_blocks_on_missing_ledger_mapping(self, tally_setup):
        """
        Export is blocked if mandatory ledger mapping is empty.
        """
        org = tally_setup["org"]
        admin = tally_setup["admin"]

        cfg = TallyLedgerConfig.objects.get(organization=org)
        cfg.sales_ledger = ""
        cfg.save()

        preview = TallyExportService.validate_and_preview(organization=org)
        assert preview["validation"]["can_export"] is False
        assert any("Sales Ledger" in err for err in preview["validation"]["blocking_errors"])

        with pytest.raises(ValueError, match="Export blocked"):
            TallyExportService.generate_tally_xml(organization=org, user=admin)

    def test_validation_flags_invalid_gstin_and_unbalanced_voucher(self, tally_setup):
        """
        Incomplete or malformed GSTIN produces warnings, and unbalanced voucher produces blocking error.
        """
        org = tally_setup["org"]
        store = tally_setup["store"]

        customer = Customer.objects.create(
            organization=org,
            first_name="Bad GSTIN Customer",
            phone="9877766655",
            gstin="INVALID-GSTIN-123",  # Malformed
        )

        # Unbalanced transaction (total != taxable + tax - discount + roundoff)
        Transaction.objects.create(
            organization=org,
            store=store,
            customer=customer,
            invoice_number="INV-UNBALANCED-01",
            transaction_date=timezone.now(),
            subtotal=Decimal("1000.00"),
            tax=Decimal("180.00"),
            total=Decimal("9999.00"),  # Corrupted / unbalanced total!
            payment_status="paid",
        )

        preview = TallyExportService.validate_and_preview(organization=org, include_previously_exported=True)
        assert preview["validation"]["can_export"] is False
        assert any("double-entry balance check" in err for err in preview["validation"]["blocking_errors"])
        assert any("Customer GSTIN 'INVALID-GSTIN-123' is invalid" in warn for warn in preview["validation"]["warnings"])

