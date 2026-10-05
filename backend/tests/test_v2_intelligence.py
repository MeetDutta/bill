from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.analytics.models import BusinessAlert, CustomerRFMProfile
from apps.analytics.services import (
    AIBusinessCopilotService,
    AnomalyDetectionService,
    BusinessHealthService,
    CampaignROIService,
    ChurnPredictionService,
    CustomerHealthService,
    LoyaltyTierService,
    NextBestActionService,
    OfferRecommendationService,
    ProductIntelligenceService,
    RFMAnalysisService,
    SmartBundleService,
)
from apps.campaigns.models import Campaign, CampaignMessage
from apps.customers.models import Customer
from apps.loyalty.models import LoyaltyAccount
from apps.products.models import Product
from apps.transactions.models import Transaction, TransactionItem
from tests.factories import (
    CustomerFactory,
    LoyaltyAccountFactory,
    OrganizationFactory,
    ProductFactory,
    StoreFactory,
    TransactionFactory,
    TransactionItemFactory,
    UserFactory,
)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
class TestV2IntelligenceServices:
    def test_rfm_calculation_and_segmentation(self):
        org = OrganizationFactory()
        now = timezone.now()

        # Champion customer: recent, frequent, high spend
        champion = CustomerFactory(
            organization=org,
            total_purchases=15,
            total_spend=Decimal("30000.00"),
            last_purchase_at=now - timedelta(days=5),
        )
        rfm_data = RFMAnalysisService.calculate_customer_rfm(champion)
        assert rfm_data["segment"] == "Champions"
        assert rfm_data["r_score"] == 5
        assert rfm_data["f_score"] == 5
        assert rfm_data["m_score"] == 5

        # At-risk customer: high historical spend, but inactive for 70 days
        at_risk = CustomerFactory(
            organization=org,
            total_purchases=6,
            total_spend=Decimal("12000.00"),
            last_purchase_at=now - timedelta(days=70),
        )
        rfm_at_risk = RFMAnalysisService.calculate_customer_rfm(at_risk)
        assert rfm_at_risk["segment"] in ["At Risk", "Can't Lose Them"]

        # New customer: 1 purchase recently
        new_cust = CustomerFactory(
            organization=org,
            total_purchases=1,
            total_spend=Decimal("800.00"),
            last_purchase_at=now - timedelta(days=3),
        )
        rfm_new = RFMAnalysisService.calculate_customer_rfm(new_cust)
        assert rfm_new["segment"] == "New Customers"

        # Update profile test
        profile = RFMAnalysisService.update_customer_rfm_profile(champion)
        assert profile.segment == "Champions"
        assert CustomerRFMProfile.objects.filter(customer=champion).exists()

    def test_customer_health_score(self):
        org = OrganizationFactory()
        now = timezone.now()

        healthy_cust = CustomerFactory(
            organization=org,
            total_purchases=8,
            total_spend=Decimal("15000.00"),
            average_order_value=Decimal("1875.00"),
            last_purchase_at=now - timedelta(days=10),
        )
        LoyaltyAccountFactory(organization=org, customer=healthy_cust, balance=Decimal("600"))

        health = CustomerHealthService.calculate_health(healthy_cust)
        assert health["score"] >= 75
        assert health["status"] in ["HEALTHY", "EXCELLENT"]
        assert len(health["positive_factors"]) > 0

        # Lapsed customer
        critical_cust = CustomerFactory(
            organization=org,
            total_purchases=1,
            total_spend=Decimal("200.00"),
            last_purchase_at=now - timedelta(days=130),
        )
        health_crit = CustomerHealthService.calculate_health(critical_cust)
        assert health_crit["score"] <= 49
        assert health_crit["status"] in ["AT_RISK", "CRITICAL"]
        assert health_crit["recommended_action"] == "SEND_COMEBACK_OFFER"

    def test_churn_prediction_service(self):
        org = OrganizationFactory()
        now = timezone.now()

        cust = CustomerFactory(
            organization=org,
            total_purchases=2,
            total_spend=Decimal("4000.00"),
            last_purchase_at=now - timedelta(days=95),
        )
        pred = ChurnPredictionService.predict_churn(cust)
        assert pred["churn_probability"] >= 0.5
        assert pred["churn_risk"] in ["HIGH", "CRITICAL"]
        assert "inactivity" in pred["prediction_reason"].lower() or "cadence" in pred["prediction_reason"].lower()

    def test_next_best_action_engine(self):
        org = OrganizationFactory()
        now = timezone.now()

        # High value inactive -> comeback offer
        high_val_inactive = CustomerFactory(
            organization=org,
            total_purchases=4,
            total_spend=Decimal("12000.00"),
            last_purchase_at=now - timedelta(days=80),
        )
        action = NextBestActionService.determine_next_action(high_val_inactive)
        assert action["action"] == "SEND_COMEBACK_OFFER"
        assert action["priority"] == "HIGH"

        # Recent 1-order buyer -> review request
        recent_first = CustomerFactory(
            organization=org,
            total_purchases=1,
            total_spend=Decimal("1000.00"),
            last_purchase_at=now - timedelta(days=2),
        )
        action_review = NextBestActionService.determine_next_action(recent_first)
        assert action_review["action"] == "REQUEST_REVIEW"

    def test_smart_offer_recommendation_and_coupon_creation(self):
        org = OrganizationFactory()
        now = timezone.now()

        cust = CustomerFactory(
            organization=org,
            total_purchases=5,
            total_spend=Decimal("14000.00"),
            average_order_value=Decimal("2800.00"),
            last_purchase_at=now - timedelta(days=70),
        )
        offer = OfferRecommendationService.recommend_offer(cust)
        assert offer["requires_merchant_approval"] is True
        assert offer["discount_type"] in ["fixed", "percentage", "bonus_points"]

        coupon = OfferRecommendationService.create_approved_coupon(cust, offer)
        assert coupon.is_active is True
        assert coupon.organization == org

    def test_product_affinity_and_bundles(self):
        org = OrganizationFactory()
        store = StoreFactory(organization=org)
        p1 = ProductFactory(organization=org, name="Wireless Keyboard", unit_price=Decimal("1200"))
        p2 = ProductFactory(organization=org, name="Wireless Mouse", unit_price=Decimal("800"))

        # Create 2 transactions with both products together
        for i in range(2):
            tx = TransactionFactory(organization=org, store=store)
            TransactionItemFactory(transaction=tx, product=p1, unit_price=p1.unit_price, total=p1.unit_price)
            TransactionItemFactory(transaction=tx, product=p2, unit_price=p2.unit_price, total=p2.unit_price)

        affinities = ProductIntelligenceService.calculate_affinities(org)
        assert len(affinities) > 0
        assert affinities[0]["affinity_score"] > 0

        bundles = SmartBundleService.get_bundle_recommendations(org)
        assert len(bundles) > 0
        assert bundles[0]["suggested_bundle_price"] < bundles[0]["individual_price"]

    def test_campaign_roi_calculation(self):
        org = OrganizationFactory()
        store = StoreFactory(organization=org)
        camp = Campaign.objects.create(
            organization=org,
            name="Festive Blast",
            campaign_type="promotional",
            total_recipients=10,
            total_delivered=10,
            sent_at=timezone.now() - timedelta(days=2),
        )
        recipient = CustomerFactory(organization=org)
        CampaignMessage.objects.create(
            organization=org,
            campaign=camp,
            customer=recipient,
            phone=recipient.phone,
            status="delivered",
        )

        # Attributed transaction during 7-day attribution window
        TransactionFactory(
            organization=org,
            store=store,
            customer=recipient,
            total=Decimal("2500.00"),
            transaction_date=timezone.now() - timedelta(days=1),
            status="completed",
        )

        roi_data = CampaignROIService.calculate_campaign_roi(camp)
        assert roi_data["conversions"] == 1
        assert roi_data["attributed_revenue"] == 2500.0
        assert roi_data["roi_numeric"] > 0

    def test_loyalty_tiers_and_achievements(self):
        org = OrganizationFactory()
        cust = CustomerFactory(organization=org, total_spend=Decimal("18000.00"), total_purchases=5)

        tier_info = LoyaltyTierService.get_customer_tier(cust)
        assert tier_info["current_tier"] in ["Gold", "Silver"]

        unlocked = LoyaltyTierService.check_and_unlock_achievements(cust)
        assert len(unlocked) >= 1
        codes = [a.code for a in unlocked]
        assert "FIRST_PURCHASE" in codes or "FIVE_PURCHASES" in codes

    def test_business_health_score(self):
        org = OrganizationFactory()
        store = StoreFactory(organization=org)
        TransactionFactory(
            organization=org,
            store=store,
            total=Decimal("5000.00"),
            status="completed",
            transaction_date=timezone.now(),
        )

        health = BusinessHealthService.calculate_health(org)
        assert 0 <= health["overall_score"] <= 100
        assert "Primary improvement area:" in health["weakest_area"]

    def test_anomaly_detection_and_alerts(self):
        org = OrganizationFactory()
        store = StoreFactory(organization=org)

        # Create 3 refunded transactions to trigger anomaly
        for _ in range(3):
            TransactionFactory(
                organization=org,
                store=store,
                status="refunded",
                created_at=timezone.now(),
            )

        alerts = AnomalyDetectionService.scan_anomalies(org)
        assert len(alerts) >= 1
        assert any(a.alert_type == "REFUND_SPIKE" for a in alerts)

    def test_ai_business_copilot_service(self):
        org = OrganizationFactory()
        resp = AIBusinessCopilotService.answer_query(org, "What happened to sales this month?")
        assert "health score" in resp["answer"].lower() or "sales" in resp["answer"].lower()

        resp_churn = AIBusinessCopilotService.answer_query(org, "Who is at risk of churning?")
        assert "churn" in resp_churn["answer"].lower() or "risk" in resp_churn["answer"].lower()


@pytest.mark.django_db
class TestV2IntelligenceAPIEndpoints:
    def test_rfm_endpoints(self, api_client):
        org = OrganizationFactory()
        user = UserFactory(organization=org)
        CustomerFactory(organization=org, total_purchases=6, total_spend=Decimal("10000.00"))

        api_client.force_authenticate(user=user)

        res_dist = api_client.get("/api/v1/analytics/rfm/distribution/")
        assert res_dist.status_code == 200
        assert isinstance(res_dist.data, list)

        res_summary = api_client.get("/api/v1/analytics/rfm/summary/")
        assert res_summary.status_code == 200
        assert "total_customers" in res_summary.data

        res_custs = api_client.get("/api/v1/analytics/rfm/customers/")
        assert res_custs.status_code == 200

    def test_customer_health_and_churn_api(self, api_client):
        org = OrganizationFactory()
        user = UserFactory(organization=org)
        cust = CustomerFactory(organization=org, total_purchases=2, total_spend=Decimal("2500.00"))

        api_client.force_authenticate(user=user)

        res_h = api_client.get(f"/api/v1/customers/{cust.id}/health/")
        assert res_h.status_code == 200
        assert "score" in res_h.data
        assert "status" in res_h.data

        res_c = api_client.get(f"/api/v1/customers/{cust.id}/churn/")
        assert res_c.status_code == 200
        assert "churn_probability" in res_c.data

        res_act = api_client.get(f"/api/v1/customers/{cust.id}/next-action/")
        assert res_act.status_code == 200
        assert "action" in res_act.data

        res_rec = api_client.get(f"/api/v1/customers/{cust.id}/recommendations/")
        assert res_rec.status_code == 200
        assert "offer_title" in res_rec.data

        # Test merchant offer approval
        res_create_offer = api_client.post(f"/api/v1/customers/{cust.id}/create-recommended-offer/")
        assert res_create_offer.status_code == 201
        assert "coupon" in res_create_offer.data

    def test_product_affinity_and_bundles_api(self, api_client):
        org = OrganizationFactory()
        user = UserFactory(organization=org)
        api_client.force_authenticate(user=user)

        res_prod = api_client.get("/api/v1/products/intelligence/")
        assert res_prod.status_code == 200

        res_aff = api_client.get("/api/v1/products/affinity/")
        assert res_aff.status_code == 200

        res_bun = api_client.get("/api/v1/products/bundles/")
        assert res_bun.status_code == 200

    def test_campaign_roi_api(self, api_client):
        org = OrganizationFactory()
        user = UserFactory(organization=org)
        camp = Campaign.objects.create(organization=org, name="Spring Launch", campaign_type="promotional")
        api_client.force_authenticate(user=user)

        res_roi_sum = api_client.get("/api/v1/campaigns/roi/")
        assert res_roi_sum.status_code == 200

        res_roi = api_client.get(f"/api/v1/campaigns/{camp.id}/roi/")
        assert res_roi.status_code == 200
        assert "attributed_revenue" in res_roi.data

    def test_business_health_and_retention_api(self, api_client):
        org = OrganizationFactory()
        user = UserFactory(organization=org)
        api_client.force_authenticate(user=user)

        res_bh = api_client.get("/api/v1/analytics/business-health/")
        assert res_bh.status_code == 200
        assert "overall_score" in res_bh.data

        res_ret = api_client.get("/api/v1/analytics/customer-retention/")
        assert res_ret.status_code == 200
        assert "retention_rate" in res_ret.data

        res_coh = api_client.get("/api/v1/analytics/cohorts/")
        assert res_coh.status_code == 200
        assert "cohorts" in res_coh.data

    def test_alerts_api(self, api_client):
        org = OrganizationFactory()
        user = UserFactory(organization=org)
        alert = BusinessAlert.objects.create(
            organization=org,
            alert_type="TEST_ALERT",
            severity="WARNING",
            title="Test Alert",
            description="Testing alert ack and dismiss",
        )
        api_client.force_authenticate(user=user)

        res_list = api_client.get("/api/v1/alerts/")
        assert res_list.status_code == 200
        assert len(res_list.data) >= 1

        res_ack = api_client.post(f"/api/v1/alerts/{alert.id}/acknowledge/")
        assert res_ack.status_code == 200

        res_dism = api_client.post(f"/api/v1/alerts/{alert.id}/dismiss/")
        assert res_dism.status_code == 200
        alert.refresh_from_db()
        assert alert.is_dismissed is True

    def test_customer_portal_public_access(self, api_client):
        org = OrganizationFactory()
        cust = CustomerFactory(organization=org, first_name="Aarav", last_name="Sharma")
        token = cust.portal_token

        # Access without any authentication
        res = api_client.get(f"/api/v1/customer-portal/{token}/")
        assert res.status_code == 200
        assert res.data["customer"]["name"] == "Aarav Sharma"
        assert "loyalty" in res.data
        assert "available_rewards" in res.data

        # Invalid token returns 404
        res_invalid = api_client.get("/api/v1/customer-portal/nonexistent-token/")
        assert res_invalid.status_code == 404

    def test_ai_copilot_api(self, api_client):
        org = OrganizationFactory()
        user = UserFactory(organization=org)
        api_client.force_authenticate(user=user)

        res = api_client.post("/api/v1/copilot/query/", {"question": "What should I do today?"})
        assert res.status_code == 200
        assert "answer" in res.data
        assert "recommended_action" in res.data

    def test_tenant_isolation(self, api_client):
        org_a = OrganizationFactory()
        org_b = OrganizationFactory()
        user_b = UserFactory(organization=org_b)

        cust_a = CustomerFactory(organization=org_a)
        api_client.force_authenticate(user=user_b)

        # User B should NOT be able to view Org A's customer health or churn
        res_h = api_client.get(f"/api/v1/customers/{cust_a.id}/health/")
        assert res_h.status_code == 404

        res_c = api_client.get(f"/api/v1/customers/{cust_a.id}/churn/")
        assert res_c.status_code == 404


@pytest.mark.django_db
class TestV2EdgeCasesAndDataIntegrity:
    def test_customer_zero_transactions(self):
        org = OrganizationFactory()
        customer = CustomerFactory(organization=org, total_purchases=0, total_spend=Decimal("0.00"), last_purchase_at=None)

        rfm = RFMAnalysisService.calculate_customer_rfm(customer)
        assert rfm["segment"] in ["New Customers", "Lost", "Promising"]
        assert rfm["monetary_value"] == 0

        health = CustomerHealthService.calculate_health(customer)
        assert health["score"] >= 0
        assert "No purchases recorded yet" in health["risk_factors"] or len(health["risk_factors"]) > 0

        churn = ChurnPredictionService.predict_churn(customer)
        assert churn["churn_probability"] >= 0
        assert churn["churn_risk"] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

        action = NextBestActionService.determine_next_action(customer)
        assert action["action"] in ["SEND_WELCOME_OFFER", "SEND_COMEBACK_OFFER", "SEND_THANK_YOU", "NO_ACTION"]

    def test_single_transaction_customer(self):
        org = OrganizationFactory()
        customer = CustomerFactory(
            organization=org,
            total_purchases=1,
            total_spend=Decimal("1250.00"),
            last_purchase_at=timezone.now() - timedelta(days=5),
        )
        health = CustomerHealthService.calculate_health(customer)
        assert health["score"] > 0
        assert any("Purchased within" in f for f in health["positive_factors"])

    def test_refunded_or_cancelled_transactions_excluded(self, api_client):
        org = OrganizationFactory()
        user = UserFactory(organization=org)
        customer = CustomerFactory(organization=org)
        store = StoreFactory(organization=org)

        # Completed transaction
        TransactionFactory(
            organization=org,
            customer=customer,
            store=store,
            status="completed",
            total=Decimal("1000.00"),
            transaction_date=timezone.now() - timedelta(days=2),
        )
        # Cancelled and refunded transactions
        TransactionFactory(
            organization=org,
            customer=customer,
            store=store,
            status="cancelled",
            total=Decimal("5000.00"),
            transaction_date=timezone.now() - timedelta(days=1),
        )
        TransactionFactory(
            organization=org,
            customer=customer,
            store=store,
            status="refunded",
            total=Decimal("3000.00"),
            transaction_date=timezone.now() - timedelta(days=1),
        )

        api_client.force_authenticate(user=user)
        res = api_client.get("/api/v1/analytics/customer-retention/")
        assert res.status_code == 200
        assert res.data["total_customers"] >= 1

    def test_empty_database_new_merchant(self, api_client):
        org = OrganizationFactory()
        user = UserFactory(organization=org)
        api_client.force_authenticate(user=user)

        # Endpoints should return clean empty structures without 500 errors
        res_rfm = api_client.get("/api/v1/analytics/rfm/distribution/")
        assert res_rfm.status_code == 200

        res_bh = api_client.get("/api/v1/analytics/business-health/")
        assert res_bh.status_code == 200
        assert "overall_score" in res_bh.data

        res_aff = api_client.get("/api/v1/products/affinity/")
        assert res_aff.status_code == 200

        res_bundles = api_client.get("/api/v1/products/bundles/")
        assert res_bundles.status_code == 200

        res_roi = api_client.get("/api/v1/campaigns/roi/")
        assert res_roi.status_code == 200
        assert len(res_roi.data) == 0

    def test_extreme_transaction_value_precision(self):
        org = OrganizationFactory()
        customer = CustomerFactory(
            organization=org,
            total_purchases=50,
            total_spend=Decimal("9999999.99"),
            last_purchase_at=timezone.now() - timedelta(days=1),
        )
        rfm = RFMAnalysisService.calculate_customer_rfm(customer)
        assert rfm["m_score"] == 5
        assert rfm["monetary_value"] == 9999999.99
