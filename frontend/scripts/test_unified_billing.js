const fs = require("fs");
const path = require("path");
const assert = require("assert");

function testUnifiedBillingWorkspace() {
  console.log("=== Running Frontend Verification for Unified Billing Workspace ===");

  const frontendRoot = path.resolve(__dirname, "..");

  // 1. Verify existence of primary and backward-compatible routes
  const requiredRoutes = [
    "app/dashboard/billing/page.tsx",
    "app/staff/billing/page.tsx",
    "app/dashboard/pos/page.tsx",
    "app/dashboard/invoices/page.tsx",
    "app/staff/pos/page.tsx",
    "app/staff/invoices/page.tsx",
    "components/billing/UnifiedBillingWorkspace.tsx",
  ];

  for (const route of requiredRoutes) {
    const filePath = path.join(frontendRoot, route);
    assert(fs.existsSync(filePath), `Required route or component missing: ${route}`);
    console.log(`✓ Verified file exists: ${route}`);
  }

  // 2. Verify Admin Navigation in dashboard/layout.tsx
  const dashboardLayout = fs.readFileSync(path.join(frontendRoot, "app/dashboard/layout.tsx"), "utf8");
  assert(
    dashboardLayout.includes('{ name: "Billing", href: "/dashboard/billing", icon: Receipt }'),
    "Admin navigation does not contain consolidated 'Billing' entry with /dashboard/billing"
  );
  assert(
    !dashboardLayout.includes('{ name: "POS Terminal", href: "/dashboard/pos"'),
    "Admin navigation still contains separate 'POS Terminal' item"
  );
  assert(
    !dashboardLayout.includes('{ name: "Invoices", href: "/dashboard/invoices"'),
    "Admin navigation still contains separate 'Invoices' item"
  );
  assert(
    dashboardLayout.includes('itemPath === "/dashboard/billing"') &&
    dashboardLayout.includes('pathname === "/dashboard/pos"') &&
    dashboardLayout.includes('pathname === "/dashboard/invoices"'),
    "Admin navigation active highlighting does not cover backward-compatible routes"
  );
  console.log("✓ Verified Admin sidebar navigation consolidation and active highlighting");

  // 3. Verify Staff Navigation in staff/layout.tsx
  const staffLayout = fs.readFileSync(path.join(frontendRoot, "app/staff/layout.tsx"), "utf8");
  assert(
    staffLayout.includes('{ name: "Billing", href: "/staff/billing", icon: Receipt }'),
    "Staff navigation does not contain consolidated 'Billing' entry with /staff/billing"
  );
  assert(
    !staffLayout.includes('{ name: "POS Terminal", href: "/staff/pos"'),
    "Staff navigation still contains separate 'POS Terminal' item"
  );
  assert(
    !staffLayout.includes('{ name: "My Invoices", href: "/staff/invoices"'),
    "Staff navigation still contains separate 'My Invoices' item"
  );
  assert(
    staffLayout.includes('item.href === "/staff/billing"') &&
    staffLayout.includes('pathname === "/staff/pos"') &&
    staffLayout.includes('pathname === "/staff/invoices"'),
    "Staff navigation active highlighting does not cover backward-compatible routes"
  );
  console.log("✓ Verified Staff navigation consolidation and active highlighting");

  // 4. Verify Backward-Compatible Route Redirection Logic
  const dashPosPage = fs.readFileSync(path.join(frontendRoot, "app/dashboard/pos/page.tsx"), "utf8");
  assert(
    dashPosPage.includes("router.replace(`/dashboard/billing${qs}`)") &&
    dashPosPage.includes('initialView="new"'),
    "dashboard/pos page does not properly forward to dashboard/billing with new bill view"
  );

  const dashInvPage = fs.readFileSync(path.join(frontendRoot, "app/dashboard/invoices/page.tsx"), "utf8");
  assert(
    dashInvPage.includes('params.set("view", "history")') &&
    dashInvPage.includes("router.replace(`/dashboard/billing?${params.toString()}`)") &&
    dashInvPage.includes('initialView="history"'),
    "dashboard/invoices page does not properly forward to dashboard/billing with history view"
  );

  const staffPosPage = fs.readFileSync(path.join(frontendRoot, "app/staff/pos/page.tsx"), "utf8");
  assert(
    staffPosPage.includes("router.replace(`/staff/billing${qs}`)") &&
    staffPosPage.includes('initialView="new"'),
    "staff/pos page does not properly forward to staff/billing with new bill view"
  );

  const staffInvPage = fs.readFileSync(path.join(frontendRoot, "app/staff/invoices/page.tsx"), "utf8");
  assert(
    staffInvPage.includes('params.set("view", "history")') &&
    staffInvPage.includes("router.replace(`/staff/billing?${params.toString()}`)") &&
    staffInvPage.includes('initialView="history"'),
    "staff/invoices page does not properly forward to staff/billing with history view"
  );
  console.log("✓ Verified backward-compatible route redirection and query parameter forwarding");

  // 5. Verify UnifiedBillingWorkspace Capabilities
  const workspaceSrc = fs.readFileSync(path.join(frontendRoot, "components/billing/UnifiedBillingWorkspace.tsx"), "utf8");
  
  // Segmented control / Tabs
  assert(workspaceSrc.includes('switchView("new")') && workspaceSrc.includes('switchView("history")'), "Missing segmented control switcher for New Bill and Invoice History");
  assert(workspaceSrc.includes('window.history.pushState'), "Missing pushState URL sync for browser history");
  assert(workspaceSrc.includes('popstate'), "Missing popstate listener for browser back/forward buttons");

  // Product Catalog
  assert(workspaceSrc.includes("searchProducts") && workspaceSrc.includes("barcodeBufferRef"), "Missing product search and barcode scanning");
  assert(workspaceSrc.includes("selectedCategory") && workspaceSrc.includes("quickAddModalOpen"), "Missing category filters and quick add modal");

  // Cart & Calculations
  assert(workspaceSrc.includes("calculateCart") && workspaceSrc.includes("handleHoldCart"), "Missing cart calculations and hold bill support");
  assert(workspaceSrc.includes("handleLoadQuotation"), "Missing quotation load support");

  // Checkout, Payments & Idempotency
  assert(workspaceSrc.includes("inFlightCheckoutRef"), "Missing synchronous double-submission lock");
  assert(workspaceSrc.includes("idempotency_key"), "Missing idempotency key in checkout payload");
  assert(workspaceSrc.includes("IsolatedReceiptModal"), "Missing post-sale IsolatedReceiptModal");
  assert(workspaceSrc.includes("UPI") && workspaceSrc.includes("CREDIT") && workspaceSrc.includes("CASH"), "Missing multi-payment support");

  // Invoice History Table & Actions
  assert(workspaceSrc.includes("fetchHistoryInvoices"), "Missing invoice history fetching");
  assert(workspaceSrc.includes("handlePrintInvoice"), "Missing print invoice action");
  assert(workspaceSrc.includes("handleDownloadInvoicePdf"), "Missing download invoice PDF action");
  assert(workspaceSrc.includes("handleShareWhatsApp"), "Missing share WhatsApp action");

  console.log("✓ Verified UnifiedBillingWorkspace component features & integrity");
  console.log("=== All Frontend Verifications Passed Successfully! ===");
}

testUnifiedBillingWorkspace();

