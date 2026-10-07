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
  Eye,
  FileText,
  Boxes,
  History,
  X,
  Building,
  CreditCard,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function PurchasesPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "history">("orders");
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  // Create Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "history") setActiveTab("history");
      const sId = params.get("supplier_id");
      if (sId) {
        setSupplierFilter(sId);
        setSelectedSupplierId(sId);
      }
    }
  }, []);
  const [notes, setNotes] = useState("");
  const [poItems, setPoItems] = useState<
    Array<{ product_id: string; product_name: string; quantity: number; purchase_price: number; tax_rate: number; total: number }>
  >([{ product_id: "", product_name: "", quantity: 1, purchase_price: 0, tax_rate: 18, total: 0 }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [poRes, supRes, prodRes] = await Promise.all([
        posApi.getPurchaseOrders(),
        supplierApi.list(),
        posApi.searchProducts({ page_size: 100 }),
      ]);

      const poList = Array.isArray(poRes.data) ? poRes.data : poRes.data?.results || [];
      setPurchases(poList);

      const supList = Array.isArray(supRes.data) ? supRes.data : supRes.data?.results || [];
      setSuppliers(supList);

      const prodList = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.results || [];
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
      setFormError(err.response?.data?.error || err.response?.data?.detail || "Failed to create purchase order.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered List
  const filteredPurchases = purchases.filter((po) => {
    const sTerm = searchTerm.toLowerCase();
    const matchesSearch =
      !sTerm ||
      po.po_number?.toLowerCase().includes(sTerm) ||
      po.supplier_name?.toLowerCase().includes(sTerm) ||
      po.supplier?.toLowerCase().includes(sTerm) ||
      po.supplier_invoice_number?.toLowerCase().includes(sTerm);

    const matchesSupplier =
      !supplierFilter ||
      po.supplier_ref === supplierFilter ||
      po.supplier === suppliers.find((s) => s.id === supplierFilter)?.name;

    return matchesSearch && matchesSupplier;
  });

  const totalPoSum = filteredPurchases.reduce(
    (sum, po) => sum + (parseFloat(String(po.total_amount)) || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Truck className="h-4 w-4 text-primary" />
            <span>Purchasing & Inward Stock</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Purchase Orders & Stock-In
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Procure inventory from vendors, track supplier invoices, and auto-replenish stock
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadData()}
            className="flex items-center gap-1.5 rounded-lg border bg-card hover:bg-accent px-3 py-2 text-xs font-medium text-foreground transition-all shadow-sm"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>+ Record Purchase</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b text-xs font-medium">
        <button
          onClick={() => setActiveTab("orders")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors",
            activeTab === "orders"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <ClipboardList className="h-4 w-4" />
          <span>Purchase Orders</span>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary">
            {purchases.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors",
            activeTab === "history"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <History className="h-4 w-4" />
          <span>Purchase History & Value</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search PO #, Supplier name, or Supplier Invoice #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border bg-background pl-9 pr-4 py-2 text-xs focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              aria-label="Filter by supplier"
              className="rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {(searchTerm || supplierFilter) && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSupplierFilter("");
                }}
                className="rounded-lg border bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">PO #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-4">Supplier Invoice #</th>
                <th className="py-3 px-4">Total Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                      <span>Loading purchase orders...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
                      <div>
                        <p className="font-semibold text-foreground text-sm">No Purchase Orders Recorded</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Inward stock purchases automatically increase inventory and update purchase costs.
                        </p>
                      </div>
                      <button
                        onClick={handleOpenCreate}
                        className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm"
                      >
                        + Record Purchase
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((po) => (
                  <tr
                    key={po.id}
                    className="hover:bg-accent/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedPO(po)}
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-foreground">
                      {po.po_number}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {po.purchase_date || new Date(po.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 font-medium text-foreground">
                      {po.supplier_name || po.supplier || "Supplier"}
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {po.supplier_invoice_number || "—"}
                    </td>
                    <td className="py-3 px-4 font-bold text-foreground">
                      ₹{Number(po.total_amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {po.status?.toUpperCase() || "RECEIVED"}
                      </span>
                    </td>
                    <td
                      className="py-3 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setSelectedPO(po)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table summary footer */}
        {filteredPurchases.length > 0 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs bg-muted/20">
            <span className="text-muted-foreground">
              Total {filteredPurchases.length} Purchase Orders
            </span>
            <div className="font-bold text-foreground">
              Total Value: <span className="text-primary font-mono">₹{totalPoSum.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* CREATE PURCHASE ORDER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-2xl border bg-card p-6 shadow-2xl text-foreground max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Record Inward Stock Purchase</h3>
                <p className="text-xs text-muted-foreground">
                  Inward stock directly increases on-hand inventory and logs purchase ledger
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPO} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
              {formError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Select Supplier *</label>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">-- Choose Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Supplier Invoice #</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-9042"
                    value={supplierInvoiceNumber}
                    onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Purchase Date *</label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Items Table Builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-muted-foreground">
                    Products & Inward Stock
                  </h4>
                  <button
                    type="button"
                    onClick={addPoItemRow}
                    className="text-primary hover:underline font-semibold text-xs flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Product</span>
                  </button>
                </div>

                <div className="space-y-2 border rounded-xl p-3 bg-muted/20">
                  {poItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-card p-2 rounded-lg border">
                      <div className="col-span-12 sm:col-span-5">
                        <label className="block text-[10px] text-muted-foreground mb-0.5">Product</label>
                        <select
                          required
                          value={item.product_id}
                          onChange={(e) => handleSelectProduct(idx, e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs bg-background"
                        >
                          <option value="">-- Select Product --</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (Stock: {p.current_stock || 0})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3 sm:col-span-2">
                        <label className="block text-[10px] text-muted-foreground mb-0.5">Quantity</label>
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          required
                          value={item.quantity}
                          onChange={(e) => updatePoItem(idx, "quantity", e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs bg-background text-center"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label className="block text-[10px] text-muted-foreground mb-0.5">Buy Price (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={item.purchase_price}
                          onChange={(e) => updatePoItem(idx, "purchase_price", e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs bg-background text-right"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2 text-right">
                        <label className="block text-[10px] text-muted-foreground mb-0.5">Total (₹)</label>
                        <span className="font-bold text-foreground">₹{Number(item.total || 0).toFixed(2)}</span>
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => removePoItemRow(idx)}
                          className="p-1 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Notes / Delivery Reference</label>
                <input
                  type="text"
                  placeholder="e.g. Received via BlueDart shipment #44021"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="border-t pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border px-4 py-2 font-semibold hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-primary text-primary-foreground px-5 py-2 font-semibold shadow-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? "Recording Purchase..." : "Confirm & Inward Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl text-foreground max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <h3 className="text-base font-bold font-mono text-foreground">#{selectedPO.po_number}</h3>
                <p className="text-xs text-muted-foreground">
                  Purchase Order & Stock-In Receipt
                </p>
              </div>
              <button
                onClick={() => setSelectedPO(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3.5">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Supplier</span>
                  <div className="font-semibold text-sm mt-0.5">{selectedPO.supplier_name || selectedPO.supplier}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Invoice #</span>
                  <div className="font-mono text-sm mt-0.5">{selectedPO.supplier_invoice_number || "—"}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Date</span>
                  <div>{selectedPO.purchase_date || new Date(selectedPO.created_at).toLocaleDateString()}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Received By</span>
                  <div>{selectedPO.created_by_name || "Staff"}</div>
                </div>
              </div>

              {selectedPO.items && selectedPO.items.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Received Items
                  </h4>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-muted/50 border-b text-[10px] font-bold uppercase text-muted-foreground">
                        <tr>
                          <th className="py-2 px-3">Product</th>
                          <th className="py-2 px-2 text-center">Qty</th>
                          <th className="py-2 px-3 text-right">Unit Price</th>
                          <th className="py-2 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selectedPO.items.map((it: any, idx: number) => (
                          <tr key={idx}>
                            <td className="py-2 px-3 font-medium">{it.product_name || (it.product?.name) || "Item"}</td>
                            <td className="py-2 px-2 text-center font-mono">{it.quantity}</td>
                            <td className="py-2 px-3 text-right font-mono">₹{Number(it.purchase_price).toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold">₹{Number(it.total).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-between text-sm font-bold border-t pt-3">
                <span>Grand Total:</span>
                <span className="font-mono text-primary">₹{Number(selectedPO.total_amount).toFixed(2)}</span>
              </div>
            </div>

            <div className="border-t pt-4 flex justify-end">
              <button
                onClick={() => setSelectedPO(null)}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 font-semibold hover:bg-primary/90"
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
