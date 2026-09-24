"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyticsApi } from "@/services/api";
import { formatCurrency } from "@/lib/utils";
import { BarChart3, TrendingUp, Users, Megaphone } from "lucide-react";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [salesRes, customerRes, campaignRes] = await Promise.all([
          analyticsApi.getSales(),
          analyticsApi.getCustomers(),
          analyticsApi.getCampaigns(),
        ]);
        setSales(salesRes.data.results || []);
        setCustomers(customerRes.data.results || []);
        setCampaigns(campaignRes.data.results || []);
      } catch {
        setSales([]);
        setCustomers([]);
        setCampaigns([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_revenue), 0);
  const totalTransactions = sales.reduce((sum, s) => sum + s.total_transactions, 0);
  const avgOrder = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  const latestCustomers = customers[0] || {
    total_customers: 0,
    new_customers: 0,
    active_customers: 0,
    vip_customers: 0,
  };

  const totalMessages = campaigns.reduce((sum, c) => sum + c.total_messages_sent, 0);
  const totalDelivered = campaigns.reduce((sum, c) => sum + c.total_delivered, 0);
  const totalCoupons = campaigns.reduce((sum, c) => sum + c.total_coupons_redeemed, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Analytics</h2>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgOrder)}</div>
            <p className="text-xs text-muted-foreground">Per transaction</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latestCustomers.active_customers}</div>
            <p className="text-xs text-muted-foreground">{latestCustomers.vip_customers} VIP</p>
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
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                No sales data yet
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
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                No customer data yet
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
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              No campaign data yet
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
