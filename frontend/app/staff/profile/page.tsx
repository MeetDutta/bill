"use client";

import React, { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { staffApi } from "@/services/api";
import {
  UserCheck,
  TrendingUp,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Banknote,
  QrCode,
  CreditCard,
  RefreshCw,
  Printer,
  Download,
  ShieldCheck,
  Store,
} from "lucide-react";

interface SalesProfileData {
  staff: { id: string; name: string; email: string; role: string; role_display: string };
  date_range: { start_date: string; end_date: string };
  today: { sales: number; invoices_count: number; collected: number };
  range_summary: {
    gross_sales: number;
    discounts: number;
    net_sales: number;
    invoices_count: number;
    actual_collected: number;
    outstanding_credit: number;
  };
  payment_methods: Array<{ method: string; payment_method: string; amount: number; count: number; percentage: number }>;
  recent_invoices: Array<{
    id: string;
    invoice_number: string;
    date: string;
    customer: string;
    total: number;
    amount_paid: number;
    outstanding_amount: number;
    payment_status: string;
    payment_method: string;
    pdf_url: string;
    web_url: string;
  }>;
}

export default function StaffSalesProfilePage() {
  const [data, setData] = useState<SalesProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchProfile = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await staffApi.getSalesProfile({
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setData(res.data);
    } catch (err) {
      console.error("Failed to load staff sales profile:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleDownloadPdf = (invoiceId: string) => {
    window.open(`/api/v1/invoices/${invoiceId}/pdf/?download=true`, "_blank");
  };

  const handlePrintPdf = (invoiceId: string) => {
    const printWindow = window.open(`/api/v1/invoices/${invoiceId}/pdf/?raw=true`, "_blank");
    if (printWindow) {
      printWindow.focus();
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">My Sales Profile</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified performance and monetary collection ledger for{" "}
            <span className="font-semibold text-foreground">{data?.staff?.name || "Staff Member"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchProfile(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* DATE RANGE FILTER BAR */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-semibold">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border bg-background text-foreground text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-semibold">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border bg-background text-foreground text-xs"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="text-xs font-semibold text-foreground hover:underline"
            >
              Reset to 30 Days
            </button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Showing: <span className="font-mono font-semibold text-foreground">{data?.date_range?.start_date}</span> to{" "}
          <span className="font-mono font-semibold text-foreground">{data?.date_range?.end_date}</span>
        </div>
      </div>

      {/* PRIMARY METRICS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Gross Sales in Range */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Gross Sales</span>
            <TrendingUp className="h-4 w-4 text-foreground" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
            {formatCurrency(data?.range_summary?.gross_sales || 0)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {data?.range_summary?.invoices_count || 0} completed invoices
          </p>
        </div>

        {/* Net Sales */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Net Sales</span>
            <Receipt className="h-4 w-4 text-foreground" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
            {formatCurrency(data?.range_summary?.net_sales || 0)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Discounts: {formatCurrency(data?.range_summary?.discounts || 0)}
          </p>
        </div>

        {/* Actual Collections (Green) */}
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 shadow-xs">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span className="text-xs font-semibold">Actual Money Collected</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400">
            {formatCurrency(data?.range_summary?.actual_collected || 0)}
          </div>
          <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-1">
            Excludes uncollected credit
          </p>
        </div>

        {/* Credit Dues (Red) */}
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 shadow-xs">
          <div className="flex items-center justify-between text-red-700 dark:text-red-400">
            <span className="text-xs font-semibold">Customer Credit Balance</span>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-red-700 dark:text-red-400">
            {formatCurrency(data?.range_summary?.outstanding_credit || 0)}
          </div>
          <p className="text-[11px] text-red-800/80 dark:text-red-300/80 mt-1">
            Unsettled customer receivables
          </p>
        </div>
      </div>

      {/* TWO COLUMN SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Methods Breakdown */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Sales by Payment Mode</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Allocations across Cash, UPI, Cards, etc.</p>
          </div>

          <div className="space-y-3">
            {(!data?.payment_methods || data.payment_methods.length === 0) ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No payment transactions in this range.</p>
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

        {/* Recent Invoices in Range */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-border bg-card shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Personal Sales History</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Recent invoices processed under your credentials</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/30 text-muted-foreground uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-2.5 px-3">Invoice #</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(!data?.recent_invoices || data.recent_invoices.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No invoices found in selected date range.
                    </td>
                  </tr>
                ) : (
                  data.recent_invoices.map((inv) => {
                    const isPaid = inv.payment_status === "paid";
                    return (
                      <tr key={inv.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                          #{inv.invoice_number}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {new Date(inv.date).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-foreground">
                          {inv.customer}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                          {formatCurrency(inv.total)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isPaid
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                                : "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                            }`}
                          >
                            {inv.payment_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handlePrintPdf(inv.id)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                              title="Print Invoice"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDownloadPdf(inv.id)}
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
