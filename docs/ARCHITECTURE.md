# BillFree V2 Platform Architecture

## 1. High-Level Architecture Overview

BillFree V2 transforms a billing and CRM solution into an **Intelligent Billing + Customer Retention + Business Intelligence Platform**.

```
                           BILLING & TRANSACTIONS
                                     ↓
                          CUSTOMER DATA PLATFORM
                                     ↓
                   V2 INTELLIGENCE & ANALYTICS ENGINE
      ┌─────────────────┬──────────────────┬─────────────────┐
      │  RFM Profiling  │  Health Scoring  │ Churn Predictor │
      └─────────────────┴──────────────────┴─────────────────┘
                                     ↓
                          NEXT BEST ACTION ENGINE
                                     ↓
                      SMART OFFER & BUNDLE GENERATOR
                                     ↓
                     CAMPAIGN & WHATSAPP ENGAGEMENT
                                     ↓
                     DIRECT REVENUE ATTRIBUTION & ROI
```

---

## 2. Core Subsystems

### 2.1 Backend Core (Django 5.1 / Django REST Framework)
- **Multi-Tenant Foundation (`apps/core/models.py`)**: All domain models inherit `TenantModel` containing `organization = models.ForeignKey(Organization)`. The custom `TenantQuerySet` guarantees strict organization isolation across all operations.
- **Transactions & Invoicing (`apps/transactions/`, `apps/invoices/`)**: POS transaction ingest API (`/api/v1/transactions/`), immutable record ledger, automated GST calculations, dynamic PDF invoice generation, and unique public token links (`/bills/<secure_token>`).
- **Loyalty Engine (`apps/loyalty/`)**: Multiplier-based point accumulation ledger, Tier rules (`LoyaltyTier`), Gamification badges (`Achievement`, `CustomerAchievement`).
- **Intelligence Layer (`apps/analytics/services.py`)**:
  - `RFMAnalysisService`: 1–5 recency, frequency, monetary scoring & 9 segment classifications.
  - `CustomerHealthService`: 0–100 weighted health score with explainable positive & risk factors.
  - `ChurnPredictionService`: Behaviour-based churn risk probability & cadence ratio analysis.
  - `NextBestActionService`: Rule-based deterministic decision tree recommending channel and offer.
  - `OfferRecommendationService`: Margin-aware smart discounts with explicit merchant confirmation.
  - `ProductIntelligenceService` & `SmartBundleService`: Co-occurrence market basket analysis (support, confidence, lift).
  - `CampaignROIService`: Direct 7-day transaction link attributing actual revenue against messaging cost.
  - `BusinessHealthService`: 0–100 executive score spanning sales, retention, loyalty, marketing, and products.
  - `AnomalyDetectionService`: Anomaly scanning for refund surges, coupon abuse, and delivery drops.
  - `AIBusinessCopilotService`: Tool-based natural language assistant with access to read-only business summaries.

### 2.2 Frontend Application (Next.js 14 / TypeScript / Tailwind CSS)
- **Executive Dashboard (`/dashboard`)**: Business Health index (0–100), Active Business Alerts banner with dismissal, today's customer opportunities, and revenue/customer trend charts.
- **Retention & RFM Analytics (`/dashboard/analytics`)**: Interactive RFM segment distribution bar, drill-down customer drawer, Customers at Risk table with 1-click Comeback Offer trigger, and 6-month Cohort Retention matrix.
- **Customer 360 (`/dashboard/customers/[id]`)**: Full health score breakdown ("Why this score?"), Churn risk meter, Next Best Action, and Merchant-Confirmed Smart Offers.
- **Product Intelligence & Smart Bundles (`/dashboard/products`)**: Product affinities ("Customers who buy X frequently buy Y"), declining product alert, and smart bundles with price comparison.
- **Campaign ROI (`/dashboard/campaigns`)**: Attributed revenue, campaign cost, verified conversions, and ROI multiplier.
- **AI Business Copilot Drawer**: Global slide-out assistant accessible across dashboard routes with pre-engineered prompt shortcuts.
- **Customer Mini Portal (`/portal/[token]`)**: Secure, mobile-responsive token-based mini portal with multi-language foundation (English, Hindi, Marathi, Gujarati), loyalty tiers, progress bar, rewards wallet, and unlocked achievement badges.
- **Smart Digital Invoice (`/bills/[token]`)**: Public tax invoice with loyalty tier badge, wallet balance, recommended companion product, and verification QR code.

---

## 3. Database Design & Relational Schema

```
Organization (Tenant Root)
  ├── User (Staff / Admins)
  ├── Store (Branches)
  ├── Product
  ├── Customer
  │     ├── CustomerRFMProfile (1:1)
  │     ├── CustomerHealthProfile (1:1)
  │     ├── ChurnPrediction (1:1)
  │     ├── LoyaltyAccount (1:1)
  │     └── CustomerAchievement (1:M)
  ├── Transaction
  │     ├── TransactionItem (1:M)
  │     └── Invoice (1:1)
  ├── Coupon & CouponRedemption
  ├── Campaign & CampaignRecipient
  ├── LoyaltyTier (Bronze, Silver, Gold, Platinum)
  ├── Achievement (Definitions)
  ├── ProductAffinity (Market Basket Pairings)
  ├── BusinessAlert (Real-time operational alerts)
  └── BusinessHealthSnapshot (Historical trend)
```

---

## 4. Multi-Tenant Security & Isolation
- **Tenant Scope Enforcement**: Every intelligence query filters by `organization=request.user.organization`.
- **Public Mini Portal**: Token-based lookup matches `portal_token` directly or verifies the invoice's `secure_token`. Never leaks other customers or internal IDs.
- **AI Tool Boundaries**: LLM copilot services execute only controlled service functions that enforce tenant isolation. Arbitrary SQL execution is strictly prohibited.
