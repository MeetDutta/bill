"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { campaignApi, campaignIntelligenceApi } from "@/services/api";
import { formatDate } from "@/lib/utils";
import type { Campaign, CampaignROIItem } from "@/types";
import {
  Megaphone,
  Plus,
  Search,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  DollarSign,
  Users,
  Target,
  ShieldCheck,
} from "lucide-react";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [roiItems, setRoiItems] = useState<CampaignROIItem[]>([]);
  const [roiTotals, setRoiTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "roi">("all");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cRes, roiRes] = await Promise.allSettled([
          campaignApi.list(),
          campaignIntelligenceApi.getROISummary(),
        ]);

        if (cRes.status === "fulfilled") {
          setCampaigns(cRes.value.data.results || []);
        }
        if (roiRes.status === "fulfilled") {
          const rData = roiRes.value.data;
          setRoiItems(rData.campaigns || []);
          setRoiTotals(rData.totals || null);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "sending":
      case "scheduled":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "cancelled":
        return <XCircle className="h-4 w-4 text-rose-500" />;
      default:
        return <Send className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Campaigns & Attribution ROI</h2>
          <p className="text-sm text-muted-foreground">
            Track broadcast delivery, verified customer conversions, and direct revenue attribution.
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Campaign
        </Button>
      </div>

      {/* Top ROI & Performance Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Direct Attributed Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              ₹{Number(roiTotals?.total_revenue_generated || 0).toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Verified 7-day transaction link
            </p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Overall Campaign ROI
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              {roiTotals?.overall_roi || "0.0x"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              vs ₹{Number(roiTotals?.total_cost || 0).toLocaleString("en-IN")} messaging cost
            </p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Verified Conversions
            </CardTitle>
            <Target className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              {roiTotals?.total_conversions || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              from {Number(roiTotals?.total_recipients || 0).toLocaleString()} recipients
            </p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Messages Sent
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              {campaigns.reduce((sum, c) => sum + (c.total_sent || 0), 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              across {campaigns.length} campaigns
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "all"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All Campaigns ({campaigns.length})
        </button>
        <button
          onClick={() => setActiveTab("roi")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "roi"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Attribution & Financial ROI ({roiItems.length})
        </button>
      </div>

      {/* Tab 1: All Campaigns Table */}
      {activeTab === "all" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search campaigns by title..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading campaigns...</p>
            ) : filtered.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                No campaigns found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                      <th className="pb-3 pr-4">Name</th>
                      <th className="pb-3 pr-4">Type</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Recipients</th>
                      <th className="pb-3 pr-4">Delivered</th>
                      <th className="pb-3 pr-4">Read</th>
                      <th className="pb-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((campaign) => (
                      <tr key={campaign.id} className="border-b">
                        <td className="py-3 pr-4 font-medium">{campaign.name}</td>
                        <td className="py-3 pr-4">
                          <span className="inline-flex rounded-full bg-blue-100 dark:bg-blue-950/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400 capitalize">
                            {campaign.campaign_type}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="flex items-center gap-1.5 text-xs">
                            {statusIcon(campaign.status)}
                            <span className="capitalize">{campaign.status}</span>
                          </span>
                        </td>
                        <td className="py-3 pr-4 font-mono text-sm">{campaign.total_recipients}</td>
                        <td className="py-3 pr-4 font-mono text-sm">{campaign.total_delivered ?? "—"}</td>
                        <td className="py-3 pr-4 font-mono text-sm">{campaign.total_read ?? "—"}</td>
                        <td className="py-3 text-xs text-muted-foreground">
                          {campaign.sent_at ? formatDate(campaign.sent_at) : formatDate(campaign.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Attribution & ROI Table */}
      {activeTab === "roi" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Direct Transaction Attribution Table
                </CardTitle>
                <CardDescription>
                  Revenues linked directly to recipients completing a purchase within the post-campaign window.
                </CardDescription>
              </div>
              <span className="text-xs bg-muted px-2.5 py-1 rounded-md text-muted-foreground">
                No Fabricated Conversions
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {roiItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No campaigns with attribution data found yet. Send a campaign and recorded customer purchases will tie in automatically.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                      <th className="pb-3 pr-4">Campaign</th>
                      <th className="pb-3 pr-4">Recipients</th>
                      <th className="pb-3 pr-4">Conversions</th>
                      <th className="pb-3 pr-4">Conversion Rate</th>
                      <th className="pb-3 pr-4">Direct Revenue</th>
                      <th className="pb-3 pr-4">Cost</th>
                      <th className="pb-3 pr-4">ROI</th>
                      <th className="pb-3">Rev / Recipient</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roiItems.map((item) => (
                      <tr key={item.campaign_id} className="border-b">
                        <td className="py-3 pr-4 font-semibold text-sm">
                          {item.campaign_name}
                          <div className="text-[11px] font-normal text-muted-foreground capitalize">
                            {item.campaign_type}
                          </div>
                        </td>
                        <td className="py-3 pr-4 font-mono text-sm">{item.recipients}</td>
                        <td className="py-3 pr-4 font-mono text-sm text-emerald-600 font-bold">
                          {item.conversions}
                        </td>
                        <td className="py-3 pr-4 text-sm">{item.conversion_rate}%</td>
                        <td className="py-3 pr-4 font-mono text-sm font-bold">
                          ₹{Number(item.attributed_revenue).toLocaleString("en-IN")}
                        </td>
                        <td className="py-3 pr-4 font-mono text-sm text-muted-foreground">
                          ₹{Number(item.campaign_cost).toLocaleString("en-IN")}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="inline-flex rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 text-xs font-extrabold font-mono">
                            {item.roi}
                          </span>
                        </td>
                        <td className="py-3 font-mono text-sm">
                          ₹{item.revenue_per_recipient}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
