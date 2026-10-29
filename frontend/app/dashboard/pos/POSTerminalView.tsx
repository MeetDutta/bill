"use client";

import UnifiedBillingWorkspace from "@/components/billing/UnifiedBillingWorkspace";

export default function POSTerminalView({
  basePath = "/dashboard",
  initialView = "new",
}: {
  basePath?: string;
  initialView?: "new" | "history";
} = {}) {
  return <UnifiedBillingWorkspace basePath={basePath} initialView={initialView} />;
}
