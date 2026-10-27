"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { analyticsApi, engagementApi, intelligenceAnalyticsApi } from "@/services/api";
import { useRealtimeSubscription, type RealtimeEventPayload } from "@/services/realtime";
import { formatCurrency } from "@/lib/utils";
import type {
  DashboardData,
  EngagementDashboard,
  BusinessHealthData,
  BusinessAlertItem,
} from "@/types";
import {
  TrendingUp,
  Receipt,
  Wallet,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Info,
  X,
  Activity,
  ArrowRight,
  RefreshCw,
  Radio,
  CreditCard,
  Banknote,
  QrCode,
  DollarSign,
  PackageX,
  CheckCircle2,
  Boxes,
  Truck,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { StaffSalesBreakdownTable } from "@/components/dashboard/StaffSalesBreakdownTable";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, setEngagement] = useState<EngagementDashboard | null>(null);
  const [healthData, setHealthData] = useState<BusinessHealthData | null>(null);
  const [alerts, setAlerts] = useState<BusinessAlertItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [liveEventsCount, setLiveEventsCount] = useState(0);

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const [res, engagementRes, healthRes, alertsRes] = await Promise.allSettled([
        analyticsApi.getDashboard(),
        engagementApi.dashboard(),
        intelligenceAnalyticsApi.getBusinessHealth(),
        intelligenceAnalyticsApi.getAlerts(),
      ]);

      if (res.status === "fulfilled" && res.value.data) {
        setData(res.value.data);
        setDashboardError("");
        setLastUpdated(new Date());
      } else {
        setDashboardError("Dashboard totals could not be refreshed. Showing the last available data; use Refresh to try again.");
      }
      if (engagementRes.status === "fulfilled" && engagementRes.value.data) setEngagement(engagementRes.value.data);
      if (healthRes.status === "fulfilled" && healthRes.value.data) setHealthData(healthRes.value.data);
      if (alertsRes.status === "fulfilled" && alertsRes.value.data) {
        const raw = alertsRes.value.data;
        setAlerts(raw.alerts || raw || []);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    // Reconcile in case an SSE event was missed or the stream temporarily disconnects.
    const interval = window.setInterval(() => fetchDashboard(true), 30000);
    return () => window.clearInterval(interval);
  }, [fetchDashboard]);

  // Real-time SSE Live Event Handling
  const handleRealtimeEvent = useCallback(
    (event: RealtimeEventPayload) => {
      setLiveEventsCount((prev) => prev + 1);
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

  const handleDismissAlert = async (alertId: string) => {
    try {
      await intelligenceAnalyticsApi.dismissAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    }
  };

  // Authoritative metrics from backend
  const todayGrossSales = Number(data?.today_gross_sales || 0);
  const todayNetSales = Number(data?.today_net_sales || 0);
  const todayOutstanding = Number(data?.today_outstanding || 0);
  const lowStockCount = Number(data?.low_stock_count || 0);
  const todayTransactionsCount = Number(data?.today_transactions_count || 0);
  const estimatedGrossProfit = Number(data?.estimated_gross_profit || 0);

  const weekRevenue = Number(data?.week_revenue || 0);
  const monthRevenue = Number(data?.month_revenue || 0);
  const allTimeRevenue = Number(data?.all_time_revenue || Number(data?.total_revenue || 0));

  const stockValue = Number(data?.stock_value || 0);
  const totalProducts = Number(data?.total_products_count || 0);
  const inStockCount = Number(data?.in_stock_count || 0);
  const outOfStockCount = Number(data?.out_of_stock_count || 0);
  const totalSuppliers = Number(data?.total_suppliers_count || 0);
  const supplierDues = Number(data?.supplier_dues || 0);

  const salesByCategory = data?.sales_by_category || [];
  const salesTrend30 = data?.sales_trend_30 || [];
  const paymentBreakdown = data?.payment_methods_breakdown || [];
  const hourlySales = data?.hourly_sales || [];
  const liveSalesActivity = data?.live_sales_activity || [];

  const hasRevenueData = Boolean(
    data?.has_revenue_data && data?.revenue_trend && data.revenue_trend.some((d) => d.revenue > 0)
  );
  const hasCustomerData = Boolean(
    data?.has_customer_data && data?.customer_growth && (data?.total_customers || 0) > 0
  );

  // Parse payment channel specifics
  const cashItem = paymentBreakdown.find((p) => p.payment_method.toUpperCase() === "CASH");
  const upiItem = paymentBreakdown.find((p) => p.payment_method.toUpperCase() === "UPI");
  const cardItem = paymentBreakdown.find((p) =>
    ["CARD", "DEBIT", "CREDIT_CARD"].includes(p.payment_method.toUpperCase())
  );
  const cashAmount = Number(cashItem?.total || 0);
  const cashCount = Number(cashItem?.count || 0);
  const upiAmount = Number(upiItem?.total || 0);
  const upiCount = Number(upiItem?.count || 0);
  const cardAmount = Number(cardItem?.total || 0);
  const cardCount = Number(cardItem?.count || 0);

  const getPaymentIcon = (method: string) => {
    switch (method.toUpperCase()) {
      case "CASH":
        return <Banknote className="h-4 w-4 text-emerald-600" />;
      case "UPI":
        return <QrCode className="h-4 w-4 text-foreground" />;
      case "CARD":
      case "DEBIT":
      case "CREDIT_CARD":
        return <CreditCard className="h-4 w-4 text-slate-700" />;
      case "CREDIT":
      case "UDHAAR":
        return <Wallet className="h-4 w-4 text-red-600" />;
      default:
        return <DollarSign className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-foreground border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground text-xs font-semibold">Loading dashboard metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 min-w-0">
      {/* Top Header: Title, Realtime Status Badge & Refresh Control */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground truncate">
            Business Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Operational sales velocity, payment allocations, and inventory ledger
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Live SSE Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              isConnected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : "bg-muted border-border text-muted-foreground"
            }`}
          >
            <span className="relative flex h-2 w-2">
              {isConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isConnected ? "bg-emerald-500" : "bg-slate-400"
                }`}
              ></span>
            </span>
            <span className="text-[11px] font-bold">{isConnected ? "Live updates" : "Refresh fallback"}</span>
            {liveEventsCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px] font-mono">
                {liveEventsCount}
              </Badge>
            )}
          </div>

          {lastUpdated && (
            <span className="hidden md:inline text-[10px] text-muted-foreground whitespace-nowrap">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboard(false)}
            disabled={isRefreshing}
            className="h-8 gap-1.5 text-xs font-bold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden xs:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Quick Action Operations Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <Link href="/pos">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-bold shadow-xs">
            <Receipt className="h-4 w-4" /> + New POS Sale
          </Button>
        </Link>
        <Link href="/dashboard/inventory">
          <Button size="sm" variant="outline" className="gap-1.5 font-semibold">
            <Boxes className="h-4 w-4" /> Manage Inventory
          </Button>
        </Link>
        <Link href="/dashboard/invoices">
          <Button size="sm" variant="outline" className="gap-1.5 font-semibold">
            <Receipt className="h-4 w-4" /> Invoices & Bills
          </Button>
        </Link>
        <Link href="/dashboard/quotations">
          <Button size="sm" variant="outline" className="gap-1.5 font-semibold">
            <Clock className="h-4 w-4" /> Quotations
          </Button>
        </Link>
        <Link href="/dashboard/reports">
          <Button size="sm" variant="outline" className="gap-1.5 font-semibold">
            <TrendingUp className="h-4 w-4" /> Financial Reports
          </Button>
        </Link>
      </div>

      {dashboardError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" role="status" aria-live="polite">
          {dashboardError}
        </div>
      )}

      {/* Smart Business Alerts Banner */}
      {alerts && alerts.filter((a) => !a.is_dismissed).length > 0 && (
        <div className="space-y-2">
          {alerts
            .filter((a) => !a.is_dismissed)
            .slice(0, 2)
            .map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start justify-between rounded-xl border p-3 text-xs shadow-xs transition-all ${
                  alert.severity === "CRITICAL"
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
                    : alert.severity === "WARNING"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                    : "bg-muted/40 border-border text-foreground"
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {alert.severity === "CRITICAL" ? (
                    <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  ) : alert.severity === "WARNING" ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  ) : (
                    <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-xs truncate">{alert.title}</div>
                    <div className="mt-0.5 text-muted-foreground text-[11px] line-clamp-2">{alert.description}</div>
                    {alert.recommended_action && (
                      <div className="mt-1 font-semibold text-[11px] text-foreground">
                        Action: {alert.recommended_action}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDismissAlert(alert.id)}
                  className="text-muted-foreground hover:text-foreground p-1 shrink-0 ml-2"
                  title="Dismiss alert"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 1: TODAY'S SALES & PAYMENT CHANNELS                    */}
      {/* ============================================================== */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Today&apos;s Sales & Payment Channels
          </h2>
          <span className="text-[10px] text-muted-foreground font-mono">
            {todayTransactionsCount} bills recorded today
          </span>
        </div>

        {/* 6-Card Responsive Grid: 2 cols on mobile, 3 cols on tablet, 6 cols on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {/* Card 1: Today's Net Sales */}
          <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
              <span className="text-xs font-semibold text-muted-foreground truncate">Today&apos;s Sales</span>
              <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-xl lg:text-xl font-black text-emerald-600 truncate">
                {formatCurrency(todayNetSales)}
              </div>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                Gross: {formatCurrency(todayGrossSales)}
              </p>
            </CardContent>
          </Card>

          {/* Card 2: Number of Transactions */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
              <span className="text-xs font-semibold text-muted-foreground truncate">Bills Issued</span>
              <Receipt className="h-4 w-4 text-foreground shrink-0" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-xl lg:text-xl font-black text-foreground truncate">
                {todayTransactionsCount}
              </div>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                Completed checkouts
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Cash Sales */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
              <span className="text-xs font-semibold text-muted-foreground truncate">Cash Sales</span>
              <Banknote className="h-4 w-4 text-foreground shrink-0" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-xl lg:text-xl font-black text-foreground truncate">
                {formatCurrency(cashAmount)}
              </div>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {cashCount} cash payments
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Online / UPI Sales */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
              <span className="text-xs font-semibold text-muted-foreground truncate">UPI / QR Sales</span>
              <QrCode className="h-4 w-4 text-foreground shrink-0" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-xl lg:text-xl font-black text-foreground truncate">
                {formatCurrency(upiAmount)}
              </div>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {upiCount} digital payments
              </p>
            </CardContent>
          </Card>

          {/* Card 5: Card Payments */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
              <span className="text-xs font-semibold text-muted-foreground truncate">Card Payments</span>
              <CreditCard className="h-4 w-4 text-foreground shrink-0" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-xl lg:text-xl font-black text-foreground truncate">
                {formatCurrency(cardAmount)}
              </div>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {cardCount} card swipes
              </p>
            </CardContent>
          </Card>

          {/* Card 6: Customer Dues / Outstanding Credit */}
          <Link
            href="/dashboard/finance/receivables"
            className="block focus:outline-none focus:ring-2 focus:ring-foreground/20 rounded-xl"
          >
            <Card
              className={`h-full shadow-xs transition-all hover:border-foreground/30 ${
                todayOutstanding > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"
              }`}
            >
              <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                <span className="text-xs font-semibold text-muted-foreground truncate">Customer Dues</span>
                <Wallet
                  className={`h-4 w-4 shrink-0 ${
                    todayOutstanding > 0 ? "text-red-600" : "text-muted-foreground"
                  }`}
                />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div
                  className={`text-lg sm:text-xl lg:text-xl font-black truncate ${
                    todayOutstanding > 0 ? "text-red-600" : "text-foreground"
                  }`}
                >
                  {formatCurrency(todayOutstanding)}
                </div>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center justify-between">
                  <span>Pending credit</span>
                  <span className="font-bold">View →</span>
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* ============================================================== */}
      {/* SECTION 2: INVENTORY & WORKING CAPITAL                         */}
      {/* ============================================================== */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Inventory Valuation & Payables
          </h2>
          <Link
            href="/dashboard/inventory"
            className="text-[11px] font-semibold text-foreground hover:underline flex items-center gap-1"
          >
            Catalog ({totalProducts} SKUs) →
          </Link>
        </div>

        {/* 6-Card Responsive Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {/* Card 1: Stock Value */}
          <Link href="/dashboard/inventory" className="block focus:outline-none">
            <Card className="h-full border-border bg-card shadow-xs hover:border-foreground/30 transition-all">
              <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                <span className="text-xs font-semibold text-muted-foreground truncate">Stock Value</span>
                <Boxes className="h-4 w-4 text-foreground shrink-0" />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg sm:text-xl lg:text-xl font-black text-foreground truncate">
                  {formatCurrency(stockValue)}
                </div>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {totalProducts} active SKUs
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Card 2: In Stock */}
          <Link href="/dashboard/inventory" className="block focus:outline-none">
            <Card className="h-full border-emerald-500/20 bg-emerald-500/5 shadow-xs hover:border-emerald-500/40 transition-all">
              <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                <span className="text-xs font-semibold text-muted-foreground truncate">In Stock</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg sm:text-xl lg:text-xl font-black text-emerald-600 truncate">
                  {inStockCount}
                </div>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                  Available on shelves
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Card 3: Low Stock Alert */}
          <Link href="/dashboard/inventory" className="block focus:outline-none">
            <Card
              className={`h-full shadow-xs transition-all hover:border-foreground/30 ${
                lowStockCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"
              }`}
            >
              <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                <span className="text-xs font-semibold text-muted-foreground truncate">Low Stock</span>
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 ${
                    lowStockCount > 0 ? "text-red-600" : "text-muted-foreground"
                  }`}
                />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div
                  className={`text-lg sm:text-xl lg:text-xl font-black truncate ${
                    lowStockCount > 0 ? "text-red-600" : "text-foreground"
                  }`}
                >
                  {lowStockCount}
                </div>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                  Below reorder min
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Card 4: Out of Stock */}
          <Link href="/dashboard/inventory" className="block focus:outline-none">
            <Card
              className={`h-full shadow-xs transition-all hover:border-foreground/30 ${
                outOfStockCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"
              }`}
            >
              <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                <span className="text-xs font-semibold text-muted-foreground truncate">Out of Stock</span>
                <PackageX
                  className={`h-4 w-4 shrink-0 ${
                    outOfStockCount > 0 ? "text-red-600" : "text-muted-foreground"
                  }`}
                />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div
                  className={`text-lg sm:text-xl lg:text-xl font-black truncate ${
                    outOfStockCount > 0 ? "text-red-600" : "text-foreground"
                  }`}
                >
                  {outOfStockCount}
                </div>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                  Zero quantity SKUs
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Card 5: Supplier Dues */}
          <Link href="/dashboard/suppliers" className="block focus:outline-none">
            <Card
              className={`h-full shadow-xs transition-all hover:border-foreground/30 ${
                supplierDues > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"
              }`}
            >
              <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
                <span className="text-xs font-semibold text-muted-foreground truncate">Supplier Dues</span>
                <Truck
                  className={`h-4 w-4 shrink-0 ${
                    supplierDues > 0 ? "text-red-600" : "text-muted-foreground"
                  }`}
                />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div
                  className={`text-lg sm:text-xl lg:text-xl font-black truncate ${
                    supplierDues > 0 ? "text-red-600" : "text-foreground"
                  }`}
                >
                  {formatCurrency(supplierDues)}
                </div>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {totalSuppliers} active vendors
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Card 6: Est. Gross Profit */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
              <span className="text-xs font-semibold text-muted-foreground truncate">Gross Profit</span>
              <DollarSign className="h-4 w-4 text-emerald-600 shrink-0" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-xl lg:text-xl font-black text-emerald-600 truncate">
                {formatCurrency(estimatedGrossProfit)}
              </div>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                Revenue less item cost
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ============================================================== */}
      {/* SECTION 3: REVENUE HORIZONS (WEEK, MONTH, LIFETIME)             */}
      {/* ============================================================== */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <span className="text-xs font-semibold text-muted-foreground">This Week</span>
            <Activity className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg sm:text-xl font-black text-foreground">
              {formatCurrency(weekRevenue)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Past 7 calendar days</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <span className="text-xs font-semibold text-muted-foreground">This Month</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg sm:text-xl font-black text-emerald-600">
              {formatCurrency(monthRevenue)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Month-to-date gross sales</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <span className="text-xs font-semibold text-muted-foreground">All-Time Revenue</span>
            <Wallet className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg sm:text-xl font-black text-foreground">
              {formatCurrency(allTimeRevenue)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Lifetime verified sales</p>
          </CardContent>
        </Card>
      </section>

      {/* ============================================================== */}
      {/* SECTION 4: 30-DAY SALES TREND & CATEGORY BREAKDOWN              */}
      {/* ============================================================== */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
        {/* 30-Day Trend (7 Cols) */}
        <Card className="lg:col-span-7 flex flex-col shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-foreground" />
                <span>30-Day Sales Trend</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-semibold">
                Past 30 Days
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Daily revenue trajectory and transaction volume
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {salesTrend30.length > 0 && salesTrend30.some((p) => p.revenue > 0) ? (
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrend30} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trend30Gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f172a" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#0f172a" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="formatted_date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      interval={3}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    />
                    <Tooltip
                      formatter={(val: number) => [formatCurrency(val), "Sales"]}
                      labelFormatter={(label) => `Date: ${label}`}
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#0f172a"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#trend30Gradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {/* Daily History Mini Table */}
            <div className="rounded-lg border overflow-hidden max-h-44 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b font-semibold text-muted-foreground text-[10px] uppercase">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3 text-center">Bills</th>
                    <th className="py-2 px-3 text-right">Gross Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {salesTrend30.slice().reverse().slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="py-1.5 px-3 font-medium">{row.formatted_date}</td>
                      <td className="py-1.5 px-3 text-center font-mono">{row.transactions}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-bold text-foreground">
                        {formatCurrency(row.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown (5 Cols) */}
        <Card className="lg:col-span-5 flex flex-col shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-foreground" />
                <span>Sales by Category</span>
              </div>
              <span className="text-[11px] text-muted-foreground font-normal">Past 30 Days</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Product category revenue contribution and unit volume
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-2.5">
            {salesByCategory.length > 0 ? (
              salesByCategory.map((cat, idx) => (
                <div key={idx} className="space-y-1 rounded-lg border p-2 bg-muted/20 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">{cat.category}</span>
                    <span className="font-mono font-bold">{formatCurrency(cat.total)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{cat.items_sold} units sold</span>
                    <span>{cat.percentage}% share</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, cat.percentage))}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-44 text-center text-muted-foreground">
                <Boxes className="h-8 w-8 mb-2 opacity-30 stroke-1" />
                <p className="text-xs font-semibold">No category sales recorded</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Items assigned to categories will reflect their share here upon checkout.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============================================================== */}
      {/* SECTION 5: PAYMENT BREAKDOWN & HOURLY SALES VELOCITY            */}
      {/* ============================================================== */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
        {/* Payment Breakdown Card (5 Cols) */}
        <Card className="lg:col-span-5 flex flex-col shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-foreground" />
              Payment Method Breakdown
            </CardTitle>
            <CardDescription className="text-xs">
              Exact split allocations across Cash, UPI, Cards, and Customer Credit
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-2.5">
            {paymentBreakdown.length > 0 ? (
              paymentBreakdown.map((item) => (
                <div key={item.payment_method} className="space-y-1 rounded-lg border p-2.5 bg-muted/20">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
                      {getPaymentIcon(item.payment_method)}
                      <span>{item.payment_method}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        ({item.count} {item.count === 1 ? "txn" : "txns"})
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-foreground">{formatCurrency(item.total)}</span>
                      <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        item.payment_method.toUpperCase() === "CASH"
                          ? "bg-emerald-500"
                          : item.payment_method.toUpperCase() === "UPI"
                          ? "bg-slate-900 dark:bg-slate-100"
                          : item.payment_method.toUpperCase().includes("CARD")
                          ? "bg-slate-600"
                          : item.payment_method.toUpperCase() === "CREDIT"
                          ? "bg-red-500"
                          : "bg-slate-400"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-44 text-center text-muted-foreground">
                <Receipt className="h-8 w-8 mb-2 opacity-30 stroke-1" />
                <p className="text-xs font-semibold">No transactions recorded today</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  POS checkouts will automatically populate payment allocations.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hourly Sales Velocity Chart (7 Cols) */}
        <Card className="lg:col-span-7 flex flex-col shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-foreground" />
              Today&apos;s Hourly Sales Velocity
            </CardTitle>
            <CardDescription className="text-xs">
              Real-time hourly sales distribution from 00:00 to 23:00
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            {hourlySales.some((h) => h.sales > 0) ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlySales} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="time_label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      interval={2}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      tickFormatter={(val) =>
                        `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                      }
                    />
                    <Tooltip
                      formatter={(val: number) => [formatCurrency(val), "Sales"]}
                      labelFormatter={(label) => `Hour: ${label}`}
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="sales" fill="#16a34a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-56 text-center text-muted-foreground">
                <Clock className="h-8 w-8 mb-2 opacity-30 stroke-1" />
                <p className="text-xs font-semibold">No hourly sales activity yet</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">
                  As transactions are committed throughout the day, velocity by hour will render here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============================================================== */}
      {/* SECTION 6: STAFF PERFORMANCE & SALES ATTRIBUTION TABLE         */}
      {/* ============================================================== */}
      <StaffSalesBreakdownTable />

      {/* ============================================================== */}
      {/* SECTION 7: LIVE SALES STREAM (RECENT COMMITTED TRANSACTIONS)   */}
      {/* ============================================================== */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-600 animate-pulse" />
              Live Sales Stream
            </CardTitle>
            <CardDescription className="text-xs">
              Recent atomically committed sales with cashier, customer, and payment methods
            </CardDescription>
          </div>
          <Link
            href="/dashboard/transactions"
            className="text-xs font-semibold text-foreground hover:underline flex items-center gap-1"
          >
            All Transactions <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {liveSalesActivity.length > 0 ? (
            <>
              {/* Desktop / Tablet Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground uppercase text-[10px]">
                      <th className="text-left pb-2 font-semibold">Invoice #</th>
                      <th className="text-left pb-2 font-semibold">Time</th>
                      <th className="text-left pb-2 font-semibold">Customer</th>
                      <th className="text-left pb-2 font-semibold">Cashier</th>
                      <th className="text-left pb-2 font-semibold">Items</th>
                      <th className="text-left pb-2 font-semibold">Payment Methods</th>
                      <th className="text-right pb-2 font-semibold">Amount</th>
                      <th className="text-right pb-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {liveSalesActivity.map((tx) => (
                      <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 font-mono font-bold text-foreground">
                          {tx.invoice_number}
                        </td>
                        <td className="py-2.5 text-muted-foreground">{tx.time}</td>
                        <td className="py-2.5 font-medium">{tx.customer}</td>
                        <td className="py-2.5 text-muted-foreground">{tx.cashier}</td>
                        <td className="py-2.5">{tx.items_count} items</td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {tx.payment_methods.map((pm, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 uppercase font-medium"
                              >
                                {pm}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 text-right font-black text-foreground">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge
                            className={`text-[10px] font-bold ${
                              tx.payment_status === "PAID"
                                ? "bg-emerald-600 text-white"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {tx.payment_status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View (Zero horizontal scrolling on 320px–430px) */}
              <div className="block md:hidden space-y-2.5">
                {liveSalesActivity.map((tx) => (
                  <div
                    key={tx.id}
                    className="rounded-xl border border-border bg-muted/20 p-3 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-foreground text-xs">
                        {tx.invoice_number}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{tx.time}</span>
                        <Badge
                          className={`text-[9px] font-bold px-1.5 py-0 ${
                            tx.payment_status === "PAID"
                              ? "bg-emerald-600 text-white"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {tx.payment_status}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span className="truncate">Cust: <strong className="text-foreground">{tx.customer}</strong></span>
                      <span className="truncate">Staff: <strong className="text-foreground">{tx.cashier}</strong></span>
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-2">
                      <div className="flex flex-wrap gap-1">
                        {tx.payment_methods.map((pm, i) => (
                          <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 uppercase">
                            {pm}
                          </Badge>
                        ))}
                        <span className="text-[10px] text-muted-foreground self-center">
                          ({tx.items_count} items)
                        </span>
                      </div>
                      <span className="text-sm font-black text-foreground">
                        {formatCurrency(tx.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Receipt className="h-8 w-8 mb-2 opacity-30 stroke-1" />
              <p className="text-xs font-semibold">No recent transactions recorded</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                New sales committed at POS will appear here instantly.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================== */}
      {/* SECTION 8: BUSINESS HEALTH INDEX & 14-DAY REVENUE CURVE        */}
      {/* ============================================================== */}
      {healthData && (
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <Activity className="h-4 w-4 text-foreground" />
                  Business Health Index
                </CardTitle>
                <CardDescription className="text-xs">
                  Operational velocity, loyalty retention, and catalog performance
                </CardDescription>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-foreground">
                  {healthData.overall_score}
                </span>
                <span className="text-xs text-muted-foreground font-semibold">/ 100</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-5 pt-1">
              <div className="rounded-lg border bg-background p-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Sales Growth</p>
                <p className="mt-1 text-lg font-bold">{healthData.sales_growth || 0}%</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-foreground" style={{ width: `${healthData.sales_growth || 0}%` }} />
                </div>
              </div>

              <div className="rounded-lg border bg-background p-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Retention</p>
                <p className="mt-1 text-lg font-bold">{healthData.customer_retention || 0}%</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-600" style={{ width: `${healthData.customer_retention || 0}%` }} />
                </div>
              </div>

              <div className="rounded-lg border bg-background p-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Loyalty</p>
                <p className="mt-1 text-lg font-bold">{healthData.customer_loyalty || 0}%</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${healthData.customer_loyalty || 0}%` }} />
                </div>
              </div>

              <div className="rounded-lg border bg-background p-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Marketing</p>
                <p className="mt-1 text-lg font-bold">{healthData.marketing || 0}%</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-slate-700" style={{ width: `${healthData.marketing || 0}%` }} />
                </div>
              </div>

              <div className="rounded-lg border bg-background p-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Products</p>
                <p className="mt-1 text-lg font-bold">{healthData.product_performance || 0}%</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-slate-900 dark:bg-slate-100" style={{ width: `${healthData.product_performance || 0}%` }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer Growth & Retention Overview */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-12">
        <Card className="md:col-span-4 flex flex-col shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-600" />
              Customer Base & Retention
            </CardTitle>
            <CardDescription className="text-xs">
              Client acquisition and retention health
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            <div className="rounded-lg border p-3 bg-muted/20">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Total Registered Customers</span>
              <div className="text-2xl font-black text-foreground mt-0.5">
                {(data?.total_customers || 0).toLocaleString()}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Active directory across all store counters</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border p-2.5 bg-background">
                <span className="text-[10px] font-semibold text-muted-foreground">Retention Rate</span>
                <p className="text-base font-bold text-emerald-600 mt-0.5">{healthData?.customer_retention || 0}%</p>
                <span className="text-[9px] text-muted-foreground">Repeat buyers</span>
              </div>
              <div className="rounded-lg border p-2.5 bg-background">
                <span className="text-[10px] font-semibold text-muted-foreground">Loyalty Score</span>
                <p className="text-base font-bold text-foreground mt-0.5">{healthData?.customer_loyalty || 0}%</p>
                <span className="text-[9px] text-muted-foreground">Engagement rank</span>
              </div>
            </div>
            <Link href="/dashboard/customers" className="block pt-1">
              <Button variant="outline" size="sm" className="w-full text-xs font-semibold justify-between">
                <span>View Full Customer Directory</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="md:col-span-8 flex flex-col shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">Customer Growth Curve</CardTitle>
            <CardDescription className="text-xs">
              Cumulative registered customers over the past 14 days
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            {hasCustomerData && data?.customer_growth ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.customer_growth}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="customerGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f172a" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0f172a" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="formatted_date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      formatter={(val: number, name: string) => [
                        val,
                        name === "total_customers" ? "Total Customers" : "New Customers",
                      ]}
                      labelFormatter={(label) => `Date: ${label}`}
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total_customers"
                      stroke="#0f172a"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#customerGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-56 text-center p-6 text-muted-foreground">
                <TrendingUp className="h-8 w-8 mb-2 opacity-30 stroke-1" />
                <p className="text-xs font-semibold text-foreground">
                  No customer growth data yet.
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">
                  New customers registered at POS will populate this growth curve.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
