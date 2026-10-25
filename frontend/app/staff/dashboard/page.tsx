"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { staffApi } from "@/services/api";
import { useRealtimeSubscription, type RealtimeEventPayload } from "@/services/realtime";
import {
  ShoppingCart,
  Receipt,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  CreditCard,
  Banknote,
  QrCode,
  FileText,
  FileCheck,
  UserCheck,
  ArrowRight,
  RefreshCw,
  Clock,
  Printer,
  Download,
} from "lucide-react";

interface StaffOverviewData {
  staff: { id: string; name: string; email: string; role: string; role_display: string };
  organization: { id: string; name: string; gst_number: string };
  store: { id: string; name: string };
  metrics: {
    today_sales: number;
    today_bills_count: number;
    today_collected: number;
    today_outstanding: number;
  };
  payment_methods: Array<{ method: string; payment_method: string; amount: number; count: number; percentage: number }>;
  recent_bills: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    customer_phone: string;
    date: string;
    total: number;
    amount_paid: number;
    outstanding_amount: number;
    payment_status: string;
    payment_method: string;
    pdf_url: string;
    web_url: string;
  }>;
}

export default function StaffDashboardPage() {
  const [data, setData] = useState<StaffOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchOverview = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await staffApi.getOverview();
      setData(res.data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Failed to load staff dashboard overview:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Realtime subscription: auto-refresh on transaction events
  const handleRealtimeEvent = useCallback(
    (event: RealtimeEventPayload) => {
      if (
        ["sale_completed", "payment_recorded", "return_completed", "quotation_converted"].includes(
          event.event_type
        )
      ) {
        fetchOverview(true);
      }
    },
    [fetchOverview]
  );

  const { isConnected } = useRealtimeSubscription(handleRealtimeEvent);

  const handleDownloadPdf = (billId: string, invoiceNum: string) => {
    const downloadUrl = `/api/v1/invoices/${billId}/pdf/?download=true`;
    window.open(downloadUrl, "_blank");
  };

  const handlePrintPdf = (billId: string) => {
    const printUrl = `/api/v1/invoices/${billId}/pdf/?raw=true`;
    const printWindow = window.open(printUrl, "_blank");
    if (printWindow) {
      printWindow.focus();
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">Staff Overview</h1>
            {isConnected && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                Live
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Store Context: <span className="font-semibold text-foreground">{data?.store?.name || "Main Store"}</span> &bull; Operator:{" "}
            <span className="font-semibold text-foreground">{data?.staff?.name || "Cashier"}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchOverview(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/staff/pos"
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 shadow-sm transition-transform active:scale-95"
          >
            <ShoppingCart className="h-4 w-4" />
            <span>Open POS</span>
          </Link>
        </div>
      </div>

      {/* OVERVIEW METRICS GRID (Black, Red, Green Palette) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Today's Sales */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Today&apos;s Sales</span>
            <TrendingUp className="h-4 w-4 text-foreground" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
            {formatCurrency(data?.metrics?.today_sales || 0)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Personal gross generated</p>
        </div>

        {/* Bills Generated */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Bills Generated</span>
            <Receipt className="h-4 w-4 text-foreground" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
            {data?.metrics?.today_bills_count || 0}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Completed invoices today</p>
        </div>

        {/* Collected Amount (Green) */}
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 shadow-xs">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span className="text-xs font-semibold">Total Collected</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400">
            {formatCurrency(data?.metrics?.today_collected || 0)}
          </div>
          <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-1">Cash, UPI &amp; Cards</p>
        </div>

        {/* Outstanding Credit (Red) */}
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 shadow-xs">
          <div className="flex items-center justify-between text-red-700 dark:text-red-400">
            <span className="text-xs font-semibold">Customer Credit</span>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-red-700 dark:text-red-400">
            {formatCurrency(data?.metrics?.today_outstanding || 0)}
          </div>
          <p className="text-[11px] text-red-800/80 dark:text-red-300/80 mt-1">Unsettled credit dues</p>
        </div>
      </div>

      {/* QUICK WORKFLOW SHORTCUTS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Link
          href="/staff/pos"
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent text-foreground transition-colors group"
        >
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-foreground" />
            <span className="text-xs font-bold">New Sale</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <Link
          href="/staff/quotations"
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent text-foreground transition-colors group"
        >
          <div className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-foreground" />
            <span className="text-xs font-bold">Quotations</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <Link
          href="/staff/invoices"
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent text-foreground transition-colors group"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-foreground" />
            <span className="text-xs font-bold">My Invoices</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <Link
          href="/staff/profile"
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent text-foreground transition-colors group"
        >
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-foreground" />
            <span className="text-xs font-bold">Sales Profile</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* TWO COLUMN SECTION: COLLECTIONS BREAKDOWN + RECENT TRANSACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Collections by Payment Method */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Today&apos;s Collections by Method</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Authoritative monetary allocations</p>
          </div>

          <div className="space-y-3">
            {(!data?.payment_methods || data.payment_methods.length === 0) ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No collections recorded yet today.</p>
            ) : (
              data.payment_methods.map((pm) => (
                <div key={pm.method} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      {pm.method === "CASH" && <Banknote className="h-3.5 w-3.5 text-emerald-600" />}
                      {pm.method === "UPI" && <QrCode className="h-3.5 w-3.5 text-foreground" />}
                      {pm.method === "CARD" && <CreditCard className="h-3.5 w-3.5 text-foreground" />}
                      {pm.method} ({pm.count})
                    </span>
                    <span className="font-bold text-foreground font-mono">{formatCurrency(pm.amount)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, pm.percentage))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Recent Sales & Invoices (2 cols) */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-border bg-card shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">Recent Personal Transactions</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Last 10 completed sales generated by you</p>
            </div>
            <Link
              href="/staff/invoices"
              className="text-xs font-semibold text-foreground hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/30 text-muted-foreground uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-2.5 px-3">Invoice #</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(!data?.recent_bills || data.recent_bills.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No transactions recorded yet today. Click &quot;Open POS&quot; to begin billing.
                    </td>
                  </tr>
                ) : (
                  data.recent_bills.map((bill) => {
                    const isPaid = bill.payment_status === "paid";
                    return (
                      <tr key={bill.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                          #{bill.invoice_number}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-foreground">
                          {bill.customer_name}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {new Date(bill.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                          {formatCurrency(bill.total)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isPaid
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                                : "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                            }`}
                          >
                            {bill.payment_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handlePrintPdf(bill.id)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                              title="Print Authentic PDF"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDownloadPdf(bill.id, bill.invoice_number)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                              title="Download PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
