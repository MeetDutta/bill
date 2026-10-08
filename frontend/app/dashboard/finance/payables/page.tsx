"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi } from "@/services/api";
import type { PayableItem } from "@/types";
import {
  FileSpreadsheet,
  Search,
  CreditCard,
  Calendar,
  AlertCircle,
  Truck,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function PayablesPage() {
  const [payables, setPayables] = useState<PayableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Payment Modal State
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedPayable, setSelectedPayable] = useState<PayableItem | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paying, setPaying] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApi.getPayables();
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.results || [];
      setPayables(list);
    } catch (err) {
      console.error("Failed to load payables:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayable) return;
    setPaying(true);
    try {
      await posApi.recordSupplierPayment({
        supplier_id: selectedPayable.supplier_id,
        purchase_order_id: selectedPayable.po_id,
        amount: parseFloat(payAmount) || 0,
        payment_method: payMethod,
        reference: payReference,
        notes: payNotes || `Payout for PO ${selectedPayable.po_number}`,
      });
      setPayModalOpen(false);
      setSelectedPayable(null);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to record supplier payment");
    } finally {
      setPaying(false);
    }
  };

  const filtered = payables.filter((p) => {
    const term = searchTerm.toLowerCase();
    const sup = (p.supplier_name || "").toLowerCase();
    const poNum = (p.po_number || "").toLowerCase();
    const inv = (p.supplier_invoice_number || "").toLowerCase();
    const matchesSearch = sup.includes(term) || poNum.includes(term) || inv.includes(term);

    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalOutstanding = filtered.reduce((acc, p) => acc + (parseFloat(p.outstanding) || 0), 0);
  const overdueCount = filtered.filter((p) => p.status === "OVERDUE").length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Supplier Payables</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Track unpaid vendor invoices, purchase liabilities, aging overdue days, and record disbursements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/purchases/history">
            <Button variant="outline" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              Purchase History
            </Button>
          </Link>
          <Link href="/dashboard/finance/payments">
            <Button variant="outline" className="gap-2">
              <CreditCard className="w-4 h-4" />
              Payment Ledger
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Outstanding Payables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ₹{totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Owed to suppliers for received stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Unsettled PO Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filtered.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Pending payment disbursement</p>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Overdue Payables (&gt;30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">{overdueCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Due past supplier credit term</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by supplier name, PO number, or invoice number..."
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

      {/* Payables Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Supplier</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">PO Number</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Supplier Inv #</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Purchase Date</th>
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
                      Loading supplier payables...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      No outstanding supplier payables!
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.po_id} className="hover:bg-muted/20">
                      <td className="py-3 px-4 font-medium">{p.supplier_name}</td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{p.po_number}</td>
                      <td className="py-3 px-4 font-mono text-xs">{p.supplier_invoice_number || "—"}</td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{p.purchase_date}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        ₹{parseFloat(p.total).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-600">
                        ₹{parseFloat(p.paid).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-bold text-blue-600">
                        ₹{parseFloat(p.outstanding).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold",
                            p.status === "OVERDUE"
                              ? "bg-rose-500/10 text-rose-700"
                              : p.status === "DUE_SOON"
                              ? "bg-amber-500/10 text-amber-700"
                              : "bg-blue-500/10 text-blue-700"
                          )}
                        >
                          {p.status} ({p.days_overdue}d)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                          onClick={() => {
                            setSelectedPayable(p);
                            setPayAmount(p.outstanding);
                            setPayMethod("bank_transfer");
                            setPayReference("");
                            setPayNotes(`Disbursement for ${p.po_number}`);
                            setPayModalOpen(true);
                          }}
                        >
                          Pay Vendor
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

      {/* Pay Vendor Modal */}
      {payModalOpen && selectedPayable && (
        <Dialog open={payModalOpen} onOpenChange={() => setPayModalOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disburse Payment to {selectedPayable.supplier_name}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleRecordPayment} className="space-y-4 my-2">
              <div className="bg-muted/40 p-3 rounded-lg text-sm flex justify-between items-center">
                <div>
                  <span className="text-muted-foreground block text-xs">Purchase Order:</span>
                  <span className="font-semibold">{selectedPayable.po_number}</span>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground block text-xs">Outstanding Payable:</span>
                  <span className="font-bold text-blue-600">₹{selectedPayable.outstanding}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Disbursement Amount (₹) *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Payment Mode *</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full mt-1 p-2 border rounded-md text-sm bg-background"
                >
                  <option value="bank_transfer">BANK TRANSFER / NEFT / RTGS</option>
                  <option value="cheque">CHEQUE</option>
                  <option value="upi">UPI</option>
                  <option value="cash">CASH</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Transaction Reference / UTR #</label>
                <Input
                  placeholder="e.g. UTR-99882233"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Payment Notes</label>
                <Input
                  placeholder="e.g. Cleared via HDFC Bank netbanking"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="mt-1"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPayModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={paying} className="bg-blue-600 hover:bg-blue-700">
                  {paying ? "Recording..." : "Confirm & Record Disbursement"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
