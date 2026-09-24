from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.loyalty.models import LoyaltyAccount, LoyaltyTransaction, LoyaltyRule
from tests.factories import CustomerFactory, LoyaltyAccountFactory, LoyaltyRuleFactory, OrganizationFactory, UserFactory


class LoyaltyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = OrganizationFactory()
        self.user = UserFactory(organization=self.org, role="org_admin")
        self.client.force_authenticate(user=self.user)

    def test_loyalty_account_created(self):
        customer = CustomerFactory(organization=self.org)
        account = LoyaltyAccount.objects.create(
            organization=self.org,
            customer=customer,
        )
        self.assertEqual(account.balance, Decimal("0"))
        self.assertEqual(account.total_earned, Decimal("0"))

    def test_loyalty_rule_created(self):
        rule = LoyaltyRuleFactory(
            organization=self.org,
            name="Standard Earn",
            points=Decimal("10"),
            per_amount=Decimal("100"),
        )
        self.assertEqual(rule.rule_type, "earn_purchase")
        self.assertTrue(rule.is_active)

    def test_loyalty_earn(self):
        customer = CustomerFactory(organization=self.org)
        account = LoyaltyAccountFactory(organization=self.org, customer=customer)

        rule = LoyaltyRuleFactory(
            organization=self.org,
            points=Decimal("10"),
            per_amount=Decimal("100"),
        )

        from apps.loyalty.tasks import calculate_loyalty_task
        from tests.factories import TransactionFactory
        tx = TransactionFactory(organization=self.org, customer=customer, total=Decimal("500"))

        result = calculate_loyalty_task(str(tx.id), str(self.org.id))
        self.assertEqual(result["points_earned"], "50.00")

        account.refresh_from_db()
        self.assertEqual(account.balance, Decimal("50.00"))
        self.assertEqual(account.total_earned, Decimal("50.00"))

    def test_loyalty_redeem(self):
        customer = CustomerFactory(organization=self.org)
        account = LoyaltyAccountFactory(
            organization=self.org,
            customer=customer,
            balance=Decimal("100"),
            total_earned=Decimal("100"),
        )

        response = self.client.post(
            "/api/v1/loyalty/redeem/",
            {"customer_id": str(customer.id), "points": "30"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        account.refresh_from_db()
        self.assertEqual(account.balance, Decimal("70"))
        self.assertEqual(account.total_redeemed, Decimal("30"))

    def test_loyalty_redeem_insufficient(self):
        customer = CustomerFactory(organization=self.org)
        account = LoyaltyAccountFactory(
            organization=self.org,
            customer=customer,
            balance=Decimal("10"),
        )

        response = self.client.post(
            "/api/v1/loyalty/redeem/",
            {"customer_id": str(customer.id), "points": "50"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
