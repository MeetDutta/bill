from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
import zoneinfo

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APIClient

from apps.billing.models import BusinessConfig
from apps.billing.services.checkout_service import CheckoutService
from apps.billing.services.credit_service import CreditService
from apps.billing.services.return_service import ReturnService
from apps.customers.analytics import (
    get_customer_detailed_analytics,
    reconcile_organization_customer_sales,
)
from apps.customers.models import Customer
from apps.transactions.models import Transaction, TransactionItem, TransactionPayment
from tests.factories import (
    CustomerFactory,
    OrganizationFactory,
    ProductFactory,
    StoreFactory,
    TransactionFactory,
    UserFactory,
)


class CustomerAnalyticsKPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory(
            timezone="Asia/Kolkata",
            gst_number="27AABCT1234F1Z5",
            state="Maharashtra",
        )
        self.user = UserFactory(organization=self.org, role="org_admin")
        self.store = StoreFactory(organization=self.org)
        self.config = BusinessConfig.objects.create(
            organization=self.org,
            gst_enabled=True,
            allow_credit_sales=True,
            allow_negative_stock=True,
        )
        self.client.force_authenticate(user=self.user)
        self.biz_tz = zoneinfo.ZoneInfo("Asia/Kolkata")

    def _make_tx(
        self,
        *,
        customer=None,
        total=Decimal("500.00"),
        tx_dt=None,
        tx_status="completed",
        payment_method="cash",
        payment_status="paid",
        amount_paid=None,
        outstanding_amount=Decimal("0.00"),
        is_return=False,
        allocations=None,
    ):
        tx_dt = tx_dt or datetime(2026, 11, 12, 14, 0, 0, tzinfo=self.biz_tz)
        amt_paid = total if amount_paid is None else amount_paid
        tx = TransactionFactory(
            organization=self.org,
            store=self.store,
            customer=customer,
            cashier=self.user,
            total=total,
            subtotal=total,
            tax=Decimal("0.00"),
            discount=Decimal("0.00"),
            transaction_date=tx_dt,
            status=tx_status,
            payment_method=payment_method,
            payment_status=payment_status,
            amount_paid=amt_paid,
            outstanding_amount=outstanding_amount,
            is_return=is_return,
        )
        if allocations:
            for pm, amt in allocations:
                TransactionPayment.objects.create(
                    organization=self.org,
                    transaction=tx,
                    payment_method=pm,
                    amount=Decimal(str(amt)),
                    status="success",
                )
        else:
            TransactionPayment.objects.create(
                organization=self.org,
                transaction=tx,
                payment_method=payment_method,
                amount=total,
                status="success",
            )
        return tx

    def test_1_customer_purchases_today_count_and_spend_separated(self):
        """TEST 1: Customer has 2 purchases today -> Today's Purchase Count = 2 & Spend separated."""
        fixed_now = datetime(2026, 11, 12, 18, 30, 0, tzinfo=self.biz_tz)
        cust = CustomerFactory(organization=self.org, first_name="Vrushabh", last_name="Gillakar", phone="9322520275")

        self._make_tx(customer=cust, total=Decimal("450.00"), tx_dt=datetime(2026, 11, 12, 0, 5, 0, tzinfo=self.biz_tz))
        self._make_tx(customer=cust, total=Decimal("750.00"), tx_dt=datetime(2026, 11, 12, 17, 15, 0, tzinfo=self.biz_tz))
        # Yesterday at 23:55 IST should NOT count in Today
        self._make_tx(customer=cust, total=Decimal("1000.00"), tx_dt=datetime(2026, 11, 11, 23, 55, 0, tzinfo=self.biz_tz))

        with patch("django.utils.timezone.now", return_value=fixed_now):
            res = self.client.get(f"/api/v1/customers/{cust.id}/analytics/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            data = res.data
            self.assertEqual(data["today"]["purchase_count"], 2)
            self.assertEqual(data["today"]["spend"], 1200.0)
            self.assertEqual(data["lifetime"]["purchase_count"], 3)
            self.assertEqual(data["lifetime"]["spend"], 2200.0)

            list_res = self.client.get("/api/v1/customers/")
            self.assertEqual(list_res.status_code, status.HTTP_200_OK)
            row = next(r for r in list_res.data["results"] if r["id"] == str(cust.id))
            self.assertEqual(row["today_purchase_count"], 2)
            self.assertEqual(row["today_spend"], 1200.0)
            self.assertEqual(row["total_purchase_count"], 3)
            self.assertEqual(row["lifetime_spend"], 2200.0)

    def test_2_weekly_boundary_calculations(self):
        """TEST 2: Purchases across multiple weeks -> Current Monday-Sunday week calculated accurately."""
        # Thursday Nov 12, 2026 -> Current Monday is Nov 9, 2026
        fixed_now = datetime(2026, 11, 12, 12, 0, 0, tzinfo=self.biz_tz)
        cust = CustomerFactory(organization=self.org, first_name="Week", last_name="Buyer", phone="9811111111")

        # Inside this week (Monday 00:01 IST + Thursday)
        self._make_tx(customer=cust, total=Decimal("500.00"), tx_dt=datetime(2026, 11, 9, 0, 1, 0, tzinfo=self.biz_tz))
        self._make_tx(customer=cust, total=Decimal("800.00"), tx_dt=datetime(2026, 11, 12, 10, 0, 0, tzinfo=self.biz_tz))
        # Last week Sunday 23:59 IST (Nov 8) -> Outside this week, inside this month
        self._make_tx(customer=cust, total=Decimal("1200.00"), tx_dt=datetime(2026, 11, 8, 23, 59, 0, tzinfo=self.biz_tz))

        with patch("django.utils.timezone.now", return_value=fixed_now):
            res = self.client.get(f"/api/v1/customers/{cust.id}/analytics/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data["today"]["purchase_count"], 1)
            self.assertEqual(res.data["today"]["spend"], 800.0)
            self.assertEqual(res.data["week"]["purchase_count"], 2)
            self.assertEqual(res.data["week"]["spend"], 1300.0)
            self.assertEqual(res.data["month"]["purchase_count"], 3)
            self.assertEqual(res.data["month"]["spend"], 2500.0)

    def test_3_monthly_boundary_calculations(self):
        """TEST 3: Purchases across multiple months -> Current calendar month isolated cleanly."""
        fixed_now = datetime(2026, 11, 12, 12, 0, 0, tzinfo=self.biz_tz)
        cust = CustomerFactory(organization=self.org, first_name="Month", last_name="Buyer", phone="9822222222")

        self._make_tx(customer=cust, total=Decimal("300.00"), tx_dt=datetime(2026, 11, 1, 1, 0, 0, tzinfo=self.biz_tz))
        self._make_tx(customer=cust, total=Decimal("700.00"), tx_dt=datetime(2026, 11, 10, 14, 0, 0, tzinfo=self.biz_tz))
        # October 31 -> excluded from November, included in Year & Lifetime
        self._make_tx(customer=cust, total=Decimal("2000.00"), tx_dt=datetime(2026, 10, 31, 22, 0, 0, tzinfo=self.biz_tz))

        with patch("django.utils.timezone.now", return_value=fixed_now):
            res = self.client.get(f"/api/v1/customers/{cust.id}/analytics/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data["month"]["purchase_count"], 2)
            self.assertEqual(res.data["month"]["spend"], 1000.0)
            self.assertEqual(res.data["year"]["purchase_count"], 3)
            self.assertEqual(res.data["year"]["spend"], 3000.0)

    def test_4_yearly_boundary_calculations(self):
        """TEST 4: Purchases across multiple years -> Current calendar year vs Lifetime separated."""
        fixed_now = datetime(2026, 11, 12, 12, 0, 0, tzinfo=self.biz_tz)
        cust = CustomerFactory(organization=self.org, first_name="Year", last_name="Buyer", phone="9833333333")

        self._make_tx(customer=cust, total=Decimal("1500.00"), tx_dt=datetime(2026, 1, 2, 10, 0, 0, tzinfo=self.biz_tz))
        self._make_tx(customer=cust, total=Decimal("2500.00"), tx_dt=datetime(2025, 12, 31, 23, 30, 0, tzinfo=self.biz_tz))

        with patch("django.utils.timezone.now", return_value=fixed_now):
            res = self.client.get(f"/api/v1/customers/{cust.id}/analytics/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data["year"]["purchase_count"], 1)
            self.assertEqual(res.data["year"]["spend"], 1500.0)
            self.assertEqual(res.data["lifetime"]["purchase_count"], 2)
            self.assertEqual(res.data["lifetime"]["spend"], 4000.0)

    def test_5_split_payment_counts_as_one_purchase_and_breaks_down_methods(self):
        """TEST 5: Split payment invoice (Cash + UPI + Card) counts as ONE purchase & breaks down methods."""
        fixed_now = datetime(2026, 11, 12, 15, 0, 0, tzinfo=self.biz_tz)
        cust = CustomerFactory(organization=self.org, first_name="Split", last_name="Payer", phone="9844444444")

        self._make_tx(
            customer=cust,
            total=Decimal("1500.00"),
            tx_dt=fixed_now,
            payment_method="split",
            allocations=[
                ("cash", Decimal("500.00")),
                ("upi", Decimal("700.00")),
                ("card", Decimal("300.00")),
            ],
        )

        with patch("django.utils.timezone.now", return_value=fixed_now):
            res = self.client.get(f"/api/v1/customers/{cust.id}/analytics/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data["today"]["purchase_count"], 1)
            self.assertEqual(res.data["today"]["spend"], 1500.0)
            self.assertEqual(res.data["lifetime"]["purchase_count"], 1)
            self.assertEqual(res.data["payment_breakdown"]["cash"], 500.0)
            self.assertEqual(res.data["payment_breakdown"]["upi"], 700.0)
            self.assertEqual(res.data["payment_breakdown"]["card"], 300.0)
            self.assertEqual(res.data["payment_breakdown"]["credit"], 0.0)
            self.assertEqual(res.data["purchase_history"][0]["payment_method_summary"], "Cash + UPI + Card")

    def test_6_cancelled_refunded_excluded_and_sales_returns_deducted(self):
        """TEST 6: Cancelled, pending, refunded & is_return TXs excluded; partial SalesReturn nets spend."""
        fixed_now = datetime(2026, 11, 12, 16, 0, 0, tzinfo=self.biz_tz)
        cust = CustomerFactory(organization=self.org, first_name="Return", last_name="Tester", phone="9855555555")
        prod = ProductFactory(organization=self.org, unit_price=Decimal("500.00"), tax_rate=Decimal("0.00"))

        valid_tx = self._make_tx(customer=cust, total=Decimal("1000.00"), tx_dt=fixed_now)
        tx_item = TransactionItem.objects.create(
            transaction=valid_tx,
            product=prod,
            name=prod.name,
            quantity=Decimal("2.00"),
            unit_price=Decimal("500.00"),
            total=Decimal("1000.00"),
        )
        # Invalid/cancelled/draft/refunded records must be ignored
        self._make_tx(customer=cust, total=Decimal("5000.00"), tx_dt=fixed_now, tx_status="cancelled")
        self._make_tx(customer=cust, total=Decimal("3000.00"), tx_dt=fixed_now, tx_status="pending")
        self._make_tx(customer=cust, total=Decimal("2000.00"), tx_dt=fixed_now, tx_status="refunded")
        self._make_tx(customer=cust, total=Decimal("400.00"), tx_dt=fixed_now, tx_status="completed", is_return=True)

        # Partial sales return of 1 unit (₹500) created at fixed_now
        with patch("django.utils.timezone.now", return_value=fixed_now):
            ReturnService.process_return(
                organization=self.org,
                user=self.user,
                original_transaction_id=str(valid_tx.id),
                items_to_return=[{"transaction_item_id": str(tx_item.id), "quantity": 1}],
                refund_method="cash",
            )
            res = self.client.get(f"/api/v1/customers/{cust.id}/analytics/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data["today"]["purchase_count"], 1)
            self.assertEqual(res.data["today"]["spend"], 500.0)
            self.assertEqual(res.data["lifetime"]["purchase_count"], 1)
            self.assertEqual(res.data["lifetime"]["spend"], 500.0)

    def test_7_new_completed_checkout_updates_customer_analytics_immediately(self):
        """TEST 7: Completing a real CheckoutService sale updates customer KPIs, breakdown & history."""
        cust = CustomerFactory(
            organization=self.org,
            first_name="Live",
            last_name="Checkout",
            phone="9866666666",
            credit_limit=Decimal("10000.00"),
        )
        prod = ProductFactory(organization=self.org, unit_price=Decimal("600.00"), tax_rate=Decimal("0.00"))

        before = self.client.get(f"/api/v1/customers/{cust.id}/analytics/").data
        self.assertEqual(before["today"]["purchase_count"], 0)
        self.assertEqual(before["today"]["spend"], 0.0)

        res = CheckoutService.process_checkout(
            organization=self.org,
            store=self.store,
            user=self.user,
            cart_data={
                "customer_id": str(cust.id),
                "items": [{"product_id": str(prod.id), "quantity": 2}],
                "payments": [
                    {"payment_method": "upi", "amount": "700.00"},
                    {"payment_method": "credit", "amount": "500.00"},
                ],
            },
        )
        self.assertIn("invoice_number", res)

        after = self.client.get(f"/api/v1/customers/{cust.id}/analytics/").data
        self.assertEqual(after["today"]["purchase_count"], 1)
        self.assertEqual(after["today"]["spend"], 1200.0)
        self.assertEqual(after["month"]["purchase_count"], 1)
        self.assertEqual(after["lifetime"]["purchase_count"], 1)
        self.assertEqual(after["lifetime"]["spend"], 1200.0)
        self.assertEqual(after["average_bill_value"], 1200.0)
        self.assertEqual(after["payment_breakdown"]["upi"], 700.0)
        self.assertEqual(after["payment_breakdown"]["credit"], 500.0)
        self.assertEqual(after["credit"]["outstanding_balance"], 500.0)
        self.assertEqual(after["credit"]["total_credit_taken"], 500.0)
        self.assertEqual(after["credit"]["total_credit_paid"], 0.0)
        self.assertEqual(len(after["purchase_history"]), 1)
        self.assertEqual(after["purchase_history"][0]["payment_method_summary"], "UPI + Credit")
        self.assertIsNotNone(after["purchase_history"][0]["invoice_id"])

        # Credit repayment updates credit summary independently without altering sales spend
        CreditService.record_payment(
            organization=self.org,
            customer_id=str(cust.id),
            amount=Decimal("200.00"),
            payment_method="cash",
            user=self.user,
            store=self.store,
        )
        after_credit_paid = self.client.get(f"/api/v1/customers/{cust.id}/analytics/").data
        self.assertEqual(after_credit_paid["lifetime"]["spend"], 1200.0)
        self.assertEqual(after_credit_paid["credit"]["outstanding_balance"], 300.0)
        self.assertEqual(after_credit_paid["credit"]["total_credit_taken"], 500.0)
        self.assertEqual(after_credit_paid["credit"]["total_credit_paid"], 200.0)

    def test_8_walk_in_purchase_does_not_affect_registered_customers_and_reconciles(self):
        """TEST 8: Walk-in transactions remain isolated and reconcile with organization totals."""
        fixed_now = datetime(2026, 11, 12, 13, 0, 0, tzinfo=self.biz_tz)
        reg_cust = CustomerFactory(organization=self.org, first_name="Registered", last_name="One", phone="9877777777")
        walk_cust = CustomerFactory(
            organization=self.org,
            first_name="Walk-in",
            last_name="Customer",
            phone="",
            is_walk_in=True,
        )

        self._make_tx(customer=reg_cust, total=Decimal("900.00"), tx_dt=fixed_now)
        self._make_tx(customer=None, total=Decimal("600.00"), tx_dt=fixed_now)
        self._make_tx(customer=walk_cust, total=Decimal("300.00"), tx_dt=fixed_now)

        with patch("django.utils.timezone.now", return_value=fixed_now):
            reg_data = get_customer_detailed_analytics(self.org, reg_cust, now=fixed_now)
            self.assertEqual(reg_data["today"]["purchase_count"], 1)
            self.assertEqual(reg_data["today"]["spend"], 900.0)

            walk_data = get_customer_detailed_analytics(self.org, walk_cust, now=fixed_now)
            self.assertTrue(walk_data["is_walk_in"])
            self.assertEqual(walk_data["lifetime"]["purchase_count"], 0)
            self.assertEqual(walk_data["lifetime"]["spend"], 0.0)

            # Reconciliation: registered + walk-in == organization total
            recon = reconcile_organization_customer_sales(self.org, now=fixed_now)
            self.assertEqual(recon["organization_total"]["today_count"], 3)
            self.assertEqual(recon["organization_total"]["today_gross"], 1800.0)
            self.assertEqual(
                recon["registered_customers"]["today_gross"] + recon["walk_in"]["today_gross"],
                recon["organization_total"]["today_gross"],
            )

    def test_9_average_bill_value_and_search_by_name_mobile_customer_id(self):
        """TEST 9: Average bill value exact & search by Name, Mobile, Customer ID works."""
        fixed_now = datetime(2026, 11, 12, 11, 0, 0, tzinfo=self.biz_tz)
        cust = CustomerFactory(
            organization=self.org,
            first_name="Aarav",
            last_name="Mehta",
            phone="9888888888",
            customer_id="CUS-AARAV99",
        )
        self._make_tx(customer=cust, total=Decimal("1000.00"), tx_dt=fixed_now)
        self._make_tx(customer=cust, total=Decimal("1500.00"), tx_dt=fixed_now - timedelta(days=3))
        self._make_tx(customer=cust, total=Decimal("2000.00"), tx_dt=fixed_now - timedelta(days=40))

        with patch("django.utils.timezone.now", return_value=fixed_now):
            analytics = self.client.get(f"/api/v1/customers/{cust.id}/analytics/").data
            self.assertEqual(analytics["lifetime"]["purchase_count"], 3)
            self.assertEqual(analytics["lifetime"]["spend"], 4500.0)
            self.assertEqual(analytics["average_bill_value"], 1500.0)
            self.assertEqual(analytics["days_since_last_purchase"], 0)

            for query in ("Aarav", "9888888888", "+91 98888-88888", "CUS-AARAV99", str(cust.id)):
                search_res = self.client.get("/api/v1/customers/", {"search": query})
                self.assertEqual(search_res.status_code, status.HTTP_200_OK)
                ids = [r["id"] for r in search_res.data["results"]]
                self.assertIn(str(cust.id), ids, f"Failed searching customer by '{query}'")

    def test_10_large_customer_list_avoids_n_plus_one_queries(self):
        """TEST 10: Customer list uses constant grouped queries with no N+1 queries across pagination."""
        customers = []
        for idx in range(30):
            c = CustomerFactory(
                organization=self.org,
                first_name=f"Scale{idx}",
                last_name="User",
                phone=f"990000{idx:04d}",
            )
            customers.append(c)
            self._make_tx(customer=c, total=Decimal("100.00") + idx)
            self._make_tx(customer=c, total=Decimal("200.00"))

        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get("/api/v1/customers/", {"page": 1, "page_size": 20})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 20)
        self.assertEqual(res.data["count"], 30)
        # Constant queries regardless of 20 customers on page (auth/org/user + count + page + 2 group-by queries)
        self.assertLessEqual(
            len(ctx.captured_queries),
            8,
            f"Too many SQL queries ({len(ctx.captured_queries)}), potential N+1 detected!",
        )
        # Verify returned KPIs for first customer on page
        first_row = res.data["results"][0]
        self.assertEqual(first_row["total_purchase_count"], 2)
        self.assertGreaterEqual(first_row["lifetime_spend"], 300.0)
