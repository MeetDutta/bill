"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate, parseApiError } from "@/lib/utils";
import { authApi, quotationApi } from "@/services/api";
import { QuotationCreateModal } from "@/components/quotations/QuotationCreateModal";
import type { Quotation } from "@/types";
import {
  FileText,
  Search,
  ShoppingCart,
  X,
  CheckCircle2,
  Plus,
  AlertCircle,
  Eye,
  Trash2,
  RefreshCw,
} from "lucide-react";

export default function MobileQuotationsPage() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingPosId, setLoadingPosId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManageQuotations = userRole !== "inventory";

  const loadQuotations = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setListError(null);
      try {
        const res = await quotationApi.list({
          search: searchQuery.trim() || undefined,
          page: 1,
        });
        setQuotations(res.data?.results || (Array.isArray(res.data) ? res.data : []));
      } catch (err) {
        console.error("Failed to load quotations:", err);
        setListError(parseApiError(err, "Failed to load quotations."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchQuery]
  );

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  useEffect(() => {
    let active = true;
    const initRoleAndDeepLink = async () => {
      let resolvedRole = "";
      try {
        const res = await authApi.getProfile();
        resolvedRole = res.data?.role || "";
        if (active) setUserRole(resolvedRole);
      } catch {
        // Handled by mobile layout session guard
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

  // Load full quotation (including items array) and redirect to /m/pos
  const handleLoadInPOS = async (q: Quotation) => {
    setActionError(null);
    setLoadingPosId(q.id);
    try {
      const fullQuote = q.items && q.items.length > 0 ? q : (await quotationApi.get(q.id)).data;
      if (!fullQuote.items || fullQuote.items.length === 0) {
        setActionError(`Quotation #${fullQuote.quotation_number} has no items to load.`);
        return;
      }
      if (typeof window !== "undefined") {
        sessionStorage.setItem("billmeet_loaded_quote", JSON.stringify(fullQuote));
        router.push("/m/pos");
      }
    } catch (err) {
      setActionError(parseApiError(err, "Failed to load quotation items for POS checkout."));
    } finally {
      setLoadingPosId(null);
    }
  };

  const handleOpenDetail = async (q: Quotation) => {
    setActionError(null);
    setSelectedQuotation(q);
    if (!q.items || q.items.length === 0) {
      setLoadingDetail(true);
      try {
        const res = await quotationApi.get(q.id);
        setSelectedQuotation(res.data);
      } catch (err) {
        setActionError(parseApiError(err, "Failed to load quotation details."));
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const handleDeleteDraft = async (q: Quotation) => {
    if (!confirm(`Delete quotation #${q.quotation_number}? This action cannot be undone.`)) return;
    setActionError(null);
    setDeletingId(q.id);
    try {
      await quotationApi.delete(q.id);
      setSelectedQuotation((prev) => (prev?.id === q.id ? null : prev));
      await loadQuotations(true);
    } catch (err) {
      setActionError(parseApiError(err, "Failed to delete quotation."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3 pt-1 pb-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base font-extrabold text-slate-900">Quotations & Estimates</h1>
          <p className="text-[11px] text-slate-400">Create estimates & convert to POS bills</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => loadQuotations(true)}
            disabled={refreshing}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Refresh quotations"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {canManageQuotations && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Quotation</span>
            </button>
          )}
        </div>
      </div>

      {!canManageQuotations && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Quotation Access Restricted</p>
            <p className="text-[11px] mt-0.5">
              Warehouse inventory accounts cannot create or manage sales quotations.
            </p>
          </div>
        </div>
      )}

      {(listError || actionError) && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{listError || actionError}</span>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by quote # or customer name..."
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Quotations List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : quotations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-10 px-4 text-center space-y-3">
          <FileText className="mx-auto h-8 w-8 text-slate-300" />
          <div>
            <p className="text-xs font-semibold text-slate-700">No quotations found</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Create a quote without deducting inventory until converted.
            </p>
          </div>
          {canManageQuotations && !searchQuery.trim() && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Quotation</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {quotations.map((q) => {
            const isConverted = q.status === "converted" || Boolean(q.converted_invoice);
            const itemsCount = q.items_count ?? q.items?.length ?? 0;
            return (
              <div
                key={q.id}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono font-bold text-xs text-slate-900 block">
                      #{q.quotation_number}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatDate(q.quotation_date)} • {q.customer_name || "Walk-in Customer"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-extrabold text-slate-900 block">
                      {formatCurrency(Number(q.total))}
                    </span>
                    <span
                      className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                        isConverted
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {isConverted ? "Converted" : q.status || "Draft"}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500 font-medium">
                    {itemsCount} {itemsCount === 1 ? "item" : "items"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(q)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="h-3 w-3" />
                      <span>Details</span>
                    </button>
                    {!isConverted ? (
                      <button
                        type="button"
                        disabled={loadingPosId === q.id || !canManageQuotations}
                        onClick={() => handleLoadInPOS(q)}
                        className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform disabled:opacity-50"
                      >
                        <ShoppingCart className="h-3 w-3" />
                        <span>{loadingPosId === q.id ? "Loading..." : "POS →"}</span>
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Invoiced</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quotation Detail Modal */}
      {selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-extrabold font-mono text-slate-900">
                  #{selectedQuotation.quotation_number}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {selectedQuotation.customer_name || "Walk-in Customer"}
                  {selectedQuotation.customer_phone ? ` • ${selectedQuotation.customer_phone}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQuotation(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Issue Date</span>
                  <span className="font-semibold text-slate-800">
                    {formatDate(selectedQuotation.quotation_date)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Valid Until</span>
                  <span className="font-semibold text-slate-800">
                    {selectedQuotation.valid_until ? formatDate(selectedQuotation.valid_until) : "No expiry"}
                  </span>
                </div>
              </div>

              <div>
                <p className="font-bold text-slate-800 mb-1.5">Items</p>
                {loadingDetail ? (
                  <p className="text-slate-400 py-3">Loading line items...</p>
                ) : selectedQuotation.items && selectedQuotation.items.length > 0 ? (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {selectedQuotation.items.map((it, idx) => (
                      <div key={it.id || idx} className="p-2.5 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{it.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {Number(it.quantity)} × {formatCurrency(Number(it.unit_price))}
                            {Number(it.discount) > 0 ? ` • Disc ${formatCurrency(Number(it.discount))}` : ""}
                            {Number(it.tax_rate) > 0 ? ` • GST ${Number(it.tax_rate)}%` : ""}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-slate-900 shrink-0">
                          {formatCurrency(Number(it.total))}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400">No items listed.</p>
                )}
              </div>

              <div className="rounded-xl bg-slate-50 p-3 space-y-1 text-[11px]">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatCurrency(Number(selectedQuotation.subtotal || 0))}</span>
                </div>
                {Number(selectedQuotation.discount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount</span>
                    <span className="font-mono">
                      -{formatCurrency(Number(selectedQuotation.discount || 0))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500">
                  <span>GST / Tax</span>
                  <span className="font-mono">{formatCurrency(Number(selectedQuotation.tax || 0))}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-xs font-extrabold text-slate-900">
                  <span>Grand Total</span>
                  <span className="font-mono">{formatCurrency(Number(selectedQuotation.total || 0))}</span>
                </div>
              </div>

              {selectedQuotation.notes && (
                <div className="rounded-xl border border-slate-200 p-2.5 text-[11px]">
                  <span className="font-bold text-slate-700 block mb-0.5">Notes</span>
                  <p className="text-slate-600 whitespace-pre-wrap">{selectedQuotation.notes}</p>
                </div>
              )}

              {selectedQuotation.terms_and_conditions && (
                <div className="rounded-xl border border-slate-200 p-2.5 text-[11px]">
                  <span className="font-bold text-slate-700 block mb-0.5">Terms & Conditions</span>
                  <p className="text-slate-600 whitespace-pre-wrap">
                    {selectedQuotation.terms_and_conditions}
                  </p>
                </div>
              )}
            </div>

            {selectedQuotation.status !== "converted" && !selectedQuotation.converted_invoice && canManageQuotations && (
              <div className="border-t border-slate-200 p-3 flex items-center justify-between gap-2 bg-white">
                <button
                  type="button"
                  disabled={deletingId === selectedQuotation.id}
                  onClick={() => handleDeleteDraft(selectedQuotation)}
                  className="flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{deletingId === selectedQuotation.id ? "Deleting..." : "Delete"}</span>
                </button>
                <button
                  type="button"
                  disabled={loadingPosId === selectedQuotation.id}
                  onClick={() => handleLoadInPOS(selectedQuotation)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span>Checkout in POS →</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <QuotationCreateModal
        open={showCreateModal && canManageQuotations}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => loadQuotations(true)}
      />
    </div>
  );
}
