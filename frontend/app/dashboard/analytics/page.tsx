"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyticsApi } from "@/services/api";
import { formatCurrency } from "@/lib/utils";
import { parseApiError } from "@/lib/api-error";
import { BarChart3, TrendingUp, Users, Megaphone, AlertCircle, RefreshCw } from "lucide-react";
import type { DashboardData } from "@/types";

interface SalesData {
  date: string;
  total_revenue: number;
  total_transactions: number;
  average_order_value: number;
  new_customers: number;
  returning_customers: number;
}

interface CustomerData {
  date: string;
  total_customers: number;
  new_customers: number;
  active_customers: number;
  inactive_customers: number;
  vip_customers: number;
}

interface CampaignData {
  date: string;
  total_campaigns: number;
  total_messages_sent: number;
  total_delivered: number;
  total_read: number;
  total_failed: number;
  total_coupons_redeemed: number;
}

export default function AnalyticsPage() {
  const [sales, setSales] = useState<SalesData[]>([]);
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [salesRes, customerRes, campaignRes, dashRes] = await Promise.all([
        analyticsApi.getSales(),
        analyticsApi.getCustomers(),
        analyticsApi.getCampaigns(),
        analyticsApi.getDashboard().catch(() => null),
      ]);
      setSales(salesRes.data.results || []);
      setCustomers(customerRes.data.results || []);
      setCampaigns(campaignRes.data.results || []);
      if (dashRes) {
        setDashboard(dashRes.data);
      }
    } catch (err: unknown) {
      setError(parseApiError(err, "Failed to load analytics data. Please check your network or try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Combine real-time aggregates with historical sales
  const historicalRev = sales.reduce((sum, s) => sum + Number(s.total_revenue), 0);
  const totalRevenue = dashboard && Number(dashboard.total_revenue) > historicalRev
    ? Number(dashboard.total_revenue)
    : historicalRev;

  const historicalTx = sales.reduce((sum, s) => sum + s.total_transactions, 0);
  const totalTransactions = dashboard && dashboard.total_transactions > historicalTx
    ? dashboard.total_transactions
    : historicalTx;

  const avgOrder = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  const latestCustomers = customers[0] || {
    total_customers: dashboard ? dashboard.total_customers : 0,
    new_customers: dashboard ? dashboard.new_customers_today : 0,
    active_customers: dashboard ? dashboard.total_customers : 0,
    vip_customers: 0,
  };

  const totalMessages = campaigns.reduce((sum, c) => sum + c.total_messages_sent, 0);
  const totalDelivered = campaigns.reduce((sum, c) => sum + c.total_delivered, 0);
  const totalCoupons = campaigns.reduce(
    (sum, c) => sum + c.total_coupons_redeemed,
    dashboard ? dashboard.total_coupons_redeemed : 0
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground text-sm">Loading analytics intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Analytics</h2>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 bg-white px-3 py-1.5 rounded-lg shadow-sm hover:bg-slate-50 transition"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchData}
            className="underline font-semibold text-xs ml-4 hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">Current billing cycle</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgOrder)}</div>
            <p className="text-xs text-muted-foreground">Per completed transaction</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latestCustomers.active_customers}</div>
            <p className="text-xs text-muted-foreground">{latestCustomers.vip_customers} VIP members</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Messages Delivered</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDelivered.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">of {totalMessages.toLocaleString()} sent</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sales Data</CardTitle>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <div className="flex flex-col h-48 items-center justify-center text-muted-foreground text-sm gap-1">
                <span>No historical daily sales recorded yet.</span>
                <span className="text-xs text-slate-400">Daily reports aggregate nightly via Celery Beat.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {sales.slice(0, 7).map((s) => (
                  <div key={s.date} className="flex items-center justify-between border-b pb-2">
                    <span className="text-sm">{s.date}</span>
                    <span className="font-medium">{formatCurrency(Number(s.total_revenue))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Customer Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {customers.length === 0 ? (
              <div className="flex flex-col h-48 items-center justify-center text-muted-foreground text-sm gap-1">
                <span>No daily customer metrics recorded yet.</span>
                <span className="text-xs text-slate-400">Total customer base: {dashboard ? dashboard.total_customers : 0}</span>
              </div>
            ) : (
              <div className="space-y-2">
                {customers.slice(0, 7).map((c) => (
                  <div key={c.date} className="flex items-center justify-between border-b pb-2">
                    <span className="text-sm">{c.date}</span>
                    <span className="font-medium">{c.total_customers} total</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="flex flex-col h-32 items-center justify-center text-muted-foreground text-sm gap-1">
              <span>No campaign analytics records found.</span>
              <span className="text-xs text-slate-400">Launch marketing campaigns to track read receipts and conversions.</span>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{totalMessages.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Messages Sent</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{totalDelivered.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Delivered</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {campaigns.reduce((sum, c) => sum + c.total_read, 0).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Read</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{totalCoupons.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Coupons Redeemed</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
