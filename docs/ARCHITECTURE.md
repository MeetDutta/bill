# BillMeet Architecture Documentation

## 1. System Overview

BillMeet (formerly BillFree) is a production-oriented, multi-tenant Billing, Inventory, and Point-of-Sale (POS) ERP platform designed for retail, wholesale, and multi-store operations. The system is architected around financial accuracy, high-concurrency checkout, and auditability.

```
                    ┌───────────────────────────────┐
                    │  Next.js 14 Frontend Client   │
                    │   (React / TypeScript / CSS)  │
                    └───────────────┬───────────────┘
                                    │ HTTPS / REST API
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
          │ - InventoryService       │  └─────────────────────────┘
          │ - ReturnService          │
          │ - CreditService          │
          │ - ReconciliationService  │
          └─────────────┬────────────┘
                        │
                        ▼
          ┌──────────────────────────┐
          │ PostgreSQL Database      │
          │ (Atomic ACIDs & Locks)   │
          └──────────────────────────┘
```

---

## 2. Multi-Tenant Architecture & Data Isolation

### Tenancy Model
- Every business account is an `Organization`.
- Every physical outlet is a `Store` belonging to an `Organization`.
- All operational models (`Customer`, `Product`, `Transaction`, `Invoice`, `Quotation`, `Supplier`, `PurchaseOrder`, `InventoryMovement`, `CashRegister`, `HeldCart`, `Coupon`, `Campaign`) have a direct foreign key to `Organization`.

### Enforced Isolation Rules
1. **Model Managers / Queryset Filtering**:
   All Django ViewSets inherit tenant-scoping logic that filters queries strictly by `request.user.organization`.
2. **Strict Create Injection**:
   Create actions inject `organization = request.user.organization` defensively on the backend, ignoring any payload attempt to spoof organization IDs.
3. **Database Constraints**:
   Invoice numbers are scoped per organization via `UniqueConstraint(fields=["organization", "invoice_number"])`, preventing cross-tenant leakage or global serial collision.
4. **Cross-Tenant Test Verification**:
   Automated security tests (`test_tenant_isolation.py` and `test_workflow_7_strict_cross_tenant_isolation`) verify that requests from Organization A attempting to read, update, or delete Organization B entities receive `403 Forbidden` or `404 Not Found`.

---

## 3. Financial Core & Transaction Lifecycle

```
[POS Checkout Request]
        │
        ▼ (select_for_update idempotent lookup)
  [Transaction] ── (Status: completed, payment_status, total, round_off)
        │
        ├──▶ [TransactionItem] ── (quantity, unit_price, tax_rate, discount, total)
        │
        ├──▶ [Invoice] ── (invoice_number: INV-YYYYMMDD-000001, secure_token)
        │
        ├──▶ [TransactionPayment] ── (amount, method: cash/upi/card/credit)
        │
        ├──▶ [InventoryMovement] ── (type: SALE, quantity: -N, prev/new stock)
        │
        ├──▶ [Customer Stats] ── (total_spend += total, visit_count += 1)
        │
        └──▶ [Customer Credit Ledger] ── (outstanding_credit += debt if credit sale)
```

### Atomic Checkout Guarantee (`CheckoutService.process_checkout`)
Every sale runs within a single `transaction.atomic()` database context. If any step (inventory deduction, payment logging, customer balance update, or invoice persistence) fails, the entire transaction rolls back completely:
- No orphaned invoices without transactions.
- No deducted stock without sales records.
- No partial payment status out of sync with customer credit balances.

---

## 4. Sequential Invoice Numbering Strategy

Historical implementations used timestamps and random tokens (`INV-20261005-ADFE51`). Production billing compliance requires gapless, sequential, tenant-isolated numbering:
- **Format**: `INV-YYYYMMDD-000001` (configurable prefix and date format).
- **Concurrency Protection**: Backed by `InvoiceSequence` model using row-level locking:
  ```python
  seq, _ = InvoiceSequence.objects.select_for_update().get_or_create(
      organization=org,
      store=store,
      date_key=date_key,
      prefix=prefix,
  )
  seq.last_number += 1
  seq.save()
  ```
- **Crash Recovery**: If an atomic transaction rolls back, the sequence lock releases without leaking or creating phantom invoice records.

---

## 5. Inventory & Stock Movement Architecture

Inventory is an immutable ledger of physical stock movements.
- **Rules**:
  - `current_stock` is updated in the database only alongside an `InventoryMovement` entry.
  - Movement types: `SALE`, `PURCHASE`, `RETURN`, `PURCHASE_RETURN`, `ADJUSTMENT`, `DAMAGE`, `TRANSFER`, `OPENING_STOCK`.
  - Every movement logs `previous_stock`, `new_stock`, `quantity`, `reference_type`, `reference_id`, and `performed_by`.
- **Negative Stock Protection**: Controlled by tenant setting `allow_negative_stock`. When false, checkout or stock adjustment attempts exceeding available inventory raise `ValidationError`.

---

## 6. Returns & Credit Management

- **Returns (`ReturnService.process_return`)**:
  - Validates that the return quantity does not exceed the remaining returnable quantity (`item.quantity - item.returned_quantity`).
  - Restores inventory by generating positive `InventoryMovement(movement_type="RETURN")`.
  - Calculates proportional discount and tax adjustments to prevent refunding uncollected revenue.
  - Creates an immutable `SalesReturn` and `SalesReturnItem` audit record.
  - Leaves the original `Transaction` and `Invoice` intact as immutable historical records.
- **Credit / Udhaar (`CreditService`)**:
  - Row-level locking on `Customer` during settlement prevents double-crediting race conditions.
  - Credit payments automatically settle historical unpaid transactions on a FIFO (First-In, First-Out) basis.

---

## 7. Public Bill Security

Public invoices are accessible via unguessable, cryptographically secure tokens (`/bills/<token>`):
- Customer portal authentication tokens (`portal_token`) are strictly stripped from public invoice JSON responses (`PublicInvoiceSerializer`).
- Public bills expose only relevant bill data (store name, items, tax breakdown, total, receipt info) and never reveal internal organization IDs or private customer profiles.

---

## 8. Data Reconciliation Engine

The system includes a built-in `ReconciliationService` and CLI command (`python manage.py reconcile_data`):
- Audits invoice totals vs item sums + round-offs.
- Audits payments vs transaction paid amounts and outstanding debts.
- Reconciles physical product stock against the historical sum of `InventoryMovement` entries.
- Verifies customer profile `outstanding_credit` against the sum of active unpaid transactions.
- Audit-only mode by default to ensure zero silent mutation of historical records.
