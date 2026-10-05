# BillFree V2 Intelligence & Customer Engagement Features

This document provides a comprehensive description of the 15 core V2 intelligence features implemented in the platform.

---

## Feature 1: RFM Customer Intelligence
- **Implementation**: `apps/analytics/services.py:RFMAnalysisService`
- **Methodology**: Calculates Recency (days since last purchase), Frequency (total orders), and Monetary Value (lifetime spend) using quartile scoring (1 to 5).
- **Segments Generated**:
  1. *Champions*: R 4-5, F 4-5, M 4-5
  2. *Loyal Customers*: R 3-5, F 3-5, M 3-5
  3. *Potential Loyalists*: R 4-5, F 2-3, M 2-4
  4. *New Customers*: R 4-5, F 1, M 1-3
  5. *Promising*: R 3-4, F 1-2, M 1-2
  6. *At Risk*: R 2-3, F 2-4, M 2-4
  7. *Can't Lose Them*: R 1-2, F 4-5, M 4-5
  8. *Hibernating*: R 1-2, F 1-2, M 1-3
  9. *Lost*: R 1, F 1, M 1
- **API Endpoints**:
  - `GET /api/v1/analytics/rfm/distribution/`
  - `GET /api/v1/analytics/rfm/summary/`
  - `GET /api/v1/analytics/rfm/customers/?segment={segment}`

---

## Feature 2: Customer Health Score (0–100)
- **Implementation**: `apps/analytics/services.py:CustomerHealthService`
- **Scoring Dimensions**:
  - Purchase Recency (up to 30 pts)
  - Purchase Frequency (up to 25 pts)
  - Lifetime Monetary Value & AOV (up to 25 pts)
  - Purchasing Cadence vs Historical Interval (up to 10 pts)
  - Loyalty Engagement & Redemption (up to 10 pts)
  - Coupon Redemptions (up to 5 pts)
  - Refund Activity Penalty (-15 pts)
- **Status Categories**: Excellent (90–100), Healthy (75–89), Stable (50–74), At Risk (25–49), Critical (0–24).
- **Explainability ("Why?")**: Returns structured `positive_factors` and `risk_factors` explaining the score.

---

## Feature 3: Behaviour-Based Churn Prediction
- **Implementation**: `apps/analytics/services.py:ChurnPredictionService`
- **Risk Categorization**: LOW (<35%), MEDIUM (35–64%), HIGH (65–84%), CRITICAL (>=85%).
- **Cadence Ratio**: Compares current inactivity days against the customer's personal average purchase interval.
- **API Endpoints**:
  - `GET /api/v1/customers/{id}/churn/`
  - `GET /api/v1/analytics/churn/at-risk/`

---

## Feature 4: Next Best Action Engine
- **Implementation**: `apps/analytics/services.py:NextBestActionService`
- **Rule Set**:
  - Upcoming Birthday → `SEND_BIRTHDAY_OFFER`
  - High-Value Inactive → `SEND_COMEBACK_OFFER`
  - Recent 1st Purchase (<7 days) → `REQUEST_REVIEW`
  - Champion Customer → `SEND_LOYALTY_REWARD`
  - Active Repeat Customer → `RECOMMEND_PRODUCT`
  - First-time registered user → `SEND_WELCOME_OFFER`

---

## Feature 5: Smart Offer Recommendation
- **Implementation**: `apps/analytics/services.py:OfferRecommendationService`
- **Merchant Protection**: Recommends appropriate discount type (percentage, fixed amount, free product) but strictly requires explicit merchant approval before creating or sending the coupon.
- **API Endpoint**:
  - `POST /api/v1/customers/{id}/create-recommended-offer/`

---

## Feature 6: Product Intelligence & Market Basket Affinity
- **Implementation**: `apps/analytics/services.py:ProductIntelligenceService`
- **Metrics**: Units sold, total revenue, repeat purchase rate, growth rate, and decline rate.
- **Affinity Analysis**: Analyzes co-occurrence across multi-item transactions. Computes support, confidence, and affinity percentage.
- **Insight Example**: *"Customers who purchase Laptop frequently buy Wireless Mouse (67% affinity)."*

---

## Feature 7: Smart Bundles
- **Implementation**: `apps/analytics/services.py:SmartBundleService`
- **Bundle Packaging**: Combines high-affinity product pairs into bundles with a 10%–15% package incentive.
- **Merchant Safeguard**: Bundles are proposed for merchant review; product catalog base prices are never altered automatically.

---

## Feature 8: Direct Campaign ROI Attribution
- **Implementation**: `apps/analytics/services.py:CampaignROIService`
- **Attribution Model**: Directly links transactions completed by campaign recipients within 7 days post-send.
- **Integrity**: Directly attributed revenue is clearly distinguished from estimated revenue with zero fabricated numbers.

---

## Feature 9: Customer Mini Portal
- **Frontend Route**: `/portal/[token]`
- **Design**: Fast, mobile-first responsive layout with token-based authentication.
- **Features**: Live tier badge, points balance, spend needed for next tier, available discount coupons with copy code button, and recent invoices.

---

## Feature 10: Loyalty Tiers
- **Implementation**: `apps/analytics/services.py:LoyaltyTierService`
- **Tier Structure**: Bronze (₹0), Silver (₹2,500), Gold (₹7,500), Platinum (₹20,000).
- **Multiplier**: Automatically accelerates points accrual as customers advance across tiers.

---

## Feature 11: Professional Gamification & Achievements
- **Implementation**: `apps/loyalty/models.py:Achievement`, `CustomerAchievement`
- **Supported Badges**:
  - `FIRST_PURCHASE` (First Steps)
  - `FIVE_PURCHASES` (Loyal Regular)
  - `TEN_PURCHASES` (Brand Champion)
  - `VIP_CUSTOMER` (High Roller)
  - `SUPER_SAVER` (Coupon Enthusiast)

---

## Feature 12: Customer Journeys & Automation
- **Implementation**: `apps/automations/models.py:CustomerJourney`, `CustomerJourneyProgress`
- **Workflow Steps**: Trigger (e.g. `NEW_CUSTOMER` or `COMPLETED_PURCHASE`), condition checks, delay timers, and automated engagement branches.

---

## Feature 13: Smart Business Alerts
- **Implementation**: `apps/analytics/services.py:AnomalyDetectionService`
- **Monitors**: Surge in refunds, high-value customer inactivity spikes, WhatsApp delivery rate drops, and coupon misuse.
- **Alert Actions**: Real-time severity classification (INFO, WARNING, CRITICAL) with dismiss/acknowledge APIs.

---

## Feature 14: Business Health Score (0–100)
- **Implementation**: `apps/analytics/services.py:BusinessHealthService`
- **Composite Dimensions**: Sales Growth, Customer Retention, Loyalty Index, Marketing Effectiveness, Product Momentum.
- **Weakest Area Highlight**: Identifies the single most urgent operational bottleneck with targeted next steps.

---

## Feature 15: AI Business Copilot
- **Implementation**: `apps/analytics/services.py:AIBusinessCopilotService`
- **Interface**: Global slide-out assistant drawer with prompt suggestions.
- **Safe Tool Routing**: Queries retrieve verified database aggregates (sales summaries, churn risks, campaign ROI). The model never accesses raw SQL or database connections directly.

---

## Feature 16: Multi-Language Foundation (i18n)
- **Supported Languages**: English (`en`), Hindi (`hi`), Marathi (`mr`), Gujarati (`gu`).
- **Scope**: Customer Mini Portal and digital invoice experiences allow 1-click language toggling.
