"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  customerApi,
  customerIntelligenceApi,
  engagementApi,
  invoiceApi,
} from "@/services/api";
import { useRealtimeSubscription, type RealtimeEventPayload } from "@/services/realtime";
import { downloadInvoicePdf, streamInvoicePdf } from "@/lib/receiptPrinter";
import type {
  ChurnPredictionData,
  Customer360,
  CustomerAnalyticsData,
  CustomerPurchaseHistoryItem,
  Invoice,
  NextBestActionData,
  SmartOfferData,
  CustomerHealth,
} from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  IndianRupee,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Radio,
  Receipt,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

const CUSTOMER_REALTIME_EVENTS = ["sale_completed", "sale_return", "credit_payment"];

function formatInr(amount: number | string | undefined | null): string {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric)) return "₹0";
  return `₹${numeric.toLocaleString("en-IN", {
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  })}`;
}

function formatDateLong(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDaysAgo(days: number | null | undefined): string {
  if (days === null || days === undefined) return "No purchases yet";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatPaymentStatusBadge(status: string): { label: string; className: string } {
  const normalized = (status || "").toLowerCase();
  if (normalized === "paid") {
    return {
      label: "Paid",
      className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    };
  }
  if (normalized === "partial") {
    return {
      label: "Partial",
      className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    };
  }
  if (normalized === "credit") {
    return {
      label: "Credit",
      className: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
    };
  }
  return {
    label: status || "Paid",
    className: "bg-muted text-muted-foreground border-border",
  };
}

export default function Customer360Page() {
  const params = useParams();
  const id = params?.id as string;

  const [analytics, setAnalytics] = useState<CustomerAnalyticsData | null>(null);
  const [d, setD] = useState<Customer360 | null>(null);
  const [health, setHealth] = useState<CustomerHealth | null>(null);
  const [churn, setChurn] = useState<ChurnPredictionData | null>(null);
  const [nextAction, setNextAction] = useState<NextBestActionData | null>(null);
  const [offer, setOffer] = useState<SmartOfferData | null>(null);
  const [loading, setLoading] = useState(true);

  // Offer approval state
  const [offerCreatedMsg, setOfferCreatedMsg] = useState<string | null>(null);
  const [offerIgnored, setOfferIgnored] = useState(false);
  const [creatingOffer, setCreatingOffer] = useState(false);

  // Invoice detail modal state
  const [selectedHistoryRow, setSelectedHistoryRow] = useState<CustomerPurchaseHistoryItem | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const loadCustomerData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id) return;
    if (!opts?.silent) {
      setLoading(true);
    }
    try {
      const [rAnalytics, r360, rHealth, rChurn, rAction, rOffer] = await Promise.allSettled([
        customerApi.getAnalytics(id, { limit: 50 }),
        engagementApi.customer360(id),
        customerIntelligenceApi.getHealth(id),
        customerIntelligenceApi.getChurn(id),
        customerIntelligenceApi.getNextAction(id),
        customerIntelligenceApi.getRecommendations(id),
      ]);
      if (rAnalytics.status === "fulfilled") setAnalytics(rAnalytics.value.data);
      if (r360.status === "fulfilled") setD(r360.value.data);
      if (rHealth.status === "fulfilled") setHealth(rHealth.value.data);
      if (rChurn.status === "fulfilled") setChurn(rChurn.value.data);
      if (rAction.status === "fulfilled") setNextAction(rAction.value.data);
      if (rOffer.status === "fulfilled") setOffer(rOffer.value.data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCustomerData();
  }, [loadCustomerData]);

  const { isConnected } = useRealtimeSubscription(
    useCallback((event: RealtimeEventPayload) => {
      const eventCustId = event?.payload?.customer_id;
      if (!eventCustId || String(eventCustId) === String(id)) {
        loadCustomerData({ silent: true });
      }
    }, [id, loadCustomerData]),
    CUSTOMER_REALTIME_EVENTS
  );

  const handleCreateOffer = async () => {
    if (!id) return;
    setCreatingOffer(true);
    try {
      const res = await customerIntelligenceApi.createOffer(id, offer);
      setOfferCreatedMsg(
        `Offer coupon created successfully: Code "${res.data.coupon?.code || "APPROVED"}"`
      );
    } catch {
      setOfferCreatedMsg("Failed to create offer coupon. Please try again.");
    } finally {
      setCreatingOffer(false);
    }
  };

  const handleOpenInvoice = async (row: CustomerPurchaseHistoryItem) => {
    setSelectedHistoryRow(row);
    setSelectedInvoice(null);
    if (!row.invoice_id) return;
    setInvoiceLoading(true);
    try {
      const res = await invoiceApi.get(row.invoice_id);
      setSelectedInvoice(res.data);
    } catch {
      setSelectedInvoice(null);
    } finally {
      setInvoiceLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p>Loading Customer profile & purchase analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics && !d) return <div className="p-8">Customer not found.</div>;

  const custInfo = analytics?.customer || d?.customer;
  if (!custInfo) return <div className="p-8">Customer not found.</div>;

  const customerName = custInfo.full_name || custInfo.name || "Customer";
  const customerPhone = custInfo.phone || "—";
  const customerAddress =
    custInfo.full_address ||
    [custInfo.address_line1, custInfo.city, custInfo.state, custInfo.postal_code]
      .filter(Boolean)
      .join(", ") ||
    "—";

  const todayKPI = analytics?.today || { purchase_count: 0, spend: 0 };
  const weekKPI = analytics?.week || { purchase_count: 0, spend: 0 };
  const monthKPI = analytics?.month || { purchase_count: 0, spend: 0 };
  const yearKPI = analytics?.year || { purchase_count: 0, spend: 0 };
  const lifetimeKPI = analytics?.lifetime || {
    purchase_count: Number(d?.customer.total_purchases || 0),
    spend: Number(d?.customer.total_spend || 0),
  };
  const avgBill = analytics?.average_bill_value ?? Number(d?.customer.average_order_value || 0);
  const customerSince = analytics?.customer_since || d?.customer.created_at || null;
  const lastPurchaseDate = analytics?.last_purchase_date || d?.customer.last_purchase_at || null;
  const daysSinceLast = analytics?.days_since_last_purchase ?? churn?.days_since_last_purchase ?? null;
  const paymentBreakdown = analytics?.payment_breakdown || {
    cash: 0,
    upi: 0,
    card: 0,
    credit: 0,
    other: 0,
    total_allocated: 0,
  };
  const creditSummary = analytics?.credit || {
    outstanding_balance: Number(d?.customer.outstanding_credit || 0),
    total_credit_taken: 0,
    total_credit_paid: 0,
    credit_limit: Number(d?.customer.credit_limit || 0),
  };
  const purchaseHistory: CustomerPurchaseHistoryItem[] = analytics?.purchase_history || [];

  const getHealthBadge = (score: number) => {
    if (score >= 90) return { label: "Excellent", bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
    if (score >= 75) return { label: "Healthy", bg: "bg-green-500/10 text-green-600 border-green-500/30" };
    if (score >= 50) return { label: "Stable", bg: "bg-blue-500/10 text-blue-600 border-blue-500/30" };
    if (score >= 25) return { label: "At Risk", bg: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
    return { label: "Critical", bg: "bg-rose-500/10 text-rose-600 border-rose-500/30" };
  };

  const getChurnRiskBadge = (risk?: string) => {
    switch (risk) {
      case "CRITICAL":
        return { label: "CRITICAL CHURN RISK", bg: "bg-rose-500/10 text-rose-600 border-rose-500/30" };
      case "HIGH":
        return { label: "HIGH CHURN RISK", bg: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
      case "MEDIUM":
        return { label: "MEDIUM CHURN RISK", bg: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" };
      default:
        return { label: "LOW CHURN RISK", bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
    }
  };

  const healthBadge = health ? getHealthBadge(health.score) : { label: "N/A", bg: "bg-muted text-muted-foreground" };
  const churnBadge = getChurnRiskBadge(churn?.churn_risk);

  const periodCards = [
    { key: "today", label: "Today", countLabel: "Purchases", count: todayKPI.purchase_count, spend: todayKPI.spend },
    { key: "week", label: "This Week", countLabel: "Purchases", count: weekKPI.purchase_count, spend: weekKPI.spend },
    { key: "month", label: "This Month", countLabel: "Purchases", count: monthKPI.purchase_count, spend: monthKPI.spend },
    { key: "year", label: "This Year", countLabel: "Purchases", count: yearKPI.purchase_count, spend: yearKPI.spend },
    { key: "lifetime", label: "Lifetime", countLabel: "Total Purchases", count: lifetimeKPI.purchase_count, spend: lifetimeKPI.spend, isLifetime: true },
  ];

  const paymentRows = [
    { key: "cash", label: "Cash", amount: paymentBreakdown.cash, barClass: "bg-emerald-500" },
    { key: "upi", label: "UPI", amount: paymentBreakdown.upi, barClass: "bg-indigo-500" },
    { key: "card", label: "Card", amount: paymentBreakdown.card, barClass: "bg-sky-500" },
    { key: "credit", label: "Credit", amount: paymentBreakdown.credit, barClass: "bg-rose-500" },
    ...(paymentBreakdown.other > 0
      ? [{ key: "other", label: "Other", amount: paymentBreakdown.other, barClass: "bg-slate-500" }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Top Navigation & Profile Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to customers
        </Link>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            isConnected
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-border bg-muted/50 text-muted-foreground"
          }`}
        >
          <Radio className="h-3 w-3" />
          {isConnected ? "Real-time Analytics Active" : "Database Synced"}
        </span>
      </div>

      {analytics?.is_walk_in && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Walk-in Customer Profile</p>
            <p className="mt-0.5">
              {analytics.walk_in_notice ||
                "Generic Walk-in records are kept separate from permanent customer analytics."}
            </p>
          </div>
        </div>
      )}

      {/* Customer Information Card */}
      <Card className="border">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {custInfo.customer_id && (
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                    {custInfo.customer_id}
                  </span>
                )}
                {custInfo.segment && (
                  <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-semibold capitalize">
                    {custInfo.segment}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{customerName}</h1>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground pt-1">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-mono text-foreground font-medium">{customerPhone}</span>
                </div>
                <div className="flex items-start gap-2 sm:col-span-2">
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span className="text-foreground">{customerAddress}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>
                    Since <strong className="text-foreground">{formatDateLong(customerSince)}</strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Last Purchase:{" "}
                  <strong className="text-foreground">{formatDateLong(lastPurchaseDate)}</strong>{" "}
                  {daysSinceLast !== null && (
                    <span className="text-muted-foreground">({formatDaysAgo(daysSinceLast)})</span>
                  )}
                </span>
                {custInfo.email && <span>Email: <strong className="text-foreground">{custInfo.email}</strong></span>}
                {custInfo.gstin && (
                  <span>
                    GSTIN: <strong className="font-mono text-foreground">{custInfo.gstin}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              {custInfo.portal_token && (
                <Link href={`/portal/${custInfo.portal_token}`} target="_blank">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Customer Mini Portal
                  </Button>
                </Link>
              )}
              <Button variant="outline" size="sm">
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Period Purchase & Spending Analytics Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Purchase Analytics
          </h2>
          {analytics?.timezone && (
            <span className="text-[11px] text-muted-foreground">
              Timezone: {analytics.timezone}
            </span>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {periodCards.map((item) => (
            <Card
              key={item.key}
              className={`border ${item.isLifetime ? "border-primary/30 bg-primary/5" : ""}`}
            >
              <CardContent className="p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.label}
                  </span>
                  <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">{item.countLabel}</span>
                    <span className="text-lg font-extrabold text-foreground">{item.count}</span>
                  </div>
                  <div className="flex items-baseline justify-between border-t pt-1.5 text-xs">
                    <span className="text-muted-foreground">
                      {item.isLifetime ? "Lifetime Spend" : "Spent"}
                    </span>
                    <span className="text-base font-bold text-primary">
                      {formatInr(item.spend)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Additional Customer KPIs Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Average Bill Value */}
        <Card className="border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Average Bill Value
              </span>
              <IndianRupee className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-3xl font-extrabold">{formatInr(avgBill)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lifetimeKPI.purchase_count > 0
                ? `${formatInr(lifetimeKPI.spend)} / ${lifetimeKPI.purchase_count} purchases`
                : "No completed purchases yet"}
            </p>
          </CardContent>
        </Card>

        {/* Customer Health */}
        <Card className="relative overflow-hidden border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Customer Health
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${healthBadge.bg}`}>
                {health?.status || healthBadge.label}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold">
                {health ? health.score : d?.engagement.score ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {health ? health.recommended_action.replaceAll("_", " ") : d?.engagement.label || "Standard"}
            </p>
          </CardContent>
        </Card>

        {/* Churn Risk */}
        <Card className="relative overflow-hidden border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Churn Risk
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${churnBadge.bg}`}>
                {churn?.churn_risk || "LOW"}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold">
                {churn ? `${churn.churn_probability}%` : "—"}
              </span>
              <span className="text-xs text-muted-foreground">probability</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {daysSinceLast !== null
                ? `${formatDaysAgo(daysSinceLast)} (avg ${churn?.average_purchase_interval_days ?? 0}d)`
                : "Behaviour-based prediction"}
            </p>
          </CardContent>
        </Card>

        {/* Loyalty Wallet */}
        <Card className="border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Loyalty Points
              </span>
              <Award className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2 text-3xl font-extrabold">
              {d?.loyalty ? Number(d.loyalty.balance).toLocaleString("en-IN") : "0"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {d?.loyalty ? `${d.loyalty.total_earned} total earned` : "No active rewards balance"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Breakdown & Customer Credit / Outstanding */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payment Breakdown */}
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment Breakdown
            </CardTitle>
            <CardDescription>
              Actual payment allocations across Cash, UPI, Card, and Credit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentRows.map((row) => {
              const total = paymentBreakdown.total_allocated || 0;
              const pct = total > 0 ? Math.round((row.amount / total) * 100) : 0;
              return (
                <div key={row.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{row.label}</span>
                    <span className="font-bold text-foreground">
                      {formatInr(row.amount)}
                      {total > 0 && (
                        <span className="ml-1.5 font-normal text-muted-foreground">({pct}%)</span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${row.barClass}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between border-t pt-2.5 text-xs">
              <span className="text-muted-foreground">Total Allocated Across Invoices</span>
              <span className="font-bold text-foreground">
                {formatInr(paymentBreakdown.total_allocated)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Customer Credit / Outstanding */}
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Customer Credit & Outstanding
            </CardTitle>
            <CardDescription>
              Tracked independently from completed sales revenue and payment settlements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border bg-rose-500/5 border-rose-500/20 p-3">
                <p className="text-[11px] font-medium text-muted-foreground">Outstanding Balance</p>
                <p className="mt-1 text-lg font-extrabold text-rose-600 dark:text-rose-400">
                  {formatInr(creditSummary.outstanding_balance)}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-[11px] font-medium text-muted-foreground">Total Credit Taken</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {formatInr(creditSummary.total_credit_taken)}
                </p>
              </div>
              <div className="rounded-xl border bg-emerald-500/5 border-emerald-500/20 p-3">
                <p className="text-[11px] font-medium text-muted-foreground">Total Credit Paid</p>
                <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {formatInr(creditSummary.total_credit_paid)}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>Configured Credit Limit</span>
              <span className="font-semibold text-foreground">
                {creditSummary.credit_limit > 0 ? formatInr(creditSummary.credit_limit) : "No limit set"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Purchase History Table */}
      <Card className="border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                Customer Purchase History
              </CardTitle>
              <CardDescription>
                Completed invoices for this customer — click any invoice to inspect details or download PDF
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground">
              {purchaseHistory.length} recent {purchaseHistory.length === 1 ? "invoice" : "invoices"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {purchaseHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No completed purchases yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 pr-4">Invoice Number</th>
                    <th className="pb-3 pr-4">Date</th>
                    <th className="pb-3 pr-4">Amount</th>
                    <th className="pb-3 pr-4">Payment Status</th>
                    <th className="pb-3 pr-4">Payment Method Summary</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchaseHistory.map((row) => {
                    const badge = formatPaymentStatusBadge(row.payment_status);
                    return (
                      <tr
                        key={row.id}
                        onClick={() => handleOpenInvoice(row)}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <td className="py-3 pr-4 font-mono font-semibold text-primary">
                          {row.invoice_number}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground text-xs">
                          {formatDateShort(row.date)}
                        </td>
                        <td className="py-3 pr-4 font-bold text-foreground">
                          {formatInr(row.total)}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs text-foreground font-medium">
                          {row.payment_method_summary}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenInvoice(row);
                            }}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* V2 Intelligence Grid: Health "Why?", Churn, Next Best Action, and Smart Offers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Customer Health Assessment
                </CardTitle>
                <CardDescription>
                  0–100 multi-factor retention score with explainability
                </CardDescription>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${healthBadge.bg}`}>
                {health?.score || d?.engagement.score || 0} / 100 · {health?.status || "STABLE"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Why this health score?
              </p>
              <div className="space-y-2">
                {health?.positive_factors?.map((factor, i) => (
                  <div
                    key={`pos-${i}`}
                    className="flex items-start gap-2 text-xs bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 p-2 rounded-md border border-emerald-500/20"
                  >
                    <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" />
                    <span>{factor}</span>
                  </div>
                ))}
                {health?.risk_factors?.map((factor, i) => (
                  <div
                    key={`risk-${i}`}
                    className="flex items-start gap-2 text-xs bg-amber-500/5 text-amber-700 dark:text-amber-400 p-2 rounded-md border border-amber-500/20"
                  >
                    <TrendingDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                    <span>{factor}</span>
                  </div>
                ))}
                {(!health || (!health.positive_factors?.length && !health.risk_factors?.length)) && (
                  <p className="text-xs text-muted-foreground">Standard cadence metrics calculated.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                  Behaviour-Based Churn Prediction
                </span>
                <span className="text-muted-foreground">
                  Risk: <strong className="text-foreground">{churn?.churn_risk || "LOW"}</strong>
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    (churn?.churn_probability || 0) > 70
                      ? "bg-rose-500"
                      : (churn?.churn_probability || 0) > 40
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${churn?.churn_probability || 10}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {churn?.prediction_reason || "Customer activity is within normal historical purchase bounds."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Next Best Action & Recommended Offer
                </CardTitle>
                <CardDescription>
                  Explainable rules engine with required merchant confirmation
                </CardDescription>
              </div>
              {nextAction && (
                <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-semibold">
                  {nextAction.priority} Priority
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-primary/5 p-4">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Zap className="h-4 w-4 text-primary" />
                Action: {nextAction?.action || d?.recommended_action.title || "Engage customer"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <strong className="text-foreground">Why? </strong>
                {nextAction?.reason || d?.recommended_action.reason || "Based on purchase recency and spend."}
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Channel: <strong className="text-foreground">{nextAction?.recommended_channel || "WhatsApp"}</strong>
                </span>
                <span>·</span>
                <span>
                  Offer:{" "}
                  <strong className="text-foreground">
                    {nextAction?.recommended_offer || d?.recommended_action.suggested_offer || "Reward points"}
                  </strong>
                </span>
              </div>
            </div>

            {!offerIgnored ? (
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-bold uppercase tracking-wider text-primary">
                        Recommended Merchant Offer
                      </span>
                    </div>
                    <p className="text-lg font-bold">
                      {offer?.offer_title || "₹150 OFF above ₹999"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Rationale: </strong>
                      {offer?.reason || "Tailored discount based on customer value and purchase cadence."}
                    </p>
                  </div>
                </div>

                {offerCreatedMsg ? (
                  <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{offerCreatedMsg}</span>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" onClick={handleCreateOffer} disabled={creatingOffer}>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      {creatingOffer ? "Generating..." : "Create Offer"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOfferIgnored(true)}>
                      Ignore
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                Offer recommendation dismissed.
                <button
                  onClick={() => setOfferIgnored(false)}
                  className="ml-2 text-primary underline"
                >
                  Restore
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Customer Timeline & Milestones */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Customer Timeline & Milestones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(d?.timeline || []).map((e) => (
              <div key={e.id} className="flex gap-3">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium capitalize">
                    {e.event_type.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>
            ))}
            {(!d?.timeline || d.timeline.length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No timeline events recorded yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoice Viewer Dialog */}
      <Dialog
        open={Boolean(selectedHistoryRow)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedHistoryRow(null);
            setSelectedInvoice(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              {selectedHistoryRow?.invoice_number}
            </DialogTitle>
            <DialogDescription>
              {formatDateLong(selectedHistoryRow?.date)} · {selectedHistoryRow?.payment_method_summary}
            </DialogDescription>
          </DialogHeader>

          {invoiceLoading ? (
            <div className="flex h-36 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading invoice items...
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3">
                <div>
                  <p className="text-muted-foreground">Total Amount</p>
                  <p className="font-bold text-sm text-foreground">
                    {formatInr(selectedHistoryRow?.total)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount Paid</p>
                  <p className="font-bold text-sm text-foreground">
                    {formatInr(selectedHistoryRow?.amount_paid)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Status</p>
                  <p className="font-semibold capitalize text-foreground">
                    {selectedHistoryRow?.payment_status}
                  </p>
                </div>
              </div>

              {selectedHistoryRow?.payment_allocations &&
                selectedHistoryRow.payment_allocations.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                      Payment Allocations
                    </p>
                    <div className="rounded-lg border divide-y">
                      {selectedHistoryRow.payment_allocations.map((alloc, idx) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-2">
                          <span className="font-medium">{alloc.label}</span>
                          <span className="font-bold">{formatInr(alloc.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {selectedInvoice?.transaction_details?.items &&
                selectedInvoice.transaction_details.items.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                      Billed Items
                    </p>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 border-b text-muted-foreground">
                          <tr>
                            <th className="py-2 px-3 text-left">Item</th>
                            <th className="py-2 px-3 text-right">Qty</th>
                            <th className="py-2 px-3 text-right">Price</th>
                            <th className="py-2 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selectedInvoice.transaction_details.items.map((item: { id?: string; name?: string; quantity?: number | string; unit_price?: number | string; total?: number | string }, idx: number) => (
                            <tr key={item.id || idx}>
                              <td className="py-2 px-3 font-medium text-foreground">{item.name}</td>
                              <td className="py-2 px-3 text-right">{Number(item.quantity)}</td>
                              <td className="py-2 px-3 text-right">{formatInr(item.unit_price)}</td>
                              <td className="py-2 px-3 text-right font-semibold">
                                {formatInr(item.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {selectedHistoryRow?.invoice_id && (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
                  {selectedHistoryRow.web_url && (
                    <Link href={selectedHistoryRow.web_url} target="_blank">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Web Bill
                      </Button>
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => streamInvoicePdf(selectedHistoryRow.invoice_id!, "thermal")}
                  >
                    <Printer className="h-3.5 w-3.5 mr-1.5" />
                    Thermal PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => streamInvoicePdf(selectedHistoryRow.invoice_id!, "a4")}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    View A4 PDF
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadInvoicePdf(
                        selectedHistoryRow.invoice_id!,
                        selectedHistoryRow.invoice_number,
                        "a4"
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download PDF
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
