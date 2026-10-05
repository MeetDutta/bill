"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { analyticsApi, engagementApi, intelligenceAnalyticsApi } from "@/services/api";
import { formatCurrency } from "@/lib/utils";
import type { DashboardData, EngagementDashboard, BusinessHealthData, BusinessAlertItem } from "@/types";
import {
  TrendingUp,
  Users,
  Receipt,
  Megaphone,
  Star,
  Ticket,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  Info,
  X,
  Activity,
  Award,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [engagement, setEngagement] = useState<EngagementDashboard | null>(null);
  const [healthData, setHealthData] = useState<BusinessHealthData | null>(null);
  const [alerts, setAlerts] = useState<BusinessAlertItem[]>([]);

  useEffect(() => {
    const fetchDashboard = async () => {
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
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const handleDismissAlert = async (alertId: string) => {
    try {
      await intelligenceAnalyticsApi.dismissAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      // optimistic remove
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    }
  };

  const totalRevenue = Number(data?.total_revenue || 0);
  const totalTransactions = data?.total_transactions || 0;
  const totalCustomers = data?.total_customers || 0;
  const newCustomersToday = data?.new_customers_today || 0;
  const activeCampaigns = data?.active_campaigns || 0;
  const totalLoyaltyPoints = Number(data?.total_loyalty_points || 0);
  const totalCouponsRedeemed = data?.total_coupons_redeemed || 0;

  const hasRevenueData = Boolean(
    data?.has_revenue_data && data?.revenue_trend && data.revenue_trend.some((d) => d.revenue > 0)
  );
  const hasCustomerData = Boolean(
    data?.has_customer_data && data?.customer_growth && totalCustomers > 0
  );

  const cards = [
    {
      title: "Total Revenue",
      value: formatCurrency(totalRevenue),
      icon: TrendingUp,
      description: "This month",
    },
    {
      title: "Transactions",
      value: totalTransactions.toLocaleString(),
      icon: Receipt,
      description: "This month",
    },
    {
      title: "Total Customers",
      value: totalCustomers.toLocaleString(),
      icon: Users,
      description: `${newCustomersToday} new today`,
    },
    {
      title: "Active Campaigns",
      value: activeCampaigns.toLocaleString(),
      icon: Megaphone,
      description: "Running now",
    },
    {
      title: "Loyalty Points",
      value: Math.round(totalLoyaltyPoints).toLocaleString(),
      icon: Star,
      description: "Total outstanding",
    },
    {
      title: "Coupons Redeemed",
      value: totalCouponsRedeemed.toLocaleString(),
      icon: Ticket,
      description: "This month",
    },
  ];

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
      {/* Smart Business Alerts Banner */}
      {alerts && alerts.filter((a) => !a.is_dismissed).length > 0 && (
        <div className="space-y-2">
          {alerts
            .filter((a) => !a.is_dismissed)
            .slice(0, 3)
            .map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start justify-between rounded-xl border p-4 text-xs shadow-sm transition-all ${
                  alert.severity === "CRITICAL"
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
                    : alert.severity === "WARNING"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                    : "bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300"
                }`}
              >
                <div className="flex items-start gap-3">
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

      {/* Business Health Score 0–100 Showcase */}
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
            {/* Category Sub-scores */}
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

            {/* Weakest Area Rationale */}
            {healthData.weakest_area && (
              <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3.5 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
                <span>
                  <strong>Primary improvement area:</strong> {healthData.weakest_area}. Launch a targeted loyalty or comeback campaign to boost performance.
                </span>
                <a href="/dashboard/analytics" className="underline font-semibold ml-2 shrink-0">
                  View Intelligence →
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Customer Engagement Opportunities */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Today&apos;s Customer Opportunities
          </CardTitle>
          <CardDescription>Actions based on your actual customer and loyalty data.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {(engagement?.opportunities || []).map((opportunity) => (
              <a
                key={opportunity.key}
                href={opportunity.key === "vip" ? "/dashboard/customers" : "/dashboard/engagement"}
                className="rounded-xl border bg-background p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl">{opportunity.icon}</span>
                  <span className="text-2xl font-bold">{opportunity.count}</span>
                </div>
                <p className="mt-2 text-sm font-semibold">{opportunity.title}</p>
                <p className="mt-1 flex items-center text-xs text-muted-foreground">
                  {opportunity.action}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </p>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Real Charts Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Revenue Trend Chart */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Revenue Trend</CardTitle>
            <CardDescription className="text-xs">
              Daily revenue performance over the last 14 days
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
                  Sales and transactions will automatically generate your daily revenue trend.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Growth Chart */}
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
                <Users className="h-10 w-10 mb-2 opacity-30 stroke-1" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  No customer data available yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Customers added via POS or CRM will populate your growth curve over time.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
