# Changelog

All notable changes to the BillMeet (BillFree) Billing & POS application are documented here.

---

## [2.1.0] - 2026-10-08

### Critical Financial & Concurrency Hardening
- **Fixed Float Rounding in Cart Engine**: Eliminated `float()` conversion in `apps/billing/services/cart_engine.py`. Implemented strict `Decimal` rounding via `.quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(Decimal("0.01"))`.
- **Sequential Invoice Numbering Engine**:
  - Implemented `InvoiceSequence` model for thread-safe, gapless, organization-isolated invoice sequence tracking (`INV-YYYYMMDD-000001`).
  - Implemented `InvoiceNumberService` with `select_for_update()` row-level locking.
  - Replaced random UUID/token-based invoice number generation in POS `CheckoutService`, `QuotationConvertView`, and `TransactionIngestView`.
  - Migrated `Invoice.invoice_number` from global uniqueness to tenant-scoped `UniqueConstraint(fields=["organization", "invoice_number"])`.
- **Atomic POS Checkout & Quotation Conversion**:
  - Ensured synchronous creation of `Invoice`, `TransactionPayment`, `InventoryMovement`, customer spending metrics, and credit ledger records within a single `transaction.atomic()` block.
  - Added full rollback protection: no orphaned bills, no inventory deduction without sales record, and no credit adjustments without payment logging.
  - Hardened `QuotationConvertView` with duplicate conversion protection (re-conversion returns HTTP 400 Bad Request).
- **Pro-Rata Returns & Restocking**:
  - Hardened `ReturnService.process_return` with returnable quantity bounds checking (`<= item.quantity - item.returned_quantity`).
  - Added checks preventing returns against cancelled or refunded transactions.
  - Implemented high-precision pro-rata tax and discount adjustments.
  - Preserved original sales and invoices as immutable historical financial documents.
- **Credit (Udhaar) Ledger & Concurrency**:
  - Added `select_for_update()` row locking on `Customer` during settlement in `CreditService` to prevent double-crediting race conditions.
  - Enforced FIFO allocation of credit settlements across unpaid transactions.
  - Added zero guards and Decimal quantization to `Customer.update_stats`.

### Security & Multi-Tenancy
- **Public Bill Security**:
  - Hardened `PublicInvoiceSerializer` in `apps/invoices/serializers.py` to strip customer `portal_token` from public invoice payloads.
  - Verified cryptographically unguessable 32-character tokens for public bills (`/bills/<token>`).
- **Cross-Tenant Isolation**:
  - Verified strict tenant scoping across all querysets.
  - Added automated cross-tenant test (`test_workflow_7_strict_cross_tenant_isolation`) confirming 404/403 rejections on unauthorized cross-tenant operations.

### Data Reconciliation Engine
- **Reconciliation Engine (`ReconciliationService`)**:
  - Built comprehensive reconciliation engine in `apps/billing/services/reconciliation_service.py` to audit invoice-to-item integrity, payment sums, inventory movement drift, customer credit discrepancies, and purchase order receipts.
  - Added non-mutating Django management command: `python manage.py reconcile_data [--all|--invoice|--transaction|--product|--customer|--purchase]`.

### Database & Migrations
- `billing.0004_invoicesequence`: Created sequence tracking table for sequential invoice numbers.
- `invoices.0005_alter_invoice_invoice_number_and_more`: Altered `invoice_number` constraint from global unique to `UniqueConstraint(fields=["organization", "invoice_number"])`.
- Added `MOVEMENT_TYPES = MOVEMENT_CHOICES` backward-compatibility alias on `InventoryMovement`.

### Testing & Verification
- **End-to-End Test Suite**: Created `tests/test_e2e_workflows.py` testing 8 core business workflows (POS lifecycle, supplier purchase, credit/Udhaar settlement, sales return/restocking, quotation conversion, idempotency, tenant isolation, public bill security).
- **100% Test Pass Rate**: Expanded test suite from 104 tests to 112 tests; all 112 tests passing (`uv run pytest`).
- **Frontend Build**: Verified clean Next.js 14 production build (`npm run build`) with zero TypeScript errors across all 27 routes.

### Documentation
- Created `AUDIT_REPORT.md` (comprehensive codebase audit across 30 dimensions).
- Created `ARCHITECTURE.md` (domain architecture, tenancy isolation, checkout flow, invoice sequence model).
- Created `DATA_INTEGRITY.md` (financial calculations, atomicity, idempotency, inventory invariants).
- Created `TESTING.md` (automated test framework, end-to-end workflows, execution guidelines).
- Created `RELEASE_CHECKLIST.md` (production release verification gates).
