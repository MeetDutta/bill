"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi, supplierApi } from "@/services/api";
import type { PurchaseOrder, Supplier, POSProduct } from "@/types";
import {
  ClipboardList,
  Search,
  Plus,
  RefreshCw,
  Truck,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Boxes,
  History,
  X,
  Building,
  CreditCard,
  User,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function PurchaseOrdersPage() {
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [receiveModalPO, setReceiveModalPO] = useState<PurchaseOrder | null>(null);
  const [receiveInvoiceNumber, setReceiveInvoiceNumber] = useState("");
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiving, setReceiving] = useState(false);

  // Create Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [poStatus, setPoStatus] = useState<"ordered" | "received" | "draft">("ordered");
  const [notes, setNotes] = useState("");
  const [poItems, setPoItems] = useState<
    Array<{ product_id: string; product_name: string; quantity: number; purchase_price: number; tax_rate: number; total: number }>
  >([{ product_id: "", product_name: "", quantity: 1, purchase_price: 0, tax_rate: 18, total: 0 }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [poRes, supRes, prodRes] = await Promise.all([
        posApi.getPurchaseOrders(),
        supplierApi.list(),
        posApi.searchProducts({ page_size: 100 }),
      ]);

      const poList = Array.isArray(poRes.data) ? poRes.data : (poRes.data as any)?.results || [];
      setPurchases(poList);

      const supList = Array.isArray(supRes.data) ? supRes.data : (supRes.data as any)?.results || [];
      setSuppliers(supList);

      const prodList = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data as any)?.results || [];
      setProducts(prodList);
    } catch (err) {
      console.error("Failed to load purchasing data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle open create modal
  const handleOpenCreate = () => {
    setSelectedSupplierId(supplierFilter || (suppliers[0]?.id || ""));
    setSupplierInvoiceNumber("");
    setPurchaseDate(new Date().toISOString().split("T")[0]);
    setExpectedDelivery("");
    setPoStatus("ordered");
    setNotes("");
    setPoItems([{ product_id: "", product_name: "", quantity: 1, purchase_price: 0, tax_rate: 18, total: 0 }]);
    setFormError("");
    setShowCreateModal(true);
  };

  // Update Line Items
  const updatePoItem = (index: number, field: string, value: any) => {
    const updated = [...poItems];
    const it = { ...updated[index], [field]: value };

    const qty = parseFloat(String(it.quantity)) || 0;
    const price = parseFloat(String(it.purchase_price)) || 0;
    const rate = parseFloat(String(it.tax_rate)) || 0;

    const sub = qty * price;
    const tax = sub * (rate / 100);
    it.total = Math.round((sub + tax) * 100) / 100;

    updated[index] = it;
    setPoItems(updated);
  };

  const handleSelectProduct = (index: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const updated = [...poItems];
    const qty = updated[index].quantity || 1;
    const cost = (prod as any).cost_price || (prod as any).purchase_price || 0;
    const rate = prod.tax_rate || 0;
    const sub = Number(qty) * Number(cost);
    const tax = sub * (Number(rate) / 100);

    updated[index] = {
      product_id: prod.id,
      product_name: prod.name,
      quantity: Number(qty),
      purchase_price: Number(cost),
      tax_rate: Number(rate),
      total: Math.round((sub + tax) * 100) / 100,
    };
    setPoItems(updated);
  };

  const addPoItemRow = () => {
    setPoItems([
      ...poItems,
      { product_id: "", product_name: "", quantity: 1, purchase_price: 0, tax_rate: 18, total: 0 },
    ]);
  };

  const removePoItemRow = (index: number) => {
    if (poItems.length <= 1) return;
    setPoItems(poItems.filter((_, i) => i !== index));
  };

  // Submit PO
  const handleSubmitPO = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const validItems = poItems.filter((it) => it.product_id && (parseFloat(String(it.quantity)) || 0) > 0);
    if (validItems.length === 0) {
      setFormError("Please select at least one product with valid quantity.");
      return;
    }

    const supplierObj = suppliers.find((s) => s.id === selectedSupplierId);

    setSubmitting(true);
    try {
      await posApi.createPurchaseOrder({
        supplier_id: selectedSupplierId || undefined,
        supplier: supplierObj?.name || "Supplier",
        supplier_invoice_number: supplierInvoiceNumber,
        purchase_date: purchaseDate,
        expected_delivery: expectedDelivery || undefined,
        status: poStatus,
        notes,
        items: validItems.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          purchase_price: it.purchase_price,
          tax_rate: it.tax_rate,
        })),
      });

      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      setFormError(err.response?.data?.error || err.message || "Failed to create purchase order");
    } finally {
      setSubmitting(false);
    }
  };

  // Receive PO
  const handleReceivePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveModalPO) return;
    setReceiving(true);
    try {
      await posApi.receivePurchaseOrder(receiveModalPO.id, {
        supplier_invoice_number: receiveInvoiceNumber,
        notes: receiveNotes,
      });
      setReceiveModalPO(null);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to receive purchase order");
    } finally {
      setReceiving(false);
    }
  };

  // Cancel PO
  const handleCancelPO = async (po: PurchaseOrder) => {
    if (!confirm(`Cancel Purchase Order ${po.po_number}? This cannot be undone.`)) return;
    try {
      await posApi.cancelPurchaseOrder(po.id, { reason: "Cancelled by merchant" });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to cancel purchase order");
    }
  };

  // Filter
  const filteredPurchases = purchases.filter((po) => {
    const term = searchTerm.toLowerCase();
    const poNum = (po.po_number || "").toLowerCase();
    const sup = (po.supplier_name || po.supplier || "").toLowerCase();
    const matchesSearch = poNum.includes(term) || sup.includes(term);

    const matchesSupplier = !supplierFilter || po.supplier_ref === supplierFilter;
    const matchesStatus = statusFilter === "all" || po.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesSupplier && matchesStatus;
  });

  const activeOrdersCount = purchases.filter((p) => p.status === "ordered" || p.status === "sent").length;
  const draftOrdersCount = purchases.filter((p) => p.status === "draft").length;
  const completedCount = purchases.filter((p) => p.status === "received").length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
              <ClipboardList className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Supplier procurement workflow: Track pending supplier orders, deliveries, and stock receipt.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/purchases/history">
            <Button variant="outline" className="gap-2">
              <History className="w-4 h-4" />
              Purchase History
            </Button>
          </Link>
          <Button onClick={handleOpenCreate} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4" />
            Create Purchase Order
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pending Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{activeOrdersCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting delivery & receipt</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Draft Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{draftOrdersCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Unsent procurement orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Received Purchases
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{completedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Stock received & ledgered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Order Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{purchases.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Lifetime supplier orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by PO number or supplier name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm bg-background"
            >
              <option value="all">All Statuses</option>
              <option value="ordered">Ordered / Pending</option>
              <option value="draft">Draft</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm bg-background"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Purchase Orders Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">PO Number</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Supplier</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Order Date</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Expected Delivery</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Status</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Items</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Total (₹)</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Loading purchase orders...
                    </td>
                  </tr>
                ) : filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      No purchase orders matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((po) => {
                    const isReceived = po.status.toLowerCase() === "received";
                    const isCancelled = po.status.toLowerCase() === "cancelled";
                    const isPending = po.status.toLowerCase() === "ordered" || po.status.toLowerCase() === "sent";

                    return (
                      <tr key={po.id} className="hover:bg-muted/20">
                        <td className="py-3 px-4 font-mono font-medium">{po.po_number}</td>
                        <td className="py-3 px-4">{po.supplier_name || po.supplier}</td>
                        <td className="py-3 px-4 font-mono text-xs">{po.purchase_date}</td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                          {po.expected_delivery || "—"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isReceived ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600">
                              <CheckCircle2 className="w-3 h-3" /> Received
                            </span>
                          ) : isCancelled ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600">
                              <XCircle className="w-3 h-3" /> Cancelled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600">
                              <Clock className="w-3 h-3" /> {po.status.toUpperCase()}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">{po.items?.length || 0}</td>
                        <td className="py-3 px-4 text-right font-semibold">
                          ₹{parseFloat(po.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => setSelectedPO(po)}
                              title="View PO Details"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>

                            {isPending && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                                  onClick={() => {
                                    setReceiveModalPO(po);
                                    setReceiveInvoiceNumber(po.supplier_invoice_number || "");
                                    setReceiveNotes("");
                                  }}
                                  title="Receive Goods into Inventory"
                                >
                                  Receive
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700"
                                  onClick={() => handleCancelPO(po)}
                                  title="Cancel PO"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </>
                            )}

                            {isReceived && (
                              <Link href="/dashboard/purchases/history">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-muted-foreground"
                                  title="View in Purchase History"
                                >
                                  <ArrowUpRight className="w-4 h-4" />
                                </Button>
                              </Link>
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
        </CardContent>
      </Card>

      {/* Create PO Modal */}
      {showCreateModal && (
        <Dialog open={showCreateModal} onOpenChange={() => setShowCreateModal(false)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Purchase Order (Procurement)</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmitPO} className="space-y-4 my-2">
              {formError && (
                <div className="p-3 text-sm rounded bg-rose-500/10 border border-rose-500/20 text-rose-600">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Supplier *</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full mt-1 p-2 border rounded-md text-sm bg-background"
                    required
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Order Date *</label>
                  <Input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="mt-1"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Expected Delivery</label>
                  <Input
                    type="date"
                    value={expectedDelivery}
                    onChange={(e) => setExpectedDelivery(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">PO Workflow Status</label>
                  <select
                    value={poStatus}
                    onChange={(e) => setPoStatus(e.target.value as any)}
                    className="w-full mt-1 p-2 border rounded-md text-sm bg-background"
                  >
                    <option value="ordered">Ordered / Pending Delivery (Procurement)</option>
                    <option value="draft">Draft (Save for review)</option>
                    <option value="received">Received Immediately (Direct Stock-In)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Supplier Invoice # (if known)</label>
                  <Input
                    placeholder="e.g. INV-8899"
                    value={supplierInvoiceNumber}
                    onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Line Items
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={addPoItemRow} className="gap-1 text-xs">
                    <Plus className="w-3.5 h-3.5" /> Add Product
                  </Button>
                </div>

                <div className="space-y-2">
                  {poItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center bg-muted/20 p-2 rounded-lg border">
                      <div className="flex-1">
                        <select
                          value={item.product_id}
                          onChange={(e) => handleSelectProduct(idx, e.target.value)}
                          className="w-full p-2 border rounded-md text-xs bg-background"
                          required
                        >
                          <option value="">Select Product...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (SKU: {p.sku || "N/A"})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-20">
                        <Input
                          type="number"
                          placeholder="Qty"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updatePoItem(idx, "quantity", e.target.value)}
                          className="text-xs"
                          required
                        />
                      </div>

                      <div className="w-24">
                        <Input
                          type="number"
                          placeholder="Cost"
                          step="0.01"
                          value={item.purchase_price}
                          onChange={(e) => updatePoItem(idx, "purchase_price", e.target.value)}
                          className="text-xs"
                          required
                        />
                      </div>

                      <div className="w-20">
                        <Input
                          type="number"
                          placeholder="GST %"
                          value={item.tax_rate}
                          onChange={(e) => updatePoItem(idx, "tax_rate", e.target.value)}
                          className="text-xs"
                        />
                      </div>

                      <div className="w-24 text-right font-mono text-xs font-semibold pr-2">
                        ₹{item.total.toFixed(2)}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePoItemRow(idx)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-500"
                        disabled={poItems.length <= 1}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Order Notes / Instructions</label>
                <Input
                  placeholder="e.g. Restocking order, dispatch via road transport"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                  {submitting ? "Creating..." : "Save Purchase Order"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Receive Stock Modal */}
      {receiveModalPO && (
        <Dialog open={!!receiveModalPO} onOpenChange={() => setReceiveModalPO(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Receive Goods into Stock — {receiveModalPO.po_number}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleReceivePO} className="space-y-4 my-2">
              <p className="text-sm text-muted-foreground">
                Receiving this purchase order will increase inventory stock for all{" "}
                <span className="font-semibold text-foreground">{receiveModalPO.items?.length || 0}</span> items and
                record official PURCHASE inventory movements.
              </p>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Supplier Invoice Number *</label>
                <Input
                  placeholder="e.g. SUP-INV-9988"
                  value={receiveInvoiceNumber}
                  onChange={(e) => setReceiveInvoiceNumber(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Receipt / Inspection Notes</label>
                <Input
                  placeholder="e.g. All cartons inspected and verified"
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  className="mt-1"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReceiveModalPO(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={receiving} className="bg-emerald-600 hover:bg-emerald-700">
                  {receiving ? "Receiving..." : "Confirm & Update Stock"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* PO Detail Dialog */}
      {selectedPO && (
        <Dialog open={!!selectedPO} onOpenChange={() => setSelectedPO(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Purchase Order — {selectedPO.po_number}</span>
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
                  <span className="text-muted-foreground text-xs block">Status:</span>
                  <span className="font-semibold capitalize">{selectedPO.status}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Line Items
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
                <span>Total Expected Amount:</span>
                <span className="text-base text-foreground">
                  ₹{parseFloat(selectedPO.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setSelectedPO(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
