"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { posApi } from "@/services/api";
import {
  CircleDollarSign,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

export default function MobileRegisterPage() {
  const [register, setRegister] = useState<{
    id?: string;
    status: "open" | "closed";
    opened_at?: string;
    cashier_name?: string;
    opening_balance?: number;
    cash_sales?: number;
    cash_refunds?: number;
    cash_added?: number;
    cash_withdrawn?: number;
    expected_cash?: number;
    actual_cash?: number;
    difference?: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Open Shift Form
  const [openingCashInput, setOpeningCashInput] = useState("2000.00");
  const [openingNotes, setOpeningNotes] = useState("");
  const [openingSubmitting, setOpeningSubmitting] = useState(false);

  // Close Shift Form
  const [actualCashInput, setActualCashInput] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [closingSubmitting, setClosingSubmitting] = useState(false);
  const [closeSuccessMessage, setCloseSuccessMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await posApi.getRegisterStatus();
      setRegister(res.data);
    } catch {
      setRegister({ status: "closed" });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpeningSubmitting(true);
    try {
      await posApi.openRegister({
        opening_balance: Number(openingCashInput) || 0,
        notes: openingNotes,
      });
      loadStatus();
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string } } };
      alert(errObj.response?.data?.error || "Failed to open register.");
    } finally {
      setOpeningSubmitting(false);
    }
  };

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualCashInput) {
      alert("Please count and enter actual cash in drawer.");
      return;
    }

    setClosingSubmitting(true);
    try {
      const res = await posApi.closeRegister({
        actual_cash: Number(actualCashInput),
        notes: closingNotes,
      });
      setCloseSuccessMessage("Register shift closed successfully.");
      setActualCashInput("");
      setClosingNotes("");
      loadStatus();
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string } } };
      alert(errObj.response?.data?.error || "Failed to close register.");
    } finally {
      setClosingSubmitting(false);
    }
  };

  const countedDiff = actualCashInput
    ? Number(actualCashInput) - Number(register?.expected_cash || 0)
    : null;

  return (
    <div className="space-y-3.5 pt-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Cash Register Session</h1>
          <p className="text-[11px] text-slate-400">Cash drawer balancing & shift reconciliation</p>
        </div>
        <button
          onClick={() => {
            setIsRefreshing(true);
            loadStatus();
          }}
          disabled={isRefreshing}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 shadow-sm active:scale-95"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {closeSuccessMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{closeSuccessMessage}</span>
        </div>
      )}

      {/* Register Status Banner */}
      <div
        className={`rounded-2xl p-4 text-white shadow-md relative overflow-hidden ${
          register?.status === "open"
            ? "bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900"
            : "bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                register?.status === "open" ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300"
              }`}
            >
              {register?.status === "open" ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Shift Status</span>
              <h2 className="text-base font-extrabold text-white">
                {register?.status === "open" ? "Active Shift Open" : "Register Closed"}
              </h2>
            </div>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
              register?.status === "open" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-slate-700 text-slate-300"
            }`}
          >
            {register?.status === "open" ? "🟢 OPEN" : "⚪ CLOSED"}
          </span>
        </div>

        {register?.status === "open" && register.opened_at && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-300 border-t border-white/10 pt-2">
            <Clock className="h-3 w-3 text-emerald-400" />
            <span>Opened: {formatDateTime(register.opened_at)}</span>
          </div>
        )}
      </div>

      {/* Case A: Open Shift Metrics & Closing Form */}
      {register?.status === "open" ? (
        <div className="space-y-3">
          {/* Drawer Metrics Breakdown */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-2 text-xs">
            <h3 className="font-bold text-slate-900">Current Shift Cash Drawer</h3>

            <div className="space-y-1.5 border-t pt-2">
              <div className="flex justify-between text-slate-500">
                <span>Opening Cash Float</span>
                <span>{formatCurrency(Number(register.opening_balance || 0))}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Total Cash Sales (+)</span>
                <span className="text-emerald-600 font-bold">
                  +{formatCurrency(Number(register.cash_sales || 0))}
                </span>
              </div>
              {Number(register.cash_refunds || 0) > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Cash Refunds (-)</span>
                  <span className="text-rose-600 font-bold">
                    -{formatCurrency(Number(register.cash_refunds || 0))}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-sm text-slate-900 border-t pt-2">
                <span>Expected Cash in Drawer</span>
                <span className="text-blue-600">
                  {formatCurrency(Number(register.expected_cash || register.opening_balance || 0))}
                </span>
              </div>
            </div>
          </div>

          {/* End Shift & Counted Cash Closing Form */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3 text-xs">
            <h3 className="font-bold text-slate-900">Close Shift / Day-End Reconciliation</h3>
            <p className="text-[10px] text-slate-400">
              Count the physical cash in the drawer and enter below.
            </p>

            <form onSubmit={handleCloseRegister} className="space-y-2.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Actual Counted Cash (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 5420.00"
                  value={actualCashInput}
                  onChange={(e) => setActualCashInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {countedDiff !== null && (
                <div
                  className={`rounded-lg p-2 font-bold text-xs flex items-center justify-between ${
                    countedDiff === 0
                      ? "bg-emerald-50 text-emerald-800"
                      : countedDiff > 0
                      ? "bg-blue-50 text-blue-800"
                      : "bg-rose-50 text-rose-800"
                  }`}
                >
                  <span>Drawer Variance:</span>
                  <span>
                    {countedDiff === 0
                      ? "Exact Match (₹0.00)"
                      : countedDiff > 0
                      ? `Surplus: +${formatCurrency(countedDiff)}`
                      : `Shortage: -${formatCurrency(Math.abs(countedDiff))}`}
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Closing Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Shift 1 closing completed"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={closingSubmitting}
                className="w-full rounded-xl bg-slate-900 py-3 text-center text-xs font-extrabold text-white shadow-md active:scale-95 transition-transform disabled:opacity-50"
              >
                {closingSubmitting ? "Closing Shift..." : "Reconcile & Close Register Shift"}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Case B: Open Shift Form */
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 text-xs animate-in fade-in">
          <h3 className="font-bold text-sm text-slate-900">Open Register Shift</h3>
          <p className="text-[11px] text-slate-500">
            Start a new cashier shift by recording your opening cash float.
          </p>

          <form onSubmit={handleOpenRegister} className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600">Opening Cash Float (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={openingCashInput}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600">Shift Notes (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Morning counter shift"
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={openingSubmitting}
              className="w-full rounded-xl bg-blue-600 py-3 text-center text-xs font-extrabold text-white shadow-md shadow-blue-500/30 active:scale-95 transition-transform"
            >
              {openingSubmitting ? "Opening Shift..." : "Open Cash Register"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
