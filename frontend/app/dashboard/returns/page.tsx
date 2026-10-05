"use client";

import React, { useState, useEffect } from "react";
import {
  RotateCcw,
  Search,
  CheckCircle,
  AlertCircle,
  Receipt,
  ArrowRight,
  Boxes,
  Banknote,
  CreditCard,
} from "lucide-react";
import { posApi, transactionApi } from "@/services/api";
import { SalesReturn, Transaction } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function ReturnsPage() {
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null);
  const [searchError, setSearchError] = useState("");

  // Return Processing Form
  const [returnItems, setReturnItems] = useState<
    { item_id: string; product_name: string; unit_price: number; max_qty: number; return_qty: number }[]
  >([]);
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [restockInventory, setRestockInventory] = useState(true);
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [successReturn, setSuccessReturn] = useState<any | null>(null);

  // Past Returns History
  const [pastReturns, setPastReturns] = useState<SalesReturn[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadPastReturns = async () => {
    setHistoryLoading(true);
    try {
      const res = await posApi.getReturnsReport();
      const list = res.data?.results || res.data || [];
      setPastReturns(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadPastReturns();
  }, []);

  const handleSearchInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    setSelectedTxn(null);

    try {
      // Find transaction by invoice number
      const res = await transactionApi.list();
      const txns = res.data?.results || [];
      const match = txns.find(
        (t: any) => t.invoice_number?.toLowerCase() === invoiceQuery.trim().toLowerCase()
      );

      if (!match) {
        setSearchError(`No transaction found for invoice "${invoiceQuery}".`);
        return;
      }

      // Fetch detailed transaction
      const detailRes = await transactionApi.get(match.id);
      const detail = detailRes.data;
      setSelectedTxn(detail);

      // Populate return items
      const items = ((detail as any).items || []).map((it: any) => ({
        item_id: it.id,
        product_name: it.product_name || it.product?.name || "Item",
        unit_price: Number(it.unit_price) || 0,
        max_qty: Number(it.quantity) || 1,
        return_qty: 0,
      }));
      setReturnItems(items);
    } catch (err) {
      setSearchError("Failed to lookup invoice. Please check the invoice number.");
    } finally {
      setSearching(false);
    }
  };

  const calculateTotalRefund = () => {
    return returnItems.reduce((acc, it) => acc + it.return_qty * it.unit_price, 0);
  };

  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeReturns = returnItems.filter((it) => it.return_qty > 0);
    if (activeReturns.length === 0) {
      alert("Please specify at least 1 item quantity to return.");
      return;
    }

    setProcessing(true);
    try {
      const payload = {
        transaction_id: selectedTxn.id,
        items: activeReturns.map((it) => ({
          transaction_item_id: it.item_id,
          quantity: it.return_qty,
          reason: reason || "Customer return",
          restock_inventory: restockInventory,
        })),
        refund_method: refundMethod,
        reason: reason || "Customer return",
      };

      const res = await posApi.processReturn(payload);
      setSuccessReturn(res.data);
      setSelectedTxn(null);
      setReturnItems([]);
      setInvoiceQuery("");
      loadPastReturns();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to process return.";
      alert(msg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Sales Returns & Refunds</h2>
        <p className="text-sm text-muted-foreground">
          Process item-level returns against historical invoices with automatic stock restocking and audit trail.
        </p>
      </div>

      {/* Success Banner */}
      {successReturn && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="font-bold text-sm">Return {successReturn.return_number} Processed Successfully!</p>
              <p className="text-xs">
                Refund Amount: ₹{successReturn.total_refund_amount} via {successReturn.refund_method}. Inventory updated.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setSuccessReturn(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Search Invoice Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Lookup Original Invoice
          </CardTitle>
          <CardDescription className="text-xs">
            Enter the exact invoice number printed on the customer bill (e.g. INV-1001 or INV-...)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearchInvoice} className="flex gap-2 max-w-md">
            <Input
              required
              placeholder="e.g. INV-1001"
              value={invoiceQuery}
              onChange={(e) => setInvoiceQuery(e.target.value)}
              className="text-xs uppercase"
            />
            <Button type="submit" disabled={searching} className="gap-1 text-xs shrink-0">
              <Search className="h-3.5 w-3.5" />
              {searching ? "Searching..." : "Lookup Bill"}
            </Button>
          </form>

          {searchError && (
            <p className="mt-2 text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {searchError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Selected Invoice Items for Return */}
      {selectedTxn && (
        <Card className="border-primary/40">
          <CardHeader className="bg-primary/5 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  Invoice #{selectedTxn.invoice_number}
                </CardTitle>
                <CardDescription className="text-xs">
                  Date: {new Date(selectedTxn.transaction_date).toLocaleString()} • Original Total: ₹
                  {selectedTxn.total}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTxn(null)}
                className="text-xs text-muted-foreground"
              >
                Close
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-4">
            <form onSubmit={handleProcessReturn} className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3">Item Purchased</th>
                      <th className="py-2 px-3 text-right">Unit Price</th>
                      <th className="py-2 px-3 text-right">Qty Bought</th>
                      <th className="py-2 px-3 text-center">Return Qty</th>
                      <th className="py-2 px-3 text-right">Refund Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {returnItems.map((item, idx) => (
                      <tr key={item.item_id}>
                        <td className="py-2.5 px-3 font-semibold">{item.product_name}</td>
                        <td className="py-2.5 px-3 text-right">₹{item.unit_price.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-medium">{item.max_qty}</td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max={item.max_qty}
                            value={item.return_qty}
                            onChange={(e) => {
                              const val = Math.min(item.max_qty, Math.max(0, parseInt(e.target.value) || 0));
                              setReturnItems((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], return_qty: val };
                                return copy;
                              });
                            }}
                            className="w-16 rounded border text-center py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-foreground">
                          ₹{(item.return_qty * item.unit_price).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Options & Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t pt-3 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Refund Method *</label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="h-9 w-full rounded border px-2 text-xs"
                  >
                    <option value="CASH">Cash Refund</option>
                    <option value="UPI">UPI Refund</option>
                    <option value="CARD">Card Refund</option>
                    <option value="CREDIT">Customer Udhaar / Store Credit</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Reason for Return</label>
                  <Input
                    placeholder="e.g. Defective piece / Wrong size"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="restock_check"
                    checked={restockInventory}
                    onChange={(e) => setRestockInventory(e.target.checked)}
                    className="rounded text-primary h-4 w-4"
                  />
                  <label htmlFor="restock_check" className="font-medium cursor-pointer">
                    Restock items into inventory
                  </label>
                </div>
              </div>

              {/* Footer / Process Button */}
              <div className="flex items-center justify-between border-t pt-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">Total Refund to Customer: </span>
                  <span className="font-black text-lg text-primary">₹{calculateTotalRefund().toFixed(2)}</span>
                </div>

                <Button
                  type="submit"
                  disabled={processing || calculateTotalRefund() <= 0}
                  className="font-bold text-xs"
                >
                  {processing ? "Processing Return..." : "Authorize & Refund"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Past Returns History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-purple-600" />
            Historical Returns Ledger
          </CardTitle>
          <CardDescription className="text-xs">
            Immutable log of all completed returns and linked original invoices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading returns history...</div>
          ) : pastReturns.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No return transactions recorded.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3">Return #</th>
                    <th className="py-2.5 px-3">Original Invoice</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Items Returned</th>
                    <th className="py-2.5 px-3 text-right">Refund Amount</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pastReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="py-2.5 px-3 font-mono font-bold">{r.return_number}</td>
                      <td className="py-2.5 px-3 font-mono text-muted-foreground">{r.original_invoice_number}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">{r.items_returned_count || 1}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-destructive">
                        -₹{Number(r.total_refund_amount).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 uppercase text-[11px] font-medium">{r.refund_method}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase">
                          {r.status || "Completed"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
