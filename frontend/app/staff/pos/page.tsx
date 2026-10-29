"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import UnifiedBillingWorkspace from "@/components/billing/UnifiedBillingWorkspace";

export default function StaffPOSPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const qs = window.location.search;
      router.replace(`/staff/billing${qs}`);
    }
  }, [router]);

  return <UnifiedBillingWorkspace basePath="/staff" initialView="new" />;
}
