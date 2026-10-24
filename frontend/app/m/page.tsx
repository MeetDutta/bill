"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MobileIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/m/dashboard");
  }, [router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );
}
