"use client";

import { useEffect, useState, useCallback } from "react";
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
  RotateCcw,
  Wallet,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Info,
  X,
  Activity,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Radio,
  CreditCard,
  Banknote,
  Smartphone,
  QrCode,
  DollarSign,
  PackageX,
  CheckCircle2,
  Boxes,
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
  const [engagement, setEngagement] = useState<EngagementDashboard | null>(null);
  const [healthData, setHealthData] = useState<BusinessHealthData | null>(null);
  const [alerts, setAlerts] = useState<BusinessAlertItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
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

      if (res.status === "fulfilled" && res.value.data) setData(res.value.data);
      if (engagementRes.status === "fulfilled" && engagementRes.value.data) setEngagement(engagementRes.value.data);
      if (healthRes.status === "fulfilled" && healthRes.value.data) setHealthData(healthRes.value.data);
      if (alertsRes.status === "fulfilled" && alertsRes.value.data) {
        const raw = alertsRes.value.data;
        setAlerts(raw.alerts || raw || []);
      }
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Real-time SSE Live Event Handling
  const handleRealtimeEvent = useCallback(
    (event: RealtimeEventPayload) => {
      setLiveEventsCount((prev) => prev + 1);
      // Auto-refresh analytics when high-impact transactions commit
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

  const { isConnected, connectionError } = useRealtimeSubscription(handleRealtimeEvent);

  const handleDismissAlert = async (alertId: string) => {
    try {
      await intelligenceAnalyticsApi.dismissAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    }
  };

  const todayGrossSales = Number(data?.today_gross_sales || 0);
  const todayDiscounts = Number(data?.today_discounts || 0);
  const todayReturns = Number(data?.today_returns || 0);
  const todayNetSales = Number(data?.today_net_sales || 0);
  const todayCollected = Number(data?.today_collected || 0);
  const todayOutstanding = Number(data?.today_outstanding || 0);
  const lowStockCount = Number(data?.low_stock_count || 0);
  const todayTransactionsCount = Number(data?.today_transactions_count || 0);
  const estimatedGrossProfit = Number(data?.estimated_gross_profit || 0);

  const weekRevenue = Number(data?.week_revenue || 0);
  const monthRevenue = Number(data?.month_revenue || 0);
  const allTimeRevenue = Number(data?.all_time_revenue || Number(data?.total_revenue || 0));
  const avgBillValue = Number(data?.avg_bill_value || (todayTransactionsCount > 0 ? todayNetSales / todayTransactionsCount : 0));
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

  const getPaymentIcon = (method: string) => {
    switch (method.toUpperCase()) {
      case "CASH":
        return <Banknote className="h-4 w-4 text-emerald-600" />;
      case "UPI":
        return <QrCode className="h-4 w-4 text-indigo-600" />;
      case "CARD":
      case "DEBIT":
      case "CREDIT_CARD":
        return <CreditCard className="h-4 w-4 text-blue-600" />;
      case "CREDIT":
      case "UDHAAR":
        return <Wallet className="h-4 w-4 text-amber-600" />;
      default:
        return <DollarSign className="h-4 w-4 text-slate-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground text-sm font-medium">Loading executive dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header: Title, Realtime Status Badge & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Business Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Authoritative financial metrics, real-time POS velocity, and inventory ledger intelligence
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Live SSE Status Pill */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isConnected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
            }`}
          >
            <span className="relative flex h-2 w-2">
              {isConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isConnected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              ></span>
            </span>
            <span>{isConnected ? "Live Sync Active" : "Reconnecting SSE..."}</span>
            {liveEventsCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {liveEventsCount} events
              </Badge>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboard(false)}
            disabled={isRefreshing}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Smart Business Alerts Banner */}
      {alerts && alerts.filter((a) => !a.is_dismissed).length > 0 && (
        <div className="space-y-2">
          {alerts
            .filter((a) => !a.is_dismissed)
            .slice(0, 2)
            .map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start justify-between rounded-xl border p-3.5 text-xs shadow-sm transition-all ${
                  alert.severity === "CRITICAL"
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
                    : alert.severity === "WARNING"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                    : "bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {alert.severity === "CRITICAL" ? (
                    <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  ) : alert.severity === "WARNING" ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  ) : (
                    <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold text-sm">{alert.title}</div>
                    <div className="mt-0.5 text-foreground/80">{alert.description}</div>
                    {alert.recommended_action && (
                      <div className="mt-1 font-medium text-foreground">
                        💡 Recommended: {alert.recommended_action}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDismissAlert(alert.id)}
                  className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                  title="Dismiss alert"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* EXECUTIVE KPI GRID - ROW 1: SALES VELOCITY & REVENUE */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Sales Velocity & Performance</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {/* Today's Net Sales */}
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Today&apos;s Net Sales</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className="text-xl font-black text-emerald-700 dark:text-emerald-400">
                {formatCurrency(todayNetSales)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 flex justify-between">
                <span>Gross: {formatCurrency(todayGrossSales)}</span>
                <span>{todayTransactionsCount} bills</span>
              </div>
            </CardContent>
          </Card>

          {/* This Week */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">This Week</span>
              <Activity className="h-4 w-4 text-foreground" />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className="text-xl font-black text-foreground">
                {formatCurrency(weekRevenue)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Last 7 calendar days</p>
            </CardContent>
          </Card>

          {/* This Month */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">This Month</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className="text-xl font-black text-emerald-600">
                {formatCurrency(monthRevenue)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Month to date gross</p>
            </CardContent>
          </Card>

          {/* All-Time Sales */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">All-Time Revenue</span>
              <Wallet className="h-4 w-4 text-foreground" />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className="text-xl font-black text-foreground">
                {formatCurrency(allTimeRevenue)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Lifetime verified sales</p>
            </CardContent>
          </Card>

          {/* Gross Profit */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Est. Gross Profit</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className="text-xl font-black text-emerald-600">
                {formatCurrency(estimatedGrossProfit)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Revenue less purchase cost</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* EXECUTIVE KPI GRID - ROW 2: INVENTORY & WORKING CAPITAL */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Inventory Valuation & Dues</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Stock Valuation */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Stock Value</span>
              <Boxes className="h-4 w-4 text-foreground" />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className="text-xl font-black text-foreground">
                {formatCurrency(stockValue)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{totalProducts} active catalog SKUs</p>
            </CardContent>
          </Card>

          {/* In-Stock SKUs */}
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">In Stock</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className="text-xl font-black text-emerald-600">
                {inStockCount}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Healthy on-shelf inventory</p>
            </CardContent>
          </Card>

          {/* Low Stock Alerts */}
          <Card className={lowStockCount > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Low Stock Alert</span>
              <AlertTriangle className={`h-4 w-4 ${lowStockCount > 0 ? "text-red-600" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className={`text-xl font-black ${lowStockCount > 0 ? "text-red-600" : "text-foreground"}`}>
                {lowStockCount}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Below reorder threshold</p>
            </CardContent>
          </Card>

          {/* Out of Stock */}
          <Card className={outOfStockCount > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Out of Stock</span>
              <PackageX className={`h-4 w-4 ${outOfStockCount > 0 ? "text-red-600" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className={`text-xl font-black ${outOfStockCount > 0 ? "text-red-600" : "text-foreground"}`}>
                {outOfStockCount}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Zero stock items</p>
            </CardContent>
          </Card>

          {/* Customer Dues (Udhaar) */}
          <Card className={todayOutstanding > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Customer Dues</span>
              <Wallet className={`h-4 w-4 ${todayOutstanding > 0 ? "text-red-600" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className={`text-xl font-black ${todayOutstanding > 0 ? "text-red-600" : "text-foreground"}`}>
                {formatCurrency(todayOutstanding)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Total outstanding receivables</p>
            </CardContent>
          </Card>

          {/* Supplier Payables */}
          <Card className={supplierDues > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Supplier Dues</span>
              <CreditCard className={`h-4 w-4 ${supplierDues > 0 ? "text-red-600" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent className="px-3.5 pb-3">
              <div className={`text-xl font-black ${supplierDues > 0 ? "text-red-600" : "text-foreground"}`}>
                {formatCurrency(supplierDues)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{totalSuppliers} active suppliers</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 30-DAY SALES TREND & CATEGORY BREAKDOWN (PDF Page 1-2) */}
      <div className="grid gap-4 md:grid-cols-12">
        {/* 30-Day Trend Table & Chart (7 Cols) */}
        <Card className="md:col-span-7 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span>30-Day Sales Trend</span>
              </div>
              <Badge variant="outline" className="text-xs font-semibold">
                Past 30 Days
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Daily revenue trajectory and transaction volume
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            {salesTrend30.length > 0 && salesTrend30.some((p) => p.revenue > 0) ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrend30} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trend30Gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="formatted_date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      interval={4}
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
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#trend30Gradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {/* Daily History Mini Table (matching PDF Page 1) */}
            <div className="rounded-lg border overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b font-semibold text-muted-foreground text-[10px] uppercase">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3 text-center">Bills Count</th>
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

        {/* Category Breakdown (5 Cols, matching PDF Page 2) */}
        <Card className="md:col-span-5 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-emerald-600" />
                <span>Sales by Category</span>
              </div>
              <span className="text-xs text-muted-foreground font-normal">Past 30 Days</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Product category revenue contribution and unit volume
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {salesByCategory.length > 0 ? (
              salesByCategory.map((cat, idx) => (
                <div key={idx} className="space-y-1.5 rounded-lg border p-2.5 bg-muted/20 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">{cat.category}</span>
                    <span className="font-mono font-bold">{formatCurrency(cat.total)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{cat.items_sold} units sold</span>
                    <span>{cat.percentage}% of sales</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, cat.percentage))}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
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

      {/* SECOND ROW: PAYMENT BREAKDOWN & HOURLY SALES VELOCITY */}
      <div className="grid gap-4 md:grid-cols-12">
        {/* Payment Breakdown Card (5 Cols) */}
        <Card className="md:col-span-5 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment Method Breakdown
            </CardTitle>
            <CardDescription className="text-xs">
              Exact split allocations across Cash, UPI, Cards, and Customer Credit
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {paymentBreakdown.length > 0 ? (
              paymentBreakdown.map((item) => (
                <div key={item.payment_method} className="space-y-1.5 rounded-lg border p-2.5 bg-muted/20">
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
                      <span className="ml-1.5 text-[11px] font-semibold text-muted-foreground">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        item.payment_method.toUpperCase() === "CASH"
                          ? "bg-emerald-500"
                          : item.payment_method.toUpperCase() === "UPI"
                          ? "bg-indigo-500"
                          : item.payment_method.toUpperCase().includes("CARD")
                          ? "bg-blue-500"
                          : item.payment_method.toUpperCase() === "CREDIT"
                          ? "bg-amber-500"
                          : "bg-slate-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
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
        <Card className="md:col-span-7 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Today&apos;s Hourly Sales Velocity
            </CardTitle>
            <CardDescription className="text-xs">
              Real-time hourly sales distribution from 00:00 to 23:00
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            {hourlySales.some((h) => h.sales > 0) ? (
              <div className="h-64 w-full">
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
                    <Bar dataKey="sales" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
                <Clock className="h-10 w-10 mb-2 opacity-30 stroke-1" />
                <p className="text-sm font-semibold">No hourly sales activity yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  As transactions are committed throughout the day, velocity by hour will render here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* STAFF PERFORMANCE & SALES ATTRIBUTION BREAKDOWN */}
      <StaffSalesBreakdownTable />

      {/* THIRD ROW: LIVE RECENT COMMITTED TRANSACTIONS */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-600 animate-pulse" />
              Live Sales Stream
            </CardTitle>
            <CardDescription className="text-xs">
              Recent atomically committed sales with cashier, customer, and hybrid payment methods
            </CardDescription>
          </div>
          <a
            href="/dashboard/transactions"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            All Transactions <ArrowRight className="h-3 w-3" />
          </a>
        </CardHeader>
        <CardContent>
          {liveSalesActivity.length > 0 ? (
            <div className="overflow-x-auto">
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
                <tbody className="divide-y">
                  {liveSalesActivity.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 font-mono font-bold text-primary">
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
                              className="text-[10px] px-1.5 py-0 uppercase"
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
                          variant={tx.payment_status === "PAID" ? "default" : "secondary"}
                          className={`text-[10px] ${
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
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <Receipt className="h-8 w-8 mb-2 opacity-30 stroke-1" />
              <p className="text-xs font-semibold">No recent transactions recorded</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                New sales committed at POS or ingested via API will appear here instantly.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* FOURTH ROW: BUSINESS HEALTH INDEX & 14-DAY TRENDS */}
      {healthData && (
        <Card className="border bg-gradient-to-r from-card via-card to-primary/5">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <Activity className="h-5 w-5 text-primary" />
                  Business Health Index (0–100)
                </CardTitle>
                <CardDescription>
                  Real-time composite score of store operations, customer loyalty, and retention
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black text-foreground">
                  {healthData.overall_score}
                </span>
                <span className="text-xs text-muted-foreground font-semibold">/ 100</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5 pt-1">
              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase">Sales Growth</p>
                <p className="mt-1 text-xl font-bold">{healthData.sales_growth || 0}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${healthData.sales_growth || 0}%` }} />
                </div>
              </div>

              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase">Retention</p>
                <p className="mt-1 text-xl font-bold">{healthData.customer_retention || 0}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${healthData.customer_retention || 0}%` }} />
                </div>
              </div>

              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase">Loyalty</p>
                <p className="mt-1 text-xl font-bold">{healthData.customer_loyalty || 0}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${healthData.customer_loyalty || 0}%` }} />
                </div>
              </div>

              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase">Marketing</p>
                <p className="mt-1 text-xl font-bold">{healthData.marketing || 0}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${healthData.marketing || 0}%` }} />
                </div>
              </div>

              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase">Products</p>
                <p className="mt-1 text-xl font-bold">{healthData.product_performance || 0}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${healthData.product_performance || 0}%` }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 14-Day Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base font-semibold">14-Day Revenue Trend</CardTitle>
            <CardDescription className="text-xs">
              Daily revenue trend across all stores
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            {hasRevenueData && data?.revenue_trend ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.revenue_trend}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="formatted_date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      tickFormatter={(val) =>
                        `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                      }
                    />
                    <Tooltip
                      formatter={(val: number) => [formatCurrency(val), "Revenue"]}
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
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#revenueGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-muted-foreground">
                <Receipt className="h-10 w-10 mb-2 opacity-30 stroke-1" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  No revenue data available yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Committed POS checkouts will populate your revenue trend curve.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Customer Growth</CardTitle>
            <CardDescription className="text-xs">
              Cumulative registered customer count over the last 14 days
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            {hasCustomerData && data?.customer_growth ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.customer_growth}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="customerGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="formatted_date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 11 }}
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
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#customerGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-muted-foreground">
                <TrendingUp className="h-10 w-10 mb-2 opacity-30 stroke-1" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  No customer growth data yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
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
