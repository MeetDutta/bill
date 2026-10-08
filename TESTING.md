# BillMeet Automated Testing Strategy & Verification Guide

## 1. Test Suite Architecture

BillMeet features a comprehensive, multi-layer automated test suite built with `pytest`, `pytest-django`, and `unittest`.

```
backend/tests/
├── test_ai.py                          # AI business assistant & smart insight tests
├── test_analytics.py                   # Dashboards, reports, and aggregation tests
├── test_authentication.py              # JWT authentication, login, refresh, roles
├── test_coupons.py                     # Coupon issuance, validation, and usage rules
├── test_customers.py                   # Customer CRUD, profiles, and RFM scores
├── test_e2e_workflows.py               # 8 End-to-end critical business workflows (NEW)
├── test_invoices.py                    # Invoicing, sequences, rendering, quotations
├── test_loyalty.py                     # Loyalty programs, points accrual, achievements
├── test_subscriptions.py               # Organization plans, quotas, and billing
├── test_tenant_isolation.py            # Strict cross-organization boundary tests
├── test_transactions.py                # Transaction ingest, sync, and payment verification
├── test_universal_pos.py               # POS cart engine, tax engine, registers, held carts
├── test_v2_intelligence.py             # Advanced intelligence, churn, and affinity tests
└── test_whatsapp.py                    # WhatsApp notifications and webhook tests
```

---

## 2. End-to-End Critical Workflow Coverage (`test_e2e_workflows.py`)

The new test module `test_e2e_workflows.py` executes 8 end-to-end workflows:

1. **`test_workflow_1_pos_sale_lifecycle`**:
   - Product creation with stock tracking -> POS sale with GST -> Payment logging -> Synchronous invoice persistence -> Inventory movement creation -> Customer spend/visit update -> Financial reconciliation.
2. **`test_workflow_2_supplier_purchase_ledger`**:
   - Supplier registration -> Purchase order creation -> Stock increase -> Inventory movement of type `PURCHASE` -> Supplier purchase ledger query -> PO reconciliation.
3. **`test_workflow_3_customer_credit_sale_and_settlement`**:
   - Customer credit sale (Udhaar) -> Customer outstanding balance increase -> Partial cash payment settlement -> Customer balance decrease -> FIFO transaction settlement -> Credit ledger reconciliation.
4. **`test_workflow_4_sales_return_and_restocking`**:
   - Sale of tracked items -> Partial item return -> Re-stocking verification -> Positive inventory movement (`RETURN`) -> Pro-rata refund calculation -> Original transaction preservation.
5. **`test_workflow_5_quotation_conversion_to_invoice`**:
   - Quotation creation -> Acceptance & conversion to invoice -> Synchronous transaction & invoice creation -> Inventory movement deduction -> Prevention of duplicate re-conversion (HTTP 400).
6. **`test_workflow_6_checkout_idempotency_guarantee`**:
   - Double-click simulation with matching `idempotency_key` -> Returns existing transaction -> Exactly 1 transaction, 1 invoice, 1 payment, 1 inventory movement, and single stock deduction.
7. **`test_workflow_7_strict_cross_tenant_isolation`**:
   - Organization B user attempts to access Organization A invoices, customers, and products -> Returns HTTP 404/403 -> Zero cross-tenant data leakage.
8. **`test_workflow_8_public_invoice_security`**:
   - Public invoice access via secure token -> Stripping of sensitive customer portal token -> Correct bill breakdown.

---

## 3. Running Backend Tests

### Quick Execution
```bash
cd backend
uv run pytest
```

### Targeted Workflow Execution
```bash
uv run pytest tests/test_e2e_workflows.py -v
```

### Running with Coverage
```bash
uv run pytest --cov=apps --cov-report=term-missing
```

---

## 4. Running Frontend Verification

### Production Build & Static Analysis
```bash
cd frontend
npm run build
```
This runs the Next.js compiler, TypeScript typechecking (`tsc`), ESLint, and route generation across all 27 static and dynamic pages.

---

## 5. Verification Checklist for Production Deployments

- [ ] All 112 backend tests pass with 0 failures (`uv run pytest`).
- [ ] Django system check identifies 0 issues (`python manage.py check`).
- [ ] All database migrations are applied (`python manage.py showmigrations`).
- [ ] Next.js frontend builds cleanly (`npm run build`).
- [ ] Reconcile existing data integrity (`python manage.py reconcile_data --all`).
