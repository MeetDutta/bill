"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { transactionApi } from "@/services/api";
import type { Transaction } from "@/types";
import {
  Receipt,
  Search,
  RotateCcw,
  Eye,
  X,
  CreditCard,
  Banknote,
  QrCode,
  Calendar,
  CheckCircle2,
} from "lucide-react";

export default function MobileSalesPage() {
  const [sales, setSales] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<Transaction | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const res = await transactionApi.list({
        search: searchQuery.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        page: 1,
      });
      setSales(res.data?.results || []);
    } catch (err) {
      console.error("Failed to load sales:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  return (
    <div className="space-y-3 pt-1">
      {/* Header and Returns Shortcut */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Sales & Invoices</h1>
          <p className="text-[11px] text-slate-400">Transaction history & bill receipts</p>
        </div>
        <Link
          href="/m/returns"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm active:scale-95 transition-transform"
        >
          <RotateCcw className="h-3.5 w-3.5 text-rose-600" />
          <span>Returns</span>
        </Link>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by invoice # or customer phone..."
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

      {/* Status Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-semibold">
        {["all", "paid", "credit", "partial", "refunded"].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`rounded-xl px-3 py-1.5 transition-all uppercase text-[10px] whitespace-nowrap ${
              statusFilter === st
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Sales Transaction List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-20 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : sales.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <Receipt className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-xs font-semibold text-slate-600">No transactions found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sales.map((tx) => (
            <div
              key={tx.id}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2 transition-all hover:border-slate-300"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono font-bold text-xs text-slate-900 block">
                    #{tx.invoice_number || tx.id.slice(0, 8)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatDateTime(tx.transaction_date)} • {tx.customer_name || "Walk-in"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-extrabold text-slate-900 block">
                    {formatCurrency(Number(tx.total))}
                  </span>
                  <span
                    className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                      tx.payment_status === "paid"
                        ? "bg-emerald-50 text-emerald-700"
                        : tx.payment_status === "credit"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {tx.payment_status}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                <span className="text-slate-500 font-medium">
                  Method: <span className="font-bold uppercase text-slate-800">{tx.payment_method || "cash"}</span>
                </span>
                <button
                  onClick={() => setSelectedReceipt(tx)}
                  className="flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700 active:scale-95 transition-transform"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>View Receipt</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white p-4 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-xs text-slate-900">Sale Receipt #{selectedReceipt.invoice_number}</h3>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <div className="text-center border-b pb-2">
                <p className="font-extrabold text-base text-slate-900">BillMeet POS Store</p>
                <p className="text-slate-400 text-[10px]">{formatDateTime(selectedReceipt.transaction_date)}</p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-bold text-slate-800">{selectedReceipt.customer_name || "Walk-in"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment:</span>
                  <span className="font-bold uppercase text-slate-800">{selectedReceipt.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-bold uppercase text-emerald-600">{selectedReceipt.payment_status}</span>
                </div>
              </div>

              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(Number(selectedReceipt.subtotal || selectedReceipt.total))}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Taxes</span>
                  <span>{formatCurrency(Number(selectedReceipt.tax || 0))}</span>
                </div>
                <div className="flex justify-between font-extrabold text-sm text-slate-900 border-t pt-1">
                  <span>Total Amount</span>
                  <span>{formatCurrency(Number(selectedReceipt.total))}</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-2 flex gap-2">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 font-bold text-xs text-slate-700"
              >
                Close
              </button>
              {selectedReceipt.invoice?.web_url && (
                <a
                  href={selectedReceipt.invoice.web_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-center font-bold text-xs text-white"
                >
                  Digital Bill →
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
