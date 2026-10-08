"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi } from "@/services/api";
import type { ReceivableItem } from "@/types";
import {
  AlertCircle,
  Search,
  CreditCard,
  Calendar,
  CheckCircle2,
  Clock,
  Phone,
  ArrowRight,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function ReceivablesPage() {
  const [receivables, setReceivables] = useState<ReceivableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Settle Modal State
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<ReceivableItem | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMethod, setSettleMethod] = useState("cash");
  const [settleNotes, setSettleNotes] = useState("");
  const [settling, setSettling] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApi.getReceivables();
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.results || [];
      setReceivables(list);
    } catch (err) {
      console.error("Failed to load receivables:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSettlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceivable || !selectedReceivable.customer_id) return;
    setSettling(true);
    try {
      await posApi.recordCreditPayment({
        customer_id: selectedReceivable.customer_id,
        amount: parseFloat(settleAmount) || 0,
        payment_method: settleMethod,
        notes: settleNotes || `Settlement for invoice ${selectedReceivable.invoice_number}`,
      });
      setSettleModalOpen(false);
      setSelectedReceivable(null);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to record payment");
    } finally {
      setSettling(false);
    }
  };

  const filtered = receivables.filter((r) => {
    const term = searchTerm.toLowerCase();
    const name = (r.customer_name || "").toLowerCase();
    const phone = (r.customer_phone || "").toLowerCase();
    const inv = (r.invoice_number || "").toLowerCase();
    const matchesSearch = name.includes(term) || phone.includes(term) || inv.includes(term);

    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalOutstanding = filtered.reduce((acc, r) => acc + (parseFloat(r.outstanding) || 0), 0);
  const overdueCount = filtered.filter((r) => r.status === "OVERDUE").length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
              <AlertCircle className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Customer Receivables (Udhaar)</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Track customer debts, aging overdue days, and settle credit payments using FIFO allocation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/finance/payments">
            <Button variant="outline" className="gap-2">
              <CreditCard className="w-4 h-4" />
              Payment Ledger
            </Button>
          </Link>
          <Link href="/dashboard/finance/payables">
            <Button variant="outline" className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Supplier Payables
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Outstanding Receivables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              ₹{totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Unpaid customer balances</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Unpaid Invoices Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filtered.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Active credit bills</p>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Overdue Invoices (&gt;30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">{overdueCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Require immediate collection</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer name, phone, or invoice number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="w-full md:w-56">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
            >
              <option value="all">All Aging Statuses</option>
              <option value="CURRENT">Current (&le; 7 days)</option>
              <option value="DUE_SOON">Due Soon (8 - 30 days)</option>
              <option value="OVERDUE">Overdue (&gt; 30 days)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Receivables Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Customer</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Phone</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Invoice #</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Invoice Date</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Total Bill (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Paid (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Outstanding (₹)</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Aging Status</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      Loading customer receivables...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      No outstanding customer debts found!
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.transaction_id} className="hover:bg-muted/20">
                      <td className="py-3 px-4 font-medium">{r.customer_name}</td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{r.customer_phone || "—"}</td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold">{r.invoice_number}</td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{r.invoice_date}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        ₹{parseFloat(r.total).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-600">
                        ₹{parseFloat(r.paid).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-bold text-amber-600">
                        ₹{parseFloat(r.outstanding).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold",
                            r.status === "OVERDUE"
                              ? "bg-rose-500/10 text-rose-700"
                              : r.status === "DUE_SOON"
                              ? "bg-amber-500/10 text-amber-700"
                              : "bg-emerald-500/10 text-emerald-700"
                          )}
                        >
                          {r.status} ({r.days_overdue}d)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                          onClick={() => {
                            setSelectedReceivable(r);
                            setSettleAmount(r.outstanding);
                            setSettleMethod("cash");
                            setSettleNotes(`Settle bill ${r.invoice_number}`);
                            setSettleModalOpen(true);
                          }}
                        >
                          Receive Payment
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Settle Modal */}
      {settleModalOpen && selectedReceivable && (
        <Dialog open={settleModalOpen} onOpenChange={() => setSettleModalOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Receive Payment — {selectedReceivable.customer_name}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSettlePayment} className="space-y-4 my-2">
              <div className="bg-muted/40 p-3 rounded-lg text-sm flex justify-between items-center">
                <div>
                  <span className="text-muted-foreground block text-xs">Invoice Reference:</span>
                  <span className="font-semibold">{selectedReceivable.invoice_number}</span>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground block text-xs">Outstanding Balance:</span>
                  <span className="font-bold text-amber-600">₹{selectedReceivable.outstanding}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Payment Amount (₹) *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Payment Method *</label>
                <select
                  value={settleMethod}
                  onChange={(e) => setSettleMethod(e.target.value)}
                  className="w-full mt-1 p-2 border rounded-md text-sm bg-background"
                >
                  <option value="cash">CASH</option>
                  <option value="upi">UPI</option>
                  <option value="card">CARD</option>
                  <option value="bank_transfer">BANK TRANSFER</option>
                  <option value="cheque">CHEQUE</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Settlement Notes / Reference</label>
                <Input
                  placeholder="e.g. Paid via UPI GPay ref 123456"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  className="mt-1"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSettleModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={settling} className="bg-emerald-600 hover:bg-emerald-700">
                  {settling ? "Recording..." : "Record & Clear Udhaar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
