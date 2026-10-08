# BillMeet Production Release Checklist

Before promoting any release of BillMeet to staging or production, the release engineering team must execute and verify each of the following verification gates.

---

## 1. Environment & Configuration Security

- [ ] `DEBUG` is set to `False` in production environment variables (`.env`).
- [ ] `SECRET_KEY` is cryptographically random and injected via secure secrets management (not committed in Git).
- [ ] `ALLOWED_HOSTS` is restricted to authorized domain names (e.g. `app.billmeet.com`, `api.billmeet.com`).
- [ ] `CORS_ALLOWED_ORIGINS` is configured to only allow official frontend web and mobile origins.
- [ ] Database credentials point to isolated, highly-available PostgreSQL cluster with automated backups enabled.
- [ ] Redis instance has password protection enabled and is configured with appropriate maxmemory eviction policies.

---

## 2. Database Migrations & Schemas

- [ ] Run `python manage.py makemigrations --check --dry-run` to verify that no pending model changes exist without migrations.
- [ ] Run `python manage.py showmigrations` to confirm all migrations have been applied cleanly.
- [ ] Ensure `billing.0004_invoicesequence` and `invoices.0005_alter_invoice_invoice_number_and_more` are executed.
- [ ] Confirm table indexes on `(organization, invoice_number)`, `(organization, created_at)`, and `(customer, status)` are active.

---

## 3. Financial & Data Integrity Validation

- [ ] Execute reconciliation scan:
  ```bash
  python manage.py reconcile_data --all
  ```
- [ ] Verify that POS checkouts produce matching invoice numbers (`INV-YYYYMMDD-000001`).
- [ ] Test double-click / duplicate checkout protection using idempotency keys.
- [ ] Verify that customer outstanding balances reconcile with active unpaid credit sales.
- [ ] Verify that stock cannot decrease without an associated `InventoryMovement` record.

---

## 4. Multi-Tenant Isolation & Public Bill Security

- [ ] Execute tenant boundary tests:
  ```bash
  uv run pytest tests/test_tenant_isolation.py tests/test_e2e_workflows.py -k "isolation"
  ```
- [ ] Verify public invoice endpoint `/bills/<token>`:
  - Tokens are 32-character cryptographically random strings.
  - Response does not leak `portal_token` or internal customer profile secrets.
  - Response does not leak Organization UUIDs.

---

## 5. Background Workers & Async Processing

- [ ] Celery worker is running:
  ```bash
  celery -A config worker -l info
  ```
- [ ] Celery beat scheduler is running for periodic tasks (RFM compute, health snapshots, campaign triggers).
- [ ] WeasyPrint PDF dependencies (`pango`, `cairo`, `gobject`) are installed on the worker container or HTML fallback is tested.
- [ ] WhatsApp message queues process failed deliveries gracefully without throwing unhandled exceptions.

---

## 6. Frontend Production Build

- [ ] Verify frontend build:
  ```bash
  cd frontend && npm run build
  ```
- [ ] Confirm no unresolved TypeScript errors or broken imports exist.
- [ ] Check responsive layout on mobile viewport (POS, Customer Profile, Invoices).
- [ ] Verify that the sidebar navigation groups are cleanly organized (Sales, Customers, Purchases, Inventory, Finance, Growth, Administration).

---

## 7. Automated Test Suite Sign-Off

- [ ] Complete test suite passes with 0 failures:
  ```bash
  uv run pytest
  ```
  **Current Benchmark**: 112 passed, 0 failed.

---

## 8. Rollback & Disaster Recovery Plan

- [ ] PostgreSQL point-in-time recovery (PITR) verified.
- [ ] Blue/Green or rolling deployment strategy configured to prevent zero-downtime cutover errors.
- [ ] Alerting thresholds configured for error rate spikes (HTTP 5xx), database lock waits, and Celery queue backlog.
