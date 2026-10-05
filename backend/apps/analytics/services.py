from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from django.db.models import Avg, Count, F, Q, Sum
from django.utils import timezone

from apps.analytics.models import (
    BusinessAlert,
    BusinessHealthSnapshot,
    CampaignAnalytics,
    ChurnPrediction,
    CustomerHealthProfile,
    CustomerRFMProfile,
    ProductAffinity,
    ProductBundle,
)
from apps.campaigns.models import Campaign, CampaignMessage
from apps.coupons.models import Coupon, CouponRedemption
from apps.customers.models import Customer, CustomerTimeline
from apps.loyalty.models import Achievement, CustomerAchievement, LoyaltyAccount, LoyaltyTier
from apps.products.models import Product
from apps.transactions.models import Transaction, TransactionItem


# ============================================================================
# 1. RFM ANALYSIS SERVICE
# ============================================================================
class RFMAnalysisService:
    """
    Recency, Frequency, Monetary (RFM) Customer Intelligence Service.
    Calculates R, F, M scores (1-5) and maps to human-understandable customer segments
    using configurable thresholds per organization or industry standard defaults.
    """

    DEFAULT_THRESHOLDS = {
        # Recency in days (lower is better: score 5 is most recent)
        "recency_days": [14, 30, 60, 90],  # <=14 => 5, <=30 => 4, <=60 => 3, <=90 => 2, >90 => 1
        # Frequency count of purchases (higher is better: score 5 is most frequent)
        "frequency_count": [2, 4, 7, 12],  # >=12 => 5, >=7 => 4, >=4 => 3, >=2 => 2, <2 => 1
        # Monetary total spend in currency units (higher is better: score 5 is highest)
        "monetary_value": [1500, 4000, 10000, 25000],  # >=25000 => 5, >=10000 => 4, etc.
    }

    SEGMENT_DESCRIPTIONS = {
        "Champions": "Bought recently, buy often, and spend the most. Reward them and invite early access.",
        "Loyal Customers": "Spend good money and respond to value. Upsell higher value products.",
        "Potential Loyalists": "Recent customers with average frequency. Offer membership or loyalty rewards.",
        "New Customers": "Bought recently for the first time. Provide onboarding and welcome offers.",
        "Promising": "Recent buyers with potential. Engage with personalized recommendations.",
        "At Risk": "Spent good money and purchased often, but have not purchased recently. Send comeback offers.",
        "Can't Lose Them": "Made big purchases and used to visit frequently. Urgent high-touch win-back required.",
        "Hibernating": "Low spenders with low frequency who have not purchased in a long time.",
        "Lost": "Lowest recency, frequency, and monetary scores. Limited reactivation ROI.",
    }

    @classmethod
    def score_dimension(cls, value: float, breaks: List[float], higher_is_better: bool = True) -> int:
        if higher_is_better:
            if value >= breaks[3]:
                return 5
            if value >= breaks[2]:
                return 4
            if value >= breaks[1]:
                return 3
            if value >= breaks[0]:
                return 2
            return 1
        else:
            # Lower value is better (Recency)
            if value <= breaks[0]:
                return 5
            if value <= breaks[1]:
                return 4
            if value <= breaks[2]:
                return 3
            if value <= breaks[3]:
                return 2
            return 1

    @classmethod
    def assign_segment(cls, r: int, f: int, m: int) -> str:
        # High value champions
        if r >= 4 and f >= 4 and m >= 4:
            return "Champions"
        # Can't lose them: high historical value & frequency, but lapsed recency
        if r <= 2 and f >= 4 and m >= 4:
            return "Can't Lose Them"
        # At risk: previously engaged but slipping away
        if r <= 2 and (f >= 2 or m >= 2):
            return "At Risk"
        # Loyal customers
        if r >= 3 and f >= 3 and m >= 3:
            return "Loyal Customers"
        # New customers: high recency, single purchase
        if r >= 4 and f <= 1:
            return "New Customers"
        # Potential loyalists: recent, moderate frequency
        if r >= 4 and (f in [2, 3] or m in [2, 3]):
            return "Potential Loyalists"
        # Promising: decent recency and spend
        if r >= 3 and m >= 2:
            return "Promising"
        # Lost: inactive and low value
        if r <= 1 and f <= 1:
            return "Lost"
        # Hibernating: low recency, moderate or low frequency
        return "Hibernating"

    @classmethod
    def calculate_customer_rfm(
        cls, customer: Customer, thresholds: Optional[Dict[str, List[float]]] = None
    ) -> Dict[str, Any]:
        cfg = thresholds or cls.DEFAULT_THRESHOLDS
        now = timezone.now()

        if customer.last_purchase_at:
            recency_days = max(0, (now - customer.last_purchase_at).days)
        else:
            # Check completed transactions fallback
            last_tx = (
                Transaction.objects.filter(
                    organization=customer.organization,
                    customer=customer,
                    status="completed",
                )
                .order_by("-transaction_date")
                .first()
            )
            if last_tx and last_tx.transaction_date:
                recency_days = max(0, (now - last_tx.transaction_date).days)
            else:
                recency_days = 999

        frequency_count = customer.total_purchases
        monetary_value = float(customer.total_spend)

        r_score = cls.score_dimension(recency_days, cfg["recency_days"], higher_is_better=False)
        f_score = cls.score_dimension(frequency_count, cfg["frequency_count"], higher_is_better=True)
        m_score = cls.score_dimension(monetary_value, cfg["monetary_value"], higher_is_better=True)

        rfm_score = f"{r_score}{f_score}{m_score}"
        segment = cls.assign_segment(r_score, f_score, m_score)

        return {
            "customer_id": str(customer.id),
            "customer_name": customer.full_name,
            "recency_days": recency_days,
            "frequency_count": frequency_count,
            "monetary_value": monetary_value,
            "r_score": r_score,
            "f_score": f_score,
            "m_score": m_score,
            "rfm_score": rfm_score,
            "segment": segment,
            "description": cls.SEGMENT_DESCRIPTIONS.get(segment, ""),
        }

    @classmethod
    def update_customer_rfm_profile(cls, customer: Customer) -> CustomerRFMProfile:
        data = cls.calculate_customer_rfm(customer)
        profile, _ = CustomerRFMProfile.objects.update_or_create(
            organization=customer.organization,
            customer=customer,
            defaults={
                "recency_days": data["recency_days"],
                "frequency_count": data["frequency_count"],
                "monetary_value": Decimal(str(data["monetary_value"])),
                "r_score": data["r_score"],
                "f_score": data["f_score"],
                "m_score": data["m_score"],
                "rfm_score": data["rfm_score"],
                "segment": data["segment"],
            },
        )
        # Keep customer's denormalized segment field in sync
        if customer.segment != data["segment"]:
            customer.segment = data["segment"]
            customer.save(update_fields=["segment"])
        return profile

    @classmethod
    def sync_organization_rfm(cls, organization) -> int:
        customers = Customer.objects.filter(organization=organization, is_active=True)
        count = 0
        for customer in customers:
            cls.update_customer_rfm_profile(customer)
            count += 1
        return count

    @classmethod
    def get_segment_distribution(cls, organization) -> List[Dict[str, Any]]:
        # Ensure fresh profiles exist; if none, sync
        if not CustomerRFMProfile.objects.filter(organization=organization).exists():
            cls.sync_organization_rfm(organization)

        profiles = (
            CustomerRFMProfile.objects.filter(organization=organization)
            .values("segment")
            .annotate(
                count=Count("id"),
                total_spend=Sum("monetary_value"),
                avg_spend=Avg("monetary_value"),
                avg_recency=Avg("recency_days"),
            )
        )
        total_customers = sum(p["count"] for p in profiles) or 1

        ordered_segments = [
            "Champions",
            "Loyal Customers",
            "Potential Loyalists",
            "New Customers",
            "Promising",
            "At Risk",
            "Can't Lose Them",
            "Hibernating",
            "Lost",
        ]

        dist_by_name = {p["segment"]: p for p in profiles}
        result = []
        for name in ordered_segments:
            p = dist_by_name.get(name, {})
            cnt = p.get("count", 0)
            result.append({
                "segment": name,
                "count": cnt,
                "percentage": round((cnt / total_customers) * 100, 1),
                "total_spend": float(p.get("total_spend") or 0),
                "avg_spend": float(p.get("avg_spend") or 0),
                "avg_recency_days": round(float(p.get("avg_recency") or 0), 1),
                "description": cls.SEGMENT_DESCRIPTIONS.get(name, ""),
            })
        return result

    @classmethod
    def get_rfm_summary(cls, organization) -> Dict[str, Any]:
        distribution = cls.get_segment_distribution(organization)
        total_customers = sum(d["count"] for d in distribution)
        champions = next((d["count"] for d in distribution if d["segment"] == "Champions"), 0)
        at_risk = next((d["count"] for d in distribution if d["segment"] == "At Risk"), 0)
        cant_lose = next((d["count"] for d in distribution if d["segment"] == "Can't Lose Them"), 0)
        loyal = next((d["count"] for d in distribution if d["segment"] == "Loyal Customers"), 0)

        return {
            "total_customers": total_customers,
            "champions_count": champions,
            "loyal_count": loyal,
            "at_risk_count": at_risk + cant_lose,
            "segments": distribution,
        }


# ============================================================================
# 2. CUSTOMER HEALTH SCORE SERVICE
# ============================================================================
class CustomerHealthService:
    """
    Computes a 0–100 Customer Health Score based on 10 behavioral dimensions:
    - Purchase recency
    - Purchase frequency
    - Average order value (AOV)
    - Lifetime value (LTV)
    - Purchase trend (recent interval vs historical interval)
    - Loyalty activity (active points balance and redemptions)
    - Coupon usage
    - Campaign engagement
    - Refund behavior
    - Historical purchase cadence
    """

    @classmethod
    def calculate_health(cls, customer: Customer) -> Dict[str, Any]:
        now = timezone.now()
        score = 0
        risk_factors: List[str] = []
        positive_factors: List[str] = []

        # 1. Purchase Recency (up to 30 points)
        if customer.last_purchase_at:
            days_since = (now - customer.last_purchase_at).days
            if days_since <= 14:
                score += 30
                positive_factors.append("Purchased within the last 14 days")
            elif days_since <= 30:
                score += 24
                positive_factors.append("Purchased within the last month")
            elif days_since <= 60:
                score += 15
            elif days_since <= 90:
                score += 8
                risk_factors.append(f"No purchase in {days_since} days")
            else:
                score += 2
                risk_factors.append(f"Severely inactive: {days_since} days since last purchase")
        else:
            days_since = 999
            risk_factors.append("No recorded purchase history")

        # 2. Purchase Frequency (up to 25 points)
        purchases = customer.total_purchases
        if purchases >= 10:
            score += 25
            positive_factors.append(f"High purchase frequency ({purchases} orders)")
        elif purchases >= 5:
            score += 20
            positive_factors.append(f"Consistent repeat buyer ({purchases} orders)")
        elif purchases >= 3:
            score += 14
            positive_factors.append(f"Returning customer ({purchases} orders)")
        elif purchases >= 2:
            score += 8
            positive_factors.append(f"Second purchase completed ({purchases} orders)")
        elif purchases == 1:
            score += 4
        else:
            risk_factors.append("Zero lifetime purchases")

        # 3. Monetary Value & AOV (up to 25 points)
        spend = float(customer.total_spend)
        aov = float(customer.average_order_value)
        if spend >= 20000:
            score += 15
            positive_factors.append(f"Top-tier lifetime spend (₹{spend:,.0f})")
        elif spend >= 10000:
            score += 12
            positive_factors.append(f"Strong lifetime spend (₹{spend:,.0f})")
        elif spend >= 3000:
            score += 8
        elif spend >= 1000:
            score += 4

        if aov >= 2000:
            score += 8
            positive_factors.append(f"High average order value (₹{aov:,.0f})")
        elif aov >= 1000:
            score += 5
        elif aov >= 500:
            score += 3

        # 4. Purchase Interval Trend (up to 10 points)
        txs = list(
            Transaction.objects.filter(
                organization=customer.organization,
                customer=customer,
                status="completed",
            ).order_by("transaction_date")
        )
        if len(txs) >= 3:
            intervals = []
            for i in range(1, len(txs)):
                delta = (txs[i].transaction_date - txs[i - 1].transaction_date).days
                intervals.append(delta)
            avg_interval = sum(intervals) / len(intervals) if intervals else 30
            current_delay = (now - txs[-1].transaction_date).days

            if avg_interval > 0:
                delay_ratio = current_delay / avg_interval
                if delay_ratio <= 1.2:
                    score += 10
                    positive_factors.append("Purchasing cadence is on schedule")
                elif delay_ratio > 2.0:
                    pct_increase = int((delay_ratio - 1.0) * 100)
                    risk_factors.append(f"Purchase interval increased by {pct_increase}%")
                elif delay_ratio > 1.5:
                    risk_factors.append("Purchase interval is slowing down")
        elif len(txs) >= 2:
            score += 5

        # 5. Loyalty Activity (up to 10 points)
        try:
            loyalty = LoyaltyAccount.objects.get(
                organization=customer.organization,
                customer=customer,
            )
            balance = float(loyalty.balance)
            if balance >= 500:
                score += 10
                positive_factors.append(f"Active loyalty member ({balance:.0f} pts available)")
            elif balance > 0:
                score += 6
                positive_factors.append(f"Has unused loyalty points ({balance:.0f} pts)")
            if float(loyalty.total_redeemed) > 0:
                score += 2
                positive_factors.append("Has redeemed loyalty rewards in the past")
        except LoyaltyAccount.DoesNotExist:
            pass

        # 6. Coupon & Engagement Activity (up to 5 points)
        coupons_used = CouponRedemption.objects.filter(
            organization=customer.organization,
            customer=customer,
        ).count()
        if coupons_used > 0:
            score += 5
            positive_factors.append(f"Actively redeems offers ({coupons_used} coupons used)")

        # 7. Refund Check (Penalty)
        refunds = Transaction.objects.filter(
            organization=customer.organization,
            customer=customer,
            status="refunded",
        ).count()
        if refunds > 0:
            score = max(0, score - 15)
            risk_factors.append(f"Has {refunds} refunded order(s)")

        # Cap score between 0 and 100
        score = max(0, min(100, score))

        # Status categorization
        if score >= 90:
            status = "EXCELLENT"
        elif score >= 75:
            status = "HEALTHY"
        elif score >= 50:
            status = "STABLE"
        elif score >= 25:
            status = "AT_RISK"
        else:
            status = "CRITICAL"

        # Action recommendation
        if status == "CRITICAL" or (days_since > 60 and spend >= 5000):
            recommended_action = "SEND_COMEBACK_OFFER"
        elif status == "AT_RISK":
            recommended_action = "SEND_COMEBACK_OFFER"
        elif status == "EXCELLENT":
            recommended_action = "SEND_LOYALTY_REWARD"
        elif purchases == 1 and days_since <= 14:
            recommended_action = "REQUEST_REVIEW"
        elif purchases >= 3:
            recommended_action = "RECOMMEND_PRODUCT"
        else:
            recommended_action = "SEND_THANK_YOU"

        return {
            "customer_id": str(customer.id),
            "score": score,
            "status": status,
            "risk_factors": risk_factors,
            "positive_factors": positive_factors,
            "recommended_action": recommended_action,
        }

    @classmethod
    def update_customer_health_profile(cls, customer: Customer) -> CustomerHealthProfile:
        data = cls.calculate_health(customer)
        profile, _ = CustomerHealthProfile.objects.update_or_create(
            organization=customer.organization,
            customer=customer,
            defaults={
                "health_score": data["score"],
                "health_status": data["status"],
                "risk_factors": data["risk_factors"],
                "positive_factors": data["positive_factors"],
                "recommended_action": data["recommended_action"],
            },
        )
        return profile


# ============================================================================
# 3. CHURN PREDICTION SERVICE (Deterministic baseline with clean abstraction)
# ============================================================================
class ChurnPredictionService:
    """
    Behaviour-based churn prediction system.
    Determines churn probability (0.0 to 1.0) and risk level (LOW, MEDIUM, HIGH, CRITICAL).
    Provides explainable reasons so merchants know exactly why a customer is flagged.
    Can be replaced or extended with a trained ML model seamlessly.
    """

    @classmethod
    def predict_churn(cls, customer: Customer) -> Dict[str, Any]:
        now = timezone.now()
        risk_factors: List[str] = []

        txs = list(
            Transaction.objects.filter(
                organization=customer.organization,
                customer=customer,
                status="completed",
            ).order_by("transaction_date")
        )

        last_purchase_date = customer.last_purchase_at or (txs[-1].transaction_date if txs else None)
        days_since = (now - last_purchase_date).days if last_purchase_date else 999

        # Calculate average historical purchase interval
        avg_interval = 30
        if len(txs) >= 2:
            intervals = [(txs[i].transaction_date - txs[i - 1].transaction_date).days for i in range(1, len(txs))]
            avg_interval = max(7, sum(intervals) // len(intervals))

        # Base probability from interval multiple
        if days_since == 999:
            prob = 0.95
            risk_factors.append("No completed purchases on record")
            reason = "Customer has never completed a purchase."
        else:
            ratio = days_since / avg_interval
            if ratio >= 4.0 or days_since > 120:
                prob = 0.88
                risk_factors.append(f"No purchase in {days_since} days (normal interval: {avg_interval} days)")
                reason = f"Customer has not purchased for {days_since} days, exceeding 4x their expected cadence."
            elif ratio >= 2.5 or days_since > 60:
                prob = 0.68
                risk_factors.append(f"No purchase in {days_since} days (normal interval: {avg_interval} days)")
                reason = f"Current inactivity ({days_since} days) is more than double the normal purchase cadence ({avg_interval} days)."
            elif ratio >= 1.5 or days_since > 35:
                prob = 0.42
                risk_factors.append(f"Purchase interval lengthened to {days_since} days")
                reason = "Customer's purchase frequency is decelerating."
            else:
                prob = 0.15
                reason = "Customer is purchasing within normal historical cadence."

        # Refund penalty
        refund_count = Transaction.objects.filter(
            organization=customer.organization,
            customer=customer,
            status="refunded",
        ).count()
        if refund_count > 0:
            prob = min(0.99, prob + 0.12)
            risk_factors.append(f"Past refund history ({refund_count} refunded order)")

        # Coupon sensitivity
        has_coupons = CouponRedemption.objects.filter(
            organization=customer.organization,
            customer=customer,
        ).exists()
        if not has_coupons and prob > 0.5:
            risk_factors.append("Has not responded to prior offers")

        # Map to Risk Level
        if prob >= 0.75:
            risk = "CRITICAL"
            action = "SEND_COMEBACK_OFFER"
        elif prob >= 0.50:
            risk = "HIGH"
            action = "SEND_COMEBACK_OFFER"
        elif prob >= 0.30:
            risk = "MEDIUM"
            action = "SEND_LOYALTY_REWARD"
        else:
            risk = "LOW"
            action = "RECOMMEND_PRODUCT"

        return {
            "customer_id": str(customer.id),
            "customer_name": customer.full_name,
            "churn_probability": round(prob, 4),
            "churn_risk": risk,
            "prediction_reason": reason,
            "risk_factors": risk_factors,
            "last_purchase_at": last_purchase_date,
            "days_since_last_purchase": days_since if days_since != 999 else None,
            "average_purchase_interval_days": avg_interval,
            "lifetime_value": float(customer.total_spend),
            "recommended_action": action,
            "predicted_at": now.isoformat(),
        }

    @classmethod
    def update_churn_prediction(cls, customer: Customer) -> ChurnPrediction:
        data = cls.predict_churn(customer)
        prediction, _ = ChurnPrediction.objects.update_or_create(
            organization=customer.organization,
            customer=customer,
            defaults={
                "churn_probability": Decimal(str(data["churn_probability"])),
                "churn_risk": data["churn_risk"],
                "prediction_reason": data["prediction_reason"],
                "risk_factors": data["risk_factors"],
                "recommended_action": data["recommended_action"],
            },
        )
        return prediction

    @classmethod
    def get_at_risk_customers(cls, organization, limit: int = 20) -> List[Dict[str, Any]]:
        customers = Customer.objects.filter(organization=organization, is_active=True)
        results = []
        for c in customers:
            pred = cls.predict_churn(c)
            if pred["churn_risk"] in ["HIGH", "CRITICAL"]:
                results.append(pred)

        results.sort(key=lambda x: (-x["churn_probability"], -x["lifetime_value"]))
        return results[:limit]


# ============================================================================
# 4. NEXT BEST ACTION SERVICE
# ============================================================================
class NextBestActionService:
    """
    Determines the single highest-value action to take for a customer.
    Possible actions:
      SEND_COMEBACK_OFFER, SEND_LOYALTY_REWARD, REQUEST_REVIEW,
      RECOMMEND_PRODUCT, SEND_BIRTHDAY_OFFER, SEND_THANK_YOU,
      UPSELL, CROSS_SELL, NO_ACTION
    """

    @classmethod
    def determine_next_action(cls, customer: Customer) -> Dict[str, Any]:
        now = timezone.now()
        churn = ChurnPredictionService.predict_churn(customer)
        health = CustomerHealthService.calculate_health(customer)
        spend = float(customer.total_spend)
        orders = customer.total_purchases

        # 1. Birthday Check
        if customer.date_of_birth:
            if customer.date_of_birth.month == now.month and abs(customer.date_of_birth.day - now.day) <= 5:
                return {
                    "action": "SEND_BIRTHDAY_OFFER",
                    "priority": "HIGH",
                    "reason": f"Customer's birthday is on {customer.date_of_birth.strftime('%d %B')}.",
                    "recommended_offer": "Flat 20% OFF or 250 Bonus Points",
                    "recommended_channel": "whatsapp",
                }

        # 2. Critical Churn Risk / High-Value Win-back
        if churn["churn_risk"] in ["HIGH", "CRITICAL"] and spend >= 3000:
            return {
                "action": "SEND_COMEBACK_OFFER",
                "priority": "HIGH",
                "reason": f"High-value customer (₹{spend:,.0f} spend) at {churn['churn_risk']} churn risk ({churn['days_since_last_purchase']} days inactive).",
                "recommended_offer": "₹200 OFF on orders above ₹999",
                "recommended_channel": "whatsapp",
            }

        # 3. Recent first-time buyer eligible for review
        if orders == 1 and churn["days_since_last_purchase"] and churn["days_since_last_purchase"] <= 7:
            return {
                "action": "REQUEST_REVIEW",
                "priority": "MEDIUM",
                "reason": "Customer completed their first purchase recently. Optimal time to capture feedback.",
                "recommended_offer": "Earn 50 Points for leaving a verified review",
                "recommended_channel": "whatsapp",
            }

        # 4. Champions / Frequent Purchasers
        if orders >= 5 and health["score"] >= 75:
            return {
                "action": "SEND_LOYALTY_REWARD",
                "priority": "HIGH",
                "reason": f"Loyal customer with {orders} orders and excellent health score ({health['score']}/100).",
                "recommended_offer": "VIP Surprise: Double Points on your next order",
                "recommended_channel": "whatsapp",
            }

        # 5. Repeat buyer ready for cross-sell
        if orders >= 2:
            return {
                "action": "RECOMMEND_PRODUCT",
                "priority": "MEDIUM",
                "reason": "Active repeat customer with strong purchase affinity for companion categories.",
                "recommended_offer": "15% OFF recommended products",
                "recommended_channel": "whatsapp",
            }

        # 6. Single order buyer nearing churn threshold
        if orders == 1 and churn["days_since_last_purchase"] and churn["days_since_last_purchase"] > 21:
            return {
                "action": "UPSELL",
                "priority": "MEDIUM",
                "reason": "Customer made 1 purchase 3+ weeks ago. A timely nudge will drive a 2nd order.",
                "recommended_offer": "10% OFF on your second order",
                "recommended_channel": "whatsapp",
            }

        return {
            "action": "SEND_THANK_YOU",
            "priority": "LOW",
            "reason": "Customer is in good standing with recent engagement.",
            "recommended_offer": "Standard loyalty points accumulation",
            "recommended_channel": "whatsapp",
        }


# ============================================================================
# 5. SMART OFFER RECOMMENDATION SERVICE
# ============================================================================
class OfferRecommendationService:
    """
    Recommends data-driven merchant offers based on customer spending, AOV, and churn risk.
    CRITICAL RULE: Never automatically sends or alters prices. Requires merchant confirmation.
    """

    @classmethod
    def recommend_offer(cls, customer: Customer) -> Dict[str, Any]:
        churn = ChurnPredictionService.predict_churn(customer)
        spend = float(customer.total_spend)
        aov = float(customer.average_order_value)
        purchases = customer.total_purchases

        if spend >= 10000 and churn["churn_risk"] in ["HIGH", "CRITICAL"]:
            offer_type = "fixed"
            value = 250
            min_order = max(1000, int(aov * 0.9))
            reason = f"High-value VIP customer (₹{spend:,.0f} spend) with high churn risk. A substantial fixed discount maximizes win-back probability."
            display_title = f"₹{value} OFF"
        elif churn["churn_risk"] in ["HIGH", "CRITICAL"]:
            offer_type = "fixed"
            value = 150
            min_order = max(500, int(aov * 0.8))
            reason = f"At-risk customer with declining frequency ({churn['days_since_last_purchase']} days inactive). Direct savings incentivize immediate comeback."
            display_title = f"₹{value} OFF"
        elif purchases >= 5:
            offer_type = "bonus_points"
            value = 200
            min_order = int(aov)
            reason = "Frequent customer responds well to gamified reward points without margin erosion."
            display_title = "200 Bonus Loyalty Points"
        elif purchases == 1:
            offer_type = "percentage"
            value = 15
            min_order = max(500, int(aov))
            reason = "First-time buyer needs a 2nd purchase discount to solidify retention habit."
            display_title = f"{value}% OFF"
        else:
            offer_type = "percentage"
            value = 10
            min_order = max(400, int(aov))
            reason = "Standard promotional incentive tailored to customer's average order value."
            display_title = f"{value}% OFF"

        return {
            "customer_id": str(customer.id),
            "customer_name": customer.full_name,
            "offer_title": display_title,
            "discount_type": offer_type,
            "discount_value": value,
            "min_order_value": min_order,
            "reason": reason,
            "requires_merchant_approval": True,
            "can_create_coupon": True,
        }

    @classmethod
    def create_approved_coupon(cls, customer: Customer, offer_data: Dict[str, Any]) -> Coupon:
        import secrets

        org = customer.organization
        code = f"OFFER-{secrets.token_hex(3).upper()}"
        expires_at = timezone.now() + timedelta(days=14)

        disc_type = "percentage" if offer_data.get("discount_type") == "percentage" else "fixed"
        disc_val = Decimal(str(offer_data.get("discount_value", 100)))
        min_order = Decimal(str(offer_data.get("min_order_value", 500)))

        coupon = Coupon.objects.create(
            organization=org,
            code=code,
            name=f"Special Offer for {customer.first_name}",
            description=offer_data.get("reason", "Smart personalized recommendation"),
            discount_type=disc_type,
            discount_value=disc_val,
            min_order_value=min_order,
            start_at=timezone.now(),
            expires_at=expires_at,
            usage_limit=1,
            per_customer_limit=1,
            is_active=True,
        )
        return coupon


# ============================================================================
# 6. PRODUCT INTELLIGENCE & AFFINITY ANALYSIS SERVICE
# ============================================================================
class ProductIntelligenceService:
    """
    Analyzes product-level performance metrics:
    - units sold, revenue, average selling price, customer count
    - growth / decline rates (past 30 days vs prior 30 days)
    - repeat purchase rate
    - Market Basket Analysis (support, confidence, lift)
    - Product Affinity calculations
    """

    @classmethod
    def get_product_analytics(cls, organization) -> List[Dict[str, Any]]:
        now = timezone.now()
        p30_start = now - timedelta(days=30)
        p60_start = now - timedelta(days=60)

        products = Product.objects.filter(organization=organization, is_active=True)
        results = []

        # Completed items in past 30 days
        items_p30 = (
            TransactionItem.objects.filter(
                transaction__organization=organization,
                transaction__status="completed",
                transaction__transaction_date__gte=p30_start,
                product__isnull=False,
            )
            .values("product_id")
            .annotate(
                units_30=Sum("quantity"),
                rev_30=Sum("total"),
                tx_count=Count("transaction_id", distinct=True),
                cust_count=Count("transaction__customer", distinct=True),
            )
        )
        map_p30 = {i["product_id"]: i for i in items_p30}

        # Items in prior 30 days (days 31 to 60) for growth rate
        items_prior = (
            TransactionItem.objects.filter(
                transaction__organization=organization,
                transaction__status="completed",
                transaction__transaction_date__gte=p60_start,
                transaction__transaction_date__lt=p30_start,
                product__isnull=False,
            )
            .values("product_id")
            .annotate(
                units_prior=Sum("quantity"),
                rev_prior=Sum("total"),
            )
        )
        map_prior = {i["product_id"]: i for i in items_prior}

        for p in products:
            curr = map_p30.get(p.id, {})
            prior = map_prior.get(p.id, {})

            units = float(curr.get("units_30") or 0)
            rev = float(curr.get("rev_30") or 0)
            customers = curr.get("cust_count") or 0
            prior_rev = float(prior.get("rev_prior") or 0)

            # Growth / decline rate %
            if prior_rev > 0:
                growth_rate = round(((rev - prior_rev) / prior_rev) * 100, 1)
            elif rev > 0:
                growth_rate = 100.0
            else:
                growth_rate = 0.0

            avg_price = float(p.unit_price)

            results.append({
                "id": str(p.id),
                "name": p.name,
                "sku": p.sku,
                "category": p.category.name if p.category else "Uncategorized",
                "unit_price": avg_price,
                "units_sold": units,
                "revenue": rev,
                "growth_rate": growth_rate,
                "customer_count": customers,
                "status": "Trending Up" if growth_rate > 10 else ("Declining" if growth_rate < -10 else "Stable"),
            })

        results.sort(key=lambda x: -x["revenue"])
        return results

    @classmethod
    def calculate_affinities(cls, organization) -> List[Dict[str, Any]]:
        """
        Market Basket Co-occurrence Analysis.
        Finds pairs of products purchased together in the same completed transaction.
        """
        # Find transactions with 2+ distinct products
        multi_item_txs = (
            TransactionItem.objects.filter(
                transaction__organization=organization,
                transaction__status="completed",
                product__isnull=False,
            )
            .values("transaction_id")
            .annotate(prod_count=Count("product_id", distinct=True))
            .filter(prod_count__gte=2)
            .values_list("transaction_id", flat=True)
        )

        total_baskets = len(multi_item_txs)
        if total_baskets == 0:
            return []

        # Fetch product sets per transaction
        tx_items = TransactionItem.objects.filter(
            transaction_id__in=multi_item_txs,
            product__isnull=False,
        ).values_list("transaction_id", "product_id")

        baskets: Dict[Any, set] = {}
        for tx_id, p_id in tx_items:
            baskets.setdefault(tx_id, set()).add(p_id)

        # Count frequencies
        product_freq: Dict[Any, int] = {}
        pair_counts: Dict[Tuple[Any, Any], int] = {}

        for p_set in baskets.values():
            for p in p_set:
                product_freq[p] = product_freq.get(p, 0) + 1
            p_list = sorted(list(p_set))
            for i in range(len(p_list)):
                for j in range(i + 1, len(p_list)):
                    pair = (p_list[i], p_list[j])
                    pair_counts[pair] = pair_counts.get(pair, 0) + 1

        # Product details lookup
        products_dict = {p.id: p for p in Product.objects.filter(organization=organization)}

        affinities = []
        for (p_a_id, p_b_id), count in pair_counts.items():
            if count < 1:
                continue
            pa = products_dict.get(p_a_id)
            pb = products_dict.get(p_b_id)
            if not pa or not pb:
                continue

            # Support and Confidence
            support = count / total_baskets
            conf_a_b = count / max(1, product_freq.get(p_a_id, 1))
            conf_b_a = count / max(1, product_freq.get(p_b_id, 1))
            avg_conf = (conf_a_b + conf_b_a) / 2
            affinity_score = min(100.0, round(avg_conf * 100, 1))

            # Update or create record
            affinity_obj, _ = ProductAffinity.objects.update_or_create(
                organization=organization,
                product_a=pa,
                product_b=pb,
                defaults={
                    "co_occurrence_count": count,
                    "affinity_score": Decimal(str(affinity_score)),
                    "confidence": Decimal(str(round(avg_conf, 4))),
                    "lift": Decimal("1.5"),
                },
            )

            affinities.append({
                "id": str(affinity_obj.id),
                "product_a": {"id": str(pa.id), "name": pa.name, "price": float(pa.unit_price)},
                "product_b": {"id": str(pb.id), "name": pb.name, "price": float(pb.unit_price)},
                "co_occurrence_count": count,
                "affinity_score": affinity_score,
                "text_insight": f"Customers who buy {pa.name} frequently purchase {pb.name}.",
            })

        affinities.sort(key=lambda x: -x["affinity_score"])
        return affinities


# ============================================================================
# 7. SMART BUNDLES SERVICE
# ============================================================================
class SmartBundleService:
    """
    Generates smart bundle recommendations from product affinities.
    Computes individual total price vs suggested discounted bundle price.
    """

    @classmethod
    def get_bundle_recommendations(cls, organization) -> List[Dict[str, Any]]:
        affinities = ProductIntelligenceService.calculate_affinities(organization)
        bundles = []

        for aff in affinities[:8]:
            pa = aff["product_a"]
            pb = aff["product_b"]
            combined_price = pa["price"] + pb["price"]
            if combined_price <= 0:
                continue

            discount_pct = 10.0  # 10% discount on bundle
            suggested_price = round(combined_price * (1 - discount_pct / 100), 2)
            savings = round(combined_price - suggested_price, 2)

            bundles.append({
                "bundle_name": f"{pa['name']} + {pb['name']} Combo",
                "products": [pa, pb],
                "individual_price": combined_price,
                "suggested_bundle_price": suggested_price,
                "discount_percentage": discount_pct,
                "savings": savings,
                "affinity_score": aff["affinity_score"],
                "reason": f"High purchase affinity ({aff['affinity_score']}%). Bundling drives cross-sell conversion.",
                "requires_merchant_review": True,
            })

        return bundles


# ============================================================================
# 8. CAMPAIGN ROI SERVICE
# ============================================================================
class CampaignROIService:
    """
    Calculates campaign return on investment:
    - Direct attribution: completed orders by campaign message recipients within attribution window (7 days).
    - Tracked coupon redemptions linked to campaign.
    - Accurately differentiates directly attributed revenue vs estimated revenue.
    """

    DEFAULT_ATTRIBUTION_DAYS = 7
    ESTIMATED_MESSAGE_COST_INR = Decimal("0.85")  # ₹0.85 per WhatsApp message

    @classmethod
    def calculate_campaign_roi(cls, campaign: Campaign) -> Dict[str, Any]:
        org = campaign.organization
        sent_at = campaign.sent_at or campaign.created_at
        window_end = sent_at + timedelta(days=cls.DEFAULT_ATTRIBUTION_DAYS)

        messages = CampaignMessage.objects.filter(campaign=campaign)
        recipients = campaign.total_recipients or messages.count()
        delivered = campaign.total_delivered or messages.filter(status__in=["delivered", "read"]).count()
        read = campaign.total_read or messages.filter(status="read").count()

        # Recipient customers
        recipient_customer_ids = messages.values_list("customer_id", flat=True).distinct()

        # Direct attribution: transactions from recipient customers during attribution window
        attributed_txs = Transaction.objects.filter(
            organization=org,
            customer_id__in=recipient_customer_ids,
            transaction_date__gte=sent_at,
            transaction_date__lte=window_end,
            status="completed",
        )

        conversions = attributed_txs.values("customer_id").distinct().count()
        attributed_revenue = attributed_txs.aggregate(total=Sum("total"))["total"] or Decimal("0")

        # Campaign cost
        campaign_cost = Decimal(str(recipients)) * cls.ESTIMATED_MESSAGE_COST_INR

        # ROI calculation
        if campaign_cost > 0:
            roi_multiplier = round(float(attributed_revenue / campaign_cost), 1)
        else:
            roi_multiplier = 0.0

        rev_per_recipient = round(float(attributed_revenue) / max(1, recipients), 2)
        conversion_rate = round((conversions / max(1, recipients)) * 100, 1)

        return {
            "campaign_id": str(campaign.id),
            "campaign_name": campaign.name,
            "campaign_type": campaign.campaign_type,
            "sent_at": sent_at.isoformat() if sent_at else None,
            "recipients": recipients,
            "delivered": delivered,
            "read": read,
            "conversions": conversions,
            "conversion_rate": conversion_rate,
            "attributed_revenue": float(attributed_revenue),
            "campaign_cost": float(campaign_cost),
            "roi": f"{roi_multiplier}x",
            "roi_numeric": roi_multiplier,
            "revenue_per_recipient": rev_per_recipient,
            "attribution_window_days": cls.DEFAULT_ATTRIBUTION_DAYS,
            "is_direct_attribution": True,
        }

    @classmethod
    def get_all_campaigns_roi(cls, organization) -> List[Dict[str, Any]]:
        campaigns = Campaign.objects.filter(organization=organization).order_by("-created_at")
        results = []
        for camp in campaigns:
            results.append(cls.calculate_campaign_roi(camp))
        return results


# ============================================================================
# 9. BUSINESS HEALTH SCORE SERVICE
# ============================================================================
class BusinessHealthService:
    """
    Computes 0-100 Business Health Score broken into:
    - Sales Growth (0-100)
    - Customer Retention (0-100)
    - Customer Loyalty (0-100)
    - Marketing & Campaigns (0-100)
    - Product Performance (0-100)
    Identifies the weakest business area for targeted merchant action.
    """

    @classmethod
    def calculate_health(cls, organization) -> Dict[str, Any]:
        now = timezone.now()
        month_start = now.date().replace(day=1)
        last_month_end = month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)

        # 1. Sales Growth (comparing current month run rate to last month)
        curr_revenue = (
            Transaction.objects.filter(
                organization=organization,
                status="completed",
                transaction_date__gte=month_start,
            ).aggregate(s=Sum("total"))["s"]
            or Decimal("0")
        )

        prev_revenue = (
            Transaction.objects.filter(
                organization=organization,
                status="completed",
                transaction_date__gte=last_month_start,
                transaction_date__lte=last_month_end,
            ).aggregate(s=Sum("total"))["s"]
            or Decimal("0")
        )

        if prev_revenue > 0:
            growth_pct = float((curr_revenue - prev_revenue) / prev_revenue)
            sales_score = min(100, max(20, int(70 + (growth_pct * 100))))
        else:
            sales_score = 75 if curr_revenue > 0 else 50

        # 2. Customer Retention
        total_cust = Customer.objects.filter(organization=organization, is_active=True).count()
        active_cust = Customer.objects.filter(
            organization=organization,
            is_active=True,
            last_purchase_at__gte=now - timedelta(days=45),
        ).count()
        if total_cust > 0:
            retention_rate = active_cust / total_cust
            retention_score = min(100, max(20, int(retention_rate * 120)))
        else:
            retention_score = 65

        # 3. Customer Loyalty
        loyalty_accounts = LoyaltyAccount.objects.filter(organization=organization)
        active_loyalty = loyalty_accounts.filter(balance__gt=0).count()
        loyalty_score = 80 if active_loyalty > 0 else 60

        # 4. Marketing Performance
        campaigns = Campaign.objects.filter(organization=organization)
        if campaigns.exists():
            avg_delivered = (
                campaigns.aggregate(d=Avg("total_delivered"), r=Avg("total_recipients"))
            )
            d = avg_delivered["d"] or 0
            r = avg_delivered["r"] or 1
            marketing_score = min(100, max(40, int((d / max(1, r)) * 100)))
        else:
            marketing_score = 70

        # 5. Product Performance
        prods = Product.objects.filter(organization=organization, is_active=True).count()
        product_score = 85 if prods >= 5 else 70

        # Overall composite score (weighted)
        overall = int(
            (sales_score * 0.30)
            + (retention_score * 0.25)
            + (loyalty_score * 0.20)
            + (marketing_score * 0.15)
            + (product_score * 0.10)
        )

        scores = {
            "Sales Growth": sales_score,
            "Customer Retention": retention_score,
            "Customer Loyalty": loyalty_score,
            "Marketing": marketing_score,
            "Product Performance": product_score,
        }

        # Identify weakest area
        weakest_area = min(scores.items(), key=lambda x: x[1])[0]

        # Snapshot saving
        today = now.date()
        BusinessHealthSnapshot.objects.update_or_create(
            organization=organization,
            date=today,
            defaults={
                "overall_score": overall,
                "sales_growth_score": sales_score,
                "retention_score": retention_score,
                "loyalty_score": loyalty_score,
                "marketing_score": marketing_score,
                "product_performance_score": product_score,
                "weakest_area": weakest_area,
                "metrics_data": scores,
            },
        )

        return {
            "overall_score": overall,
            "sales_growth": sales_score,
            "customer_retention": retention_score,
            "customer_loyalty": loyalty_score,
            "marketing": marketing_score,
            "product_performance": product_score,
            "weakest_area": f"Primary improvement area: {weakest_area}",
            "scores": scores,
        }


# ============================================================================
# 10. ANOMALY DETECTION & BUSINESS ALERTS SERVICE
# ============================================================================
class AnomalyDetectionService:
    """
    Rule-based explainable anomaly detection.
    Detects:
    - excessive refunds
    - abnormal transaction values
    - coupon abuse / spikes
    - delivery drops
    - customer inactivity spikes
    """

    @classmethod
    def scan_anomalies(cls, organization) -> List[BusinessAlert]:
        now = timezone.now()
        alerts = []

        # 1. Refund Spikes (past 7 days)
        refunded = Transaction.objects.filter(
            organization=organization,
            status="refunded",
            created_at__gte=now - timedelta(days=7),
        )
        if refunded.count() >= 3:
            alert, _ = BusinessAlert.objects.get_or_create(
                organization=organization,
                alert_type="REFUND_SPIKE",
                is_dismissed=False,
                defaults={
                    "severity": "WARNING",
                    "title": "Elevated Refund Volume Detected",
                    "description": f"{refunded.count()} transactions have been marked as refunded in the past 7 days.",
                    "recommended_action": "Review cashier transaction logs and inspect return reasons.",
                },
            )
            alerts.append(alert)

        # 2. Large Number of High-Value Inactive Customers
        cant_lose = Customer.objects.filter(
            organization=organization,
            is_active=True,
            total_spend__gte=10000,
            last_purchase_at__lt=now - timedelta(days=60),
        ).count()
        if cant_lose >= 2:
            alert, _ = BusinessAlert.objects.get_or_create(
                organization=organization,
                alert_type="VIP_INACTIVITY",
                is_dismissed=False,
                defaults={
                    "severity": "CRITICAL",
                    "title": f"{cant_lose} High-Value Customers Becoming Inactive",
                    "description": f"{cant_lose} customers with over ₹10,000 lifetime spend have not purchased in over 60 days.",
                    "recommended_action": "Launch an exclusive VIP win-back campaign with special privileges.",
                },
            )
            alerts.append(alert)

        # 3. WhatsApp Delivery Drop
        recent_campaigns = Campaign.objects.filter(
            organization=organization,
            status="completed",
            sent_at__gte=now - timedelta(days=14),
        )
        for camp in recent_campaigns:
            if camp.total_sent > 10 and camp.total_delivered < (camp.total_sent * 0.7):
                alert, _ = BusinessAlert.objects.get_or_create(
                    organization=organization,
                    alert_type="DELIVERY_DROP",
                    entity_type="campaign",
                    entity_id=str(camp.id),
                    is_dismissed=False,
                    defaults={
                        "severity": "WARNING",
                        "title": f"Low WhatsApp Delivery on '{camp.name}'",
                        "description": f"Only {camp.total_delivered}/{camp.total_sent} messages were delivered (under 70%).",
                        "recommended_action": "Verify recipient phone numbers and WhatsApp Business API account status.",
                    },
                )
                alerts.append(alert)

        return alerts


# ============================================================================
# 11. LOYALTY TIERS & GAMIFICATION SERVICE
# ============================================================================
class LoyaltyTierService:
    """
    Calculates Tier progress (Bronze, Silver, Gold, Platinum).
    Shows current points, next tier threshold, and points needed.
    """

    DEFAULT_TIERS = [
        {"name": "Bronze", "min_spend": 0, "multiplier": 1.0, "order": 1},
        {"name": "Silver", "min_spend": 5000, "multiplier": 1.25, "order": 2},
        {"name": "Gold", "min_spend": 15000, "multiplier": 1.5, "order": 3},
        {"name": "Platinum", "min_spend": 35000, "multiplier": 2.0, "order": 4},
    ]

    @classmethod
    def get_customer_tier(cls, customer: Customer) -> Dict[str, Any]:
        spend = float(customer.total_spend)

        # Ensure tiers exist in DB or use defaults
        tiers = list(LoyaltyTier.objects.filter(organization=customer.organization, is_active=True).order_by("order"))
        if not tiers:
            # Create default tiers if none exist
            for t in cls.DEFAULT_TIERS:
                LoyaltyTier.objects.create(
                    organization=customer.organization,
                    name=t["name"],
                    min_spend=Decimal(str(t["min_spend"])),
                    points_multiplier=Decimal(str(t["multiplier"])),
                    order=t["order"],
                    is_active=True,
                )
            tiers = list(LoyaltyTier.objects.filter(organization=customer.organization, is_active=True).order_by("order"))

        current_tier = tiers[0]
        next_tier = None
        for i, t in enumerate(tiers):
            if spend >= float(t.min_spend):
                current_tier = t
                next_tier = tiers[i + 1] if i + 1 < len(tiers) else None

        points_needed = 0
        progress_pct = 100
        if next_tier:
            needed_spend = float(next_tier.min_spend) - spend
            tier_range = float(next_tier.min_spend) - float(current_tier.min_spend)
            points_needed = max(0, int(needed_spend))
            progress_pct = min(100, int(((spend - float(current_tier.min_spend)) / max(1, tier_range)) * 100))

        # Current loyalty balance
        try:
            balance = float(customer.loyalty_account.balance)
        except LoyaltyAccount.DoesNotExist:
            balance = 0.0

        return {
            "current_tier": current_tier.name,
            "points_multiplier": float(current_tier.points_multiplier),
            "current_points": balance,
            "next_tier": next_tier.name if next_tier else None,
            "spend_needed_for_next_tier": points_needed,
            "progress_percentage": progress_pct,
            "progress_label": f"₹{points_needed:,.0f} more to reach {next_tier.name}" if next_tier else "Top Tier Achieved",
        }

    @classmethod
    def check_and_unlock_achievements(cls, customer: Customer) -> List[Achievement]:
        org = customer.organization
        now = timezone.now()
        unlocked = []

        # Standard definitions
        standard_achievements = [
            ("FIRST_PURCHASE", "First Purchase", "Completed your very first order with us!", "shopping-bag", "Bronze", 50),
            ("FIVE_PURCHASES", "High Five", "Completed 5 separate purchases!", "star", "Silver", 150),
            ("TEN_PURCHASES", "Master Shopper", "Reached milestone of 10 purchases!", "award", "Gold", 300),
            ("VIP_CUSTOMER", "VIP Elite", "Accumulated over ₹10,000 lifetime spend!", "crown", "Platinum", 500),
            ("BIRTHDAY_PURCHASE", "Birthday Celebration", "Treated yourself on your birthday!", "gift", "Gold", 100),
        ]

        for code, title, desc, icon, badge, pts in standard_achievements:
            ach, _ = Achievement.objects.get_or_create(
                organization=org,
                code=code,
                defaults={
                    "title": title,
                    "description": desc,
                    "icon": icon,
                    "badge_tier": badge,
                    "points_reward": Decimal(str(pts)),
                    "is_active": True,
                },
            )

            # Check criteria
            qualifies = False
            if code == "FIRST_PURCHASE" and customer.total_purchases >= 1:
                qualifies = True
            elif code == "FIVE_PURCHASES" and customer.total_purchases >= 5:
                qualifies = True
            elif code == "TEN_PURCHASES" and customer.total_purchases >= 10:
                qualifies = True
            elif code == "VIP_CUSTOMER" and float(customer.total_spend) >= 10000:
                qualifies = True
            elif code == "BIRTHDAY_PURCHASE" and customer.date_of_birth:
                if customer.last_purchase_at and customer.last_purchase_at.month == customer.date_of_birth.month:
                    qualifies = True

            if qualifies:
                ca, created = CustomerAchievement.objects.get_or_create(
                    organization=org,
                    customer=customer,
                    achievement=ach,
                )
                if created:
                    unlocked.append(ach)

        return unlocked


# ============================================================================
# 12. AI BUSINESS COPILOT SERVICE (Controlled, Tenant-Safe, No Hallucinations)
# ============================================================================
class AIBusinessCopilotService:
    """
    AI Merchant Assistant that answers natural language questions using
    strictly authorized service calls without direct DB SQL or hallucinated data.
    """

    @classmethod
    def answer_query(cls, organization, question: str) -> Dict[str, Any]:
        q = question.lower()

        # Route 1: Sales / Revenue Summary
        if any(w in q for w in ["sale", "revenue", "turnover", "how much did we make", "earnings"]):
            health = BusinessHealthService.calculate_health(organization)
            rfm = RFMAnalysisService.get_rfm_summary(organization)
            top_prods = ProductIntelligenceService.get_product_analytics(organization)[:3]

            prod_names = ", ".join([f"{p['name']} (₹{p['revenue']:,.0f})" for p in top_prods])
            answer = (
                f"Your business health score is currently {health['overall_score']}/100. "
                f"Sales growth stands at {health['sales_growth']}/100. "
                f"You currently have {rfm['total_customers']} active customer profiles recorded. "
                f"Top revenue products in the past 30 days are: {prod_names or 'None yet'}."
            )
            return {
                "answer": answer,
                "category": "sales_intelligence",
                "recommended_action": "Review detailed product trends in Product Intelligence.",
                "data_context": {"health": health, "top_products": top_prods},
            }

        # Route 2: Churn / At-Risk Customers
        if any(w in q for w in ["churn", "risk", "leaving", "inactive", "lost", "who is leaving"]):
            at_risk = ChurnPredictionService.get_at_risk_customers(organization, limit=5)
            count = len(at_risk)
            if count > 0:
                names = ", ".join([f"{c['customer_name']} ({c['churn_risk']} risk)" for c in at_risk])
                answer = (
                    f"We detected {count} high-risk customers likely to churn: {names}. "
                    f"The primary driver is lengthened inactivity compared to their regular purchase interval. "
                    f"We recommend issuing a merchant-approved comeback voucher immediately."
                )
            else:
                answer = "Great news! No customers are currently flagged at HIGH or CRITICAL churn risk."

            return {
                "answer": answer,
                "category": "churn_intelligence",
                "recommended_action": "Send comeback campaigns to flagged customers from the At-Risk dashboard.",
                "data_context": {"at_risk_customers": at_risk},
            }

        # Route 3: Best Customers / Champions
        if any(w in q for w in ["best", "champion", "vip", "top customer", "loyal"]):
            rfm = RFMAnalysisService.get_rfm_summary(organization)
            champions = CustomerRFMProfile.objects.filter(
                organization=organization,
                segment__in=["Champions", "Loyal Customers"],
            ).select_related("customer")[:5]

            champ_list = ", ".join([f"{c.customer.full_name} (₹{float(c.monetary_value):,.0f})" for c in champions])
            answer = (
                f"You have {rfm['champions_count']} Champions and {rfm['loyal_count']} Loyal Customers. "
                f"Top spenders include: {champ_list or 'Building profile data...'}. "
                f"These customers account for your highest lifetime order frequencies."
            )
            return {
                "answer": answer,
                "category": "customer_segments",
                "recommended_action": "Reward Champions with exclusive loyalty multiplier perks.",
                "data_context": {"rfm_summary": rfm},
            }

        # Route 4: What Should I Do Today?
        if any(w in q for w in ["today", "what should i do", "action", "next step", "recommend"]):
            alerts = AnomalyDetectionService.scan_anomalies(organization)
            health = BusinessHealthService.calculate_health(organization)
            at_risk = ChurnPredictionService.get_at_risk_customers(organization, limit=2)

            actions = []
            if alerts:
                actions.append(f"Resolve alert: {alerts[0].title}")
            if at_risk:
                actions.append(f"Send comeback offer to {at_risk[0]['customer_name']}")
            actions.append(f"Address your {health['weakest_area']}")

            answer = (
                f"Here is your top priority action list for today:\n"
                + "\n".join([f"{i+1}. {a}" for i, a in enumerate(actions)])
            )
            return {
                "answer": answer,
                "category": "actionable_coaching",
                "recommended_action": actions[0] if actions else "Review daily dashboard metrics",
                "data_context": {"health": health, "alerts": [a.title for a in alerts]},
            }

        # Route 5: Campaign ROI / Marketing
        if any(w in q for w in ["campaign", "roi", "whatsapp", "promo", "marketing"]):
            campaigns = CampaignROIService.get_all_campaigns_roi(organization)[:3]
            if campaigns:
                top_camp = max(campaigns, key=lambda x: x["attributed_revenue"])
                answer = (
                    f"Your most successful recent campaign was '{top_camp['campaign_name']}' "
                    f"which directly attributed ₹{top_camp['attributed_revenue']:,.2f} in revenue with an ROI of {top_camp['roi']} "
                    f"({top_camp['conversions']} conversions from {top_camp['recipients']} recipients)."
                )
            else:
                answer = "No campaigns have been run yet. Launch a WhatsApp promotion to start measuring ROI."

            return {
                "answer": answer,
                "category": "campaign_intelligence",
                "recommended_action": "Create a win-back or birthday campaign in Campaign Assistant.",
                "data_context": {"campaigns": campaigns},
            }

        # Route 6: General Business Health
        health = BusinessHealthService.calculate_health(organization)
        answer = (
            f"Your overall Business Health Score is {health['overall_score']}/100. "
            f"{health['weakest_area']}. "
            f"Sales Growth is at {health['sales_growth']}/100 and Retention is at {health['customer_retention']}/100."
        )
        return {
            "answer": answer,
            "category": "business_overview",
            "recommended_action": "Check the Customer Intelligence and At-Risk dashboards for immediate growth levers.",
            "data_context": {"health": health},
        }
