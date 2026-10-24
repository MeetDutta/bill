"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { quotationApi } from "@/services/api";
import type { Quotation } from "@/types";
import {
  FileText,
  Search,
  ShoppingCart,
  X,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";

export default function MobileQuotationsPage() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const loadQuotations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await quotationApi.list({
        search: searchQuery.trim() || undefined,
        page: 1,
      });
      setQuotations(res.data?.results || []);
    } catch (err) {
      console.error("Failed to load quotations:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  // Load quotation and redirect to /m/pos
  const handleLoadInPOS = (q: Quotation) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("billmeet_loaded_quote", JSON.stringify(q));
      router.push("/m/pos");
    }
  };

  return (
    <div className="space-y-3 pt-1">
      <div>
        <h1 className="text-base font-extrabold text-slate-900">Quotations & Estimates</h1>
        <p className="text-[11px] text-slate-400">View estimates & convert directly to POS checkout</p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by quote # or customer name..."
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
        />
        {searchQuery && (
          <button
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
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-xs font-semibold text-slate-600">No quotations found</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {quotations.map((q) => {
            const isConverted = q.status === "converted" || Boolean(q.converted_invoice);
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
                      {formatDate(q.quotation_date)} • {q.customer_name || "Valued Customer"}
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

                <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-medium">
                    {q.items?.length || 0} items included
                  </span>
                  {!isConverted ? (
                    <button
                      onClick={() => handleLoadInPOS(q)}
                      className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform"
                    >
                      <ShoppingCart className="h-3 w-3" />
                      <span>Checkout in POS →</span>
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Already Invoiced</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
