"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyticsApi, intelligenceAnalyticsApi, customerIntelligenceApi } from "@/services/api";
import { formatCurrency } from "@/lib/utils";
import { parseApiError } from "@/lib/api-error";
import {
  BarChart3,
  TrendingUp,
  Users,
  Megaphone,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
  Flame,
  UserCheck,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Send,
  CheckCircle,
} from "lucide-react";
import type {
  DashboardData,
  RFMSegmentDistribution,
  RFMProfile,
  ChurnPredictionData,
  BusinessHealthData,
} from "@/types";

interface RetentionMetrics {
  total_customers: number;
  repeat_customers: number;
  repeat_purchase_rate: string;
  retention_rate: string;
  churn_rate: string;
  average_order_value: number;
  revenue_per_customer: number;
}

interface CohortData {
  intervals: string[];
  cohorts: Array<{
    cohort: string;
    size: number;
    retention_percentages: Array<number | string>;
  }>;
}

export default function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [rfmDist, setRfmDist] = useState<RFMSegmentDistribution[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string>("Champions");
  const [segmentCustomers, setSegmentCustomers] = useState<RFMProfile[]>([]);
  const [atRiskCustomers, setAtRiskCustomers] = useState<ChurnPredictionData[]>([]);
  const [retention, setRetention] = useState<RetentionMetrics | null>(null);
  const [cohorts, setCohorts] = useState<CohortData | null>(null);
  const [healthData, setHealthData] = useState<BusinessHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerSuccessMsg, setOfferSuccessMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, rfmRes, atRiskRes, retRes, cohRes, bhRes] = await Promise.all([
        analyticsApi.getDashboard().catch(() => null),
        intelligenceAnalyticsApi.getRFMDistribution().catch(() => null),
        customerIntelligenceApi.getAtRisk(10).catch(() => null),
        intelligenceAnalyticsApi.getRetentionMetrics().catch(() => null),
        intelligenceAnalyticsApi.getCohorts().catch(() => null),
        intelligenceAnalyticsApi.getBusinessHealth().catch(() => null),
      ]);

      if (dashRes) setDashboard(dashRes.data);
      if (rfmRes) setRfmDist(rfmRes.data);
      if (atRiskRes) setAtRiskCustomers(atRiskRes.data);
      if (retRes) setRetention(retRes.data);
      if (cohRes) setCohorts(cohRes.data);
      if (bhRes) setHealthData(bhRes.data);

      // Load initial segment customers
      loadSegmentCustomers("Champions");
    } catch (err: unknown) {
      setError(parseApiError(err, "Failed to load intelligence analytics."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSegmentCustomers = async (segmentName: string) => {
    setSelectedSegment(segmentName);
    setCustomersLoading(true);
    try {
      const res = await intelligenceAnalyticsApi.getRFMCustomers({ segment: segmentName });
      setSegmentCustomers(res.data.results || []);
    } catch {
      setSegmentCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  };

  const handleSendComebackOffer = async (customerId: string, customerName: string) => {
    try {
      await customerIntelligenceApi.createOffer(customerId, {
        discount_type: "fixed",
        discount_value: 200,
        min_order_value: 999,
        reason: "Win-back comeback voucher sent to at-risk customer",
      });
      setOfferSuccessMsg(`₹200 Comeback Offer generated for ${customerName}!`);
      setTimeout(() => setOfferSuccessMsg(null), 4000);
    } catch {
      alert("Failed to create offer.");
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground text-sm font-medium">Computing RFM & retention intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Intelligence & Retention Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            RFM Segmentation • Churn Prediction • Cohort Retention • Business Health
          </p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 bg-white px-3.5 py-2 rounded-xl shadow-2xs hover:bg-slate-50 transition w-fit"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Recalculate
        </button>
      </div>

      {offerSuccessMsg && (
        <div className="flex items-center gap-2 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold animate-in fade-in">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{offerSuccessMsg}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchData} className="underline font-semibold ml-4 hover:text-red-900">
            Retry
          </button>
        </div>
      )}

      {/* Primary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Revenue
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">
              {formatCurrency(Number(dashboard?.total_revenue || 0))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              AOV: {formatCurrency(retention?.average_order_value || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Retention Rate
            </CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-700">
              {retention?.retention_rate || "N/A"}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Repeat purchase: {retention?.repeat_purchase_rate || "N/A"}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              At Risk / Churn
            </CardTitle>
            <Flame className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-rose-600">
              {atRiskCustomers.length} Flagged
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Churn rate: {retention?.churn_rate || "N/A"}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Business Health
            </CardTitle>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-indigo-700">
              {healthData?.overall_score || 82}/100
            </div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {healthData?.weakest_area || "Strong baseline performance"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* FEATURE 1 — RFM CUSTOMER INTELLIGENCE */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">RFM Customer Segments</h3>
            <p className="text-xs text-slate-500">
              Recency + Frequency + Monetary Value profiling. Click any segment to view customers.
            </p>
          </div>
        </div>

        {/* Segment Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {rfmDist.map((seg) => {
            const isSelected = selectedSegment.toLowerCase() === seg.segment.toLowerCase();
            return (
              <button
                key={seg.segment}
                onClick={() => loadSegmentCustomers(seg.segment)}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  isSelected
                    ? "bg-indigo-50 border-indigo-500 shadow-md ring-1 ring-indigo-500"
                    : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 truncate">{seg.segment}</span>
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {seg.count}
                  </span>
                </div>
                <p className="text-lg font-black text-slate-900 mt-1">{seg.percentage}%</p>
                <p className="text-[10px] text-slate-400 mt-1">Avg: ₹{Math.round(seg.avg_spend).toLocaleString()}</p>
              </button>
            );
          })}
        </div>

        {/* Segment Customer List Table */}
        <Card className="rounded-2xl border-slate-200 shadow-xs overflow-hidden">
          <CardHeader className="bg-slate-50/70 border-b border-slate-200 px-5 py-3.5 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-800">
                Customers in &quot;{selectedSegment}&quot; Segment
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {rfmDist.find((s) => s.segment.toLowerCase() === selectedSegment.toLowerCase())?.description}
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700">
              {segmentCustomers.length} Customers
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {customersLoading ? (
              <div className="py-12 text-center text-slate-400 text-xs">Loading segment members...</div>
            ) : segmentCustomers.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No customers currently classified under &quot;{selectedSegment}&quot;.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/50 text-slate-400 uppercase font-semibold text-[10px] border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Recency</th>
                      <th className="px-4 py-3">Orders</th>
                      <th className="px-4 py-3">Total Spend</th>
                      <th className="px-4 py-3">RFM Score</th>
                      <th className="px-4 py-3 text-right">Customer 360</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {segmentCustomers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-5 py-3 font-bold text-slate-900">{c.customer_name}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono">{c.customer_phone}</td>
                        <td className="px-4 py-3">{c.recency_days} days ago</td>
                        <td className="px-4 py-3">{c.frequency_count} purchases</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          ₹{Number(c.monetary_value).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 text-slate-800">
                            {c.rfm_score}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/dashboard/customers/${c.customer}`}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold"
                          >
                            View 360 <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* FEATURE 3 — CHURN PREDICTION (Customers at Risk) */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>Customers at Risk of Churn</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
              Behaviour-Based Prediction
            </span>
          </h3>
          <p className="text-xs text-slate-500">
            Customers exhibiting purchase interval deceleration. Actionable comeback vouchers can be issued directly.
          </p>
        </div>

        <Card className="rounded-2xl border-slate-200 shadow-xs overflow-hidden">
          <CardContent className="p-0">
            {atRiskCustomers.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                🎉 No customers currently exhibit elevated churn risk.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/60 text-slate-400 uppercase font-semibold text-[10px] border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-4 py-3">Churn Probability</th>
                      <th className="px-4 py-3">Risk Level</th>
                      <th className="px-4 py-3">Inactivity vs Cadence</th>
                      <th className="px-4 py-3">Lifetime Value</th>
                      <th className="px-4 py-3">Prediction Reason</th>
                      <th className="px-4 py-3 text-right">Next Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {atRiskCustomers.map((cust) => (
                      <tr key={cust.customer_id} className="hover:bg-slate-50/80 transition">
                        <td className="px-5 py-3 font-bold text-slate-900">{cust.customer_name}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-rose-500 h-full rounded-full"
                                style={{ width: `${Math.round(cust.churn_probability * 100)}%` }}
                              />
                            </div>
                            <span className="font-bold text-rose-600 font-mono">
                              {Math.round(cust.churn_probability * 100)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              cust.churn_risk === "CRITICAL"
                                ? "bg-red-100 text-red-800"
                                : "bg-orange-100 text-orange-800"
                            }`}
                          >
                            {cust.churn_risk}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {cust.days_since_last_purchase || 0}d inactive (normal: {cust.average_purchase_interval_days}d)
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          ₹{cust.lifetime_value.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                          {cust.prediction_reason}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleSendComebackOffer(cust.customer_id, cust.customer_name)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] transition shadow-2xs"
                          >
                            <Send className="h-3 w-3" /> Issue Comeback Offer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* COHORT RETENTION MATRIX */}
      {cohorts && cohorts.cohorts && cohorts.cohorts.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Monthly Cohort Retention</h3>
            <p className="text-xs text-slate-500">
              Percentage of customers returning to make subsequent purchases across successive months.
            </p>
          </div>

          <Card className="rounded-2xl border-slate-200 shadow-xs overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-center">
                <thead className="bg-slate-50/60 text-slate-500 text-[11px] font-bold border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left">Cohort Month</th>
                    <th className="px-3 py-3">Cohort Size</th>
                    {cohorts.intervals.map((inv) => (
                      <th key={inv} className="px-3 py-3 font-semibold">
                        {inv}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {cohorts.cohorts.map((row) => (
                    <tr key={row.cohort} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 text-left font-sans font-bold text-slate-800">{row.cohort}</td>
                      <td className="px-3 py-3 text-slate-500 font-sans font-medium">{row.size}</td>
                      {row.retention_percentages.map((val, idx) => {
                        const num = typeof val === "number" ? val : null;
                        const bgColor =
                          num === 100
                            ? "bg-indigo-600 text-white font-bold"
                            : num && num > 40
                            ? "bg-indigo-100 text-indigo-800 font-semibold"
                            : num && num > 0
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-slate-400";
                        return (
                          <td key={idx} className="p-2">
                            <span className={`inline-block w-14 py-1 rounded-md text-[11px] ${bgColor}`}>
                              {num !== null ? `${num}%` : val}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
