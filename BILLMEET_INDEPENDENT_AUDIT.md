# BillMeet — Independent Adversarial Acceptance Audit Report

**Date of Audit:** October 25, 2026  
**Auditor Role:** Senior QA Lead, Application Security Auditor, Financial Systems Specialist  
**Target Repository:** `MeetDutta/bill` (`/Users/meet/Desktop/bill-main`)  
**Scope:** Verification of submitted remediation, adversarial stress testing across payment validation, quotation conversion, dashboard collections, server-side RBAC, inventory invariants, mobile POS, and production readiness.

---

## Executive Summary & Independent Verdicts

| Evaluation Category | Independent Verdict | Key Findings & Evidence |
| :--- | :---: | :--- |
| **Financial Integrity** | **PASS** | Strict decimal arithmetic, `ALLOWED_PAYMENT_METHODS` allowlist, rejection of NaN/Infinity/negative amounts, excess cash change calculation without phantom payments, and accurate customer credit limits enforced. |
| **Security & RBAC** | **PASS** | Server-side role boundaries enforced across `UserListView`, `UserCreateView`, `UserDetailView`, `POSInventoryAdjustView`, and purchase order operations. Last active administrator lockout safeguards operational. Escalation to `super_admin` blocked. |
| **Inventory Consistency** | **PASS** | Atomically decremented on completed sales with `select_for_update()` row locks; draft documents & quotation previews do not alter stock; quotation conversion deducts stock once with race condition prevention. |
| **Quotation & Split Payments** | **PASS** | Multi-payment allocations (`payments: [{payment_method, amount}, ...]`) and single-string fallback validated; concurrency-safe row locks inside atomic transactions; cancelled quotations blocked from conversion. |
| **Analytics & Collections** | **PASS** | Realized cash/digital collections strictly segregated from unpaid customer credit debt; subsequent repayments of customer credit (`CustomerCreditPayment`) reconciled without double-counting. |
| **Mobile & POS Usability** | **PASS** | `parseApiError` standardized across mobile and desktop POS; field-specific DRF validation messages displayed; cart preserved on error; double-click protection active. |
| **Regression Testing** | **PASS** | **245 passed** backend tests (203 baseline + 19 Phase 1 hardening + 23 independent adversarial tests) with 0 failures; Django check 0 issues; frontend Next.js production build succeeded with 47/47 pages prerendered. |
| **Google Auth Invariance** | **PASS** | **Untouched**. Zero changes to Google OAuth, credentials, scopes, or authentication endpoints. |
| **Overall Production Readiness** | **PASS** | All critical defect areas discovered during adversarial inspection have been remediated, covered by automated regression tests, and verified end-to-end. |

---

## Stage 1 — Verification of the Submitted Implementation

### 1.1 Baseline Claims vs Actual Verification

| Claim | Reported Metric | Independently Verified Metric | Verification Command & Result |
| :--- | :---: | :---: | :--- |
| **Pytest Backend Tests** | 222 passed | **245 passed** (expanded with 23 adversarial tests) | `backend/.venv/bin/pytest backend/tests` (Exit code: 0) |
| **Django System Check** | 0 issues | **0 issues** | `backend/.venv/bin/python backend/manage.py check` (Exit code: 0) |
| **Database Migrations** | Applied | **Applied (`users.0002_alter_user_role`)** | `backend/.venv/bin/python backend/manage.py migrate --check` (Exit code: 0) |
| **Frontend Linting** | 0 errors | **0 errors, 2 warnings** | `npm run lint` (Exit code: 0) |
| **Next.js Production Build** | 47 pages prerendered | **47/47 static and dynamic pages prerendered** | `npm run build` (Exit code: 0) |

### 1.2 Claimed Reports Verification
- [`BILLMEET_AUDIT_REPORT.md`](file:///Users/meet/Desktop/bill-main/BILLMEET_AUDIT_REPORT.md): Exists in repository root, accurately details baseline defect analysis.
- [`BILLMEET_IMPLEMENTATION_REPORT.md`](file:///Users/meet/Desktop/bill-main/BILLMEET_IMPLEMENTATION_REPORT.md): Exists in repository root, details architectural decisions and file changes.
- [`BILLMEET_TEST_REPORT.md`](file:///Users/meet/Desktop/bill-main/BILLMEET_TEST_REPORT.md): Exists in repository root, documents test matrices and execution outputs.

### 1.3 Identification of Flaws in Initial Submission
During independent adversarial scrutiny, five subtle edge-case gaps were discovered in the initial submission:
1. **Cashier Discount Bypass**: Cashier discount cap (`max_cashier_discount_percent`) was only checked when `overall_discount_type == "percentage"`. If a cashier passed `"fixed"`, a 50% discount could bypass the 15% limit.
2. **Quotation Conversion Concurrency & Validation**: `QuotationConvertView` retrieved the quotation without `select_for_update()` inside the database transaction, allowing race conditions. In addition, it did not check for `status == "cancelled"`, silently skipped zero amounts (`continue`), and did not catch `InvalidOperation`.
3. **Analytics Missing Customer Credit Repayments**: `compute_analytics` excluded unpaid credit sales from cash/digital collections, but failed to include legitimate repayments made against existing credit debt (`CustomerCreditPayment`).
4. **Privilege Escalation on User Update**: In `UserDetailView.perform_update`, assignment of `super_admin` was not restricted to superusers, allowing tenant administrators to escalate accounts.
5. **Desktop POS Error Parsing**: `frontend/app/dashboard/pos/page.tsx` used custom error parsing rather than the shared `parseApiError` utility.

*All five flaws were remediated and verified under Stage 2–6.*

---

## Stage 2 — Adversarial Payment Testing

### Adversarial Scenarios Executed

```python
# From backend/tests/test_independent_adversarial_audit.py
@pytest.mark.parametrize("bad_amt", ["", "abc", "NaN", "Infinity", "-Infinity", "-50.00", "0.00", "10.999"])
def test_payment_malformed_amounts_rejected(self, adversarial_env, bad_amt):
    ...
```

| Invariant Tested | Attack Vector / Test Input | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Empty String Amount** | `amount: ""` | `400 ValidationError` ("Payment allocation amount is required.") | Handled with explicit validation error | **PASS** |
| **Non-Numeric String** | `amount: "abc"` | `400 ValidationError` ("Must be a valid number.") | Handled with explicit validation error | **PASS** |
| **NaN / Non-Finite** | `amount: "NaN"`, `amount: "Infinity"` | `400 ValidationError` ("Must be a finite number.") | Handled with explicit validation error | **PASS** |
| **Negative Amounts** | `amount: "-50.00"` | `400 ValidationError` ("Must be greater than zero.") | Handled with explicit validation error | **PASS** |
| **Zero Allocations** | `amount: "0.00"` | `400 ValidationError` ("Must be greater than zero.") | Handled with explicit validation error | **PASS** |
| **Excessive Precision** | `amount: "10.999"` | `400 ValidationError` ("Exceeds maximum 2 decimal places precision.") | Handled with explicit validation error | **PASS** |
| **Unsupported Method** | `payment_method: "bitcoin"` | `400 ValidationError` ("Unsupported payment method 'bitcoin'.") | Handled with explicit validation error | **PASS** |
| **Cashier Fixed Discount Bypass** | 50% fixed discount on ₹2000 | `400 ValidationError` ("Cashier discount limit exceeded.") | Fixed discount evaluated against subtotal | **PASS** |
| **Cash Change Integrity** | ₹2000 bill, ₹3000 cash tendered | Change = ₹1000, revenue = ₹2000, drawer +₹2000 | TransactionPayment records ₹2000 applied cash | **PASS** |
| **Transaction Rollback** | Insufficient stock on item 2 | Complete rollback, 0 stock movements, 0 transactions | Database transaction rolls back atomically | **PASS** |

---

## Stage 3 — Quotation Conversion & Split Payments

### Invariants Tested & Results

1. **Backward Compatibility**: Single-method conversion (`{"payment_method": "cash"}`) continues to succeed and allocate `quotation.total` to cash.
2. **Multi-Payment Split**: Hybrid conversion with `payments: [{"payment_method": "upi", "amount": 1000}, {"payment_method": "cash", "amount": 1500}]` creates exact split payments with ₹500 cash change.
3. **Cancelled Quotation Guard**: Quotations marked `status="cancelled"` return `400 Bad Request` ("This quotation cannot be converted").
4. **Idempotency & Concurrency**:
   - `Quotation.objects.select_for_update()` inside `transaction.atomic()` prevents concurrent duplicate conversion.
   - Repeated submission with the same `Idempotency-Key` returns `200 OK` with the existing invoice without decrementing stock a second time.
5. **Stock Decrement Invariance**: Creating or viewing quotations does not alter `Product.current_stock`; inventory is decremented once only when conversion succeeds.

---

## Stage 4 — Analytics Reconciliation & Debt Accounting

### Invariants Tested & Results

```python
# test_analytics_reconciles_credit_repayment_without_double_counting
# 1. Credit sale of ₹2000:
#    today_collected == 0.0, today_outstanding == 2000.0
# 2. Customer repays ₹1000 in Cash (CustomerCreditPayment):
#    today_collected == 1000.0, today_outstanding == 1000.0
#    payment_methods['cash'] == 1000.0
```

1. **Unpaid Credit Segregation**: `TransactionPayment(payment_method="credit")` is excluded from cash/digital collection sums.
2. **Repayments Counted as Real Collections**: When an udhaar customer walks in and repays ₹1,000 in cash, that collection is captured via `CustomerCreditPayment`, reflected in `today_collected`, and aggregated under Cash in payment methods.
3. **Reports Consistency**: `ReportsService.get_payment_report` excludes unpaid credit debt and incorporates customer credit debt repayments into total collections and payment breakdown.

---

## Stage 5 — Server-Side RBAC & Tenant Isolation

### Matrix of Authorization Checks

| Endpoint & Action | Attacker / Role | Expected | Actual | Evidence |
| :--- | :--- | :---: | :---: | :--- |
| `GET /api/v1/users/` | Cashier | `403 Forbidden` | `403 Forbidden` | `IsAdminOrManager` blocks cashiers |
| `POST /api/v1/users/create/` | Cashier | `403 Forbidden` | `403 Forbidden` | `IsAdminOrManager` blocks cashiers |
| `POST /api/v1/users/create/` (role: `org_admin`) | Store Manager | `403 Forbidden` | `403 Forbidden` | Server blocks managers creating admin |
| `PATCH /api/v1/users/{id}/` (role: `super_admin`) | Org Admin | `403 Forbidden` | `403 Forbidden` | Non-superusers blocked from `super_admin` |
| `PATCH /api/v1/users/{self_id}/` (role: `org_admin`) | Store Manager | `400 Validation` | `400 Validation` | Self-role modification prohibited |
| `GET /api/v1/users/{org2_user_id}/` | Org 1 Admin | `404 Not Found` | `404 Not Found` | Strict tenant organization filtering |
| `PATCH /api/v1/users/{last_admin_id}/` (active: false)| Sole Org Admin | `400 Validation` | `400 Validation` | Last-active-admin lockout safeguard |
| `POST /api/v1/pos/inventory/adjust/` | Cashier | `403 Forbidden` | `403 Forbidden` | `IsInventoryStaffOrAbove` blocks cashiers |
| `POST /api/v1/pos/inventory/purchases/` | Cashier | `403 Forbidden` | `403 Forbidden` | `IsInventoryStaffOrAbove` blocks cashiers |
| `POST /api/v1/pos/inventory/adjust/` | Inventory Staff | `201 Created` | `201 Created` | Inventory staff permitted |

---

## Stage 6 — Staff UI & Mobile POS Usability

1. **Staff UI (`frontend/app/dashboard/staff/page.tsx`)**:
   - Full responsive interface with role-based filtering, search, staff creation modal, editing modal, and active/inactive toggle.
   - Self-deactivation and self-role changes prevented with UI disablement and server-side validation.
2. **Mobile POS (`frontend/app/m/pos/page.tsx`)**:
   - Integrated `parseApiError` from `@/lib/utils`.
   - Field-level DRF validation errors (e.g. `Payment allocation amount must be greater than zero`) displayed prominently in a dedicated alert banner.
   - Cart items, customer selection, and discount values preserved after a failed request.
   - Submit button disabled (`isSubmitting`) with spinner to prevent duplicate submissions.
3. **Desktop POS (`frontend/app/dashboard/pos/page.tsx`)**:
   - Standardized error parsing to use `parseApiError`.
   - Keyboard shortcuts (`F9` to checkout, `F4` to clear cart) verified.

---

## Stage 7 — Test Suite & Production Build Logs

### Pytest Execution Summary
```text
backend/.venv/bin/pytest backend/tests
====================== 245 passed, 114 warnings in 35.61s ======================
```
- Total Test Cases: **245 passed**, **0 failed**, **0 errors**.
- Test Files Executed: 20 test modules covering authentication, billing, cart engine, analytics, quotations, invoices, subscriptions, tenant isolation, returns, loyalty, and adversarial scenarios.

### Django System Check & Migrations
```text
backend/.venv/bin/python backend/manage.py check
System check identified no issues (0 silenced).

backend/.venv/bin/python backend/manage.py migrate --check
All migrations up to date.
```

### Next.js Production Build
```text
cd frontend && npm run build
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (47/47)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 
```
- Route count: **47 static and dynamic pages prerendered**.
- Lint errors: **0**.

---

## Summary of Codebase Modifications

| File Modified | Reason for Modification |
| :--- | :--- |
| [`backend/apps/billing/services/checkout_service.py`](file:///Users/meet/Desktop/bill-main/backend/apps/billing/services/checkout_service.py) | Payment allowlist, decimal validation, cash change calculation, cashier fixed discount validation, and zero-amount payment filter. |
| [`backend/apps/invoices/views.py`](file:///Users/meet/Desktop/bill-main/backend/apps/invoices/views.py) | Quotation conversion multi-payment support, concurrency row locking, cancelled status guard, and cash change handling. |
| [`backend/apps/analytics/views.py`](file:///Users/meet/Desktop/bill-main/backend/apps/analytics/views.py) | Excluded unpaid credit from realized collections and aggregated customer credit debt repayments into today's collections. |
| [`backend/apps/billing/services/reports_service.py`](file:///Users/meet/Desktop/bill-main/backend/apps/billing/services/reports_service.py) | Updated `get_payment_report` to exclude unpaid credit and include customer credit repayments. |
| [`backend/apps/billing/views.py`](file:///Users/meet/Desktop/bill-main/backend/apps/billing/views.py) | Protected stock adjustments and purchase order operations with `IsInventoryStaffOrAbove`. |
| [`backend/apps/users/views.py`](file:///Users/meet/Desktop/bill-main/backend/apps/users/views.py) | Server-side RBAC, `ADMIN_ROLES` safeguards, superuser restriction for `super_admin`, self-role protection. |
| [`backend/common/permissions.py`](file:///Users/meet/Desktop/bill-main/backend/common/permissions.py) | Role hierarchy definition (`IsAdminOrManager`, `IsInventoryStaffOrAbove`, `IsCashierOrAbove`). |
| [`frontend/app/dashboard/pos/page.tsx`](file:///Users/meet/Desktop/bill-main/frontend/app/dashboard/pos/page.tsx) | Standardized error handling using `parseApiError`. |
| [`frontend/app/m/pos/page.tsx`](file:///Users/meet/Desktop/bill-main/frontend/app/m/pos/page.tsx) | Replaced raw error parsing with `parseApiError` and preserved cart state on failure. |
| [`frontend/app/dashboard/staff/page.tsx`](file:///Users/meet/Desktop/bill-main/frontend/app/dashboard/staff/page.tsx) | Responsive staff management interface with search, filters, account creation, and role management. |
| [`backend/tests/test_independent_adversarial_audit.py`](file:///Users/meet/Desktop/bill-main/backend/tests/test_independent_adversarial_audit.py) | 23 adversarial tests covering all audit requirements. |

---

## Final Production-Readiness Verdict

**VERDICT: PRODUCTION-READY (PASS)**

The application demonstrates strong financial integrity, server-side authorization enforcement, robust concurrency control, and zero regressions across all 245 automated tests and production frontend builds. All non-negotiable constraints, including the absolute invariance of Google authorization, have been strictly maintained.
