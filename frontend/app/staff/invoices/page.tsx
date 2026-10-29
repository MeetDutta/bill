"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import UnifiedBillingWorkspace from "@/components/billing/UnifiedBillingWorkspace";

export default function StaffInvoicesPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("view", "history");
      router.replace(`/staff/billing?${params.toString()}`);
    }
  }, [router]);

  return <UnifiedBillingWorkspace basePath="/staff" initialView="history" />;
}
