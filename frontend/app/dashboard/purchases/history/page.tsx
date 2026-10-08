"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi } from "@/services/api";
import type { PurchaseOrder } from "@/types";
import {
  History,
  Search,
  Filter,
  Eye,
  FileText,
  Boxes,
  Truck,
  Calendar,
  CreditCard,
  ArrowUpRight,
  ClipboardList,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function PurchaseHistoryPage() {
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApi.getPurchaseOrders({ status: "received" });
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.results || [];
      setPurchases(list);
    } catch (err) {
      console.error("Failed to load purchase history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredPurchases = purchases.filter((po) => {
    const term = searchTerm.toLowerCase();
    const poNum = (po.po_number || "").toLowerCase();
    const invNum = (po.supplier_invoice_number || "").toLowerCase();
    const sup = (po.supplier_name || po.supplier || "").toLowerCase();
    return poNum.includes(term) || invNum.includes(term) || sup.includes(term);
  });

  const totalValue = filteredPurchases.reduce((acc, p) => acc + (parseFloat(p.total_amount) || 0), 0);
  const totalPaid = filteredPurchases.reduce((acc, p) => acc + (parseFloat(p.paid_amount || "0") || 0), 0);
  const totalOutstanding = filteredPurchases.reduce(
    (acc, p) => acc + (parseFloat(p.outstanding_amount || p.total_amount) || 0),
    0
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
              <History className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Purchase History</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Historical ledger of completed supplier stock-inward bills and payments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/purchases">
            <Button variant="outline" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              Purchase Orders
            </Button>
          </Link>
          <Link href="/dashboard/finance/payables">
            <Button variant="outline" className="gap-2">
              <CreditCard className="w-4 h-4" />
              Supplier Payables
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Completed Purchases
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredPurchases.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Stock received & ledgered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Inward Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">₹{totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground mt-1">Gross supplier purchases</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Paid to Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">₹{totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground mt-1">Settled vendor payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Outstanding Payable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">₹{totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground mt-1">Pending vendor settlements</p>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by supplier name, invoice number, or PO number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Purchases Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Purchase Date</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Supplier Invoice #</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">PO Number</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Supplier</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Items</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Total (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Paid (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Outstanding (₹)</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Status</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted-foreground">
                      Loading purchase history...
                    </td>
                  </tr>
                ) : filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted-foreground">
                      No completed purchases found.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((po) => (
                    <tr key={po.id} className="hover:bg-muted/20">
                      <td className="py-3 px-4 font-mono text-xs">{po.purchase_date}</td>
                      <td className="py-3 px-4 font-medium text-foreground">
                        {po.supplier_invoice_number || (
                          <span className="text-muted-foreground italic">No Inv #</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{po.po_number}</td>
                      <td className="py-3 px-4">{po.supplier_name || po.supplier}</td>
                      <td className="py-3 px-4 text-center">{po.items?.length || 0}</td>
                      <td className="py-3 px-4 text-right font-semibold">
                        ₹{parseFloat(po.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-600 font-medium">
                        ₹{parseFloat(po.paid_amount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-600 font-medium">
                        ₹{parseFloat(po.outstanding_amount || po.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" />
                          Received
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setSelectedPO(po)}
                            title="View Purchase Details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Link href={`/dashboard/inventory/movements?reference_id=${po.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="View Resulting Stock Movements"
                            >
                              <Boxes className="w-4 h-4 text-blue-600" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* PO Detail Dialog */}
      {selectedPO && (
        <Dialog open={!!selectedPO} onOpenChange={() => setSelectedPO(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Purchase Receipt — {selectedPO.po_number}</span>
                <span className="text-xs font-normal text-muted-foreground">{selectedPO.purchase_date}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 my-2">
              <div className="grid grid-cols-2 gap-4 bg-muted/40 p-3 rounded-lg text-sm">
                <div>
                  <span className="text-muted-foreground text-xs block">Supplier:</span>
                  <span className="font-semibold">{selectedPO.supplier_name || selectedPO.supplier}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block">Supplier Invoice Number:</span>
                  <span className="font-semibold">{selectedPO.supplier_invoice_number || "None"}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Received Line Items
                </h4>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-center">Qty</th>
                        <th className="p-2 text-right">Cost Price (₹)</th>
                        <th className="p-2 text-right">Tax Rate (%)</th>
                        <th className="p-2 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedPO.items?.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-medium">{it.product_name}</td>
                          <td className="p-2 text-center">{it.quantity}</td>
                          <td className="p-2 text-right">₹{parseFloat(it.purchase_price).toFixed(2)}</td>
                          <td className="p-2 text-right">{it.tax_rate}%</td>
                          <td className="p-2 text-right font-semibold">₹{parseFloat(it.total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center bg-muted/20 p-3 rounded-lg text-sm font-semibold">
                <span>Total Purchase Amount:</span>
                <span className="text-base text-foreground">
                  ₹{parseFloat(selectedPO.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Link href={`/dashboard/inventory/movements?reference_id=${selectedPO.id}`}>
                <Button variant="outline" className="gap-2">
                  <Boxes className="w-4 h-4" />
                  View Stock Movements
                </Button>
              </Link>
              <Button onClick={() => setSelectedPO(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
