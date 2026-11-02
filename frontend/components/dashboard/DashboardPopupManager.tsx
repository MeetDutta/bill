"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  posApi,
  transactionApi,
  invoiceApi,
  quotationApi,
} from "@/services/api";
import {
  TrendingUp,
  Receipt,
  RotateCcw,
  Boxes,
  CreditCard,
  Banknote,
  QrCode,
  DollarSign,
  AlertTriangle,
  Clock,
  Printer,
  Download,
  ArrowRight,
  Plus,
  CheckCircle2,
  Calendar,
  User as UserIcon,
  Phone,
  FileCheck,
  PackageX,
  X,
  RefreshCw,
  BarChart3,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { printThermalReceipt, downloadInvoicePdf } from "@/lib/receiptPrinter";
import type { DashboardData } from "@/types";

export type DashboardPopup =
  | { type: "sales_overview"; initialTab?: "overview" | "profit" | "payments" | "comparison" | "hourly" }
  | { type: "payment_method"; method: string }
  | { type: "recent_bills" }
  | { type: "invoice_details"; id: string; invoiceNumber?: string }
  | { type: "quotation_details"; id: string; quotationNumber?: string }
  | { type: "return_details"; id: string; returnNumber?: string }
  | { type: "date_details"; date: string; formattedDate: string; revenue: number; profit?: number; transactions: number }
  | { type: "low_stock" }
  | { type: "pending_payments" }
  | { type: "returns" }
  | { type: "quick_product" }
  | null;

interface DashboardPopupManagerProps {
  popup: DashboardPopup;
  onClose: () => void;
  dashboardData: DashboardData | null;
  config?: any;
  onRefreshDashboard?: () => void;
}

export function DashboardPopupManager({
  popup,
  onClose,
  dashboardData,
  config,
  onRefreshDashboard,
}: DashboardPopupManagerProps) {
  // Shared state for lazy-fetched data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab state for Centralized Analytics Popup
  const [analyticsTab, setAnalyticsTab] = useState<"overview" | "profit" | "payments" | "comparison" | "hourly">("overview");

  // Specific fetched data stores
  const [paymentLedger, setPaymentLedger] = useState<any[]>([]);
  const [invoiceDetail, setInvoiceDetail] = useState<any | null>(null);
  const [quotationDetail, setQuotationDetail] = useState<any | null>(null);
  const [returnDetail, setReturnDetail] = useState<any | null>(null);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [recentReturnsList, setRecentReturnsList] = useState<any[]>([]);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Quick Product Form State
  const [newProd, setNewProd] = useState({
    name: "",
    sku: "",
    category: "General",
    unit: "PCS",
    selling_price: "",
    purchase_price: "",
    opening_stock: "0",
    min_stock: "5",
    tax_rate: "18",
  });
  const [prodSubmitting, setProdSubmitting] = useState(false);
  const [prodSuccess, setProdSuccess] = useState(false);

  // Sync initial tab when opening sales_overview
  useEffect(() => {
    if (popup && popup.type === "sales_overview" && popup.initialTab) {
      setAnalyticsTab(popup.initialTab);
    } else if (popup && popup.type === "sales_overview") {
      setAnalyticsTab("overview");
    }
  }, [popup]);

  // Fetch lazy data when popup changes
  useEffect(() => {
    if (!popup) {
      setError(null);
      setPaymentLedger([]);
      setInvoiceDetail(null);
      setQuotationDetail(null);
      setReturnDetail(null);
      setLowStockProducts([]);
      setPendingInvoices([]);
      setRecentReturnsList([]);
      setProdSuccess(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (popup.type === "payment_method") {
          const res = await posApi.getPaymentLedger({
            payment_method: popup.method.toLowerCase(),
          });
          const list = res.data?.results || res.data || [];
          setPaymentLedger(Array.isArray(list) ? list : []);
        } else if (popup.type === "invoice_details") {
          try {
            const res = await transactionApi.get(popup.id);
            setInvoiceDetail(res.data);
          } catch {
            const invRes = await invoiceApi.get(popup.id);
            setInvoiceDetail(invRes.data);
          }
        } else if (popup.type === "quotation_details") {
          const res = await quotationApi.get(popup.id);
          setQuotationDetail(res.data);
        } else if (popup.type === "return_details") {
          const res = await posApi.getReturnsReport();
          const list = res.data?.results || res.data || [];
          const match = Array.isArray(list)
            ? list.find(
                (r: any) =>
                  r.id === popup.id ||
                  r.return_number === popup.returnNumber ||
                  r.return_number === popup.id
              )
            : null;
          setReturnDetail(match || { id: popup.id, return_number: popup.returnNumber || "RET-UNKNOWN" });
        } else if (popup.type === "low_stock") {
          const res = await posApi.searchProducts({ low_stock: true, page_size: 25 });
          const items = res.data?.results || res.data?.products || (Array.isArray(res.data) ? res.data : []);
          setLowStockProducts(items);
        } else if (popup.type === "pending_payments") {
          const res = await invoiceApi.list({ payment_status: "partial", page_size: 25 });
          const list = res.data?.results || (Array.isArray(res.data) ? res.data : []);
          setPendingInvoices(list);
        } else if (popup.type === "returns") {
          const res = await posApi.getReturnsReport();
          const list = res.data?.results || res.data || [];
          setRecentReturnsList(Array.isArray(list) ? list : []);
        }
      } catch (err: any) {
        console.error("Popup data load error:", err);
        setError("Unable to load latest details from server.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [popup]);

  // Quick Product Submission
  const handleQuickCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProd.name.trim()) {
      setError("Product name is required.");
      return;
    }
    setProdSubmitting(true);
    setError(null);
    try {
      await posApi.quickCreateProduct({
        name: newProd.name.trim(),
        sku: newProd.sku.trim() || `SKU-${Date.now().toString().slice(-6)}`,
        category: newProd.category || "General",
        unit: newProd.unit || "PCS",
        selling_price: parseFloat(newProd.selling_price) || 0,
        purchase_price: parseFloat(newProd.purchase_price) || 0,
        opening_stock: parseFloat(newProd.opening_stock) || 0,
        min_stock: parseFloat(newProd.min_stock) || 5,
        tax_rate: parseFloat(newProd.tax_rate) || 18,
      });
      setProdSuccess(true);
      if (onRefreshDashboard) onRefreshDashboard();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create product.");
    } finally {
      setProdSubmitting(false);
    }
  };

  const handlePrintReceipt = (data: any) => {
    if (!data) return;
    const invoiceId = data.invoice?.id || data.invoice_id || data.id;
    const invoiceNumber = data.invoice_number || data.invoice?.invoice_number || "INV-000";
    const customerName = data.customer?.name || data.customer?.full_name || "Walk-in Customer";
    const total = Number(data.total || 0);
    const subtotal = Number(data.subtotal || 0);
    const discount = Number(data.discount || 0);
    const tax = Number(data.tax || 0);
    const roundOff = Number(data.round_off || 0);
    const amountPaid = Number(data.amount_paid ?? total);
    const changeAmount = Number(data.change_amount || 0);
    const paymentStatus = (data.payment_status || "paid").toUpperCase();
    const paymentMethod = (data.payment_method || "cash").toUpperCase();

    const printPayload = {
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      transaction_date: data.transaction_date,
      created_at: data.created_at,
      seller: {
        name: config?.trade_name || config?.name || "BILLMEET RETAIL",
        legal_name: config?.legal_name || "",
        trade_name: config?.trade_name || "BILLMEET RETAIL",
        gstin: config?.gstin || "",
        address: config?.address || "",
        phone: config?.phone || "",
        email: config?.email || "",
        invoice_footer: config?.invoice_footer || "Thank you for shopping with us! Visit again.",
      },
      customer: {
        name: customerName,
        phone: data.customer?.phone || "",
        gstin: data.customer?.gstin || "",
      },
      items: (data.items || []).map((it: any) => ({
        name: it.product_name || it.product?.name || "Item",
        quantity: Number(it.quantity || 1),
        unit_price: Number(it.unit_price || 0),
        tax_rate: Number(it.tax_rate || 0),
        total: Number(it.total || 0),
      })),
      totals: {
        subtotal,
        discount,
        tax,
        round_off: roundOff,
        grand_total: total,
        amount_paid: amountPaid,
        change_amount: changeAmount,
      },
      payment: {
        method: paymentMethod,
        status: paymentStatus,
      },
    };

    printThermalReceipt(printPayload as any);
  };

  const handleDownloadPdf = async (id: string, num: string) => {
    setDownloadingPdf(true);
    try {
      await downloadInvoicePdf(id, num);
    } catch {
      window.open(`/api/v1/invoices/${id}/pdf/`, "_blank");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Authoritative calculations from dashboardData
  const todayNetSales = Number(dashboardData?.today_net_sales ?? dashboardData?.today_gross_sales ?? 0);
  const todayGrossSales = Number(dashboardData?.today_gross_sales || 0);
  const todayCount = Number(dashboardData?.today_transactions_count || 0);
  const todayOutstanding = Number(dashboardData?.today_outstanding || 0);
  const lowStockCount = Number(dashboardData?.low_stock_count || 0);
  const estimatedProfit = Number(dashboardData?.estimated_gross_profit || 0);
  const profitMarginPct = todayNetSales > 0 ? ((estimatedProfit / todayNetSales) * 100).toFixed(1) : "0.0";
  const paymentBreakdown = dashboardData?.payment_methods_breakdown || [];
  const hourlySales = dashboardData?.hourly_sales || [];
  const salesTrend30 = dashboardData?.sales_trend_30 || [];

  // Comparison metrics calculation
  const comparisons = useMemo(() => {
    const trend = dashboardData?.sales_trend_30 || [];
    if (trend.length < 14) return null;
    // Current week: days 23..29
    const currWeek = trend.slice(-7);
    // Prior week: days 16..22
    const priorWeek = trend.slice(-14, -7);

    const currWeekRev = currWeek.reduce((s, d) => s + Number(d.revenue || 0), 0);
    const priorWeekRev = priorWeek.reduce((s, d) => s + Number(d.revenue || 0), 0);
    const currWeekBills = currWeek.reduce((s, d) => s + Number(d.transactions || 0), 0);
    const priorWeekBills = priorWeek.reduce((s, d) => s + Number(d.transactions || 0), 0);
    const currWeekProfit = currWeek.reduce((s, d) => s + Number(d.profit || 0), 0);
    const priorWeekProfit = priorWeek.reduce((s, d) => s + Number(d.profit || 0), 0);

    const weekRevDiff = currWeekRev - priorWeekRev;
    const weekRevGrowth = priorWeekRev > 0 ? (weekRevDiff / priorWeekRev) * 100 : 0;

    return {
      currWeekRev,
      priorWeekRev,
      weekRevDiff,
      weekRevGrowth: Math.round(weekRevGrowth),
      currWeekBills,
      priorWeekBills,
      billsDiff: currWeekBills - priorWeekBills,
      currWeekProfit,
      priorWeekProfit,
    };
  }, [dashboardData?.sales_trend_30]);

  // Hourly Peak analysis
  const peakHour = useMemo(() => {
    const hourly = dashboardData?.hourly_sales || [];
    if (hourly.length === 0) return null;
    let max = hourly[0];
    for (const h of hourly) {
      if (h.sales > max.sales) max = h;
    }
    const hourLabel = typeof max.hour === "number" ? `${String(max.hour).padStart(2, "0")}:00` : String(max.hour);
    return {
      hourLabel,
      sales: Number(max.sales || 0),
    };
  }, [dashboardData?.hourly_sales]);

  if (!popup) return null;

  return (
    <Dialog open={popup !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md sm:max-w-xl p-5 sm:p-6 max-h-[92dvh] overflow-y-auto">
        {/* ================================================================= */}
        {/* POPUP 1: CENTRALIZED SALES & ANALYTICS AUDIT (TABBED)             */}
        {/* ================================================================= */}
        {popup.type === "sales_overview" && (
          <div className="space-y-4">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-600">
                  <BarChart3 className="h-5 w-5" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Executive Analytics
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  Today & Historical Trends
                </span>
              </div>
              <DialogTitle className="text-xl font-black">Sales & Financial Intelligence</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Authoritative multi-dimensional breakdown of sales velocity, profit, and checkout trends.
              </DialogDescription>
            </DialogHeader>

            {/* Sub-Tabs Navigation */}
            <div className="flex items-center gap-1 border-b pb-2 overflow-x-auto text-xs font-bold scrollbar-none">
              <button
                type="button"
                onClick={() => setAnalyticsTab("overview")}
                className={`px-3 py-1.5 rounded-md transition-colors shrink-0 ${
                  analyticsTab === "overview"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Sales Overview
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsTab("profit")}
                className={`px-3 py-1.5 rounded-md transition-colors shrink-0 ${
                  analyticsTab === "profit"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Gross Profit
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsTab("payments")}
                className={`px-3 py-1.5 rounded-md transition-colors shrink-0 ${
                  analyticsTab === "payments"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Payment Channels
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsTab("comparison")}
                className={`px-3 py-1.5 rounded-md transition-colors shrink-0 ${
                  analyticsTab === "comparison"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Comparisons
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsTab("hourly")}
                className={`px-3 py-1.5 rounded-md transition-colors shrink-0 ${
                  analyticsTab === "hourly"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Peak Hours
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {analyticsTab === "overview" && (
              <div className="space-y-3.5">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
                  <span className="text-xs font-semibold text-muted-foreground">Today&apos;s Net Sales</span>
                  <div className="text-3xl font-black text-emerald-600 mt-0.5">
                    {formatCurrency(todayNetSales)}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Gross Billings: <strong className="text-foreground">{formatCurrency(todayGrossSales)}</strong> ·
                    Discounts: <strong className="text-emerald-700">-{formatCurrency(Number(dashboardData?.today_discounts || 0))}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <span className="text-muted-foreground font-semibold text-[11px]">Completed Bills</span>
                    <p className="text-lg font-black text-foreground mt-0.5">{todayCount}</p>
                    <span className="text-[10px] text-muted-foreground">Customer checkouts today</span>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <span className="text-muted-foreground font-semibold text-[11px]">Gross Profit</span>
                    <p className="text-lg font-black text-emerald-600 mt-0.5">
                      {formatCurrency(estimatedProfit)}
                    </p>
                    <span className="text-[10px] text-muted-foreground">{profitMarginPct}% operating margin</span>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <span className="text-muted-foreground font-semibold text-[11px]">Customer Receivables</span>
                    <p className={`text-lg font-black mt-0.5 ${todayOutstanding > 0 ? "text-red-600" : "text-foreground"}`}>
                      {formatCurrency(todayOutstanding)}
                    </p>
                    <span className="text-[10px] text-muted-foreground">Unpaid credit balances</span>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <span className="text-muted-foreground font-semibold text-[11px]">Returns Refunded</span>
                    <p className="text-lg font-black text-foreground mt-0.5">
                      {formatCurrency(Number(dashboardData?.today_returns || 0))}
                    </p>
                    <span className="text-[10px] text-muted-foreground">Reversed transactions</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Link
                    href="/dashboard/billing?view=history&date=today"
                    className="flex-1"
                    onClick={onClose}
                  >
                    <Button className="w-full gap-1.5 font-bold h-10 touch-target-min">
                      <Receipt className="h-4 w-4" /> View Today&apos;s Invoices
                    </Button>
                  </Link>
                  <Link
                    href="/dashboard/reports/sales?period=today"
                    className="flex-1"
                    onClick={onClose}
                  >
                    <Button variant="outline" className="w-full gap-1.5 font-bold h-10 touch-target-min">
                      <TrendingUp className="h-4 w-4" /> Sales Report
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* TAB 2: GROSS PROFIT */}
            {analyticsTab === "profit" && (
              <div className="space-y-3.5">
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 text-center">
                  <span className="text-xs font-semibold text-muted-foreground">COGS Gross Profit Today</span>
                  <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {formatCurrency(estimatedProfit)}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Operating Margin: <strong className="text-foreground">{profitMarginPct}%</strong>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <span className="text-muted-foreground font-semibold text-[11px]">Net Sales</span>
                    <p className="text-lg font-black text-foreground mt-0.5">{formatCurrency(todayNetSales)}</p>
                    <span className="text-[10px] text-muted-foreground">Bill revenue less discounts</span>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <span className="text-muted-foreground font-semibold text-[11px]">Cost of Goods (COGS)</span>
                    <p className="text-lg font-black text-foreground mt-0.5">
                      {formatCurrency(Math.max(0, todayNetSales - estimatedProfit))}
                    </p>
                    <span className="text-[10px] text-muted-foreground">Recorded item purchase cost</span>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/10 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Cost Accounting Verification</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Gross profit is calculated on exact product purchase unit costs (<code className="font-mono">unit_price - cost_price</code>). Items without recorded purchase costs default to baseline selling rates.
                  </p>
                </div>

                <div className="flex gap-2 pt-1">
                  <Link href="/dashboard/purchases" className="flex-1" onClick={onClose}>
                    <Button variant="outline" className="w-full font-bold h-10 touch-target-min">
                      Purchase Invoices
                    </Button>
                  </Link>
                  <Link href="/dashboard/inventory" className="flex-1" onClick={onClose}>
                    <Button className="w-full font-bold h-10 touch-target-min bg-indigo-600 hover:bg-indigo-700">
                      Manage Stock Ledger
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* TAB 3: PAYMENT CHANNELS */}
            {analyticsTab === "payments" && (
              <div className="space-y-3.5">
                <div className="rounded-lg border bg-muted/20 p-3 text-xs flex items-center justify-between">
                  <div>
                    <span className="text-muted-foreground text-[10px] block uppercase font-bold">Total Reconciled Collections</span>
                    <span className="font-mono font-black text-xl text-foreground">
                      {formatCurrency(Number(dashboardData?.today_collected || 0))}
                    </span>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {paymentBreakdown.reduce((acc, p) => acc + p.count, 0)} payments
                  </Badge>
                </div>

                <div className="space-y-2">
                  {paymentBreakdown.map((item) => {
                    const method = item.payment_method.toUpperCase();
                    return (
                      <div key={item.payment_method} className="p-3 rounded-lg border bg-card text-xs space-y-1.5">
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-foreground">{method}</span>
                          <span className="font-mono text-foreground">{formatCurrency(item.total)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{item.count} checkouts</span>
                          <span className="font-mono font-semibold">{item.percentage}% share</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${
                              method === "CASH" ? "bg-emerald-500" : method === "UPI" ? "bg-slate-900 dark:bg-slate-100" : "bg-blue-600"
                            }`}
                            style={{ width: `${Math.min(100, item.percentage)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-1">
                  <Link href="/dashboard/finance/payments" onClick={onClose}>
                    <Button variant="outline" className="w-full font-bold h-10 touch-target-min">
                      Open Complete Payment Ledger
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* TAB 4: SALES COMPARISON */}
            {analyticsTab === "comparison" && (
              <div className="space-y-3.5 text-xs">
                {comparisons ? (
                  <>
                    <div className="rounded-xl border bg-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">Current 7 Days vs Prior 7 Days</span>
                        <span
                          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-bold ${
                            comparisons.weekRevGrowth >= 0
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "bg-red-500/10 text-red-700 dark:text-red-400"
                          }`}
                        >
                          {comparisons.weekRevGrowth >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {comparisons.weekRevGrowth >= 0 ? "+" : ""}
                          {comparisons.weekRevGrowth}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="p-2.5 rounded-lg border bg-muted/20">
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Current Week Revenue</span>
                          <p className="font-mono font-black text-base text-foreground mt-0.5">
                            {formatCurrency(comparisons.currWeekRev)}
                          </p>
                          <span className="text-[10px] text-muted-foreground">{comparisons.currWeekBills} bills issued</span>
                        </div>
                        <div className="p-2.5 rounded-lg border bg-muted/20">
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Prior Week Baseline</span>
                          <p className="font-mono font-black text-base text-muted-foreground mt-0.5">
                            {formatCurrency(comparisons.priorWeekRev)}
                          </p>
                          <span className="text-[10px] text-muted-foreground">{comparisons.priorWeekBills} bills issued</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t text-[11px] text-muted-foreground">
                        <span>Net Difference:</span>
                        <span className={`font-mono font-bold ${comparisons.weekRevDiff >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {comparisons.weekRevDiff >= 0 ? "+" : ""}
                          {formatCurrency(comparisons.weekRevDiff)}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-muted/10 p-3 text-xs flex items-center justify-between">
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-bold">Month-to-Date Volume</span>
                        <p className="font-mono font-bold text-base text-foreground">
                          {formatCurrency(Number(dashboardData?.month_revenue || 0))}
                        </p>
                      </div>
                      <Link href="/dashboard/reports/sales?period=month" onClick={onClose}>
                        <Button size="sm" variant="outline" className="h-8 text-xs font-bold">
                          Month Report
                        </Button>
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                    Comparative analytics require at least 14 days of store transaction records.
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: HOURLY PERFORMANCE */}
            {analyticsTab === "hourly" && (
              <div className="space-y-3.5 text-xs">
                {peakHour && peakHour.sales > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Flame className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                        Peak Checkout Velocity
                      </span>
                      <p className="font-bold text-foreground">
                        {peakHour.hourLabel} was your peak sales window ({formatCurrency(peakHour.sales)})
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <span className="font-bold text-muted-foreground text-[11px] uppercase tracking-wider block">
                    Today&apos;s 24-Hour Velocity
                  </span>
                  <div className="max-h-56 overflow-y-auto divide-y divide-border border rounded-lg bg-card">
                    {(hourlySales || []).filter((h) => h.sales > 0).length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        No transactions registered yet today across hourly buckets.
                      </div>
                    ) : (
                      hourlySales
                        .filter((h) => h.sales > 0)
                        .map((h, idx) => (
                          <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-muted/30">
                            <span className="font-mono font-semibold text-foreground">
                              {typeof h.hour === "number" ? `${String(h.hour).padStart(2, "0")}:00` : h.hour}
                            </span>
                            <span className="font-mono font-bold text-emerald-600">
                              {formatCurrency(h.sales)}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                <div className="pt-1">
                  <Button variant="outline" onClick={onClose} className="w-full font-bold h-10 touch-target-min">
                    Close Audit
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* POPUP: DATE NODE DETAILS (CLICKED ON SALES GRAPH)                  */}
        {/* ================================================================= */}
        {popup.type === "date_details" && (
          <div className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-foreground mb-1">
                <Calendar className="h-5 w-5 text-emerald-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Historical Audit</span>
              </div>
              <DialogTitle className="text-xl font-black">{popup.formattedDate}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Recorded sales volume and completed checkouts for {popup.date}.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
              <span className="text-xs font-semibold text-muted-foreground">Day Total Revenue</span>
              <div className="text-3xl font-black text-emerald-600 mt-0.5">
                {formatCurrency(popup.revenue)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Completed Bills: <strong className="text-foreground">{popup.transactions}</strong>
              </p>
            </div>

            {popup.profit !== undefined && popup.profit > 0 && (
              <div className="rounded-lg border bg-muted/20 p-3 text-xs flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Estimated Gross Profit</span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(popup.profit)}
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Link
                href={`/dashboard/billing?view=history&date=${encodeURIComponent(popup.date)}`}
                className="flex-1"
                onClick={onClose}
              >
                <Button className="w-full gap-1.5 font-bold h-10 touch-target-min">
                  <Receipt className="h-4 w-4" /> Filter Invoices on This Date
                </Button>
              </Link>
              <Button variant="outline" onClick={onClose} className="h-10 px-4">
                Close
              </Button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* POPUP 2: PAYMENT METHOD TRANSACTIONS                              */}
        {/* ================================================================= */}
        {popup.type === "payment_method" && (() => {
          const method = popup.method.toUpperCase();
          const item = paymentBreakdown.find((p) => p.payment_method.toUpperCase() === method) || {
            payment_method: method,
            total: 0,
            count: 0,
            percentage: 0,
          };

          return (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-2 text-foreground mb-1">
                  {method === "CASH" ? (
                    <Banknote className="h-5 w-5 text-emerald-600" />
                  ) : method === "UPI" ? (
                    <QrCode className="h-5 w-5 text-foreground" />
                  ) : (
                    <CreditCard className="h-5 w-5 text-slate-700" />
                  )}
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {method} Payment Channel
                  </span>
                </div>
                <DialogTitle className="text-xl font-black">{method} Breakdown</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Individual transactions recorded and reconciled via {method}.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-center">
                <span className="text-xs font-semibold text-muted-foreground">
                  Total {method} Collected
                </span>
                <div className="text-2xl sm:text-3xl font-black text-foreground mt-0.5">
                  {formatCurrency(item.total)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Reconciled across <strong className="text-foreground">{item.count}</strong> transactions
                  ({item.percentage}% share)
                </p>
              </div>

              {/* Transactions List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground px-1">
                  <span>Recent Recorded Transactions</span>
                  <span>{paymentLedger.length} items</span>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Loading payment transactions...</span>
                  </div>
                ) : paymentLedger.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                    No individual {method} transactions recorded yet today.
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-border border rounded-lg bg-card text-xs">
                    {paymentLedger.slice(0, 15).map((pay: any) => (
                      <div key={pay.id} className="p-3 flex items-center justify-between hover:bg-muted/40 transition-colors">
                        <div>
                          <div className="font-mono font-bold text-foreground">
                            #{pay.invoice_or_ref || pay.invoice_number || "POS-SALE"}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {pay.entity_name || "Walk-in Customer"} · {pay.date ? new Date(pay.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Today"}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-foreground">
                            {formatCurrency(pay.amount)}
                          </span>
                          <span className="block text-[10px] uppercase font-bold text-emerald-600">
                            {pay.status || "Completed"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Link
                  href={`/dashboard/billing?view=history&payment_method=${encodeURIComponent(method)}&date=today`}
                  className="flex-1"
                  onClick={onClose}
                >
                  <Button className="w-full gap-1.5 font-bold h-10 touch-target-min">
                    <Receipt className="h-4 w-4" /> Filter {method} Invoices
                  </Button>
                </Link>
                <Button variant="outline" onClick={onClose} className="h-10 px-4">
                  Close
                </Button>
              </div>
            </div>
          );
        })()}

        {/* ================================================================= */}
        {/* POPUP 3: INVOICE / RECEIPT DETAILS                                */}
        {/* ================================================================= */}
        {popup.type === "invoice_details" && (
          <div className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-foreground mb-1">
                <Receipt className="h-5 w-5 text-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-wider font-mono">
                  #{popup.invoiceNumber || invoiceDetail?.invoice_number || "INVOICE"}
                </span>
              </div>
              <DialogTitle className="text-xl font-black">Invoice & Receipt Details</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Authentic retail tax receipt and item breakdown.
              </DialogDescription>
            </DialogHeader>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Fetching verified bill details...</span>
              </div>
            ) : invoiceDetail ? (
              <div className="space-y-3.5">
                <div className="rounded-lg border bg-muted/20 p-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[10px] block uppercase font-semibold">Customer</span>
                    <p className="font-bold text-foreground">
                      {invoiceDetail.customer?.full_name || invoiceDetail.customer?.name || "Walk-in Customer"}
                    </p>
                    {invoiceDetail.customer?.phone && (
                      <p className="text-[11px] text-muted-foreground">{invoiceDetail.customer.phone}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground text-[10px] block uppercase font-semibold">Date & Time</span>
                    <p className="font-medium text-foreground">
                      {formatDateTime(invoiceDetail.transaction_date || invoiceDetail.created_at)}
                    </p>
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      {invoiceDetail.payment_status || "PAID"}
                    </span>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden text-xs">
                  <div className="bg-muted/40 font-bold px-3 py-2 flex items-center justify-between text-muted-foreground text-[11px] border-b">
                    <span>ITEM</span>
                    <span>TOTAL</span>
                  </div>
                  <div className="divide-y divide-border max-h-48 overflow-y-auto">
                    {(invoiceDetail.items || []).map((it: any, idx: number) => (
                      <div key={idx} className="px-3 py-2 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{it.product_name || it.product?.name || "Item"}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {it.quantity} × {formatCurrency(it.unit_price)}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-foreground">{formatCurrency(it.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/10 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatCurrency(invoiceDetail.subtotal || invoiceDetail.total)}</span>
                  </div>
                  {Number(invoiceDetail.discount || 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Discount</span>
                      <span className="text-emerald-600">-{formatCurrency(invoiceDetail.discount)}</span>
                    </div>
                  )}
                  {Number(invoiceDetail.tax || 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxes (GST)</span>
                      <span>+{formatCurrency(invoiceDetail.tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm text-foreground pt-1 border-t">
                    <span>Grand Total</span>
                    <span>{formatCurrency(invoiceDetail.total)}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button
                    onClick={() => handlePrintReceipt(invoiceDetail)}
                    className="flex-1 gap-1.5 font-bold h-10 touch-target-min"
                  >
                    <Printer className="h-4 w-4" /> Print Thermal Receipt
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadPdf(invoiceDetail.id, invoiceDetail.invoice_number)}
                    disabled={downloadingPdf}
                    className="flex-1 gap-1.5 font-bold h-10 touch-target-min"
                  >
                    <Download className={`h-4 w-4 ${downloadingPdf ? "animate-spin" : ""}`} />
                    <span>Download PDF</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Invoice details could not be retrieved.
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* POPUP 4: QUOTATION DETAILS                                        */}
        {/* ================================================================= */}
        {popup.type === "quotation_details" && (
          <div className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-foreground mb-1">
                <FileCheck className="h-5 w-5 text-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-wider font-mono">
                  #{popup.quotationNumber || quotationDetail?.quotation_number || "QUOTATION"}
                </span>
              </div>
              <DialogTitle className="text-xl font-black">Quotation Details</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Quoted items, customer details, and conversion status.
              </DialogDescription>
            </DialogHeader>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Loading quotation details...</span>
              </div>
            ) : quotationDetail ? (
              <div className="space-y-3.5">
                <div className="rounded-lg border bg-muted/20 p-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[10px] block uppercase font-semibold">Customer</span>
                    <p className="font-bold text-foreground">
                      {quotationDetail.customer_name || quotationDetail.customer?.full_name || "Customer"}
                    </p>
                    {quotationDetail.customer_phone && (
                      <p className="text-[11px] text-muted-foreground">{quotationDetail.customer_phone}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground text-[10px] block uppercase font-semibold">Valid Until</span>
                    <p className="font-medium text-foreground">
                      {quotationDetail.valid_until || "15 Days"}
                    </p>
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-700 dark:text-blue-400">
                      {quotationDetail.status || "DRAFT"}
                    </span>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden text-xs">
                  <div className="bg-muted/40 font-bold px-3 py-2 flex items-center justify-between text-muted-foreground text-[11px] border-b">
                    <span>ITEM</span>
                    <span>TOTAL</span>
                  </div>
                  <div className="divide-y divide-border max-h-48 overflow-y-auto">
                    {(quotationDetail.items || []).map((it: any, idx: number) => (
                      <div key={idx} className="px-3 py-2 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{it.name || "Item"}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {it.quantity} × {formatCurrency(it.unit_price)}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-foreground">{formatCurrency(it.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between font-black text-sm text-foreground p-3 bg-muted/20 rounded-lg border">
                  <span>Total Quoted Amount</span>
                  <span>{formatCurrency(quotationDetail.total)}</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Link
                    href={`/dashboard/billing?quotation_id=${quotationDetail.id}`}
                    className="flex-1"
                    onClick={onClose}
                  >
                    <Button className="w-full gap-1.5 font-bold h-10 touch-target-min bg-emerald-600 hover:bg-emerald-700">
                      <CreditCard className="h-4 w-4" /> Convert at POS
                    </Button>
                  </Link>
                  <Link href="/dashboard/quotations" className="flex-1" onClick={onClose}>
                    <Button variant="outline" className="w-full font-bold h-10 touch-target-min">
                      View All Quotes
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Quotation details could not be found.
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* POPUP 5: RETURN DETAILS                                           */}
        {/* ================================================================= */}
        {popup.type === "return_details" && (
          <div className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <RotateCcw className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-wider font-mono">
                  #{popup.returnNumber || returnDetail?.return_number || "RETURN"}
                </span>
              </div>
              <DialogTitle className="text-xl font-black">Sales Return Record</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Credit note details, restocked inventory, and refund payout.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-center">
              <span className="text-xs font-semibold text-muted-foreground">Refunded Amount</span>
              <div className="text-3xl font-black text-red-600 mt-0.5">
                {formatCurrency(returnDetail?.total_refund_amount || returnDetail?.refund_amount || 0)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Method: <strong className="text-foreground">{returnDetail?.refund_method || "CASH"}</strong>
              </p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original Invoice</span>
                <span className="font-mono font-bold text-foreground">
                  #{returnDetail?.original_invoice_number || returnDetail?.invoice_number || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date Recorded</span>
                <span>{returnDetail?.created_at ? formatDateTime(returnDetail.created_at) : "Today"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Inventory Restocked</span>
                <span className="font-bold text-emerald-600">
                  {returnDetail?.restock_inventory !== false ? "Yes" : "No"}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Link href="/dashboard/returns" className="flex-1" onClick={onClose}>
                <Button className="w-full gap-1.5 font-bold h-10 touch-target-min">
                  <RotateCcw className="h-4 w-4" /> Returns Workspace
                </Button>
              </Link>
              <Button variant="outline" onClick={onClose} className="h-10 px-4">
                Close
              </Button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* POPUP 6: LOW STOCK PRODUCTS                                       */}
        {/* ================================================================= */}
        {popup.type === "low_stock" && (
          <div className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-amber-600 mb-1">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Inventory Depletion Warning
                </span>
              </div>
              <DialogTitle className="text-xl font-black">Low-Stock Products</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Products on shelf operating at or below the configured reorder threshold.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground px-1">
                <span>Items Requiring Replenishment</span>
                <span>{lowStockProducts.length || lowStockCount} items</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading depleted inventory...</span>
                </div>
              ) : lowStockProducts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No items currently below minimum stock threshold!
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto divide-y divide-border border rounded-lg bg-card text-xs">
                  {lowStockProducts.map((p: any) => {
                    const currentStock = Number(p.current_stock ?? p.stock ?? 0);
                    const minStock = Number(p.min_stock || 5);
                    const isZero = currentStock <= 0;
                    return (
                      <div key={p.id} className="p-3 flex items-center justify-between hover:bg-muted/40 transition-colors">
                        <div>
                          <p className="font-bold text-foreground">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            SKU: {p.sku} · {p.category_name || p.category || "General"}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`font-mono font-black text-sm ${isZero ? "text-red-600" : "text-amber-600"}`}>
                            {currentStock} {p.unit || "PCS"}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            Min: {minStock}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Link href="/dashboard/inventory?filter=low_stock" className="flex-1" onClick={onClose}>
                <Button className="w-full gap-1.5 font-bold h-10 touch-target-min">
                  <Boxes className="h-4 w-4" /> Manage Inventory
                </Button>
              </Link>
              <Link href="/dashboard/purchases" className="flex-1" onClick={onClose}>
                <Button variant="outline" className="w-full gap-1.5 font-bold h-10 touch-target-min">
                  Create Purchase Order
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* POPUP 7: PENDING PAYMENTS (RECEIVABLES)                           */}
        {/* ================================================================= */}
        {popup.type === "pending_payments" && (
          <div className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <CreditCard className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Customer Dues & Receivables
                </span>
              </div>
              <DialogTitle className="text-xl font-black">Pending Payments</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Invoices with outstanding balances and customer credit lines.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-center">
              <span className="text-xs font-semibold text-muted-foreground">Total Customer Receivables</span>
              <div className="text-3xl font-black text-red-600 mt-0.5">
                {formatCurrency(todayOutstanding || Number(dashboardData?.customer_dues || 0))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Awaiting collection across open customer credit accounts
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground px-1">
                <span>Recent Pending Invoices</span>
                <span>{pendingInvoices.length} invoices</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading receivables...</span>
                </div>
              ) : pendingInvoices.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No partial or unpaid invoices currently outstanding.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto divide-y divide-border border rounded-lg bg-card text-xs">
                  {pendingInvoices.map((inv: any) => (
                    <div key={inv.id} className="p-3 flex items-center justify-between hover:bg-muted/40 transition-colors">
                      <div>
                        <span className="font-mono font-bold text-foreground">
                          #{inv.invoice_number}
                        </span>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {inv.customer?.full_name || "Customer"} · Total: {formatCurrency(inv.total)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-sm text-red-600 block">
                          Due: {formatCurrency(inv.outstanding_amount || inv.total)}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">
                          {inv.payment_status || "PARTIAL"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Link href="/dashboard/finance/receivables" className="flex-1" onClick={onClose}>
                <Button className="w-full gap-1.5 font-bold h-10 touch-target-min">
                  Full Receivables Ledger
                </Button>
              </Link>
              <Button variant="outline" onClick={onClose} className="h-10 px-4">
                Close
              </Button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* POPUP 8: RECENT RETURNS LIST                                      */}
        {/* ================================================================= */}
        {popup.type === "returns" && (
          <div className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <RotateCcw className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Returns & Refunds Ledger
                </span>
              </div>
              <DialogTitle className="text-xl font-black">Recent Sales Returns</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                History of reversed checkout transactions and customer refunds.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading returns ledger...</span>
                </div>
              ) : recentReturnsList.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No sales returns recorded yet.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto divide-y divide-border border rounded-lg bg-card text-xs">
                  {recentReturnsList.slice(0, 15).map((r: any) => (
                    <div key={r.id} className="p-3 flex items-center justify-between hover:bg-muted/40 transition-colors">
                      <div>
                        <span className="font-mono font-bold text-foreground">
                          #{r.return_number || "RET-000"}
                        </span>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Inv: #{r.original_invoice_number || r.invoice_number || "N/A"} · {r.created_at ? new Date(r.created_at).toLocaleDateString() : "Today"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-sm text-red-600 block">
                          -{formatCurrency(r.total_refund_amount || r.refund_amount || 0)}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">
                          {r.refund_method || "CASH"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Link href="/dashboard/returns" className="flex-1" onClick={onClose}>
                <Button className="w-full gap-1.5 font-bold h-10 touch-target-min">
                  <RotateCcw className="h-4 w-4" /> Process New Return
                </Button>
              </Link>
              <Button variant="outline" onClick={onClose} className="h-10 px-4">
                Close
              </Button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* POPUP 9: QUICK CREATE PRODUCT                                     */}
        {/* ================================================================= */}
        {popup.type === "quick_product" && (
          <form onSubmit={handleQuickCreateProduct} className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-foreground mb-1">
                <Plus className="h-5 w-5 text-emerald-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Catalog Operations</span>
              </div>
              <DialogTitle className="text-xl font-black">Add New Product</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Instantly register a product SKU for immediate POS cashier billing.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-semibold">
                {error}
              </div>
            )}

            {prodSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Product added successfully to catalog!
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Product Name *</label>
                <Input
                  placeholder="e.g. Basmati Rice 1kg / Cotton T-Shirt"
                  value={newProd.name}
                  onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                  required
                  className="h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Selling Price (₹) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newProd.selling_price}
                    onChange={(e) => setNewProd({ ...newProd, selling_price: e.target.value })}
                    required
                    className="h-9 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Cost Price (₹)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newProd.purchase_price}
                    onChange={(e) => setNewProd({ ...newProd, purchase_price: e.target.value })}
                    className="h-9 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Opening Stock</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newProd.opening_stock}
                    onChange={(e) => setNewProd({ ...newProd, opening_stock: e.target.value })}
                    className="h-9 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Min Reorder Level</label>
                  <Input
                    type="number"
                    placeholder="5"
                    value={newProd.min_stock}
                    onChange={(e) => setNewProd({ ...newProd, min_stock: e.target.value })}
                    className="h-9 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Category</label>
                  <Input
                    placeholder="General"
                    value={newProd.category}
                    onChange={(e) => setNewProd({ ...newProd, category: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">GST Tax Rate (%)</label>
                  <select
                    value={newProd.tax_rate}
                    onChange={(e) => setNewProd({ ...newProd, tax_rate: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  >
                    <option value="0">0% (Exempt)</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18% (Standard)</option>
                    <option value="28">28%</option>
                  </select>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={prodSubmitting}
                className="h-10 touch-target-min"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={prodSubmitting || prodSuccess}
                className="h-10 touch-target-min font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {prodSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Saving...
                  </>
                ) : (
                  "Create & Save SKU"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
