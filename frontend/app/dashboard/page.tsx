"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  analyticsApi,
  authApi,
  posApi,
  quotationApi,
  notificationApi,
} from "@/services/api";
import { useRealtimeSubscription, type RealtimeEventPayload } from "@/services/realtime";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type {
  DashboardData,
  User,
  Quotation,
  SalesReturn,
} from "@/types";
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
  Store as StoreIcon,
  Bell,
  ChevronRight,
  FileCheck,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  BarChart3,
  Wallet,
} from "lucide-react";
import {
  DashboardPopupManager,
  type DashboardPopup,
} from "@/components/dashboard/DashboardPopupManager";
import { SalesAnalyticsGraph } from "@/components/dashboard/SalesAnalyticsGraph";
import { PaymentDonutChart } from "@/components/dashboard/PaymentDonutChart";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [returnsList, setReturnsList] = useState<SalesReturn[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeActivityTab, setActiveActivityTab] = useState<"all" | "invoices" | "quotes" | "returns">("all");

  // Central Popup State
  const [popup, setPopup] = useState<DashboardPopup>(null);

  const fetchDashboard = useCallback(async (silent = false) => {
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
        setLastUpdated(new Date());
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
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    // 30s background poll fallback
    const interval = window.setInterval(() => fetchDashboard(true), 30000);
    return () => window.clearInterval(interval);
  }, [fetchDashboard]);

  // Real-time SSE Live Event Handling
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
        fetchDashboard(true);
      }
    },
    [fetchDashboard]
  );

  const { isConnected } = useRealtimeSubscription(handleRealtimeEvent);

  // Authoritative metrics from backend
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
      yesterdayRevenue: yesterdayRev,
    };
  }, [data?.sales_trend_30, todayNetSales]);

  // Store identity
  const storeName =
    config?.trade_name ||
    config?.name ||
    profile?.organization_name ||
    (profile?.organization && typeof profile.organization === "object" ? profile.organization.name : "BillMeet Store");

  // Staff identity
  const staffName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || profile.email
    : "Administrator";

  const currentDateString = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
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
      isPositive: boolean;
      originalItem: any;
    }> = [];

    const activities = data?.live_sales_activity || [];

    // Invoices from activities
    activities.slice(0, 10).forEach((tx) => {
      items.push({
        id: tx.id,
        kind: "invoice",
        refNumber: tx.invoice_number,
        title: tx.customer || "Walk-in Customer",
        timestamp: tx.time,
        amount: Number(tx.amount || 0),
        status: (tx.payment_status || "PAID").toUpperCase(),
        isPositive: true,
        originalItem: tx,
      });
    });

    // Quotations
    quotations.slice(0, 5).forEach((q) => {
      items.push({
        id: q.id,
        kind: "quotation",
        refNumber: q.quotation_number,
        title: q.customer_name || "Quoted Client",
        timestamp: q.quotation_date || q.created_at,
        amount: Number(q.total || 0),
        status: (q.status || "DRAFT").toUpperCase(),
        isPositive: false,
        originalItem: q,
      });
    });

    // Returns
    returnsList.slice(0, 5).forEach((r) => {
      items.push({
        id: r.id,
        kind: "return",
        refNumber: r.return_number || "RET-000",
        title: `Refund · ${r.refund_method || "CASH"}`,
        timestamp: r.created_at,
        amount: Number(r.total_refund_amount || 0),
        status: "RETURNED",
        isPositive: false,
        originalItem: r,
      });
    });

    // Sort by timestamp descending
    items.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeB - timeA;
    });

    return items;
  }, [data?.live_sales_activity, quotations, returnsList]);

  // Filtered Activity
  const filteredActivities = useMemo(() => {
    if (activeActivityTab === "all") return recentActivities.slice(0, 8);
    if (activeActivityTab === "invoices") return recentActivities.filter((a) => a.kind === "invoice").slice(0, 8);
    if (activeActivityTab === "quotes") return recentActivities.filter((a) => a.kind === "quotation").slice(0, 8);
    if (activeActivityTab === "returns") return recentActivities.filter((a) => a.kind === "return").slice(0, 8);
    return recentActivities.slice(0, 8);
  }, [recentActivities, activeActivityTab]);

  // Attention Counts
  const pendingQuotesCount = quotations.filter((q) => ["draft", "sent"].includes((q.status || "").toLowerCase())).length;
  const recentReturnsCount = returnsList.length;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-3 border-foreground border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-xs font-semibold">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-8 min-w-0">
      {/* =================================================================== */}
      {/* 1. STORE HEADER (COMPACT)                                           */}
      {/* =================================================================== */}
      <header className="flex items-center justify-between gap-3 px-1 py-1 border-b pb-3">
        {/* Left: Branding & Store Identity */}
        <div className="min-w-0 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-foreground text-background flex items-center justify-center font-black text-sm shrink-0">
            BM
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm sm:text-base text-foreground truncate">
                {storeName}
              </span>
              <span className="hidden sm:inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline text-[11px] text-muted-foreground">
                {currentDateString}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">{staffName}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="capitalize font-semibold text-foreground/80">
                {profile?.role?.replace("_", " ") || "Admin"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Realtime status, Notification & Refresh */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Live indicator dot */}
          <div
            className={`hidden xs:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              isConnected
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                : "bg-muted border-border text-muted-foreground"
            }`}
            title={isConnected ? "Real-time updates active" : "Real-time offline"}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            <span>{isConnected ? "Live" : "Poll"}</span>
          </div>

          {/* Refresh Action */}
          <button
            onClick={() => fetchDashboard(false)}
            disabled={isRefreshing}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors touch-target-min flex items-center justify-center"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>

          {/* Notifications */}
          <Link
            href="/dashboard/notifications"
            className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors touch-target-min flex items-center justify-center"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-600" />
            )}
          </Link>

          {/* Profile / Settings */}
          <Link
            href="/dashboard/settings"
            className="h-8 w-8 rounded-full border border-border bg-muted flex items-center justify-center text-xs font-bold text-foreground hover:border-foreground/40 transition-colors ml-0.5"
            title="Store Settings & Profile"
          >
            {staffName.charAt(0).toUpperCase()}
          </Link>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. TODAY'S SALES HERO                                               */}
      {/* =================================================================== */}
      <section>
        <button
          onClick={() => setPopup({ type: "sales_overview" })}
          className="w-full text-left rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs hover:border-foreground/30 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="font-bold tracking-wider uppercase text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
              Today&apos;s Sales
            </span>
            <span className="text-[11px] font-semibold flex items-center gap-1 text-emerald-700 dark:text-emerald-400 group-hover:underline">
              <span>View Executive Analytics</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4">
            <div className="font-black text-3xl sm:text-4xl text-foreground font-mono tracking-tight">
              {formatCurrency(todayNetSales)}
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mt-1 sm:mt-0">
              <span className="text-foreground font-bold font-mono">
                {todayCount} {todayCount === 1 ? "Bill" : "Bills"} Today
              </span>

              {dayComparison && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      dayComparison.isPositive
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-red-500/10 text-red-700 dark:text-red-400"
                    }`}
                  >
                    {dayComparison.isPositive ? "+" : "-"}
                    {dayComparison.percent}% vs yesterday
                  </span>
                </>
              )}
            </div>
          </div>
        </button>
      </section>

      {/* =================================================================== */}
      {/* 3. COMPACT FINANCIAL KPIS (4 COMPACT SUMMARY CARDS)                 */}
      {/* =================================================================== */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {/* KPI 1: Total Sales */}
        <button
          type="button"
          onClick={() => setPopup({ type: "sales_overview", initialTab: "overview" })}
          className="p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
            Total Sales
          </span>
          <p className="font-mono font-black text-base sm:text-lg text-foreground mt-0.5 truncate">
            {formatCurrency(allTimeRevenue)}
          </p>
          <span className="text-[10px] text-muted-foreground truncate block">
            All-time revenue
          </span>
        </button>

        {/* KPI 2: Total Bills */}
        <button
          type="button"
          onClick={() => setPopup({ type: "sales_overview", initialTab: "overview" })}
          className="p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
            Total Bills
          </span>
          <p className="font-mono font-black text-base sm:text-lg text-foreground mt-0.5 truncate">
            {allTimeTransactions}
          </p>
          <span className="text-[10px] text-muted-foreground truncate block">
            Completed checkouts
          </span>
        </button>

        {/* KPI 3: Gross Profit */}
        <button
          type="button"
          onClick={() => setPopup({ type: "sales_overview", initialTab: "profit" })}
          className="p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
            Gross Profit
          </span>
          <p className="font-mono font-black text-base sm:text-lg text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
            {formatCurrency(estimatedProfit)}
          </p>
          <span className="text-[10px] text-muted-foreground truncate block">
            {profitMarginPct}% operating margin
          </span>
        </button>

        {/* KPI 4: Outstanding Receivables */}
        <button
          type="button"
          onClick={() => setPopup({ type: "pending_payments" })}
          className="p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
            Receivables
          </span>
          <p className={`font-mono font-black text-base sm:text-lg mt-0.5 truncate ${customerDues > 0 ? "text-red-600" : "text-foreground"}`}>
            {formatCurrency(customerDues)}
          </p>
          <span className="text-[10px] text-muted-foreground truncate block">
            {customerDues > 0 ? "Awaiting customer payment" : "Zero balance due"}
          </span>
        </button>
      </section>

      {/* =================================================================== */}
      {/* 4. SALES PERFORMANCE & GROSS PROFIT GRAPH                           */}
      {/* =================================================================== */}
      <section>
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
      </section>

      {/* =================================================================== */}
      {/* 5. QUICK ACTIONS (4 COMPACT ACTIONS)                                */}
      {/* =================================================================== */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Link
          href="/dashboard/billing"
          className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors touch-target-min"
        >
          <div className="h-8 w-8 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Receipt className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-foreground truncate">New Sale</p>
            <p className="text-[10px] text-muted-foreground truncate">POS Billing</p>
          </div>
        </Link>

        <Link
          href="/dashboard/quotations?action=new"
          className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors touch-target-min"
        >
          <div className="h-8 w-8 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-foreground truncate">Quotation</p>
            <p className="text-[10px] text-muted-foreground truncate">Create quote</p>
          </div>
        </Link>

        <Link
          href="/dashboard/returns"
          className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors touch-target-min"
        >
          <div className="h-8 w-8 rounded-md bg-red-500/10 text-red-700 dark:text-red-400 flex items-center justify-center shrink-0">
            <RotateCcw className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-foreground truncate">Return</p>
            <p className="text-[10px] text-muted-foreground truncate">Process refund</p>
          </div>
        </Link>

        <button
          onClick={() => setPopup({ type: "quick_product" })}
          className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors touch-target-min text-left"
        >
          <div className="h-8 w-8 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Plus className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-foreground truncate">Add Product</p>
            <p className="text-[10px] text-muted-foreground truncate">Quick SKU</p>
          </div>
        </button>
      </section>

      {/* =================================================================== */}
      {/* 6. PAYMENTS TODAY MINILIST & DISTRIBUTION                           */}
      {/* =================================================================== */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between text-xs border-b pb-2">
          <div>
            <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground block">
              Payments Today
            </span>
            <span className="text-[10px] text-muted-foreground">
              Total Collected: <strong className="font-mono text-foreground font-bold">{formatCurrency(totalCollected)}</strong>
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {paymentBreakdown.reduce((acc, p) => acc + p.count, 0)} collections
          </span>
        </div>

        {paymentBreakdown.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
            No payments recorded yet today.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Left: Compact List of Payment Channels */}
            <div className="md:col-span-8 divide-y divide-border/60">
              {paymentBreakdown.map((item) => {
                const method = item.payment_method.toUpperCase();
                return (
                  <button
                    key={item.payment_method}
                    onClick={() => setPopup({ type: "payment_method", method })}
                    className="w-full py-2 flex items-center justify-between hover:bg-muted/30 px-1 rounded-md transition-colors text-xs text-left group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded bg-muted flex items-center justify-center shrink-0 text-foreground">
                        {method === "CASH" ? (
                          <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                        ) : method === "UPI" ? (
                          <QrCode className="h-3.5 w-3.5 text-foreground" />
                        ) : (
                          <CreditCard className="h-3.5 w-3.5 text-slate-700" />
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-foreground group-hover:underline">
                          {method}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-2">
                          {item.count} {item.count === 1 ? "bill" : "bills"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-foreground">
                        {formatCurrency(item.total)}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono w-10 text-right">
                        {item.percentage}%
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Payment Distribution Donut Chart */}
            <div className="md:col-span-4 flex items-center justify-center border-t md:border-t-0 md:border-l pt-3 md:pt-0 pl-0 md:pl-2">
              <PaymentDonutChart
                paymentMethods={paymentBreakdown}
                totalCollected={totalCollected}
                onSelectMethod={(m) => setPopup({ type: "payment_method", method: m })}
              />
            </div>
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 7. RECENT ACTIVITY (MINILIST)                                       */}
      {/* =================================================================== */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
            Recent Activity
          </span>

          {/* Activity Category Filters */}
          <div className="flex items-center gap-1 text-[11px]">
            <button
              onClick={() => setActiveActivityTab("all")}
              className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                activeActivityTab === "all"
                  ? "bg-foreground text-background font-bold"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveActivityTab("invoices")}
              className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                activeActivityTab === "invoices"
                  ? "bg-foreground text-background font-bold"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Bills
            </button>
            <button
              onClick={() => setActiveActivityTab("quotes")}
              className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                activeActivityTab === "quotes"
                  ? "bg-foreground text-background font-bold"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Quotes
            </button>
            <button
              onClick={() => setActiveActivityTab("returns")}
              className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                activeActivityTab === "returns"
                  ? "bg-foreground text-background font-bold"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Returns
            </button>
          </div>
        </div>

        {filteredActivities.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
            No activity recorded in this category yet.
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
                className="w-full py-2.5 flex items-center justify-between hover:bg-muted/30 px-1 rounded-md transition-colors text-xs text-left group"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className="h-7 w-7 rounded bg-muted flex items-center justify-center shrink-0">
                    {act.kind === "invoice" ? (
                      <Receipt className="h-3.5 w-3.5 text-foreground" />
                    ) : act.kind === "quotation" ? (
                      <FileCheck className="h-3.5 w-3.5 text-blue-600" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 text-red-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-foreground group-hover:underline">
                        #{act.refNumber}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
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
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {act.title} · {act.timestamp ? new Date(act.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Today"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`font-mono font-bold ${act.kind === "return" ? "text-red-600" : "text-foreground"}`}>
                    {act.kind === "return" ? "-" : ""}
                    {formatCurrency(act.amount)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 8. ATTENTION REQUIRED (ACTIONABLE MINILIST)                         */}
      {/* =================================================================== */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
            Attention Required
          </span>
          <span className="text-[10px] text-muted-foreground">Operational alerts</span>
        </div>

        <div className="divide-y divide-border/60">
          {/* Low Stock Products */}
          <button
            onClick={() => setPopup({ type: "low_stock" })}
            className="w-full py-2.5 flex items-center justify-between hover:bg-muted/30 px-1 rounded-md transition-colors text-xs text-left group"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
              <div>
                <span className="font-bold text-foreground group-hover:underline">
                  Low-Stock SKUs
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Products operating at or below replenishment threshold
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                  lowStockCount > 0
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                    : "text-muted-foreground"
                }`}
              >
                {lowStockCount} items
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground" />
            </div>
          </button>

          {/* Customer Receivables */}
          <button
            onClick={() => setPopup({ type: "pending_payments" })}
            className="w-full py-2.5 flex items-center justify-between hover:bg-muted/30 px-1 rounded-md transition-colors text-xs text-left group"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded bg-red-500/10 text-red-700 dark:text-red-400 flex items-center justify-center shrink-0">
                <CreditCard className="h-3.5 w-3.5" />
              </div>
              <div>
                <span className="font-bold text-foreground group-hover:underline">
                  Customer Receivables
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Unpaid or partial customer invoices awaiting collection
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                  customerDues > 0
                    ? "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                    : "text-muted-foreground"
                }`}
              >
                {customerDues > 0 ? formatCurrency(customerDues) : "₹0"}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground" />
            </div>
          </button>

          {/* Pending Quotations */}
          <Link
            href="/dashboard/quotations"
            className="w-full py-2.5 flex items-center justify-between hover:bg-muted/30 px-1 rounded-md transition-colors text-xs text-left group"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
                <FileCheck className="h-3.5 w-3.5" />
              </div>
              <div>
                <span className="font-bold text-foreground group-hover:underline">
                  Open Quotations
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Draft & sent price estimates waiting for customer acceptance
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono font-bold px-2 py-0.5 rounded text-xs bg-muted text-foreground">
                {pendingQuotesCount} open
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground" />
            </div>
          </Link>

          {/* Sales Returns */}
          <button
            onClick={() => setPopup({ type: "returns" })}
            className="w-full py-2.5 flex items-center justify-between hover:bg-muted/30 px-1 rounded-md transition-colors text-xs text-left group"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded bg-muted text-foreground flex items-center justify-center shrink-0">
                <RotateCcw className="h-3.5 w-3.5" />
              </div>
              <div>
                <span className="font-bold text-foreground group-hover:underline">
                  Sales Returns Today
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Reversed items and customer refund payouts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono font-bold px-2 py-0.5 rounded text-xs bg-muted text-foreground">
                {recentReturnsCount} records
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground" />
            </div>
          </button>
        </div>
      </section>

      {/* =================================================================== */}
      {/* CENTRAL POPUP MANAGER                                               */}
      {/* =================================================================== */}
      <DashboardPopupManager
        popup={popup}
        onClose={() => setPopup(null)}
        dashboardData={data}
        config={config}
        onRefreshDashboard={() => fetchDashboard(true)}
      />
    </div>
  );
}
