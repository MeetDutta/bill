"use client";

import { useState } from "react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { transactionApi, posApi } from "@/services/api";
import type { Transaction } from "@/types";
import {
  RotateCcw,
  Search,
  AlertCircle,
  CheckCircle2,
  X,
  Minus,
  Plus,
  ArrowRight,
} from "lucide-react";

interface ReturnItemState {
  item_id: string;
  name: string;
  unit_price: number;
  purchased_qty: number;
  returned_qty: number;
  return_qty: number;
}

export default function MobileReturnsPage() {
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundTransaction, setFoundTransaction] = useState<Transaction | null>(null);

  // Return Form State
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([]);
  const [returnReason, setReturnReason] = useState("Customer return");
  const [refundMethod, setRefundMethod] = useState<"cash" | "credit">("cash");
  const [restockInventory, setRestockInventory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedRefund, setConfirmedRefund] = useState<{
    return_id?: string;
    refund_amount: number;
    invoice_number: string;
  } | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceSearch.trim()) return;

    setLoadingLookup(true);
    setLookupError(null);
    setFoundTransaction(null);
    setConfirmedRefund(null);

    try {
      const res = await transactionApi.list({ search: invoiceSearch.trim() });
      const tx = res.data?.results?.[0];
      if (!tx) {
        setLookupError(`Invoice "${invoiceSearch}" not found.`);
        return;
      }

      setFoundTransaction(tx);
      const items: ReturnItemState[] = (tx.items || []).map((it) => ({
        item_id: it.id,
        name: it.name,
        unit_price: Number(it.unit_price || 0),
        purchased_qty: Number(it.quantity || 0),
        returned_qty: Number(it.returned_quantity || 0),
        return_qty: 0,
      }));
      setReturnItems(items);
    } catch {
      setLookupError("Failed to lookup invoice.");
    } finally {
      setLoadingLookup(false);
    }
  };

  const updateReturnQty = (itemId: string, delta: number) => {
    setReturnItems((prev) =>
      prev.map((item) => {
        if (item.item_id === itemId) {
          const maxEligible = item.purchased_qty - item.returned_qty;
          const target = item.return_qty + delta;
          if (target < 0) return { ...item, return_qty: 0 };
          if (target > maxEligible) return { ...item, return_qty: maxEligible };
          return { ...item, return_qty: target };
        }
        return item;
      })
    );
  };

  const totalRefundAmount = returnItems.reduce(
    (acc, item) => acc + item.unit_price * item.return_qty,
    0
  );

  const handleProcessReturn = async () => {
    if (!foundTransaction) return;
    const selectedItems = returnItems.filter((i) => i.return_qty > 0);
    if (selectedItems.length === 0) {
      alert("Please select at least 1 item to return.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        transaction_id: foundTransaction.id,
        items: selectedItems.map((i) => ({
          transaction_item_id: i.item_id,
          quantity: i.return_qty,
          unit_price: i.unit_price,
        })),
        refund_method: refundMethod,
        reason: returnReason,
        restock: restockInventory,
      };

      const res = await posApi.processReturn(payload);
      setConfirmedRefund({
        return_id: res.data?.id,
        refund_amount: totalRefundAmount,
        invoice_number: foundTransaction.invoice_number,
      });
      setFoundTransaction(null);
      setReturnItems([]);
      setInvoiceSearch("");
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string } } };
      alert(errObj.response?.data?.error || "Failed to process return.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 pt-1">
      <div>
        <h1 className="text-base font-extrabold text-slate-900">Process Return & Refund</h1>
        <p className="text-[11px] text-slate-400">Lookup original invoice & calculate eligible refunds</p>
      </div>

      {/* Invoice Lookup Form */}
      <form onSubmit={handleLookup} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={invoiceSearch}
            onChange={(e) => setInvoiceSearch(e.target.value)}
            placeholder="Enter invoice number (e.g. INV-20261024-000001)..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loadingLookup}
          className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform shrink-0 disabled:opacity-50"
        >
          {loadingLookup ? "Searching..." : "Lookup"}
        </button>
      </form>

      {lookupError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{lookupError}</span>
        </div>
      )}

      {/* Confirmed Return Banner */}
      {confirmedRefund && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center space-y-2 animate-in zoom-in-95">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <h3 className="font-extrabold text-base text-emerald-900">Return Processed Successfully!</h3>
          <p className="text-xs text-emerald-700">
            Refund Amount: <span className="font-bold">{formatCurrency(confirmedRefund.refund_amount)}</span>
          </p>
          <p className="text-[10px] text-emerald-600 font-mono">Invoice #{confirmedRefund.invoice_number}</p>
        </div>
      )}

      {/* Invoice Details and Items to Return */}
      {foundTransaction && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <span className="font-mono font-bold text-xs text-slate-900 block">
                #{foundTransaction.invoice_number}
              </span>
              <span className="text-[10px] text-slate-400">
                {foundTransaction.customer_name || "Walk-in"} • Total Paid: {formatCurrency(Number(foundTransaction.total))}
              </span>
            </div>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-700">
              {foundTransaction.payment_method}
            </span>
          </div>

          <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
            Select Quantities to Return
          </label>

          <div className="space-y-2">
            {returnItems.map((item) => {
              const remaining = item.purchased_qty - item.returned_qty;
              return (
                <div
                  key={item.item_id}
                  className="rounded-xl border border-slate-200 p-2.5 flex items-center justify-between bg-slate-50/50"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-xs font-bold text-slate-800 truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {formatCurrency(item.unit_price)} • {remaining} available to return
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 bg-white rounded-lg p-0.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => updateReturnQty(item.item_id, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-slate-700 active:bg-slate-200"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-extrabold text-slate-900">
                      {item.return_qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateReturnQty(item.item_id, 1)}
                      disabled={item.return_qty >= remaining}
                      className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-slate-700 active:bg-slate-200 disabled:opacity-30"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Refund Options */}
          <div className="space-y-2 pt-1 border-t border-slate-100 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600">Return Reason</label>
              <input
                type="text"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Reason for return..."
                className="w-full rounded-lg border border-slate-200 p-2 text-xs"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-600">Refund Method:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRefundMethod("cash")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                    refundMethod === "cash" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  Cash Refund
                </button>
                <button
                  type="button"
                  onClick={() => setRefundMethod("credit")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                    refundMethod === "credit" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  Store Credit
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-600">Restock to Inventory:</span>
              <input
                type="checkbox"
                checked={restockInventory}
                onChange={(e) => setRestockInventory(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
            </div>

            <div className="flex justify-between font-extrabold text-sm text-rose-600 border-t pt-2">
              <span>Total Refund Amount:</span>
              <span>{formatCurrency(totalRefundAmount)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleProcessReturn}
            disabled={isSubmitting || totalRefundAmount <= 0}
            className="w-full rounded-xl bg-rose-600 py-3 text-center text-xs font-extrabold text-white shadow-md active:scale-95 transition-transform disabled:opacity-50"
          >
            {isSubmitting ? "Processing..." : `Confirm Return & Refund (${formatCurrency(totalRefundAmount)})`}
          </button>
        </div>
      )}
    </div>
  );
}
