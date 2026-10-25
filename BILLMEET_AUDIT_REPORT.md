# BillMeet Billing & POS — Comprehensive Audit Report

**Date:** 2026-10-25  
**Version:** 2.1-Pilot Production Hardening  
**Auditor:** Antigravity Senior Engineering & Security Audit Team  
**Repository:** `MeetDutta/bill` (`/Users/meet/Desktop/bill-main`)

---

## 1. Executive Summary

A comprehensive, full-stack architectural, security, and functional audit of the **BillMeet** retail billing and POS platform was executed across backend services (Django REST Framework, SQLite/PostgreSQL, Redis), frontend applications (Next.js 14 App Router, TypeScript, Tailwind CSS), database migrations, and automated test suites.

The existing application exhibits strong domain foundation:
- Robust tax engine (`TaxEngine`) for GST inclusive/exclusive calculation.
- Cart engine (`CartEngine`) with item and invoice-level discounts.
- Atomic stock decrements using `select_for_update()` row locking.
- Customer credit ledger with transactional timeline records.
- Sales return and restocking engine (`ReturnService`).
- Server-Sent Events (SSE) realtime notifications.

However, several critical defects and functional gaps were discovered during deep discovery:
1. **Payment System & Split/Hybrid Payment Vulnerabilities**: `CheckoutService` accepts arbitrary payment method strings, skips negative amounts rather than throwing validation errors, lacks safety checks against non-finite or invalid decimals, and rejects valid partial payments if not explicitly formatted as a credit row.
2. **Quotation Conversion Lacks Split Payment Support**: `QuotationConvertView` only permitted a single payment method string, failing when converting quotes into hybrid split payments (e.g., Cash + UPI).
3. **Analytics Conflating Credit with Cash/Digital Collections**: Dashboard payment calculations aggregated all `TransactionPayment` records with `status="success"` without separating `payment_method="credit"`, erroneously counting credit (unpaid) dues as cash/digital money collected today.
4. **Missing Staff Management UI & Inadequate Server-Side RBAC**: The `/api/v1/users/` endpoints lacked role-based permission checks, allowing any authenticated user to create accounts, perform self-privilege escalation, or delete the last organization administrator. There was no frontend staff directory or role-management view. Stock adjustment endpoints lacked role protection.
5. **Mobile POS Error Transparency**: Mobile POS checkout error handling failed to extract structured DRF field errors, falling back to generic messages.

---

## 2. Baseline Architecture & Technology Map

| Tier | Technology | Configuration / Entry Point |
|---|---|---|
| **Backend Framework** | Django 5.1 + Django REST Framework 3.15 | `backend/config/wsgi.py`, `backend/config/urls.py` |
| **Python Environment** | Python 3.11 (`backend/.venv`) | `backend/requirements.txt` |
| **Frontend Framework** | Next.js 14.2.13 (App Router), React 18, TypeScript | `frontend/app/layout.tsx`, `frontend/package.json` |
| **Styling & UI** | Tailwind CSS 3.4.12, Radix UI, Lucide Icons | `frontend/tailwind.config.js`, `frontend/components/ui/` |
| **State & Data Fetching** | Axios 1.7.7, TanStack React Query 5.56 | `frontend/lib/api.ts`, `frontend/services/api.ts` |
| **Database** | SQLite3 (Local Dev/Staging) / PostgreSQL (Production) | `backend/config/settings/base.py`, `backend/apps/*/models.py` |
| **Cache & Realtime** | Redis / In-memory broadcast fallback, SSE | `backend/apps/billing/services/realtime_service.py` |
| **Test Runner** | Pytest 9.1.1 + pytest-django | `backend/pytest.ini`, `backend/tests/` (203 baseline tests) |

---

## 3. Detailed Audit Findings & Confirmed Defects

### Defect 1: Payment Method Validation & Precision Gaps in `CheckoutService`
- **Severity:** High (Financial & Transaction Integrity)
- **Affected File:** `backend/apps/billing/services/checkout_service.py`
- **Root Cause:**
  1. `p_data.get("amount")` converted directly via `Decimal(str(...))` without catching `InvalidOperation`, leading to unhandled 500 server crashes when non-numeric or malformed values are passed.
  2. Non-positive amounts (`amt <= 0`) were silently skipped with `continue` rather than failing fast with an informative HTTP 400 `ValidationError`.
  3. No validation of permitted payment methods: arbitrary strings like `"crypto"` or `"invalid"` were persisted into `TransactionPayment`.
  4. Explicit partial payments (`allow_partial=True`) were rejected because `total_paid_tendered < grand_total` failed before allocating the remaining balance to the customer's credit ledger.
- **Impact:** Potential recording of arbitrary payment methods, server crashes on malformed input, and inability to process legitimate partial settlements.
- **Planned Fix:**
  - Introduce strict `ALLOWED_PAYMENT_METHODS = {"cash", "upi", "card", "credit", "netbanking", "cheque", "wallet"}`.
  - Implement decimal sanitization, 2-decimal-place quantization, and rejection of negative or non-finite values.
  - Support explicit partial payment allocations when `allow_partial=True` is provided for registered customers.

---

### Defect 2: Quotation Conversion Inability to Accept Split Payments
- **Severity:** Medium-High (Sales & Workflow Defect)
- **Affected File:** `backend/apps/invoices/views.py` (`QuotationConvertView`)
- **Root Cause:**
  `QuotationConvertView` only read `request.data.get("payment_method")` as a single string. It did not support a `payments` list of multiple tender allocations (e.g., ₹500 Cash + ₹500 UPI).
- **Impact:** Quotations converted to invoices at the POS could not be settled using hybrid payment methods.
- **Planned Fix:**
  Update `QuotationConvertView` to inspect `request.data.get("payments")`. If present, validate and apply split payments, updating customer credit and payment records accordingly.

---

### Defect 3: Dashboard Conflating Credit Sales with Money Collections
- **Severity:** High (Financial Reporting Accuracy)
- **Affected File:** `backend/apps/analytics/views.py` (`compute_analytics`)
- **Root Cause:**
  `today_payments_sum = TransactionPayment.objects.filter(..., status="success").aggregate(Sum("amount"))` included `payment_method="credit"`. When a credit sale occurred, the unpaid credit amount was counted as "today's cash/digital money collected".
- **Impact:** Inaccurate daily cash and revenue metrics; store owners saw false cash/digital collections.
- **Planned Fix:**
  Exclude `payment_method="credit"` from `today_payments_sum`. Distinguish cash and digital collections from credit sales and outstanding customer receivables.

---

### Defect 4: Missing Staff Management UI and Weak Server-Side RBAC
- **Severity:** Critical (Security & Multi-Tenant Authorization)
- **Affected Files:**
  - `backend/apps/users/views.py`
  - `backend/apps/users/models.py`
  - `backend/common/permissions.py`
  - `backend/apps/billing/views.py`
  - `frontend/services/api.ts`
  - `frontend/app/dashboard/` (missing staff route)
- **Root Cause:**
  1. `UserListView`, `UserCreateView`, and `UserDetailView` had no role-checking permissions. Any authenticated user (including cashiers) could list, create, or update users.
  2. Users could escalate their own role to `super_admin` or `org_admin`.
  3. No safeguard against deleting or deactivating one's own account or the last active administrator.
  4. `User.ROLE_CHOICES` lacked distinct `cashier` and `inventory` role choices.
  5. Stock adjustments at `/api/v1/pos/inventory/adjust/` allowed any authenticated user to adjust stock without requiring manager/admin/inventory permissions.
  6. Frontend lacked a staff directory, user creation modal, role assignment UI, and navigation links.
- **Impact:** Privilege escalation risk, rogue cashier operations, and inability for store owners to manage staff accounts from the UI.
- **Planned Fix:**
  - Extend `User.ROLE_CHOICES` to include `cashier` and `inventory`.
  - Add `IsAdminOrManager`, `IsCashierOrAbove`, `IsInventoryStaffOrAbove` to `backend/common/permissions.py`.
  - Restrict user management to Organization Admins and Managers.
  - Implement server-side role validation preventing privilege escalation, self-deactivation, and deletion of the last active administrator.
  - Restrict `/api/v1/pos/inventory/adjust/` to inventory staff, store managers, and admins.
  - Build a responsive Staff Management module at `frontend/app/dashboard/staff/page.tsx` and integrate it into sidebar and mobile menus.

---

### Defect 5: Error Transparency in POS Checkout
- **Severity:** Medium (Cashier Experience & Operational Reliability)
- **Affected Files:**
  - `frontend/app/m/pos/page.tsx`
  - `frontend/app/dashboard/pos/page.tsx`
- **Root Cause:**
  Mobile POS caught errors using `errObj.response?.data?.error`, failing to parse nested DRF validation arrays or detail messages.
- **Impact:** Cashiers were presented with generic error alerts instead of actionable guidance (e.g., "Insufficient stock for Product X", "Customer credit limit exceeded").
- **Planned Fix:**
  Use `parseApiError` from `frontend/lib/utils.ts` in all checkout exception handlers, while preserving cart state and preventing duplicate click submissions.

---

## 4. Protected Features Preserved

The following existing capabilities must be strictly preserved without regression:
1. Multi-vertical business type schemas (Retail, Grocery, Pharmacy, Electronics, Restaurant).
2. GST invoice numbering service (`InvoiceNumberService`) with sequential tenant-isolated numbering.
3. Tax engine calculations with interstate IGST and intra-state CGST/SGST splits.
4. Single-use and time-bound SSE realtime streaming tickets.
5. Ingest API idempotency for external offline terminal sync.
6. Cash register opening, mid-day cash movements, and daily closing reconciliation.
7. Quotation to cart loading, quote search by number, and accepted quote conversion.
8. Customer credit limits and customer timeline audit trails.
9. Sales returns with pro-rated GST reversal and stock restoration.
10. Existing 203 automated backend tests.
