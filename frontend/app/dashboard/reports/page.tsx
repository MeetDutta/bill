"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  FileSpreadsheet,
  BarChart3,
  CreditCard,
  AlertCircle,
  Boxes,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ReportsHubPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "sales") router.replace("/dashboard/reports/sales");
      else if (tab === "pos") router.replace("/dashboard/reports/pos");
      else if (tab === "payments") router.replace("/dashboard/finance/payments");
      else if (tab === "outstanding") router.replace("/dashboard/finance/receivables");
    }
  }, [router]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports & Financial Intelligence Hub</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a dedicated analytics dashboard or operational report to audit performance and reconciliation.
        </p>
      </div>

      {/* Main Reports Hub Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Sales Report */}
        <Card className="hover:border-blue-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center mb-2">
              <TrendingUp className="w-5 h-5" />
            </div>
            <CardTitle>Sales Report</CardTitle>
            <CardDescription>
              Macro-level business revenue, gross sales, taxes collected, discounts, net margins, and top-selling merchandise.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/dashboard/reports/sales">
              <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
                View Sales Report <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* POS Register Report */}
        <Card className="hover:border-emerald-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-2">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <CardTitle>POS Register Operational Report</CardTitle>
            <CardDescription>
              Cashier shift drawer balancing: Verify opening balance, cash sales, cash refunds, expected closing cash, and cash variance.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/dashboard/reports/pos">
              <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
                View POS Register Report <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Advanced Analytics */}
        <Card className="hover:border-purple-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center mb-2">
              <BarChart3 className="w-5 h-5" />
            </div>
            <CardTitle>Business Analytics & RFM</CardTitle>
            <CardDescription>
              Customer segmentation, RFM retention scores, churn probability, product bundles, and AI business recommendations.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/dashboard/analytics">
              <Button className="w-full gap-2 bg-purple-600 hover:bg-purple-700">
                View Analytics <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Payment Ledger */}
        <Card className="hover:border-emerald-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-2">
              <CreditCard className="w-5 h-5" />
            </div>
            <CardTitle>Payment Ledger</CardTitle>
            <CardDescription>
              Chronological log of all monetary inflows (customer POS payments & Udhaar settlements) and outflows (vendor disbursements).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/dashboard/finance/payments">
              <Button variant="outline" className="w-full gap-2">
                Open Payment Ledger <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Receivables */}
        <Card className="hover:border-amber-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center mb-2">
              <AlertCircle className="w-5 h-5" />
            </div>
            <CardTitle>Customer Receivables (Udhaar)</CardTitle>
            <CardDescription>
              Track unpaid customer credit invoices, days overdue aging analysis, and record partial/full settlement payments.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/dashboard/finance/receivables">
              <Button variant="outline" className="w-full gap-2">
                Open Receivables <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Stock Movements */}
        <Card className="hover:border-blue-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center mb-2">
              <Boxes className="w-5 h-5" />
            </div>
            <CardTitle>Stock Movements Audit</CardTitle>
            <CardDescription>
              Immutable physical stock change ledger covering sales, supplier inward, customer returns, and manual adjustments.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/dashboard/inventory/movements">
              <Button variant="outline" className="w-full gap-2">
                Open Movements Ledger <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
