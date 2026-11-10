"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi, exportSalesReport } from "@/services/api";
import {
  TrendingUp,
  FileSpreadsheet,
  Calendar,
  CreditCard,
  Tag,
  ArrowUpRight,
  Filter,
  BarChart3,
  Receipt,
  Database,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TallyExportModal } from "@/components/reports/TallyExportModal";

export default function SalesReportPage() {
  const [period, setPeriod] = useState("this_month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [reportData, setReportData] = useState<any | null>(null);
  const [showTallyModal, setShowTallyModal] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("period");
      if (p && ["today", "yesterday", "this_week", "this_month", "all"].includes(p)) {
        setPeriod(p);
      }
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams: Record<string, string> = {};
      if (startDate && endDate) {
        queryParams.start_date = startDate;
        queryParams.end_date = endDate;
      } else {
        queryParams.period = period;
      }
      const res = await posApi.getSalesReport(queryParams);
      setReportData(res.data);
    } catch (err) {
      console.error("Failed to load sales report:", err);
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportExcel = async () => {
    setExporting(true);
    setToast(null);
    try {
      const params: { start_date?: string; end_date?: string; period?: string } = {};
      if (startDate && endDate) {
        params.start_date = startDate;
        params.end_date = endDate;
      } else {
        params.period = period;
      }

      const blob = await exportSalesReport(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const datePart = startDate && endDate
        ? `${startDate}_to_${endDate}`
        : `${period}_${new Date().toISOString().slice(0, 10)}`;
      a.download = `sales_report_${datePart}.xlsx`;

      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setToast({ type: "success", message: "Sales report spreadsheet downloaded successfully!" });
      setTimeout(() => setToast(null), 4000);
    } catch (err: any) {
      console.error("Failed to export sales report:", err);
      let errMsg = "Failed to export sales report to Excel. Please try again.";
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json?.error) errMsg = json.error;
        } catch {}
      } else if (err?.response?.data?.error) {
        errMsg = err.response.data.error;
      }
      setToast({ type: "error", message: errMsg });
    } finally {
      setExporting(false);
    }
  };

  const summary = reportData?.summary || {};
  const transactions = reportData?.transactions || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toast && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 p-3.5 rounded-lg border text-xs font-semibold shadow-sm transition-all",
            toast.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-xs opacity-60 hover:opacity-100 p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
              <TrendingUp className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Business Sales Report</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Macro-level commercial sales performance, merchandise analytics, gross margins, and revenue breakdown.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export to Excel Button */}
          <Button
            onClick={handleExportExcel}
            disabled={exporting}
            className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-xs"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            )}
            <span>{exporting ? "Generating Excel..." : "Export to Excel"}</span>
          </Button>

          <Button
            onClick={() => setShowTallyModal(true)}
            variant="outline"
            className="gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 font-semibold shadow-xs"
          >
            <Database className="w-4 h-4 text-emerald-600" />
            Tally GST Export
          </Button>
          <Link href="/dashboard/reports/pos">
            <Button variant="outline" className="gap-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              POS Register Report
            </Button>
          </Link>
          <Link href="/dashboard/analytics">
            <Button variant="outline" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Advanced Analytics
            </Button>
          </Link>
        </div>
      </div>

      {/* Date Filter Bar */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 mr-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Quick Filters:</span>
            </div>

            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "this_week", label: "This Week" },
              { id: "this_month", label: "This Month" },
              { id: "all", label: "All Time" },
            ].map((p) => (
              <Button
                key={p.id}
                variant={period === p.id && !startDate && !endDate ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setPeriod(p.id);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Custom Date Range Picker */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Custom:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Gross Total Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              ₹{parseFloat(summary.total_sales || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total revenue collected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Invoices Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.bill_count || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Processed transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Average Invoice Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ₹{parseFloat(summary.average_bill_value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per transaction basket size</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Tax Collected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              ₹{parseFloat(summary.total_tax || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">GST collected</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Sales Breakdown */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold">Sales Ledger</CardTitle>
          <p className="text-xs text-muted-foreground">
            Itemized list of customer transactions in this reporting timeframe.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Sales Ledger Cards */}
          <div className="sm:hidden divide-y">
            {loading ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Generating sales report...
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground p-4">
                No sales recorded in this timeframe.
              </div>
            ) : (
              transactions.map((tx: any) => (
                <div key={tx.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-xs text-foreground block">{tx.invoice_number}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(tx.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-muted uppercase">
                        {tx.payment_method || "CASH"}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-700">
                        {tx.payment_status?.toUpperCase() || "PAID"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{tx.customer || "Walk-in"}</span>
                    <span className="font-extrabold text-sm text-foreground">₹{parseFloat(tx.total).toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t text-[11px] text-muted-foreground">
                    <span>Subtotal: ₹{parseFloat(tx.subtotal).toFixed(2)}</span>
                    {parseFloat(tx.discount) > 0 && (
                      <span className="text-rose-500">-₹{parseFloat(tx.discount).toFixed(2)}</span>
                    )}
                    <span className="text-emerald-600">Tax: ₹{parseFloat(tx.tax).toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Data Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Invoice #</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Date</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Customer</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Subtotal (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Discount (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Tax (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Total (₹)</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Payment Mode</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      Generating sales report...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      No sales recorded in this timeframe.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx: any) => (
                    <tr key={tx.id} className="hover:bg-muted/20">
                      <td className="py-3 px-4 font-mono font-semibold">{tx.invoice_number}</td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {new Date(tx.date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-medium">{tx.customer}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs">₹{parseFloat(tx.subtotal).toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-rose-500">
                        ₹{parseFloat(tx.discount).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-600">
                        ₹{parseFloat(tx.tax).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-bold">
                        ₹{parseFloat(tx.total).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-muted">
                          {tx.payment_method?.toUpperCase() || "CASH"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-700">
                          {tx.payment_status?.toUpperCase() || "PAID"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tally GST Accounting Export Modal */}
      <TallyExportModal
        isOpen={showTallyModal}
        onClose={() => setShowTallyModal(false)}
        period={period}
        startDate={startDate || undefined}
        endDate={endDate || undefined}
      />
    </div>
  );
}
