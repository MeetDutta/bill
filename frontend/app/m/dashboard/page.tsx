"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { analyticsApi, transactionApi, posApi } from "@/services/api";
import type { DashboardData, Transaction } from "@/types";
import {
  TrendingUp,
  Receipt,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  ShoppingCart,
  Boxes,
  CircleDollarSign,
  QrCode,
  CreditCard,
  Banknote,
  Eye,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function MobileDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Transaction | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const [dashRes, txRes] = await Promise.all([
        analyticsApi.getDashboard(),
        transactionApi.list({ page: 1 }),
      ]);
      setData(dashRes.data);
      setTransactions(txRes.data?.results?.slice(0, 5) || []);
    } catch (err) {
      console.error("Failed to load mobile dashboard data:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDashboard();
  };

  if (loading && !data) {
    return (
      <div className="space-y-4 pt-2">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
        </div>
        <div className="h-44 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
  }

  const todaySales = data?.today_net_sales ?? data?.today_gross_sales ?? Number(data?.total_revenue || 0);
  const todayCount = data?.today_transactions_count ?? data?.total_transactions ?? 0;
  const returnsAmount = data?.today_returns ?? 0;
  const lowStockCount = data?.low_stock_count ?? 0;
  const totalSales = Number(data?.all_time_revenue ?? data?.total_revenue ?? 0);

  // 7-day revenue trend chart data
  const chartData = (data?.revenue_trend || []).slice(-7).map((item) => ({
    date: item.date ? item.date.split("-").slice(1).join("/") : "",
    revenue: Number(item.revenue || 0),
  }));

  return (
    <div className="space-y-4 pt-1">
      {/* Top Welcome / Store Card */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 p-4 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-blue-500/10 blur-xl pointer-events-none" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider">
              {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
            </p>
            <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">Retail Dashboard</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95"
            title="Refresh metrics"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Quick Launch POS Button */}
        <div className="mt-3.5">
          <Link
            href="/m/pos"
            className="flex items-center justify-between rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/30 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span>Open POS Checkout Terminal</span>
            </div>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* 4 Essential Mobile KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Today's Sales */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-medium">Today&apos;s Sales</span>
            <div className="rounded-md bg-emerald-50 p-1 text-emerald-600">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1.5 text-base font-extrabold tracking-tight text-slate-900">
            {formatCurrency(todaySales)}
          </p>
          <span className="text-[10px] text-slate-400">
            {todayCount} transactions
          </span>
        </div>

        {/* Total Orders */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-medium">Bills Issued</span>
            <div className="rounded-md bg-slate-100 p-1 text-slate-700">
              <Receipt className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1.5 text-base font-extrabold tracking-tight text-slate-900">
            {todayCount}
          </p>
          <span className="text-[10px] text-slate-400">
            Completed sales
          </span>
        </div>

        {/* Returns */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-medium">Returns</span>
            <div className="rounded-md bg-rose-50 p-1 text-rose-600">
              <RotateCcw className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1.5 text-base font-extrabold tracking-tight text-rose-600">
            {formatCurrency(returnsAmount)}
          </p>
          <span className="text-[10px] text-slate-400">
            Shift returns
          </span>
        </div>

        {/* Low Stock Alerts */}
        <Link
          href="/m/inventory?filter=low"
          className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 shadow-sm hover:bg-amber-50 transition-colors block"
        >
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-medium">Low Stock</span>
            <div className="rounded-md bg-amber-100 p-1 text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1.5 text-base font-extrabold tracking-tight text-amber-900">
            {lowStockCount} items
          </p>
          <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
            Review stock →
          </span>
        </Link>
      </div>

      {/* Quick Access Tiles */}
      <div className="grid grid-cols-3 gap-2">
        <Link
          href="/m/inventory"
          className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 px-1 shadow-sm active:bg-slate-50 transition-colors text-center"
        >
          <Boxes className="h-4 w-4 text-indigo-600" />
          <span className="mt-1 text-[11px] font-semibold text-slate-700">Inventory</span>
        </Link>
        <Link
          href="/m/sales"
          className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 px-1 shadow-sm active:bg-slate-50 transition-colors text-center"
        >
          <Receipt className="h-4 w-4 text-emerald-600" />
          <span className="mt-1 text-[11px] font-semibold text-slate-700">Sales History</span>
        </Link>
        <Link
          href="/m/register"
          className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 px-1 shadow-sm active:bg-slate-50 transition-colors text-center"
        >
          <CircleDollarSign className="h-4 w-4 text-amber-600" />
          <span className="mt-1 text-[11px] font-semibold text-slate-700">Register</span>
        </Link>
      </div>

      {/* 7-Day Revenue Trend Chart */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-slate-900">7-Day Sales Trend</h2>
          <span className="text-[10px] font-medium text-slate-400">Total: {formatCurrency(totalSales)}</span>
        </div>
        <div className="h-36 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="mobileSalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => `₹${val}`}
                />
                <Tooltip
                  formatter={(val: number) => [formatCurrency(val), "Sales"]}
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: 8, color: "#fff", fontSize: 11 }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#mobileSalesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              No sales data for the last 7 days.
            </div>
          )}
        </div>
      </div>

      {/* Recent Sales List */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-bold text-slate-900">Recent Completed Sales</h2>
          <Link href="/m/sales" className="text-[11px] font-bold text-blue-600 hover:underline">
            View All →
          </Link>
        </div>

        {transactions.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">No transactions recorded today.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-bold text-slate-800 truncate">
                    #{tx.invoice_number || tx.id.slice(0, 8)}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {formatDateTime(tx.transaction_date)} • {tx.customer_name || "Walk-in"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-extrabold text-slate-900">{formatCurrency(Number(tx.total))}</p>
                    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold uppercase text-slate-600">
                      {tx.payment_method || "cash"}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedReceipt(tx)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95 transition-all"
                    title="View Receipt"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Mobile Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white p-4 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-slate-900">Sale Receipt Preview</h3>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <div className="text-center border-b pb-2">
                <p className="font-extrabold text-base text-slate-900">BillMeet Store</p>
                <p className="text-slate-500 text-[10px]">Invoice #{selectedReceipt.invoice_number}</p>
                <p className="text-slate-400 text-[10px]">{formatDateTime(selectedReceipt.transaction_date)}</p>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-slate-700">Customer: {selectedReceipt.customer_name || "Walk-in"}</p>
                <p className="text-slate-500">Payment: <span className="font-bold uppercase text-slate-800">{selectedReceipt.payment_method}</span></p>
              </div>

              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between font-bold text-sm text-slate-900">
                  <span>Grand Total</span>
                  <span>{formatCurrency(Number(selectedReceipt.total))}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Amount Paid</span>
                  <span>{formatCurrency(Number(selectedReceipt.amount_paid || selectedReceipt.total))}</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-2 flex gap-2">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 font-bold text-xs text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
              {selectedReceipt.invoice?.web_url && (
                <a
                  href={selectedReceipt.invoice.web_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-center font-bold text-xs text-white hover:bg-blue-700"
                >
                  View Bill Link
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
