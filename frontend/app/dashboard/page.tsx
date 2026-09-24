"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { analyticsApi, loyaltyApi, couponApi, campaignApi } from "@/services/api";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Users, Receipt, Megaphone, Star, Ticket } from "lucide-react";

interface DashboardStats {
  totalRevenue: number;
  totalTransactions: number;
  totalCustomers: number;
  newCustomersToday: number;
  activeCampaigns: number;
  totalLoyaltyPoints: number;
  totalCouponsRedeemed: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalTransactions: 0,
    totalCustomers: 0,
    newCustomersToday: 0,
    activeCampaigns: 0,
    totalLoyaltyPoints: 0,
    totalCouponsRedeemed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await analyticsApi.getSales();
        if (res.data) {
          setStats({
            totalRevenue: Number(res.data.total_revenue) || 0,
            totalTransactions: Number(res.data.total_transactions) || 0,
            totalCustomers: Number(res.data.total_customers) || 0,
            newCustomersToday: Number(res.data.new_customers_today) || 0,
            activeCampaigns: Number(res.data.active_campaigns) || 0,
            totalLoyaltyPoints: Number(res.data.total_loyalty_points) || 0,
            totalCouponsRedeemed: Number(res.data.total_coupons_redeemed) || 0,
          });
        }
      } catch {
        // Use default stats
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const cards = [
    {
      title: "Total Revenue",
      value: formatCurrency(stats.totalRevenue),
      icon: TrendingUp,
      description: "This month",
    },
    {
      title: "Transactions",
      value: stats.totalTransactions.toLocaleString(),
      icon: Receipt,
      description: "This month",
    },
    {
      title: "Total Customers",
      value: stats.totalCustomers.toLocaleString(),
      icon: Users,
      description: `${stats.newCustomersToday} new today`,
    },
    {
      title: "Active Campaigns",
      value: stats.activeCampaigns.toLocaleString(),
      icon: Megaphone,
      description: "Running now",
    },
    {
      title: "Loyalty Points",
      value: stats.totalLoyaltyPoints.toLocaleString(),
      icon: Star,
      description: "Total outstanding",
    },
    {
      title: "Coupons Redeemed",
      value: stats.totalCouponsRedeemed.toLocaleString(),
      icon: Ticket,
      description: "This month",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Chart will be displayed here
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Customer Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Chart will be displayed here
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
