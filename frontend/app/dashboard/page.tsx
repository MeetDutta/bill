"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { analyticsApi } from "@/services/api";
import { formatCurrency } from "@/lib/utils";
import type { DashboardData } from "@/types";
import { TrendingUp, Users, Receipt, Megaphone, Star, Ticket } from "lucide-react";
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

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await analyticsApi.getDashboard();
        if (res.data) {
          setData(res.data);
        }
      } catch {
        // Handled with null fallback
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const totalRevenue = Number(data?.total_revenue || 0);
  const totalTransactions = data?.total_transactions || 0;
  const totalCustomers = data?.total_customers || 0;
  const newCustomersToday = data?.new_customers_today || 0;
  const activeCampaigns = data?.active_campaigns || 0;
  const totalLoyaltyPoints = Number(data?.total_loyalty_points || 0);
  const totalCouponsRedeemed = data?.total_coupons_redeemed || 0;

  const hasRevenueData = Boolean(data?.has_revenue_data && data?.revenue_trend && data.revenue_trend.some((d) => d.revenue > 0));
  const hasCustomerData = Boolean(data?.has_customer_data && data?.customer_growth && totalCustomers > 0);

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
          <p className="text-muted-foreground text-sm font-medium">Loading dashboard analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {/* Real Charts Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Revenue Trend Chart */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Revenue Trend</CardTitle>
            <CardDescription className="text-xs">Daily revenue performance over the last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            {hasRevenueData && data?.revenue_trend ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenue_trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                      tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    />
                    <Tooltip
                      formatter={(val: number) => [formatCurrency(val), "Revenue"]}
                      labelFormatter={(label) => `Date: ${label}`}
                      contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
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
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No revenue data available yet.</p>
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
            <CardDescription className="text-xs">Cumulative registered customer count over the last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            {hasCustomerData && data?.customer_growth ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.customer_growth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                      contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
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
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No customer data available yet.</p>
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
