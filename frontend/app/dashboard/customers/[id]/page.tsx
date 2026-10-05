"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { engagementApi, customerIntelligenceApi } from "@/services/api";
import type {
  Customer360,
  CustomerHealth,
  ChurnPredictionData,
  NextBestActionData,
  SmartOfferData,
} from "@/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Sparkles,
  MessageCircle,
  ShoppingBag,
  Clock,
  Star,
  Gift,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Award,
  ExternalLink,
  ShieldAlert,
  Tag,
  Zap,
} from "lucide-react";

export default function Customer360Page() {
  const params = useParams();
  const id = params?.id as string;

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

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.allSettled([
      engagementApi.customer360(id),
      customerIntelligenceApi.getHealth(id),
      customerIntelligenceApi.getChurn(id),
      customerIntelligenceApi.getNextAction(id),
      customerIntelligenceApi.getRecommendations(id),
    ])
      .then(([r360, rHealth, rChurn, rAction, rOffer]) => {
        if (r360.status === "fulfilled") setD(r360.value.data);
        if (rHealth.status === "fulfilled") setHealth(rHealth.value.data);
        if (rChurn.status === "fulfilled") setChurn(rChurn.value.data);
        if (rAction.status === "fulfilled") setNextAction(rAction.value.data);
        if (rOffer.status === "fulfilled") setOffer(rOffer.value.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p>Loading Customer 360 intelligence...</p>
        </div>
      </div>
    );
  }

  if (!d) return <div className="p-8">Customer not found.</div>;
  const c = d.customer;

  // Determine health color
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

  return (
    <div className="space-y-6">
      {/* Top Navigation & Profile Header */}
      <Link
        href="/dashboard/customers"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to customers
      </Link>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
              {c.customer_id}
            </p>
            {c.segment && (
              <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-semibold">
                {c.segment}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{c.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {c.phone} {c.email ? `· ${c.email}` : ""} {c.city ? `· ${c.city}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {c.portal_token && (
            <Link href={`/portal/${c.portal_token}`} target="_blank">
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

      {/* KPI Cards Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <span className="text-3xl font-extrabold">{health ? health.score : d.engagement.score}</span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {health ? health.recommended_action.replaceAll("_", " ") : d.engagement.label}
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
                {churn?.churn_risk || "CALCULATING"}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold">
                {churn ? `${churn.churn_probability}%` : "—"}
              </span>
              <span className="text-xs text-muted-foreground">probability</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {churn?.days_since_last_purchase != null
                ? `${churn.days_since_last_purchase}d since last buy (avg ${churn.average_purchase_interval_days}d)`
                : "Behaviour-based prediction"}
            </p>
          </CardContent>
        </Card>

        {/* Lifetime Spend */}
        <Card className="border">
          <CardContent className="p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Lifetime Value
            </p>
            <p className="mt-2 text-3xl font-extrabold">
              ₹{Number(c.total_spend || 0).toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {c.total_purchases} orders · ₹{Number(c.average_order_value || 0).toLocaleString("en-IN")} AOV
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
              {d.loyalty ? Number(d.loyalty.balance).toLocaleString() : "0"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {d.loyalty ? `${d.loyalty.total_earned} total earned` : "No active rewards balance"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* V2 Intelligence Grid: Health "Why?", Churn, Next Best Action, and Smart Offers */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Customer Health Score & "Why?" Card */}
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
                {health?.score || d.engagement.score} / 100 · {health?.status || "STABLE"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Why? Factors */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Why this health score?
              </p>
              <div className="space-y-2">
                {/* Positive factors */}
                {health?.positive_factors && health.positive_factors.length > 0 ? (
                  health.positive_factors.map((factor, i) => (
                    <div key={`pos-${i}`} className="flex items-start gap-2 text-xs bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 p-2 rounded-md border border-emerald-500/20">
                      <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" />
                      <span>{factor}</span>
                    </div>
                  ))
                ) : null}

                {/* Risk factors */}
                {health?.risk_factors && health.risk_factors.length > 0 ? (
                  health.risk_factors.map((factor, i) => (
                    <div key={`risk-${i}`} className="flex items-start gap-2 text-xs bg-amber-500/5 text-amber-700 dark:text-amber-400 p-2 rounded-md border border-amber-500/20">
                      <TrendingDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                      <span>{factor}</span>
                    </div>
                  ))
                ) : null}

                {(!health || (!health.positive_factors?.length && !health.risk_factors?.length)) && (
                  <p className="text-xs text-muted-foreground">Standard cadence metrics calculated.</p>
                )}
              </div>
            </div>

            {/* Churn Prediction Sub-section */}
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

        {/* Next Best Action & Smart Offer Card */}
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
            {/* Next Best Action Rule Output */}
            <div className="rounded-xl border bg-primary/5 p-4">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Zap className="h-4 w-4 text-primary" />
                Action: {nextAction?.action || d.recommended_action.title}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <strong className="text-foreground">Why? </strong>
                {nextAction?.reason || d.recommended_action.reason}
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Channel: <strong className="text-foreground">{nextAction?.recommended_channel || "WhatsApp"}</strong></span>
                <span>·</span>
                <span>Offer: <strong className="text-foreground">{nextAction?.recommended_offer || d.recommended_action.suggested_offer}</strong></span>
              </div>
            </div>

            {/* Smart Offer Recommendation Box */}
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
                    <Button
                      size="sm"
                      onClick={handleCreateOffer}
                      disabled={creatingOffer}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      {creatingOffer ? "Generating..." : "Create Offer"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOfferIgnored(true)}
                    >
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

      {/* Recent Purchases & Timeline History */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Recent Purchases
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {d.transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold">{t.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {t.items} items · {t.payment_method}
                    </p>
                  </div>
                  <p className="font-semibold text-sm">
                    ₹{Number(t.total).toLocaleString("en-IN")}
                  </p>
                </div>
              ))}
              {!d.transactions.length && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No completed purchases yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Customer Timeline & Milestones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {d.timeline.map((e) => (
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
              {!d.timeline.length && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No timeline events recorded yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
