"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { parseApiError } from "@/lib/api-error";
import { staffApi, quotationApi, authApi } from "@/services/api";
import type { Quotation, WhatsAppDeliverySummary } from "@/types";
import { QuotationCreateModal } from "@/components/quotations/QuotationCreateModal";
import { WhatsAppDeliveryBadge } from "@/components/whatsapp/WhatsAppDeliveryBadge";
import {
  Search,
  Plus,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Eye,
  CreditCard,
  Banknote,
  QrCode,
} from "lucide-react";

export default function StaffQuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Create Modal & RBAC
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [listError, setListError] = useState<string | null>(null);
  const canManageQuotations = userRole !== "inventory";

  // Convert Modal
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [quotationToConvert, setQuotationToConvert] = useState<Quotation | null>(null);
  const [convertPaymentMethod, setConvertPaymentMethod] = useState("cash");
  const [splitPayments, setSplitPayments] = useState<Array<{ payment_method: string; amount: number }>>([
    { payment_method: "cash", amount: 0 },
  ]);
  const [isSplit, setIsSplit] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertSuccess, setConvertSuccess] = useState<{
    invoice_number: string;
    invoice_id: string;
    bill_sent?: boolean;
    whatsapp_delivery?: WhatsAppDeliverySummary | null;
    customer_phone?: string;
  } | null>(null);

  // Detail Modal
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

  const fetchQuotations = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setListError(null);
    try {
      const res = await staffApi.getQuotations({
        search: searchTerm || undefined,
        status: statusFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
      });

      if (res.data?.results) {
        setQuotations(res.data.results);
        setTotalCount(res.data.count || 0);
        setTotalPages(Math.ceil((res.data.count || 1) / 25));
      } else if (Array.isArray(res.data)) {
        setQuotations(res.data);
        setTotalCount(res.data.length);
        setTotalPages(1);
      }
    } catch (err) {
      console.error("Failed to load staff quotations:", err);
      setListError(parseApiError(err, "Failed to load quotations. Please try refreshing."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchTerm, statusFilter, startDate, endDate, page]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  useEffect(() => {
    let active = true;
    const initRoleAndDeepLink = async () => {
      let resolvedRole = "";
      try {
        const res = await authApi.getProfile();
        resolvedRole = res.data?.role || "";
        if (active) setUserRole(resolvedRole);
      } catch {
        // Handled by staff layout session guard
      }
      if (typeof window !== "undefined" && resolvedRole !== "inventory") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("action") === "new" || params.get("create") === "1") {
          setShowCreateModal(true);
        }
      }
    };
    initRoleAndDeepLink();
    return () => {
      active = false;
    };
  }, []);

  const handleOpenCreate = () => {
    if (!canManageQuotations) return;
    setShowCreateModal(true);
  };

  const handleOpenConvert = (q: Quotation) => {
    if (q.status === "converted") return;
    setQuotationToConvert(q);
    setConvertSuccess(null);
    setConvertError(null);
    setConvertPaymentMethod("cash");
    setIsSplit(false);
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
      const payload: any = isSplit
        ? { payments: splitPayments.filter((p) => p.amount > 0) }
        : { payment_method: convertPaymentMethod };

      const res = await quotationApi.convert(quotationToConvert.id, payload);
      setConvertSuccess({
        invoice_id: res.data.invoice_id,
        invoice_number: res.data.invoice_number,
        bill_sent: res.data.bill_sent,
        whatsapp_delivery: res.data.whatsapp_delivery,
        customer_phone:
          (typeof quotationToConvert.customer === "object" ? quotationToConvert.customer?.phone : null) ||
          quotationToConvert.customer_phone,
      });
      fetchQuotations(true);
    } catch (err: unknown) {
      const errorMsg = parseApiError(err, "Failed to convert quotation to invoice.");
      setConvertError(errorMsg);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">My Quotations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Price estimates created by you ({totalCount} total)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchQuotations(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          {canManageQuotations && (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 shadow-sm transition-transform active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>New Quotation</span>
            </button>
          )}
        </div>
      </div>

      {!canManageQuotations && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Quotation Access Restricted</p>
            <p className="mt-0.5">
              Warehouse inventory accounts do not have permission to create or manage sales quotations.
            </p>
          </div>
        </div>
      )}

      {listError && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{listError}</span>
        </div>
      )}

      {/* FILTER BAR */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search quote # or customer..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-foreground/20"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent to Customer</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>

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
      </div>

      {/* TABLE */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 text-muted-foreground uppercase text-[10px] font-bold">
              <tr>
                <th className="py-3 px-4">Quote #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Valid Until</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    Loading your quotations...
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground space-y-3">
                    <p>No quotations found.</p>
                    {canManageQuotations && !searchTerm && !statusFilter && !startDate && !endDate && (
                      <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 shadow-sm"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>New Quotation</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                quotations.map((q) => {
                  const isConverted = q.status === "converted";
                  return (
                    <tr key={q.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">
                        #{q.quotation_number}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {q.quotation_date || new Date(q.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">
                          {(typeof q.customer === "object" ? q.customer?.full_name : null) || q.customer_name || "Walk-in Customer"}
                        </div>
                        {((typeof q.customer === "object" ? q.customer?.phone : null) || q.customer_phone) && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {(typeof q.customer === "object" ? q.customer?.phone : null) || q.customer_phone}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {q.valid_until || "-"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-foreground">
                        {formatCurrency(Number(q.total || 0))}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isConverted
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                              : (q.status === "rejected" || q.status === "expired")
                              ? "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {q.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedQuotation(q)}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                            title="View Quote Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {canManageQuotations && !isConverted && q.status !== "rejected" && q.status !== "expired" && (
                            <button
                              onClick={() => handleOpenConvert(q)}
                              className="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 shadow-xs"
                              title="Convert to Official Tax Invoice"
                            >
                              Convert &amp; Pay
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
      </div>

      <QuotationCreateModal
        open={showCreateModal && canManageQuotations}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => fetchQuotations(false)}
        title="New Staff Quotation"
      />

      {/* CONVERT TO INVOICE & PAY MODAL */}
      {showConvertModal && quotationToConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl text-foreground space-y-4">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Convert Quote &amp; Record Payment</h3>
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
                    href={`/staff/billing?view=history`}
                    className="rounded-lg bg-foreground text-background px-4 py-2 text-xs font-bold shadow-xs"
                  >
                    View in My Invoices
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
              <div className="space-y-4 text-xs">
                {convertError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-destructive text-xs flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="flex-1 font-medium">{convertError}</span>
                  </div>
                )}
                <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-semibold">
                      {quotationToConvert.customer?.full_name || quotationToConvert.customer_name || "Walk-in"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="text-muted-foreground font-semibold">Total Payable:</span>
                    <span className="font-black text-foreground font-mono text-base">
                      {formatCurrency(Number(quotationToConvert.total || 0))}
                    </span>
                  </div>
                </div>

                {/* Single vs Split Toggle */}
                <div className="flex items-center justify-between">
                  <label className="font-semibold">Payment Allocation</label>
                  <button
                    type="button"
                    onClick={() => setIsSplit(!isSplit)}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {isSplit ? "Switch to Single Method" : "Split Payment (Cash + UPI)"}
                  </button>
                </div>

                {!isSplit ? (
                  <div>
                    <select
                      value={convertPaymentMethod}
                      onChange={(e) => setConvertPaymentMethod(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-semibold"
                    >
                      <option value="cash">Cash Tender</option>
                      <option value="upi">UPI / Instant QR</option>
                      <option value="card">Card (Debit/Credit POS)</option>
                      <option value="netbanking">Net Banking</option>
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
                    className="rounded-lg bg-emerald-600 text-white px-5 py-2 font-bold shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {converting ? "Processing..." : "Confirm & Finalize Invoice"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl text-foreground space-y-4">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Quotation #{selectedQuotation.quotation_number}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Dated: {selectedQuotation.quotation_date || new Date(selectedQuotation.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedQuotation(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-muted/40 flex justify-between">
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <div className="font-semibold">
                    {selectedQuotation.customer?.full_name || selectedQuotation.customer_name || "Walk-in Customer"}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground">Status:</span>
                  <div>
                    <span className="font-bold uppercase text-foreground">{selectedQuotation.status}</span>
                  </div>
                </div>
              </div>

              {selectedQuotation.items && selectedQuotation.items.length > 0 && (
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
                      {selectedQuotation.items.map((it, idx) => (
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

              <div className="border-t pt-2 space-y-1 text-right">
                <div className="flex justify-between font-black text-sm text-foreground">
                  <span>Total Amount:</span>
                  <span className="font-mono">₹{Number(selectedQuotation.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-3 flex justify-end">
              <button
                onClick={() => setSelectedQuotation(null)}
                className="px-4 py-2 rounded-lg border font-semibold hover:bg-accent text-xs"
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
