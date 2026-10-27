# BillMeet — Modern Billing, POS & Business Intelligence ERP

[![Tests](https://img.shields.io/badge/Tests-272%20Passed-emerald.svg)](#)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](#)
[![Django](https://img.shields.io/badge/Django-5.1-green.svg)](#)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](#)

BillMeet is a production-oriented, multi-tenant Billing, Inventory, and Point-of-Sale (POS) ERP platform designed for retail, wholesale, and multi-store operations. The system is engineered around zero-float financial precision, atomic transactions, sequential invoicing, strict role-based access control, and real-time inventory propagation.

---

## Architecture & Core Modules

```
                    ┌───────────────────────────────┐
                    │  Next.js 14 Frontend Client   │
                    │   (React / TypeScript / CSS)  │
                    └───────────────┬───────────────┘
                                    │ HTTPS / REST API / SSE
                                    ▼
                    ┌───────────────────────────────┐
                    │      Django REST Framework    │
                    │   (Authentication & Routing)  │
                    └───────┬───────────────┬───────┘
                            │               │
                            ▼               ▼
          ┌──────────────────────────┐  ┌─────────────────────────┐
          │ Domain Services Layer    │  │ Celery Async Workers    │
          │ - CheckoutService        │  │ - PDF Invoice Rendering │
          │ - CartEngine / TaxEngine │  │ - WhatsApp Notification │
          │ - InvoiceNumberService   │  │ - Loyalty Point Compute │
          │ - Inventory & Returns    │  └─────────────────────────┘
          │ - Financial Ledger       │
          └─────────────┬────────────┘
                        │
                        ▼
          ┌──────────────────────────┐
          │ PostgreSQL / SQLite      │
          │ (Atomic ACID Operations) │
          └──────────────────────────┘
```

### Key Capabilities

- **Point of Sale (POS)**: Concurrency-hardened checkout with single-click payment, cash change computation, multi-mode split payments (Cash, UPI, Card, Credit/Udhaar), held cart parking, and barcode scanning.
- **Inventory & Catalog**: Category inline management, SKU/barcode lookup, unpaginated complete catalog selectors, and real-time Server-Sent Events (SSE) updates to all active cashier terminals.
- **Sequential Invoicing**: Non-overlapping, tenant-isolated invoice sequences (`INV-YYYYMMDD-000001`) with A4 GST Tax Invoices and 80mm thermal receipt printing.
- **Dedicated Staff System & RBAC**: Admin-managed cashier accounts with workspace isolation (`/staff/` dashboard, POS, quotations, and invoices) preventing cashiers from accessing managerial reports, tenant settings, or credentials.
- **WhatsApp Cloud Integration**: Automated digital invoice and coupon dispatch with multi-state connection testing and credential protection.
- **Customer CRM & Udhaar**: FIFO credit settlement, credit balances ledger, RFM customer segmentation, and automated loyalty tier gamification.
- **Executive Analytics**: Real-time sales metrics, customer retention, 30-day revenue trends, and daily register closing reconciliation.

---

## Directory Layout

```
.
├── backend/                  # Django 5.1 & DRF Backend
│   ├── apps/
│   │   ├── analytics/        # Business Intelligence, Retention, RFM
│   │   ├── billing/          # CheckoutService, BusinessConfig, CashRegisters
│   │   ├── customers/        # Customer CRM & Credit Balances
│   │   ├── invoices/         # Invoicing, Sequences & Quotations
│   │   ├── loyalty/          # Loyalty Tiers & Rules
│   │   ├── organizations/    # Multi-tenant Organizations & Stores
│   │   ├── products/         # Catalog, Categories, Inventory & Stock Movements
│   │   ├── reports/          # Financial Ledger, Daily Closings & Backups
│   │   ├── transactions/     # Atomic Sales Ledger & Split Payments
│   │   ├── users/            # RBAC Authentication (Owner, Manager, Cashier)
│   │   └── whatsapp/         # Meta Cloud API Integration & Diagnostics
│   ├── common/               # Tenancy scoping, pagination, permissions
│   ├── config/               # Django settings, WSGI, Celery config
│   └── tests/                # 272 Automated Pytest Tests (100% pass)
├── frontend/                 # Next.js 14 App Router (TypeScript & Tailwind)
│   ├── app/
│   │   ├── dashboard/        # Admin & Manager ERP Workspace
│   │   ├── staff/            # Cashier-Isolated Workspace
│   │   ├── m/                # Mobile POS & Operational Views
│   │   ├── bills/[token]/    # Public Verified Invoice View
│   │   └── portal/[token]/   # Customer Mini Portal
│   ├── components/           # UI Dialogs, Modals, Receipt Printers
│   └── services/api.ts       # Unified API client & Real-time SSE
├── docs/                     # Authoritative Technical Specifications
│   ├── ARCHITECTURE.md       # Full system architecture & domain lifecycles
│   ├── DATA_INTEGRITY.md     # Zero floating-point math & rounding rules
│   ├── DATA_SOURCE_MAP.md    # Authoritative database model mapping
│   ├── DEPLOYMENT.md         # Render Blueprint & Docker production setup
│   ├── FEATURES.md           # Deep dive into platform features
│   ├── API.md                # REST API endpoint specifications
│   ├── TESTING.md            # Automated testing guide
│   └── RELEASE_CHECKLIST.md  # Production promotion verification gates
└── render.yaml               # Infrastructure-as-Code for Render Cloud
```

---

## Quickstart & Local Setup

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser_if_none_exists
python manage.py runserver 0.0.0.0:8000
```
Backend runs at `http://127.0.0.1:8000`. Health check: `http://127.0.0.1:8000/api/v1/health/`.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:3000`.

---

## Automated Verification & Tests

### Backend Tests (272 Tests)
```bash
cd backend
pytest
```

### Frontend Validation & Production Build
```bash
cd frontend
npm run lint
npm run build
```

---

## Deployment to Render

This repository includes a production-ready [`render.yaml`](./render.yaml) Blueprint:
1. Push your code to GitHub or GitLab.
2. Log in to [Render Dashboard](https://dashboard.render.com/).
3. Click **"New +"** $\rightarrow$ **"Blueprint"** and select this repository.
4. Render automatically deploys the PostgreSQL database, Docker backend, and Next.js frontend with linked environments.

Detailed instructions are available in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Technical Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [Financial Data Integrity Specification](docs/DATA_INTEGRITY.md)
- [Screen & Data Source Map](docs/DATA_SOURCE_MAP.md)
- [Deployment & Render Blueprint Guide](docs/DEPLOYMENT.md)
- [API Reference](docs/API.md)
- [Platform Features](docs/FEATURES.md)
- [Testing Verification Guide](docs/TESTING.md)
- [Production Release Checklist](docs/RELEASE_CHECKLIST.md)
