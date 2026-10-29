"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import UnifiedBillingWorkspace from "@/components/billing/UnifiedBillingWorkspace";

export default function InvoicesPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("view", "history");
      router.replace(`/dashboard/billing?${params.toString()}`);
    }
  }, [router]);

  return <UnifiedBillingWorkspace basePath="/dashboard" initialView="history" />;
}
