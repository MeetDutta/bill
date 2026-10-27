# Antigravity Prompt — Independent BillMeet Three-Phase Verification and Render Demo Readiness

You are verifying the attached BillMeet repository. Do not assume implementation notes or existing audit reports are correct; inspect the source and reproduce results.

## Objective

Verify and repair the three scoped phases below so the project can be demonstrated to a supervisor on Render. Do not add unrelated features or expand the product scope.

### Phase 1: Inventory, POS, WhatsApp

- Verify category creation, product assignment and opening-stock persistence.
- Verify new products/categories and stock changes appear in POS through realtime updates and the fallback refresh.
- Verify stock is deducted exactly once on a completed sale and quotations do not deduct stock.
- Verify WhatsApp Test Connection calls the backend diagnostic, checks the saved Meta resource without sending a customer message, reports safe errors, and never leaks tokens.
- Verify tenant isolation and authorization for categories, inventory and WhatsApp settings.

### Phase 2: Dashboard and integration

- Verify the simplified admin navigation preserves every existing route.
- Verify dashboard values come from authoritative backend APIs and reconcile with the corresponding reports for the same date range.
- Verify dashboard refresh after sales, payments, returns, stock changes and purchase receipt, including missed SSE events/fallback refresh.
- Simulate a dashboard API failure and verify the UI shows a stale/unavailable message rather than claiming the displayed data is current.
- Verify desktop, tablet and mobile layouts and identify any unusable controls.

### Phase 3: Dedicated staff workspace

- Verify login routes admin/manager roles to `/dashboard` and non-admin staff roles to `/staff/dashboard`.
- Verify non-admin users are redirected away from `/dashboard` by the frontend, but also test the backend directly because frontend guards are not security boundaries.
- Verify staff can use only the permitted POS, own invoices, own quotations and own sales profile.
- Verify staff creation, role assignment, activation/deactivation, password reset and privilege boundaries through admin staff management.
- Attempt cross-tenant requests and role escalation; the backend must deny them.

## Required test execution

1. Install frontend dependencies from the lockfile and run `npm run build` and `npm run lint`.
2. Install backend requirements in the intended environment and run `python manage.py check`, migration consistency checks and the full documented Django/pytest suites.
3. Execute relevant API integration tests and browser workflow tests for all three phases.
4. Record exact commands, exit codes, test counts and failures. Do not state “passed” if the command did not execute.
5. Fix failures caused by this implementation or genuine pre-existing blockers within the three-phase scope. Avoid unrelated refactors.
6. Review security-sensitive diffs, especially payment/inventory transaction boundaries, tenant scoping, WhatsApp secrets and staff authorization.

## Render deployment and supervisor demo

- Inspect `render.yaml`, `RENDER_DEPLOYMENT.md`, Dockerfiles, build/start commands, migrations and health endpoints.
- Verify the frontend API URL resolves to the deployed backend HTTPS endpoint and the CORS/CSRF origins match the actual frontend URL.
- Verify startup does not depend on a developer's local files or `.env` secrets.
- Confirm PostgreSQL migrations run safely and health endpoints work on Render.
- Do not put real credentials or secrets in source control or screenshots.
- Use a staging/demo database and demo data for the supervisor walkthrough. Never run destructive tests against live business data.
- Prepare a short demo sequence: admin login → add category/product/opening stock → see product in POS → test WhatsApp connection → dashboard refresh → staff login and role-restricted workspace.
- Note Render free-tier cold starts and any external integration that cannot be live-tested because credentials are unavailable.

## Final output required

Produce a concise report containing:

- Pass/fail status for each phase.
- Exact commands and test results.
- Bugs found and files changed to fix them.
- Security and financial-integrity findings.
- Render deployment blockers, environment variables required, and migration status.
- A final supervisor demo checklist.

Do not claim production readiness unless all critical tests and deployment checks pass. If any required external integration cannot be verified, state it explicitly.
