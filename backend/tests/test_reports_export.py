import io
from decimal import Decimal
import openpyxl
import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.users.models import User
from apps.customers.models import Customer
from apps.transactions.models import Transaction, TransactionItem
from apps.reports.services.sales_export_service import SalesExportService


@pytest.fixture
def export_suite_setup(db):
    # Org A (Primary test org)
    org_a = Organization.objects.create(name="Apex Hypermarket", legal_name="Apex Hypermarket Pvt Ltd")
    store_a1 = Store.objects.create(organization=org_a, code="APEX-01", name="Apex Main Store", state="MAHARASHTRA")
    store_a2 = Store.objects.create(organization=org_a, code="APEX-02", name="Apex Mall Branch", state="MAHARASHTRA")

    admin_a = User.objects.create_user(
        email="admin@apex.local",
        password="AdminPassword123!",
        role="org_admin",
        organization=org_a,
    )
    manager_a = User.objects.create_user(
        email="manager@apex.local",
        password="ManagerPassword123!",
        role="store_manager",
        organization=org_a,
    )
    cashier_a = User.objects.create_user(
        email="cashier@apex.local",
        password="CashierPassword123!",
        role="cashier",
        organization=org_a,
    )

    customer_a = Customer.objects.create(
        organization=org_a,
        first_name="Rohan",
        last_name="Sharma",
        phone="9876543210",
        gstin="27AABCR1234D1ZP",
    )

    # Org B (Competitor for cross-tenant isolation testing)
    org_b = Organization.objects.create(name="Beacon Retail", legal_name="Beacon Retail Ltd")
    store_b = Store.objects.create(organization=org_b, code="BEACON-01", name="Beacon City Center", state="MAHARASHTRA")
    admin_b = User.objects.create_user(
        email="admin@beacon.local",
        password="BeaconPassword123!",
        role="org_admin",
        organization=org_b,
    )

    # Seed transactions for Org A
    tx_a1 = Transaction.objects.create(
        organization=org_a,
        store=store_a1,
        customer=customer_a,
        cashier=cashier_a,
        invoice_number="INV-APEX-001",
        transaction_date=timezone.now(),
        subtotal=Decimal("1000.00"),
        discount=Decimal("50.00"),
        tax=Decimal("90.00"),
        round_off=Decimal("0.00"),
        total=Decimal("1040.00"),
        amount_paid=Decimal("1040.00"),
        payment_method="upi",
        status="completed",
    )
    TransactionItem.objects.create(
        transaction=tx_a1,
        name="Electronics Gadget A",
        quantity=Decimal("1.00"),
        unit_price=Decimal("1000.00"),
        discount=Decimal("50.00"),
        tax=Decimal("90.00"),
        cgst_amount=Decimal("45.00"),
        sgst_amount=Decimal("45.00"),
        total=Decimal("1040.00"),
    )

    tx_a2 = Transaction.objects.create(
        organization=org_a,
        store=store_a2,
        invoice_number="INV-APEX-002",
        transaction_date=timezone.now(),
        subtotal=Decimal("500.00"),
        discount=Decimal("0.00"),
        tax=Decimal("25.00"),
        round_off=Decimal("0.00"),
        total=Decimal("525.00"),
        amount_paid=Decimal("525.00"),
        payment_method="cash",
        status="completed",
    )
    TransactionItem.objects.create(
        transaction=tx_a2,
        name="Household Item B",
        quantity=Decimal("2.00"),
        unit_price=Decimal("250.00"),
        tax=Decimal("25.00"),
        cgst_amount=Decimal("12.50"),
        sgst_amount=Decimal("12.50"),
        total=Decimal("525.00"),
    )

    # Seed transaction for Org B (Must never appear in Org A exports)
    Transaction.objects.create(
        organization=org_b,
        store=store_b,
        invoice_number="INV-BEACON-999",
        transaction_date=timezone.now(),
        subtotal=Decimal("9999.00"),
        discount=Decimal("0.00"),
        tax=Decimal("999.00"),
        total=Decimal("10998.00"),
        amount_paid=Decimal("10998.00"),
        payment_method="card",
        status="completed",
    )

    return {
        "org_a": org_a,
        "admin_a": admin_a,
        "manager_a": manager_a,
        "cashier_a": cashier_a,
        "store_a1": store_a1,
        "store_a2": store_a2,
        "org_b": org_b,
        "admin_b": admin_b,
    }


@pytest.mark.django_db
class TestSalesReportExcelExport:
    """
    Test suite for Excel export of POS Sales Reports.
    Verifies authentication, RBAC, tenant isolation, openpyxl parseability,
    sheet structure, KPI cards, and column formatting.
    """

    def test_unauthenticated_request_returns_401(self):
        client = APIClient()
        response = client.get("/api/v1/reports/sales/export/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_cashier_role_returns_403(self, export_suite_setup):
        cashier = export_suite_setup["cashier_a"]
        client = APIClient()
        client.force_authenticate(user=cashier)

        response = client.get("/api/v1/reports/sales/export/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_and_manager_can_export(self, export_suite_setup):
        admin = export_suite_setup["admin_a"]
        manager = export_suite_setup["manager_a"]

        for user in [admin, manager]:
            client = APIClient()
            client.force_authenticate(user=user)
            response = client.get("/api/v1/reports/sales/export/")
            assert response.status_code == status.HTTP_200_OK
            assert response["Content-Type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            assert "attachment; filename=" in response["Content-Disposition"]
            assert response["Content-Disposition"].endswith('.xlsx"')

    def test_cross_tenant_isolation_enforced(self, export_suite_setup):
        """Organization A export must never contain Organization B's transactions or invoice numbers."""
        admin_a = export_suite_setup["admin_a"]
        client = APIClient()
        client.force_authenticate(user=admin_a)

        response = client.get("/api/v1/reports/sales/export/")
        assert response.status_code == status.HTTP_200_OK

        wb = openpyxl.load_workbook(io.BytesIO(response.content))
        assert "Sales Transactions" in wb.sheetnames
        ws = wb["Sales Transactions"]

        all_text = ""
        for row in ws.iter_rows(values_only=True):
            all_text += " " + " ".join(str(cell or "") for cell in row)

        # Org A data present
        assert "INV-APEX-001" in all_text
        assert "INV-APEX-002" in all_text
        assert "Apex Hypermarket" in all_text

        # Org B data strictly excluded
        assert "INV-BEACON-999" not in all_text
        assert "Beacon Retail" not in all_text

    def test_excel_workbook_structure_and_formatting(self, export_suite_setup):
        """Verifies sheet title, KPI cards, table headers, column formatting, and calculations."""
        admin_a = export_suite_setup["admin_a"]
        client = APIClient()
        client.force_authenticate(user=admin_a)

        today_str = timezone.now().strftime("%Y-%m-%d")
        response = client.get(f"/api/v1/reports/sales/export/?start_date={today_str}&end_date={today_str}")
        assert response.status_code == status.HTTP_200_OK

        wb = openpyxl.load_workbook(io.BytesIO(response.content))
        ws = wb["Sales Transactions"]

        # 1. Summary Header
        assert "Apex Hypermarket" in str(ws["A1"].value)
        assert today_str in str(ws["A2"].value)

        # 2. KPI Summary block labels
        kpi_labels = [str(ws.cell(row=4, column=c).value) for c in range(1, 11) if ws.cell(row=4, column=c).value]
        assert any("TOTAL GROSS SALES" in lbl for lbl in kpi_labels)
        assert any("TOTAL DISCOUNTS" in lbl for lbl in kpi_labels)
        assert any("TOTAL NET SALES" in lbl for lbl in kpi_labels)
        assert any("TOTAL TAX (GST)" in lbl for lbl in kpi_labels)
        assert any("TOTAL TRANSACTIONS" in lbl for lbl in kpi_labels)

        # 3. Table Column Headers
        expected_columns = [
            "Date & Time",
            "Invoice / Receipt Number",
            "Customer Name",
            "Customer Phone",
            "Payment Method",
            "Subtotal",
            "Discount Amount",
            "Taxable Amount",
            "CGST",
            "SGST",
            "IGST",
            "Total Tax",
            "Grand Total",
            "Status",
        ]
        actual_headers = [ws.cell(row=7, column=col_idx).value for col_idx in range(1, len(expected_columns) + 1)]
        assert actual_headers == expected_columns

        # Verify Header Styling (Navy solid fill #1E293B, white bold font)
        for col_idx in range(1, len(expected_columns) + 1):
            cell = ws.cell(row=7, column=col_idx)
            assert cell.fill.start_color.rgb == "001E293B" or cell.fill.start_color.rgb == "1E293B"
            assert cell.font.bold is True
            assert cell.font.color.rgb == "00FFFFFF" or cell.font.color.rgb == "FFFFFF"

        # 4. Total Row verification
        total_row = None
        for r in range(8, ws.max_row + 1):
            if ws.cell(row=r, column=1).value == "TOTAL":
                total_row = r
                break

        assert total_row is not None
        # Subtotal: 1000 + 500 = 1500.00
        assert ws.cell(row=total_row, column=6).value == 1500.00
        # Discounts: 50.00
        assert ws.cell(row=total_row, column=7).value == 50.00
        # Net total: 1040 + 525 = 1565.00
        assert ws.cell(row=total_row, column=13).value == 1565.00

    def test_filter_by_payment_method(self, export_suite_setup):
        admin_a = export_suite_setup["admin_a"]
        client = APIClient()
        client.force_authenticate(user=admin_a)

        # Filter strictly for UPI payments
        response = client.get("/api/v1/reports/sales/export/?payment_method=upi")
        assert response.status_code == status.HTTP_200_OK

        wb = openpyxl.load_workbook(io.BytesIO(response.content))
        ws = wb["Sales Transactions"]

        invoices = [ws.cell(row=r, column=2).value for r in range(8, ws.max_row) if ws.cell(row=r, column=1).value != "TOTAL"]
        assert "INV-APEX-001" in invoices
        assert "INV-APEX-002" not in invoices  # Cash invoice must be filtered out

    def test_filter_by_store_id(self, export_suite_setup):
        admin_a = export_suite_setup["admin_a"]
        store_a2 = export_suite_setup["store_a2"]
        client = APIClient()
        client.force_authenticate(user=admin_a)

        response = client.get(f"/api/v1/reports/sales/export/?store_id={store_a2.id}")
        assert response.status_code == status.HTTP_200_OK

        wb = openpyxl.load_workbook(io.BytesIO(response.content))
        ws = wb["Sales Transactions"]

        invoices = [ws.cell(row=r, column=2).value for r in range(8, ws.max_row) if ws.cell(row=r, column=1).value != "TOTAL"]
        assert "INV-APEX-002" in invoices
        assert "INV-APEX-001" not in invoices

    def test_alias_endpoint_export_sales(self, export_suite_setup):
        admin_a = export_suite_setup["admin_a"]
        client = APIClient()
        client.force_authenticate(user=admin_a)

        response = client.get("/api/v1/reports/export-sales/")
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
