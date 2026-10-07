"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { invoiceApi } from "@/services/api";
import type { Invoice } from "@/types";
import {
  FileText,
  Search,
  Filter,
  Calendar,
  Printer,
  Download,
  Share2,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt,
  ArrowUpDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  CreditCard,
  User,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [invoiceType, setInvoiceType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Detail Modal
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // Fetch Invoices
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoiceApi.list({
        search: searchTerm || undefined,
        payment_status: paymentStatus || undefined,
        invoice_type: invoiceType || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
      });

      const data = res.data;
      if (Array.isArray(data)) {
        setInvoices(data);
        setTotalCount(data.length);
      } else if (data && Array.isArray(data.results)) {
        setInvoices(data.results);
        setTotalCount(data.count || data.results.length);
      } else {
        setInvoices([]);
        setTotalCount(0);
      }
    } catch (err) {
      console.error("Failed to load invoices:", err);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, paymentStatus, invoiceType, startDate, endDate, page]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // View detail
  const handleViewDetail = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    setDetailLoading(true);
    try {
      const res = await invoiceApi.get(inv.id);
      setSelectedInvoice(res.data);
    } catch (err) {
      console.error("Failed to fetch full invoice details:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Generate or open PDF
  const handleOpenPdf = async (inv: Invoice) => {
    if (inv.pdf_url) {
      window.open(inv.pdf_url, "_blank");
      return;
    }
    setPdfGenerating(true);
    try {
      const res = await invoiceApi.generatePdf(inv.id);
      if (res.data?.pdf_url) {
        window.open(res.data.pdf_url, "_blank");
        fetchInvoices();
      } else if (inv.web_url) {
        window.open(inv.web_url, "_blank");
      }
    } catch {
      if (inv.web_url) {
        window.open(inv.web_url, "_blank");
      }
    } finally {
      setPdfGenerating(false);
    }
  };

  // Share via WhatsApp
  const handleShareWhatsApp = (inv: Invoice) => {
    const phone = inv.customer_phone?.replace(/\D/g, "");
    const webUrl = typeof window !== "undefined" ? `${window.location.origin}${inv.web_url || `/bills/${inv.id}`}` : "";
    const text = encodeURIComponent(
      `Hello ${inv.customer_name || "Valued Customer"}, thank you for your purchase! Your invoice #${inv.invoice_number} of ₹${inv.total} is ready. View it here: ${webUrl}`
    );
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  };

  // Print Invoice
  const handlePrint = (inv: Invoice) => {
    if (inv.web_url) {
      const printWin = window.open(inv.web_url, "_blank");
      if (printWin) {
        printWin.focus();
        setTimeout(() => printWin.print(), 1000);
      }
    } else {
      window.print();
    }
  };

  // Summary Metrics
  const totalAmountSum = invoices.reduce((sum, inv) => sum + (parseFloat(String(inv.total)) || 0), 0);
  const paidCount = invoices.filter((i) => i.payment_status?.toLowerCase() === "paid").length;
  const creditCount = invoices.filter((i) => i.payment_status?.toLowerCase() === "credit").length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FileText className="h-4 w-4 text-primary" />
            <span>Sales & Billing</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Invoice Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit, track, print, and download customer tax invoices & receipts
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchInvoices()}
            className="flex items-center gap-1.5 rounded-lg border bg-card hover:bg-accent px-3 py-2 text-xs font-medium text-foreground transition-all shadow-sm"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>
          <Link
            href="/dashboard/pos"
            className="flex items-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-xs font-semibold shadow-sm transition-all"
          >
            <Receipt className="h-4 w-4" />
            <span>+ New Bill (POS)</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Invoices Listed</span>
            <FileText className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{totalCount}</span>
            <span className="text-[11px] text-muted-foreground">records</span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Total Value</span>
            <ArrowUpDown className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              ₹{totalAmountSum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Paid Invoices</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{paidCount}</span>
            <span className="text-[11px] text-muted-foreground">settled</span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Credit / Udhaar</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600">{creditCount}</span>
            <span className="text-[11px] text-muted-foreground">outstanding</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by Invoice #, Customer name, or Mobile..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border bg-background pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Quick Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by payment status"
              className="rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Payment Statuses</option>
              <option value="paid">Paid</option>
              <option value="credit">Credit / Udhaar</option>
              <option value="partial">Partially Paid</option>
            </select>

            <select
              value={invoiceType}
              onChange={(e) => {
                setInvoiceType(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by invoice type"
              className="rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Invoice Types</option>
              <option value="gst">GST Tax Invoice</option>
              <option value="non_gst">Standard Bill</option>
              <option value="thermal">Thermal Receipt</option>
            </select>

            {/* Date pickers */}
            <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-foreground focus:outline-none"
                title="Start Date"
              />
              <span className="text-muted-foreground">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-foreground focus:outline-none"
                title="End Date"
              />
            </div>

            {(searchTerm || paymentStatus || invoiceType || startDate || endDate) && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setPaymentStatus("");
                  setInvoiceType("");
                  setStartDate("");
                  setEndDate("");
                  setPage(1);
                }}
                className="rounded-lg border bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Clear Filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                      <span>Loading invoices...</span>
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <FileText className="h-10 w-10 text-muted-foreground/40" />
                      <div>
                        <p className="font-semibold text-foreground text-sm">No Invoices Found</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {searchTerm || paymentStatus || invoiceType || startDate || endDate
                            ? "Try adjusting your search criteria or clearing filters."
                            : "New invoices will appear automatically when you check out in the POS terminal."}
                        </p>
                      </div>
                      <Link
                        href="/dashboard/pos"
                        className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm"
                      >
                        Go to POS Terminal
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const isPaid = inv.payment_status?.toLowerCase() === "paid";
                  const isCredit = inv.payment_status?.toLowerCase() === "credit";

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-accent/40 transition-colors group cursor-pointer"
                      onClick={() => handleViewDetail(inv)}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <span>{inv.invoice_number}</span>
                          {inv.origin_quotation_id && (
                            <span
                              title="Converted from Quotation"
                              className="rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1 py-0.2 text-[9px] font-bold"
                            >
                              QUOTE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {inv.transaction_date || inv.created_at
                          ? new Date(inv.transaction_date || inv.created_at).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">
                          {inv.customer_name || "Walk-in Customer"}
                        </div>
                        {inv.customer_phone && (
                          <div className="text-[11px] text-muted-foreground">{inv.customer_phone}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-secondary-foreground">
                          {inv.invoice_type || "GST"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-foreground">
                        ₹
                        {Number(inv.total || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            isPaid
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : isCredit
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              isPaid ? "bg-emerald-500" : isCredit ? "bg-amber-500" : "bg-blue-500"
                            )}
                          />
                          {inv.payment_status ? inv.payment_status.toUpperCase() : "PAID"}
                        </span>
                      </td>
                      <td
                        className="py-3 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewDetail(inv)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handlePrint(inv)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            title="Print Invoice"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenPdf(inv)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleShareWhatsApp(inv)}
                            className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                            title="Share on WhatsApp"
                          >
                            <Share2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalCount > 20 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <div>
              Showing page {page} of {Math.ceil(totalCount / 20)} ({totalCount} total)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 rounded border px-2.5 py-1 disabled:opacity-40 hover:bg-accent"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>
              <button
                disabled={page >= Math.ceil(totalCount / 20)}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 rounded border px-2.5 py-1 disabled:opacity-40 hover:bg-accent"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal / Drawer */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-2xl text-foreground max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold font-mono text-foreground">
                    {selectedInvoice.invoice_number}
                  </h3>
                  <span className="rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase">
                    {selectedInvoice.invoice_type || "Tax Invoice"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedInvoice.transaction_date || selectedInvoice.created_at
                    ? new Date(selectedInvoice.transaction_date || selectedInvoice.created_at).toLocaleString("en-IN", {
                        dateStyle: "full",
                        timeStyle: "short",
                      })
                    : ""}
                </p>
              </div>

              <button
                onClick={() => setSelectedInvoice(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-5 text-xs">
              {detailLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Customer & Store Meta */}
                  <div className="grid grid-cols-2 gap-4 rounded-xl bg-muted/40 p-3.5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase text-[10px]">
                        <User className="h-3.5 w-3.5" />
                        <span>Billed To</span>
                      </div>
                      <div className="font-semibold text-foreground text-sm">
                        {selectedInvoice.customer_name || "Walk-in Customer"}
                      </div>
                      {selectedInvoice.customer_phone && (
                        <div className="text-muted-foreground font-mono">{selectedInvoice.customer_phone}</div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase text-[10px]">
                        <Store className="h-3.5 w-3.5" />
                        <span>Store / Organization</span>
                      </div>
                      <div className="font-semibold text-foreground text-sm">
                        {selectedInvoice.store_name || "Main Store"}
                      </div>
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="rounded bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 text-[10px] font-bold">
                          {selectedInvoice.payment_method?.toUpperCase() || "CASH"}
                        </span>
                        <span className="rounded bg-blue-500/10 text-blue-600 px-1.5 py-0.5 text-[10px] font-bold">
                          {selectedInvoice.payment_status?.toUpperCase() || "PAID"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      Line Items
                    </h4>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-muted/50 border-b text-[10px] font-bold uppercase text-muted-foreground">
                          <tr>
                            <th className="py-2 px-3">Item</th>
                            <th className="py-2 px-2 text-center">Qty</th>
                            <th className="py-2 px-3 text-right">Price</th>
                            <th className="py-2 px-3 text-right">Tax</th>
                            <th className="py-2 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-xs">
                          {selectedInvoice.transaction_details?.items && selectedInvoice.transaction_details.items.length > 0 ? (
                            selectedInvoice.transaction_details.items.map((it: any, idx: number) => (
                              <tr key={idx} className="hover:bg-muted/20">
                                <td className="py-2 px-3">
                                  <div className="font-medium text-foreground">{it.name}</div>
                                  {it.hsn_code && (
                                    <div className="text-[10px] text-muted-foreground font-mono">HSN: {it.hsn_code}</div>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center font-mono">{it.quantity}</td>
                                <td className="py-2 px-3 text-right font-mono">₹{Number(it.unit_price).toFixed(2)}</td>
                                <td className="py-2 px-3 text-right font-mono text-muted-foreground">₹{Number(it.tax || 0).toFixed(2)}</td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                                  ₹{Number(it.total).toFixed(2)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="py-4 text-center text-muted-foreground">
                                Item details included in total.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="space-y-1.5 border-t pt-3">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-mono">₹{Number(selectedInvoice.subtotal || 0).toFixed(2)}</span>
                    </div>
                    {Number(selectedInvoice.discount || 0) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Discount</span>
                        <span className="font-mono">- ₹{Number(selectedInvoice.discount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxes (GST)</span>
                      <span className="font-mono">₹{Number(selectedInvoice.tax || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-foreground border-t pt-2 mt-1">
                      <span>Grand Total</span>
                      <span className="font-mono text-primary">₹{Number(selectedInvoice.total || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Notes / Terms */}
                  {(selectedInvoice.terms_and_conditions || selectedInvoice.custom_notes) && (
                    <div className="rounded-lg bg-muted/30 p-3 space-y-1 text-[11px] text-muted-foreground">
                      {selectedInvoice.custom_notes && <p><strong>Note:</strong> {selectedInvoice.custom_notes}</p>}
                      {selectedInvoice.terms_and_conditions && (
                        <p><strong>Terms:</strong> {selectedInvoice.terms_and_conditions}</p>
                      )}
                    </div>
                  )}

                  {/* Origin Quotation reference if any */}
                  {selectedInvoice.origin_quotation_id && (
                    <div className="flex items-center justify-between rounded-lg bg-purple-500/10 p-3 text-purple-700 dark:text-purple-300">
                      <div>
                        <span className="font-semibold text-xs">Origin Quotation: </span>
                        <span className="font-mono text-xs">{selectedInvoice.origin_quotation_number || "Linked"}</span>
                      </div>
                      <Link
                        href={`/dashboard/quotations`}
                        className="text-xs underline font-semibold flex items-center gap-1"
                      >
                        <span>View Quotation</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="border-t pt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrint(selectedInvoice)}
                  className="flex items-center gap-1.5 rounded-lg border bg-card hover:bg-accent px-3 py-2 text-xs font-semibold text-foreground transition-all shadow-sm"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => handleOpenPdf(selectedInvoice)}
                  disabled={pdfGenerating}
                  className="flex items-center gap-1.5 rounded-lg border bg-card hover:bg-accent px-3 py-2 text-xs font-semibold text-foreground transition-all shadow-sm disabled:opacity-50"
                >
                  <Download className={cn("h-3.5 w-3.5", pdfGenerating && "animate-spin")} />
                  <span>{pdfGenerating ? "Generating PDF..." : "Download PDF"}</span>
                </button>
                <button
                  onClick={() => handleShareWhatsApp(selectedInvoice)}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition-all shadow-sm"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </button>
              </div>

              {selectedInvoice.web_url && (
                <a
                  href={selectedInvoice.web_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline font-semibold"
                >
                  <span>Public Bill Link</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
