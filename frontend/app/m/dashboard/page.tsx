"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import {
  analyticsApi,
  authApi,
  posApi,
  quotationApi,
  notificationApi,
} from "@/services/api";
import { useRealtimeSubscription, type RealtimeEventPayload } from "@/services/realtime";
import type { DashboardData, User, Quotation, SalesReturn } from "@/types";
import {
  TrendingUp,
  Receipt,
  RotateCcw,
  Boxes,
  CreditCard,
  Banknote,
  QrCode,
  DollarSign,
  AlertTriangle,
  Clock,
  RefreshCw,
  Plus,
  ArrowRight,
  ChevronRight,
  FileCheck,
  Bell,
  BarChart3,
} from "lucide-react";
import {
  DashboardPopupManager,
  type DashboardPopup,
} from "@/components/dashboard/DashboardPopupManager";
import { SalesAnalyticsGraph } from "@/components/dashboard/SalesAnalyticsGraph";
import { PaymentDonutChart } from "@/components/dashboard/PaymentDonutChart";

export default function MobileDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [returnsList, setReturnsList] = useState<SalesReturn[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeActivityTab, setActiveActivityTab] = useState<"all" | "invoices" | "quotes" | "returns">("all");

  // Central Popup State
  const [popup, setPopup] = useState<DashboardPopup>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const [dashRes, profileRes, configRes, quotesRes, returnsRes, notifRes] =
        await Promise.allSettled([
          analyticsApi.getDashboard(),
          authApi.getProfile(),
          posApi.getConfig(),
          quotationApi.list({ page: 1 }),
          posApi.getReturnsReport(),
          notificationApi.getSummary(),
        ]);

      if (dashRes.status === "fulfilled" && dashRes.value.data) {
        setData(dashRes.value.data);
      }
      if (profileRes.status === "fulfilled" && profileRes.value.data) {
        setProfile(profileRes.value.data);
      }
      if (configRes.status === "fulfilled" && configRes.value.data) {
        setConfig(configRes.value.data);
      }
      if (quotesRes.status === "fulfilled" && quotesRes.value.data) {
        const qList = quotesRes.value.data.results || (Array.isArray(quotesRes.value.data) ? quotesRes.value.data : []);
        setQuotations(qList);
      }
      if (returnsRes.status === "fulfilled" && returnsRes.value.data) {
        const rList = returnsRes.value.data?.results || returnsRes.value.data || [];
        setReturnsList(Array.isArray(rList) ? rList : []);
      }
      if (notifRes.status === "fulfilled" && notifRes.value.data) {
        setUnreadNotifications(notifRes.value.data.unread || 0);
      }
    } catch (err) {
      console.error("Failed to load mobile dashboard data:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const interval = window.setInterval(() => loadDashboard(true), 30000);
    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  // Real-time SSE
  const handleRealtimeEvent = useCallback(
    (event: RealtimeEventPayload) => {
      if (
        [
          "sale_completed",
          "payment_recorded",
          "return_completed",
          "stock_adjusted",
          "purchase_received",
        ].includes(event.event_type)
      ) {
        loadDashboard(true);
      }
    },
    [loadDashboard]
  );

  const { isConnected } = useRealtimeSubscription(handleRealtimeEvent);

  // Authoritative metrics
  const todayNetSales = Number(data?.today_net_sales ?? data?.today_gross_sales ?? 0);
  const todayCount = Number(data?.today_transactions_count || 0);
  const todayOutstanding = Number(data?.today_outstanding || 0);
  const lowStockCount = Number(data?.low_stock_count || 0);
  const paymentBreakdown = data?.payment_methods_breakdown || [];
  const totalCollected = Number(data?.today_collected || 0);

  // Financial KPIs
  const allTimeRevenue = Number(data?.all_time_revenue ?? data?.total_revenue ?? 0);
  const allTimeTransactions = Number(data?.all_time_transactions ?? data?.total_transactions ?? 0);
  const estimatedProfit = Number(data?.estimated_gross_profit || 0);
  const customerDues = Number(data?.customer_dues || todayOutstanding || 0);
  const profitMarginPct = todayNetSales > 0 ? ((estimatedProfit / todayNetSales) * 100).toFixed(1) : "0.0";

  // Previous Day Comparison
  const dayComparison = useMemo(() => {
    const trend = data?.sales_trend_30 || [];
    if (trend.length < 2) return null;
    const yesterday = trend[trend.length - 2];
    const yesterdayRev = Number(yesterday?.revenue || 0);
    if (yesterdayRev <= 0) return null;
    const diffPct = ((todayNetSales - yesterdayRev) / yesterdayRev) * 100;
    return {
      percent: Math.abs(Math.round(diffPct)),
      isPositive: diffPct >= 0,
    };
  }, [data?.sales_trend_30, todayNetSales]);

  // Store identity
  const storeName =
    config?.trade_name ||
    config?.name ||
    profile?.organization_name ||
    "BillMeet Store";

  const staffName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || profile.email
    : "Admin";

  const currentDateString = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  // Recent Activity merged stream
  const recentActivities = useMemo(() => {
    const items: Array<{
      id: string;
      kind: "invoice" | "quotation" | "return";
      refNumber: string;
      title: string;
      timestamp: string;
      amount: number;
      status: string;
    }> = [];

    const activities = data?.live_sales_activity || [];

    activities.slice(0, 10).forEach((tx) => {
      items.push({
        id: tx.id,
        kind: "invoice",
        refNumber: tx.invoice_number,
        title: tx.customer || "Walk-in Customer",
        timestamp: tx.time,
        amount: Number(tx.amount || 0),
        status: (tx.payment_status || "PAID").toUpperCase(),
      });
    });

    quotations.slice(0, 5).forEach((q) => {
      items.push({
        id: q.id,
        kind: "quotation",
        refNumber: q.quotation_number,
        title: q.customer_name || "Quoted Client",
        timestamp: q.quotation_date || q.created_at,
        amount: Number(q.total || 0),
        status: (q.status || "DRAFT").toUpperCase(),
      });
    });

    returnsList.slice(0, 5).forEach((r) => {
      items.push({
        id: r.id,
        kind: "return",
        refNumber: r.return_number || "RET-000",
        title: `Refund · ${r.refund_method || "CASH"}`,
        timestamp: r.created_at,
        amount: Number(r.total_refund_amount || 0),
        status: "RETURNED",
      });
    });

    items.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeB - timeA;
    });

    return items;
  }, [data?.live_sales_activity, quotations, returnsList]);

  const filteredActivities = useMemo(() => {
    if (activeActivityTab === "all") return recentActivities.slice(0, 8);
    if (activeActivityTab === "invoices") return recentActivities.filter((a) => a.kind === "invoice").slice(0, 8);
    if (activeActivityTab === "quotes") return recentActivities.filter((a) => a.kind === "quotation").slice(0, 8);
    if (activeActivityTab === "returns") return recentActivities.filter((a) => a.kind === "return").slice(0, 8);
    return recentActivities.slice(0, 8);
  }, [recentActivities, activeActivityTab]);

  const pendingQuotesCount = quotations.filter((q) => ["draft", "sent"].includes((q.status || "").toLowerCase())).length;
  const recentReturnsCount = returnsList.length;

  if (loading && !data) {
    return (
      <div className="space-y-3 pt-3">
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-14 animate-pulse rounded-lg bg-muted" />
          <div className="h-14 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-1 pb-16 min-w-0">
      {/* =================================================================== */}
      {/* 1. MOBILE HEADER (COMPACT)                                          */}
      {/* =================================================================== */}
      <header className="flex items-center justify-between gap-2 border-b pb-2.5 px-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-black text-sm text-foreground truncate">{storeName}</span>
            <span className="text-[11px] text-muted-foreground shrink-0">· {currentDateString}</span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {staffName} · <span className="capitalize font-semibold text-foreground/80">{profile?.role?.replace("_", " ") || "Admin"}</span>
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => loadDashboard(false)}
            disabled={isRefreshing}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground touch-target-min flex items-center justify-center"
            title="Refresh metrics"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/dashboard/notifications"
            className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground touch-target-min flex items-center justify-center"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-600" />
            )}
          </Link>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. PRIMARY SALES METRIC                                             */}
      {/* =================================================================== */}
      <button
        onClick={() => setPopup({ type: "sales_overview" })}
        className="w-full text-left rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-foreground/30 transition-all group"
      >
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="font-bold tracking-wider uppercase text-[11px] text-muted-foreground group-hover:text-foreground">
            Today&apos;s Sales
          </span>
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5">
            <span>Audit</span>
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <div className="font-black text-2xl xs:text-3xl text-foreground font-mono">
            {formatCurrency(todayNetSales)}
          </div>
          <div className="text-right">
            <span className="text-xs font-bold font-mono text-foreground block">
              {todayCount} {todayCount === 1 ? "Bill" : "Bills"}
            </span>
            {dayComparison && (
              <span
                className={`inline-block text-[10px] font-bold px-1 rounded ${
                  dayComparison.isPositive
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-500/10 text-red-700 dark:text-red-400"
                }`}
              >
                {dayComparison.isPositive ? "+" : "-"}
                {dayComparison.percent}% vs yest.
              </span>
            )}
          </div>
        </div>
      </button>

      {/* =================================================================== */}
      {/* 3. COMPACT FINANCIAL KPIS (2X2 GRID ON MOBILE)                      */}
      {/* =================================================================== */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          onClick={() => setPopup({ type: "sales_overview", initialTab: "overview" })}
          className="p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
            Total Sales
          </span>
          <p className="font-mono font-black text-sm text-foreground mt-0.5 truncate">
            {formatCurrency(allTimeRevenue)}
          </p>
          <span className="text-[9px] text-muted-foreground truncate block">All-time</span>
        </button>

        <button
          type="button"
          onClick={() => setPopup({ type: "sales_overview", initialTab: "overview" })}
          className="p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
            Total Bills
          </span>
          <p className="font-mono font-black text-sm text-foreground mt-0.5 truncate">
            {allTimeTransactions}
          </p>
          <span className="text-[9px] text-muted-foreground truncate block">Completed</span>
        </button>

        <button
          type="button"
          onClick={() => setPopup({ type: "sales_overview", initialTab: "profit" })}
          className="p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
            Gross Profit
          </span>
          <p className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
            {formatCurrency(estimatedProfit)}
          </p>
          <span className="text-[9px] text-muted-foreground truncate block">{profitMarginPct}% margin</span>
        </button>

        <button
          type="button"
          onClick={() => setPopup({ type: "pending_payments" })}
          className="p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
            Receivables
          </span>
          <p className={`font-mono font-black text-sm mt-0.5 truncate ${customerDues > 0 ? "text-red-600" : "text-foreground"}`}>
            {formatCurrency(customerDues)}
          </p>
          <span className="text-[9px] text-muted-foreground truncate block">
            {customerDues > 0 ? "Pending dues" : "All cleared"}
          </span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* 4. SALES PERFORMANCE GRAPH                                          */}
      {/* =================================================================== */}
      <div>
        <SalesAnalyticsGraph
          salesTrend30={data?.sales_trend_30 || []}
          hourlySales={data?.hourly_sales || []}
          onSelectDate={(pt) => {
            setPopup({
              type: "date_details",
              date: pt.date,
              formattedDate: pt.formattedDate,
              revenue: pt.revenue,
              profit: pt.profit,
              transactions: pt.transactions,
            });
          }}
          onOpenAnalytics={() => setPopup({ type: "sales_overview" })}
        />
      </div>

      {/* =================================================================== */}
      {/* 5. 4 QUICK ACTIONS                                                  */}
      {/* =================================================================== */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/dashboard/billing"
          className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors touch-target-min"
        >
          <div className="h-7 w-7 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Receipt className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-foreground truncate">New Sale</p>
            <p className="text-[10px] text-muted-foreground truncate">POS Billing</p>
          </div>
        </Link>

        <Link
          href="/dashboard/quotations"
          className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors touch-target-min"
        >
          <div className="h-7 w-7 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileCheck className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-foreground truncate">Quotation</p>
            <p className="text-[10px] text-muted-foreground truncate">Create quote</p>
          </div>
        </Link>

        <Link
          href="/dashboard/returns"
          className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors touch-target-min"
        >
          <div className="h-7 w-7 rounded-md bg-red-500/10 text-red-700 dark:text-red-400 flex items-center justify-center shrink-0">
            <RotateCcw className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-foreground truncate">Return</p>
            <p className="text-[10px] text-muted-foreground truncate">Refund</p>
          </div>
        </Link>

        <button
          onClick={() => setPopup({ type: "quick_product" })}
          className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors touch-target-min text-left"
        >
          <div className="h-7 w-7 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-foreground truncate">Add Product</p>
            <p className="text-[10px] text-muted-foreground truncate">Quick SKU</p>
          </div>
        </button>
      </div>

      {/* =================================================================== */}
      {/* 6. PAYMENTS TODAY MINILIST & DISTRIBUTION                           */}
      {/* =================================================================== */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between text-xs border-b pb-1.5">
          <div>
            <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground block">
              Payments Today
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Collected: <strong className="text-foreground">{formatCurrency(totalCollected)}</strong>
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            {paymentBreakdown.reduce((acc, p) => acc + p.count, 0)} payments
          </span>
        </div>

        {paymentBreakdown.length === 0 ? (
          <div className="py-3 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
            No payments recorded yet today.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="divide-y divide-border/60">
              {paymentBreakdown.map((item) => {
                const method = item.payment_method.toUpperCase();
                return (
                  <button
                    key={item.payment_method}
                    onClick={() => setPopup({ type: "payment_method", method })}
                    className="w-full py-2 flex items-center justify-between hover:bg-muted/30 px-1 rounded transition-colors text-xs text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-muted flex items-center justify-center shrink-0 text-foreground">
                        {method === "CASH" ? (
                          <Banknote className="h-3 w-3 text-emerald-600" />
                        ) : method === "UPI" ? (
                          <QrCode className="h-3 w-3 text-foreground" />
                        ) : (
                          <CreditCard className="h-3 w-3 text-slate-700" />
                        )}
                      </div>
                      <span className="font-bold text-foreground">{method}</span>
                      <span className="text-[10px] text-muted-foreground">({item.count})</span>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="font-bold text-foreground">{formatCurrency(item.total)}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t flex justify-center">
              <PaymentDonutChart
                paymentMethods={paymentBreakdown}
                totalCollected={totalCollected}
                onSelectMethod={(m) => setPopup({ type: "payment_method", method: m })}
              />
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 7. RECENT ACTIVITY MINILIST                                         */}
      {/* =================================================================== */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
            Recent Activity
          </span>
          <div className="flex items-center gap-1 text-[10px]">
            <button
              onClick={() => setActiveActivityTab("all")}
              className={`px-1.5 py-0.5 rounded font-semibold ${activeActivityTab === "all" ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              All
            </button>
            <button
              onClick={() => setActiveActivityTab("invoices")}
              className={`px-1.5 py-0.5 rounded font-semibold ${activeActivityTab === "invoices" ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              Bills
            </button>
            <button
              onClick={() => setActiveActivityTab("quotes")}
              className={`px-1.5 py-0.5 rounded font-semibold ${activeActivityTab === "quotes" ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              Quotes
            </button>
          </div>
        </div>

        {filteredActivities.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
            No activity recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredActivities.map((act) => (
              <button
                key={`${act.kind}-${act.id}`}
                onClick={() => {
                  if (act.kind === "invoice") {
                    setPopup({ type: "invoice_details", id: act.id, invoiceNumber: act.refNumber });
                  } else if (act.kind === "quotation") {
                    setPopup({ type: "quotation_details", id: act.id, quotationNumber: act.refNumber });
                  } else if (act.kind === "return") {
                    setPopup({ type: "return_details", id: act.id, returnNumber: act.refNumber });
                  }
                }}
                className="w-full py-2 flex items-center justify-between hover:bg-muted/30 px-1 rounded transition-colors text-xs text-left"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-foreground">#{act.refNumber}</span>
                    <span
                      className={`text-[9px] font-bold px-1 py-0.2 rounded uppercase ${
                        act.kind === "return"
                          ? "bg-red-500/10 text-red-700 dark:text-red-400"
                          : act.kind === "quotation"
                          ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {act.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{act.title}</p>
                </div>

                <div className="flex items-center gap-1 font-mono shrink-0">
                  <span className={`font-bold ${act.kind === "return" ? "text-red-600" : "text-foreground"}`}>
                    {act.kind === "return" ? "-" : ""}
                    {formatCurrency(act.amount)}
                  </span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 8. ATTENTION REQUIRED MINILIST                                      */}
      {/* =================================================================== */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground block">
          Attention Required
        </span>

        <div className="divide-y divide-border/60">
          <button
            onClick={() => setPopup({ type: "low_stock" })}
            className="w-full py-2 flex items-center justify-between hover:bg-muted/30 px-1 rounded transition-colors text-xs text-left"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span className="font-bold text-foreground">Low-Stock SKUs</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span
                className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                  lowStockCount > 0
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground"
                }`}
              >
                {lowStockCount} items
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </div>
          </button>

          <button
            onClick={() => setPopup({ type: "pending_payments" })}
            className="w-full py-2 flex items-center justify-between hover:bg-muted/30 px-1 rounded transition-colors text-xs text-left"
          >
            <div className="flex items-center gap-2">
              <CreditCard className="h-3.5 w-3.5 text-red-600" />
              <span className="font-bold text-foreground">Customer Receivables</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span
                className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                  todayOutstanding > 0
                    ? "bg-red-500/10 text-red-700 dark:text-red-400"
                    : "text-muted-foreground"
                }`}
              >
                {todayOutstanding > 0 ? formatCurrency(todayOutstanding) : "₹0"}
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </div>
          </button>

          <Link
            href="/dashboard/quotations"
            className="w-full py-2 flex items-center justify-between hover:bg-muted/30 px-1 rounded transition-colors text-xs text-left"
          >
            <div className="flex items-center gap-2">
              <FileCheck className="h-3.5 w-3.5 text-blue-600" />
              <span className="font-bold text-foreground">Open Quotations</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="font-bold text-muted-foreground text-[11px]">
                {pendingQuotesCount} open
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </div>
          </Link>
        </div>
      </div>

      {/* =================================================================== */}
      {/* CENTRAL POPUP MANAGER                                               */}
      {/* =================================================================== */}
      <DashboardPopupManager
        popup={popup}
        onClose={() => setPopup(null)}
        dashboardData={data}
        config={config}
        onRefreshDashboard={() => loadDashboard(true)}
      />
    </div>
  );
}
