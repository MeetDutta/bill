"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import UnifiedBillingWorkspace from "@/components/billing/UnifiedBillingWorkspace";

export default function POSPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const qs = window.location.search;
      router.replace(`/dashboard/billing${qs}`);
    }
  }, [router]);

  return <UnifiedBillingWorkspace basePath="/dashboard" initialView="new" />;
}
