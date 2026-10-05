# BillFree — V2 Intelligence & Customer Engagement Platform

[![Tests](https://img.shields.io/badge/Tests-90%20Passed-emerald.svg)](#)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](#)
[![Django](https://img.shields.io/badge/Django-5.1-green.svg)](#)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](#)

BillFree V2 transforms modern retail billing from a simple point-of-sale utility into an **Intelligent Billing + Customer Retention + Business Intelligence Platform**.

---

## The Platform Lifecycle

```
BILLING → CUSTOMER DATA → CUSTOMER INTELLIGENCE → PREDICTION → NEXT BEST ACTION → ENGAGEMENT → REVENUE MEASUREMENT
```

1. **Merchant Creates a Bill**: Ingested via POS API, GST calculated, itemized receipt recorded.
2. **Digital Invoice & Rewards**: Customer receives SMS/WhatsApp invoice link with loyalty points earned.
3. **Automated RFM & Health Profiling**: Customer Recency, Frequency, and Monetary scores are recalculated.
4. **Behaviour-Based Churn Prediction**: Customer inactivity is evaluated against personal purchase cadence.
5. **Next Best Action Engine**: Determines whether to offer a comeback incentive, review prompt, or VIP reward.
6. **Smart Offers with Merchant Confirmation**: Offers are recommended to merchants with one-click approval safeguards.
7. **Attributed Revenue Measurement**: Post-campaign purchases are linked directly to measure actual financial ROI.

---

## Key V2 Upgrades

- **RFM Customer Intelligence**: 9 segments (Champions, Loyal Customers, At Risk, Hibernating, Lost).
- **Customer Health Score (0–100)**: 7-factor transparent health score with explainable positive & risk factors ("Why?").
- **Churn Prediction**: Cadence ratio analysis classifying risk into LOW, MEDIUM, HIGH, CRITICAL.
- **Next Best Action Engine**: Rule-based decision tree for personalized merchant actions.
- **Smart Offer Recommendations**: Margin-safe offers requiring merchant approval before publishing.
- **Product Affinity & Smart Bundles**: Market basket co-occurrence analysis and pre-packaged bundle recommendations.
- **Direct Campaign ROI**: 7-day post-campaign transaction attribution with zero fabricated metrics.
- **Customer Mini Portal**: Mobile-responsive, token-based public portal with multi-language support (English, Hindi, Marathi, Gujarati).
- **Loyalty Tiers & Gamification**: Bronze, Silver, Gold, Platinum tiers and unlocked achievement badges.
- **Executive Business Health (0–100)**: Overall health index highlighting the weakest operational area.
- **AI Business Copilot**: Slide-out assistant executing read-only, tenant-isolated analytical tools.

---

## Directory Layout

```
.
├── backend/                  # Django 5.1 & DRF Backend
│   ├── apps/
│   │   ├── analytics/        # V2 Intelligence Services, RFM, Churn, Copilot
│   │   ├── customers/        # Customer CRM & Portal Tokens
│   │   ├── loyalty/          # Loyalty Tiers & Achievements
│   │   ├── transactions/     # POS Ingest & Ledger
│   │   ├── invoices/         # Smart Digital Invoices
│   │   ├── campaigns/        # Broadcasts & ROI Attribution
│   │   └── automations/      # Customer Journeys
│   └── tests/                # 90 Pytest Unit & Integration Tests
├── frontend/                 # Next.js 14 & Tailwind CSS Frontend
│   ├── app/
│   │   ├── dashboard/        # Executive Dashboard, Analytics, Products, Campaigns
│   │   ├── portal/[token]/   # Customer Mini Portal (Multi-Language)
│   │   └── bills/[token]/    # Smart Digital Invoices (QR, Companion Recommendations)
│   ├── components/           # CopilotDrawer, Radix UI Cards & Dialogs
│   └── services/api.ts       # Unified V2 API Client
└── docs/                     # Full Technical Documentation
    ├── ARCHITECTURE.md       # High-level architecture map
    ├── FEATURES.md           # Deep dive into all 15+ features
    ├── API.md                # Complete API endpoint specifications
    ├── AI_COPILOT.md         # Copilot architecture & safety rules
    ├── ANALYTICS.md          # Statistical & mathematical formulas
    └── DEPLOYMENT.md         # Production setup & environment variables
```

---

## Quickstart

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
pytest tests/ -v
python manage.py runserver 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run build
npm run dev
```

Visit the dashboard at `http://localhost:3000`.

---

## Documentation Links
- [Architecture Blueprint](file:///Users/meet/Desktop/bill-main/docs/ARCHITECTURE.md)
- [Feature Details](file:///Users/meet/Desktop/bill-main/docs/FEATURES.md)
- [API Reference](file:///Users/meet/Desktop/bill-main/docs/API.md)
- [AI Copilot Safety](file:///Users/meet/Desktop/bill-main/docs/AI_COPILOT.md)
- [Analytics & Mathematical Formulas](file:///Users/meet/Desktop/bill-main/docs/ANALYTICS.md)
- [Production & Deployment Guide](file:///Users/meet/Desktop/bill-main/docs/DEPLOYMENT.md)
