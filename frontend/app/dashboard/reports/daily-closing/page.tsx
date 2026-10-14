"use client";

import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  CalendarCheck,
  CreditCard,
  Landmark,
  TrendingUp,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Lock,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Calendar,
} from "lucide-react";

interface DailyClosingData {
  date: string;
  timezone: string;
  sales_summary: {
    completed_transactions: number;
    gross_sales: number;
    discounts: number;
    taxes: number;
    returns: number;
    net_sales: number;
  };
  payment_collections: {
    total_collected_funds: number;
    cash: number;
    upi: number;
    card: number;
    net_banking: number;
    other: number;
    credit_extended: number;
    customer_repayments: number;
  };
  cash_drawer_reconciliation: {
    register_status: string;
    opening_cash: number;
    cash_sales_applied: number;
    expected_closing_cash: number;
    actual_counted_cash: number;
    shortage_or_excess: number;
  };
  operational_status: {
    exceptions_count: number;
    ready_for_close: boolean;
    is_closed: boolean;
  };
}

export default function DailyClosingReportPage() {
  const [data, setData] = useState<DailyClosingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [actualCashInput, setActualCashInput] = useState<string>("");
  const [closingNotes, setClosingNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [closingSuccess, setClosingSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchDailyClosing = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await api.get<DailyClosingData>(`/reports/daily-closing/?date=${selectedDate}`);
      setData(res.data);
      if (res.data?.cash_drawer_reconciliation?.expected_closing_cash) {
        setActualCashInput(res.data.cash_drawer_reconciliation.expected_closing_cash.toString());
      }
    } catch (err) {
      console.error("Failed to load daily closing report:", err);
      setErrorMsg("Failed to retrieve daily closing metrics.");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchDailyClosing();
  }, [fetchDailyClosing]);

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErrorMsg(null);
      const res = await api.post("/reports/daily-closing/finalize/", {
        actual_cash: parseFloat(actualCashInput) || 0,
        notes: closingNotes,
      });
      setClosingSuccess(
        `✓ Daily register closing approved and finalized. Actual: ₹${res.data.actual_cash}, Variance: ₹${res.data.difference}`
      );
      setShowFinalizeModal(false);
      await fetchDailyClosing();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || "Failed to finalize daily closing.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
            <CalendarCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Daily Business Closing</h1>
            <p className="text-xs text-muted-foreground">
              End-of-day sales auditing, multi-method payment settlement, and physical drawer cash reconciliation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/50 border rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-semibold focus:outline-hidden"
            />
          </div>

          <button
            onClick={fetchDailyClosing}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border bg-background hover:bg-accent transition-all shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {closingSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center justify-between">
          <span>{closingSuccess}</span>
          <button onClick={() => setClosingSuccess(null)} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border bg-card shadow-xs space-y-2">
          <span className="text-xs font-bold text-muted-foreground uppercase">Net Completed Sales</span>
          <div className="text-2xl font-black tracking-tight text-foreground">
            ₹{data?.sales_summary.net_sales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {data?.sales_summary.completed_transactions} transactions • Gross: ₹{data?.sales_summary.gross_sales.toLocaleString("en-IN")}
          </div>
        </div>

        <div className="p-5 rounded-2xl border bg-card shadow-xs space-y-2">
          <span className="text-xs font-bold text-muted-foreground uppercase">Collected Liquid Funds</span>
          <div className="text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
            ₹{data?.payment_collections.total_collected_funds.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Cash + UPI + Card + Bank (Excludes Credit)
          </div>
        </div>

        <div className="p-5 rounded-2xl border bg-card shadow-xs space-y-2">
          <span className="text-xs font-bold text-muted-foreground uppercase">Expected Drawer Cash</span>
          <div className="text-2xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">
            ₹{data?.cash_drawer_reconciliation.expected_closing_cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Opening: ₹{data?.cash_drawer_reconciliation.opening_cash} + Cash Sales: ₹{data?.cash_drawer_reconciliation.cash_sales_applied}
          </div>
        </div>

        <div className="p-5 rounded-2xl border bg-card shadow-xs space-y-2">
          <span className="text-xs font-bold text-muted-foreground uppercase">Customer Credit (Khata)</span>
          <div className="text-2xl font-black tracking-tight text-amber-600 dark:text-amber-400">
            ₹{data?.payment_collections.credit_extended.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Repayments Collected: ₹{data?.payment_collections.customer_repayments.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* Breakdown Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods Breakdown */}
        <div className="p-6 rounded-2xl border bg-card shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <span>Payment Method Settlements</span>
            </h2>
            <span className="text-xs text-muted-foreground">Audited Allocations</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40">
              <span className="font-semibold">Cash Collections</span>
              <span className="font-mono font-bold text-foreground">
                ₹{data?.payment_collections.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40">
              <span className="font-semibold">UPI Collections (QR / VPA)</span>
              <span className="font-mono font-bold text-foreground">
                ₹{data?.payment_collections.upi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40">
              <span className="font-semibold">Card Collections (POS EDC)</span>
              <span className="font-mono font-bold text-foreground">
                ₹{data?.payment_collections.card.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40">
              <span className="font-semibold">Net Banking / Direct Bank</span>
              <span className="font-mono font-bold text-foreground">
                ₹{data?.payment_collections.net_banking.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
              <span className="font-semibold">Udhaar / Customer Credit Extended</span>
              <span className="font-mono font-bold">
                ₹{data?.payment_collections.credit_extended.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Drawer Cash Reconciliation */}
        <div className="p-6 rounded-2xl border bg-card shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-600" />
              <span>Cash Register Drawer Closing</span>
            </h2>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                data?.cash_drawer_reconciliation.register_status === "closed"
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-500/20 text-emerald-600"
              }`}
            >
              Session: {data?.cash_drawer_reconciliation.register_status}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40">
              <span>Opening Cash Float</span>
              <span className="font-mono font-bold">
                ₹{data?.cash_drawer_reconciliation.opening_cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40">
              <span>Applied Cash Sales</span>
              <span className="font-mono font-bold text-emerald-600">
                +₹{data?.cash_drawer_reconciliation.cash_sales_applied.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold">
              <span>Calculated Expected Cash</span>
              <span className="font-mono text-sm">
                ₹{data?.cash_drawer_reconciliation.expected_closing_cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {data?.cash_drawer_reconciliation.register_status === "closed" ? (
              <div className="p-3 rounded-xl bg-muted/60 border text-xs space-y-1">
                <div className="flex justify-between font-medium">
                  <span>Counted Actual Cash:</span>
                  <span className="font-mono font-bold">
                    ₹{data.cash_drawer_reconciliation.actual_counted_cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-emerald-600">
                  <span>Reconciliation Difference:</span>
                  <span className="font-mono">
                    ₹{data.cash_drawer_reconciliation.shortage_or_excess.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowFinalizeModal(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md hover:bg-primary/90 transition-all"
              >
                <Lock className="w-4 h-4" />
                <span>Approve & Finalize Daily Cash Closing</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Finalize Closing Modal */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground">Finalize Daily Cash Register</h3>
              <p className="text-xs text-muted-foreground">
                Enter the physical counted cash in the drawer. Any variance against expected cash will be recorded in the permanent audit ledger.
              </p>
            </div>

            <form onSubmit={handleFinalize} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Actual Physical Cash Counted (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={actualCashInput}
                  onChange={(e) => setActualCashInput(e.target.value)}
                  className="w-full p-3 rounded-xl border bg-background text-sm font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Closing Notes & Shift Handover
                </label>
                <textarea
                  rows={3}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="e.g. Cash counted and deposited into safe. All card slips reconciled."
                  className="w-full p-3 rounded-xl border bg-background text-xs focus:ring-2 focus:ring-primary focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFinalizeModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border bg-muted hover:bg-accent transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
                >
                  {submitting ? "Closing..." : "Confirm & Sign Off"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
