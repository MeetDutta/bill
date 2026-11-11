"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { quotationApi } from "@/services/api";
import type { Quotation, WhatsAppDeliverySummary } from "@/types";
import { QuotationCreateModal } from "@/components/quotations/QuotationCreateModal";
import { WhatsAppDeliveryBadge } from "@/components/whatsapp/WhatsAppDeliveryBadge";
import {
  FileCheck,
  Search,
  Plus,
  RefreshCw,
  Eye,
  Trash2,
  ArrowRight,
  Receipt,
  User,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
  CreditCard,
  Edit2,
  ExternalLink,
  ShoppingCart,
  Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseApiError } from "@/lib/api-error";

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [listError, setListError] = useState("");
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [quotationToConvert, setQuotationToConvert] = useState<Quotation | null>(null);
  const [convertPaymentMethod, setConvertPaymentMethod] = useState("cash");
  const [isSplitConvert, setIsSplitConvert] = useState(false);
  const [splitPayments, setSplitPayments] = useState<{ payment_method: string; amount: number }[]>([]);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertSuccess, setConvertSuccess] = useState<{
    invoice_number: string;
    invoice_id: string;
    bill_sent?: boolean;
    whatsapp_delivery?: WhatsAppDeliverySummary | null;
    customer_phone?: string;
  } | null>(null);

  // Fetch Quotations
  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const res = await quotationApi.list({
        search: searchTerm || undefined,
        status: statusFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
      });
      const data = res.data;
      if (Array.isArray(data)) {
        setQuotations(data);
        setTotalCount(data.length);
      } else if (data && Array.isArray(data.results)) {
        setQuotations(data.results);
        setTotalCount(data.count || data.results.length);
      } else {
        setQuotations([]);
        setTotalCount(0);
      }
    } catch (err) {
      setListError(parseApiError(err, "Failed to load quotations."));
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, startDate, endDate, page]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  // Open quotation creation modal automatically when navigated with ?action=new or ?create=1
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "new" || params.get("create") === "1") {
        setShowCreateModal(true);
      }
    }
  }, []);

  const handleOpenCreate = () => {
    setShowCreateModal(true);
  };

  // Convert Quotation to Invoice / Pay
  const handleConvertClick = (q: Quotation) => {
    if (q.status === "converted") return;
    setQuotationToConvert(q);
    setConvertSuccess(null);
    setConvertError(null);
    setConvertPaymentMethod("cash");
    setIsSplitConvert(false);
    const half = Math.floor(Number(q.total || 0) / 2);
    setSplitPayments([
      { payment_method: "cash", amount: half },
      { payment_method: "upi", amount: Number(q.total || 0) - half },
    ]);
    setShowConvertModal(true);
  };

  const handleExecuteConvert = async () => {
    if (!quotationToConvert || converting) return;
    setConverting(true);
    setConvertError(null);
    try {
      const payload: any = isSplitConvert
        ? { payments: splitPayments.filter((p) => p.amount > 0) }
        : { payment_method: convertPaymentMethod };

      const res = await quotationApi.convert(quotationToConvert.id, payload);
      setConvertSuccess({
        invoice_number: res.data.invoice_number,
        invoice_id: res.data.invoice_id,
        bill_sent: res.data.bill_sent,
        whatsapp_delivery: res.data.whatsapp_delivery,
        customer_phone: quotationToConvert.customer_phone,
      });
      fetchQuotations();
    } catch (err: unknown) {
      const errorMsg = parseApiError(err, "Failed to convert quotation to invoice.");
      setConvertError(errorMsg);
    } finally {
      setConverting(false);
    }
  };

  // Delete Quotation
  const handleDelete = async (q: Quotation) => {
    if (q.status === "converted") {
      alert("Cannot delete a quotation that has already been converted into an invoice.");
      return;
    }
    if (!confirm(`Are you sure you want to delete quote #${q.quotation_number}?`)) return;

    try {
      await quotationApi.delete(q.id);
      fetchQuotations();
      if (selectedQuotation?.id === q.id) setSelectedQuotation(null);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to delete quotation.");
    }
  };

  // View Details
  const handleViewDetails = async (q: Quotation) => {
    try {
      const res = await quotationApi.get(q.id);
      setSelectedQuotation(res.data);
    } catch {
      setSelectedQuotation(q);
    }
  };

  // Status badge styling
  const renderStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "converted":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            CONVERTED
          </span>
        );
      case "accepted":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
            <CheckCircle2 className="h-3 w-3" />
            ACCEPTED
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400">
            <XCircle className="h-3 w-3" />
            REJECTED
          </span>
        );
      case "sent":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400">
            <Clock className="h-3 w-3" />
            SENT
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            EXPIRED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
            DRAFT
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FileCheck className="h-4 w-4 text-primary" />
            <span>Sales & Estimates</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Quotations & Estimates
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create professional price estimates and convert accepted quotes into official Invoices
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchQuotations()}
            className="flex items-center gap-1.5 rounded-lg border bg-card hover:bg-accent px-3 py-2 text-xs font-medium text-foreground transition-all shadow-sm"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>New Quotation</span>
          </button>
        </div>
      </div>

      {listError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{listError}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search quotes by number, customer name, or phone..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border bg-background pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by quotation status"
              className="rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="converted">Converted to Invoice</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>

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

            {(searchTerm || statusFilter || startDate || endDate) && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("");
                  setStartDate("");
                  setEndDate("");
                  setPage(1);
                }}
                className="rounded-lg border bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quotations Table & Mobile Cards */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Mobile Quotations Card List */}
        <div className="sm:hidden divide-y divide-border">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
              <span>Loading quotations...</span>
            </div>
          ) : quotations.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground p-4">
              <FileCheck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="font-semibold text-foreground text-sm">No Quotations Found</p>
              <button
                onClick={handleOpenCreate}
                className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm touch-target-min"
              >
                + Create Quotation
              </button>
            </div>
          ) : (
            quotations.map((q) => {
              const isConverted = q.status === "converted";
              return (
                <div
                  key={q.id}
                  className="p-3.5 space-y-2.5 hover:bg-accent/40 transition-colors"
                  onClick={() => handleViewDetails(q)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-xs text-foreground block">
                        {q.quotation_number}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {q.quotation_date || new Date(q.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div>{renderStatusBadge(q.status)}</div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-foreground">{q.customer_name || "Walk-in Customer"}</p>
                      {q.customer_phone && (
                        <p className="text-[11px] font-mono text-muted-foreground">{q.customer_phone}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground block">Total Amount</span>
                      <span className="font-extrabold text-sm text-foreground">
                        ₹{Number(q.total || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-end gap-2 pt-1 border-t"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleViewDetails(q)}
                      className="rounded-md border p-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground touch-target-min inline-flex items-center gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View</span>
                    </button>

                    {!isConverted ? (
                      <>
                        <Link
                          href={`/dashboard/billing?quote=${encodeURIComponent(q.quotation_number)}`}
                          className="flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs touch-target-min"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          <span>POS</span>
                        </Link>
                        <button
                          onClick={() => handleConvertClick(q)}
                          className="flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs touch-target-min"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          <span>Pay</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] font-mono text-muted-foreground px-2 py-1 bg-muted rounded">
                        {q.converted_invoice_number ? `#${q.converted_invoice_number}` : "Converted"}
                      </span>
                    )}

                    {!isConverted && (
                      <button
                        onClick={() => handleDelete(q)}
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Quote #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Valid Until</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                      <span>Loading quotations...</span>
                    </div>
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <FileCheck className="h-10 w-10 text-muted-foreground/40" />
                      <div>
                        <p className="font-semibold text-foreground text-sm">No Quotations Found</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Create your first price quotation to share with prospective customers.
                        </p>
                      </div>
                      <button
                        onClick={handleOpenCreate}
                        className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm"
                      >
                        + Create Quotation
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                quotations.map((q) => {
                  const isConverted = q.status === "converted";

                  return (
                    <tr
                      key={q.id}
                      className="hover:bg-accent/40 transition-colors group cursor-pointer"
                      onClick={() => handleViewDetails(q)}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-foreground">
                        {q.quotation_number}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {q.quotation_date || new Date(q.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {q.valid_until ? new Date(q.valid_until).toLocaleDateString() : "No Expiry"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">
                          {q.customer_name || "Walk-in Customer"}
                        </div>
                        {q.customer_phone && (
                          <div className="text-[11px] text-muted-foreground">{q.customer_phone}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-foreground">
                        ₹{Number(q.total || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4">{renderStatusBadge(q.status)}</td>
                      <td
                        className="py-3 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewDetails(q)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {!isConverted ? (
                            <>
                              <Link
                                href={`/dashboard/billing?quote=${encodeURIComponent(q.quotation_number)}`}
                                className="flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-700 px-2 py-1 text-[11px] font-semibold text-white shadow-xs"
                                title="Proceed to Checkout (Load in POS)"
                              >
                                <ShoppingCart className="h-3 w-3" />
                                <span>Checkout</span>
                              </Link>
                              <button
                                onClick={() => handleConvertClick(q)}
                                className="flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white shadow-xs"
                                title="Pay & Convert to Invoice"
                              >
                                <CreditCard className="h-3 w-3" />
                                <span>Pay</span>
                              </button>
                            </>
                          ) : (
                            <span
                              className="text-[11px] font-mono text-muted-foreground px-2 py-1 bg-muted rounded"
                              title={`Converted to Invoice #${q.converted_invoice_number || ""}`}
                            >
                              {q.converted_invoice_number ? `#${q.converted_invoice_number}` : "Converted"}
                            </span>
                          )}

                          {!isConverted && (
                            <button
                              onClick={() => handleDelete(q)}
                              className="rounded p-1 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                              title="Delete Quote"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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

      {/* CREATE QUOTATION MODAL */}
      <QuotationCreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => fetchQuotations()}
      />

      {/* CONVERT TO INVOICE MODAL */}
      {showConvertModal && quotationToConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl text-foreground">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Convert to Tax Invoice</h3>
                <p className="text-xs text-muted-foreground">
                  Quotation #{quotationToConvert.quotation_number}
                </p>
              </div>
              <button
                onClick={() => setShowConvertModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {convertSuccess ? (
              <div className="py-6 text-center space-y-4">
                <div className="flex justify-center">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground">Successfully Converted!</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Invoice <span className="font-mono font-bold text-foreground">#{convertSuccess.invoice_number}</span> has been issued and inventory deducted.
                  </p>
                </div>

                {convertSuccess.invoice_id && (
                  <WhatsAppDeliveryBadge
                    invoiceId={convertSuccess.invoice_id}
                    initialDelivery={convertSuccess.whatsapp_delivery}
                    initialBillSent={convertSuccess.bill_sent}
                    customerPhone={convertSuccess.customer_phone}
                  />
                )}

                <div className="flex items-center justify-center gap-3 pt-2">
                  <Link
                    href={`/dashboard/billing?view=history`}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm"
                  >
                    View in Invoices
                  </Link>
                  <button
                    onClick={() => setShowConvertModal(false)}
                    className="rounded-lg border px-4 py-2 text-xs font-semibold hover:bg-accent"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-4 space-y-4 text-xs">
                {convertError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-destructive text-xs flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="flex-1 font-medium">{convertError}</span>
                  </div>
                )}

                <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-semibold">{quotationToConvert.customer_name || "Walk-in"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bill Amount:</span>
                    <span className="font-bold text-foreground font-mono text-sm">
                      ₹{Number(quotationToConvert.total || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Single vs Split Toggle */}
                <div className="flex items-center justify-between">
                  <label className="font-semibold">Tender / Payment Method</label>
                  <button
                    type="button"
                    onClick={() => setIsSplitConvert(!isSplitConvert)}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {isSplitConvert ? "Switch to Single Method" : "Split Payment (Cash + UPI)"}
                  </button>
                </div>

                {!isSplitConvert ? (
                  <div>
                    <select
                      value={convertPaymentMethod}
                      onChange={(e) => setConvertPaymentMethod(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="cash">Cash Tender</option>
                      <option value="upi">UPI / QR Code</option>
                      <option value="card">Card (Debit/Credit POS)</option>
                      <option value="credit">Credit / Udhaar (Registered Customers)</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                    {splitPayments.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={p.payment_method}
                          onChange={(e) => {
                            const updated = [...splitPayments];
                            updated[idx].payment_method = e.target.value;
                            setSplitPayments(updated);
                          }}
                          className="w-28 rounded border px-2 py-1.5 bg-background text-xs font-semibold"
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                          <option value="credit">Credit</option>
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          value={p.amount}
                          onChange={(e) => {
                            const updated = [...splitPayments];
                            updated[idx].amount = parseFloat(e.target.value) || 0;
                            setSplitPayments(updated);
                          }}
                          className="flex-1 rounded border px-2 py-1.5 bg-background text-right font-mono text-xs"
                          placeholder="Amount"
                        />
                      </div>
                    ))}
                    <div className="text-[11px] text-right text-muted-foreground pt-1">
                      Total Tendered: ₹{splitPayments.reduce((s, p) => s + p.amount, 0).toFixed(2)}
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-blue-500/10 p-3 text-blue-700 dark:text-blue-300 space-y-1">
                  <p className="font-semibold">Action will:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    <li>Generate an official sequential tax invoice</li>
                    <li>Deduct stock from store inventory for tracked items</li>
                    <li>Mark this quotation as converted permanently</li>
                  </ul>
                </div>

                <div className="border-t pt-4 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowConvertModal(false)}
                    className="rounded-lg border px-4 py-2 font-semibold hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteConvert}
                    disabled={converting}
                    className="rounded-lg bg-emerald-600 text-white px-5 py-2 font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {converting ? "Processing..." : "Pay & Issue Invoice"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-2xl text-foreground max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold font-mono text-foreground">
                    #{selectedQuotation.quotation_number}
                  </h3>
                  {renderStatusBadge(selectedQuotation.status)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Issued on: {selectedQuotation.quotation_date || new Date(selectedQuotation.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedQuotation(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-5 text-xs">
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-muted/40 p-3.5">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Customer</span>
                  <div className="font-semibold text-sm mt-0.5">{selectedQuotation.customer_name || "Walk-in"}</div>
                  {selectedQuotation.customer_phone && (
                    <div className="text-muted-foreground font-mono">{selectedQuotation.customer_phone}</div>
                  )}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Validity</span>
                  <div className="font-semibold text-sm mt-0.5">
                    {selectedQuotation.valid_until ? new Date(selectedQuotation.valid_until).toLocaleDateString() : "Open"}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Items</h4>
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
                      {selectedQuotation.items && selectedQuotation.items.length > 0 ? (
                        selectedQuotation.items.map((it, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-3 font-medium">{it.name}</td>
                            <td className="py-2 px-2 text-center font-mono">{it.quantity}</td>
                            <td className="py-2 px-3 text-right font-mono">₹{Number(it.unit_price).toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                              ₹{Number(it.tax || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold">
                              ₹{Number(it.total || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-3 text-center text-muted-foreground">
                            No items details available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-1 border-t pt-3">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">₹{Number(selectedQuotation.subtotal || 0).toFixed(2)}</span>
                </div>
                {Number(selectedQuotation.discount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span className="font-mono">- ₹{Number(selectedQuotation.discount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax (GST)</span>
                  <span className="font-mono">₹{Number(selectedQuotation.tax || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-foreground border-t pt-2">
                  <span>Total Amount</span>
                  <span className="font-mono text-primary">₹{Number(selectedQuotation.total || 0).toFixed(2)}</span>
                </div>
              </div>

              {selectedQuotation.converted_invoice && (
                <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300">
                  <div>
                    <span className="font-semibold text-xs">Converted to Invoice: </span>
                    <span className="font-mono text-xs">{selectedQuotation.converted_invoice_number || "Issued"}</span>
                  </div>
                  <Link href={`/dashboard/billing?view=history`} className="text-xs underline font-semibold flex items-center gap-1">
                    <span>View Invoices</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>

            <div className="border-t pt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {selectedQuotation.status !== "converted" ? (
                  <>
                    <Link
                      href={`/dashboard/billing?quote=${encodeURIComponent(selectedQuotation.quotation_number)}`}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 font-semibold shadow-sm text-xs"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      <span>Proceed to POS Checkout</span>
                    </Link>
                    <button
                      onClick={() => {
                        const q = selectedQuotation;
                        setSelectedQuotation(null);
                        handleConvertClick(q);
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 font-semibold shadow-sm text-xs"
                    >
                      <CreditCard className="h-4 w-4" />
                      <span>Pay &amp; Issue Invoice</span>
                    </button>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground italic">
                    This quotation has been converted into an invoice.
                  </div>
                )}

                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-2 font-semibold hover:bg-accent text-xs"
                >
                  <Printer className="h-4 w-4" />
                  <span>Print Quote</span>
                </button>
              </div>

              <button
                onClick={() => setSelectedQuotation(null)}
                className="rounded-lg border px-4 py-2 font-semibold hover:bg-accent text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
