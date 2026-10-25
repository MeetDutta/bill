"use client";

import React, { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { staffApi } from "@/services/api";
import type { Invoice } from "@/types";
import {
  Search,
  Calendar,
  Filter,
  FileText,
  Printer,
  Download,
  Eye,
  RefreshCw,
  X,
  CreditCard,
  Banknote,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
} from "lucide-react";

export default function StaffInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Detail Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const fetchInvoices = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await staffApi.getInvoices({
        search: searchTerm || undefined,
        payment_status: paymentStatus || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
      });

      if (res.data?.results) {
        setInvoices(res.data.results);
        setTotalCount(res.data.count || 0);
        setTotalPages(Math.ceil((res.data.count || 1) / 25));
      } else if (Array.isArray(res.data)) {
        setInvoices(res.data);
        setTotalCount(res.data.length);
        setTotalPages(1);
      }
    } catch (err) {
      console.error("Failed to load staff invoices:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchTerm, paymentStatus, startDate, endDate, page]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleDownloadPdf = (invoiceId: string) => {
    window.open(`/api/v1/invoices/${invoiceId}/pdf/?download=true`, "_blank");
  };

  const handlePrintPdf = (invoiceId: string) => {
    const printWindow = window.open(`/api/v1/invoices/${invoiceId}/pdf/?raw=true`, "_blank");
    if (printWindow) {
      printWindow.focus();
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">My Invoices</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bills and tax invoices created by you ({totalCount} total)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchInvoices(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search invoice # or customer..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          {/* Payment Status */}
          <div>
            <select
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-foreground/20"
            >
              <option value="">All Payment Statuses</option>
              <option value="paid">Fully Paid</option>
              <option value="partial">Partially Paid</option>
              <option value="credit">Credit / Unpaid</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          {/* End Date */}
          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-foreground/20"
            />
          </div>
        </div>

        {(searchTerm || paymentStatus || startDate || endDate) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
            <span>Filters active</span>
            <button
              onClick={() => {
                setSearchTerm("");
                setPaymentStatus("");
                setStartDate("");
                setEndDate("");
                setPage(1);
              }}
              className="text-xs font-semibold text-foreground hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* INVOICES TABLE */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 text-muted-foreground uppercase text-[10px] font-bold">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    Loading your invoices...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    No matching invoices found.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const tx = inv.transaction;
                  const isPaid = (inv.payment_status || tx?.payment_status) === "paid";
                  const totalAmt = Number(inv.total ?? tx?.total ?? 0);
                  const customerName = inv.customer_name || tx?.customer?.full_name || "Walk-in Customer";
                  const customerPhone = inv.customer_phone || tx?.customer?.phone || "";
                  const paymentMethod = inv.payment_method || tx?.payment_method || "Cash";

                  return (
                    <tr key={inv.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">
                        #{inv.invoice_number}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(inv.created_at).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">
                          {customerName}
                        </div>
                        {customerPhone && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {customerPhone}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-foreground font-medium uppercase text-[11px]">
                        {paymentMethod}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-foreground">
                        {formatCurrency(totalAmt)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isPaid
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                              : "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                          }`}
                        >
                          {inv.payment_status || tx?.payment_status || "paid"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="View Invoice Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handlePrintPdf(inv.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Print Tax Invoice"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDownloadPdf(inv.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
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

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="p-3 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded border disabled:opacity-50 hover:bg-accent"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 rounded border disabled:opacity-50 hover:bg-accent"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl text-foreground space-y-4">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Invoice #{selectedInvoice.invoice_number}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {new Date(selectedInvoice.created_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/40">
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <div className="font-semibold">
                    {selectedInvoice.customer_name || selectedInvoice.transaction?.customer?.full_name || "Walk-in Customer"}
                  </div>
                  {(selectedInvoice.customer_phone || selectedInvoice.transaction?.customer?.phone) && (
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {selectedInvoice.customer_phone || selectedInvoice.transaction?.customer?.phone}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground">Status:</span>
                  <div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        (selectedInvoice.payment_status || selectedInvoice.transaction?.payment_status) === "paid"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                      }`}
                    >
                      {selectedInvoice.payment_status || selectedInvoice.transaction?.payment_status || "paid"}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Method: {(selectedInvoice.payment_method || selectedInvoice.transaction?.payment_method || "CASH").toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Items List */}
              {selectedInvoice.transaction?.items && selectedInvoice.transaction.items.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] font-bold border-b">
                      <tr>
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Rate</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedInvoice.transaction.items.map((it: any, idx: number) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-medium">{it.name}</td>
                          <td className="py-2 px-3 text-center">{it.quantity}</td>
                          <td className="py-2 px-3 text-right font-mono">₹{Number(it.unit_price).toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">₹{Number(it.total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals Summary */}
              <div className="border-t pt-2 space-y-1 text-right">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-mono">₹{Number(selectedInvoice.subtotal ?? selectedInvoice.transaction?.subtotal ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax (GST):</span>
                  <span className="font-mono">₹{Number(selectedInvoice.tax ?? selectedInvoice.transaction?.tax ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-foreground pt-1 border-t">
                  <span>Grand Total:</span>
                  <span className="font-mono">₹{Number(selectedInvoice.total ?? selectedInvoice.transaction?.total ?? 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => handlePrintPdf(selectedInvoice.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border font-semibold hover:bg-accent text-xs"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print PDF</span>
              </button>
              <button
                onClick={() => handleDownloadPdf(selectedInvoice.id)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background font-semibold hover:bg-foreground/90 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
