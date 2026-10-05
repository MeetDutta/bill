"use client";

import React, { useState, useEffect } from "react";
import {
  Boxes,
  AlertTriangle,
  History,
  PlusCircle,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  CheckCircle,
  Truck,
  RotateCcw,
} from "lucide-react";
import { posApi } from "@/services/api";
import { POSProduct, InventoryMovement } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<"stock" | "ledger" | "purchases">("stock");
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // Adjustment Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<POSProduct | null>(null);
  const [adjustmentData, setAdjustmentData] = useState({
    movement_type: "ADJUSTMENT",
    quantity: "",
    notes: "",
  });
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Purchase Stock-in Modal
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [poForm, setPoForm] = useState({
    supplier: "",
    supplier_invoice_number: "",
    product_id: "",
    quantity: "1",
    purchase_price: "",
    notes: "",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, moveRes, poRes] = await Promise.all([
        posApi.searchProducts({ page_size: 100 }),
        posApi.getInventoryMovements({ page_size: 50 }),
        posApi.getPurchaseOrders(),
      ]);
      const prodList = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.results || [];
      setProducts(prodList);

      const moveList = Array.isArray(moveRes.data) ? moveRes.data : moveRes.data.results || [];
      setMovements(moveList);

      const poList = Array.isArray(poRes.data) ? poRes.data : poRes.data.results || [];
      setPurchases(poList);
    } catch (err) {
      console.error("Failed to load inventory data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setSubmittingAdjust(true);
    try {
      await posApi.adjustInventory({
        product_id: selectedProduct.id,
        movement_type: adjustmentData.movement_type,
        quantity: parseFloat(adjustmentData.quantity) || 0,
        notes: adjustmentData.notes,
      });
      setAdjustModalOpen(false);
      setAdjustmentData({ movement_type: "ADJUSTMENT", quantity: "", notes: "" });
      loadData();
    } catch (err) {
      alert("Failed to adjust inventory.");
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await posApi.createPurchaseOrder({
        supplier: poForm.supplier,
        supplier_invoice_number: poForm.supplier_invoice_number,
        items: [
          {
            product_id: poForm.product_id,
            quantity: parseFloat(poForm.quantity) || 1,
            purchase_price: parseFloat(poForm.purchase_price) || 0,
          },
        ],
        notes: poForm.notes,
      });
      setPurchaseModalOpen(false);
      setPoForm({
        supplier: "",
        supplier_invoice_number: "",
        product_id: "",
        quantity: "1",
        purchase_price: "",
        notes: "",
      });
      loadData();
    } catch (err) {
      alert("Failed to record purchase.");
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchSearch =
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search);
    if (!matchSearch) return false;
    if (showLowStockOnly) {
      const stock = Number(p.current_stock) || 0;
      const min = Number(p.min_stock) || 5;
      return p.track_inventory && stock <= min;
    }
    return true;
  });

  const lowStockCount = products.filter((p) => {
    const stock = Number(p.current_stock) || 0;
    const min = Number(p.min_stock) || 5;
    return p.track_inventory && stock <= min;
  }).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Inventory Management</h2>
          <p className="text-sm text-muted-foreground">
            Multi-store stock tracking, stock adjustments, supplier stock-in, and immutable movement ledger.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPurchaseModalOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Truck className="h-4 w-4" />
            Stock-In / Supplier PO
          </Button>
          <a href="/dashboard/pos">
            <Button size="sm" className="gap-1.5 text-xs">
              Go to POS Terminal
            </Button>
          </a>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Tracked Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{products.length}</div>
            <p className="text-xs text-muted-foreground">Items active in catalog</p>
          </CardContent>
        </Card>

        <Card className={lowStockCount > 0 ? "border-amber-500/40 bg-amber-500/5" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Low Stock Alerts</span>
              {lowStockCount > 0 && <AlertTriangle className="h-4 w-4 text-amber-600" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-black ${lowStockCount > 0 ? "text-amber-700" : ""}`}>
              {lowStockCount}
            </div>
            <p className="text-xs text-muted-foreground">Products below threshold</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Inventory Movements Logged
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{movements.length}</div>
            <p className="text-xs text-muted-foreground">Audited in transaction ledger</p>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b text-sm font-medium">
        <button
          onClick={() => setActiveTab("stock")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "stock"
              ? "border-primary font-bold text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Boxes className="h-4 w-4" />
          Stock Levels ({products.length})
        </button>

        <button
          onClick={() => setActiveTab("ledger")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "ledger"
              ? "border-primary font-bold text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-4 w-4" />
          Movement Ledger ({movements.length})
        </button>

        <button
          onClick={() => setActiveTab("purchases")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "purchases"
              ? "border-primary font-bold text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Truck className="h-4 w-4" />
          Supplier Purchases ({purchases.length})
        </button>
      </div>

      {/* TAB 1: Stock Levels */}
      {activeTab === "stock" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products by SKU, name, barcode..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLowStockOnly}
                    onChange={(e) => setShowLowStockOnly(e.target.checked)}
                    className="rounded text-primary"
                  />
                  Show Low Stock Only ({lowStockCount})
                </label>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading stock data...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No matching products found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Selling Price</th>
                      <th className="py-2.5 px-3 text-right">Current Stock</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredProducts.map((p) => {
                      const stock = Number(p.current_stock) || 0;
                      const min = Number(p.min_stock) || 5;
                      const isLow = p.track_inventory && stock <= min;

                      return (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3 font-semibold text-foreground">
                            {p.name}
                            {p.brand && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">({p.brand})</span>}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">{p.sku}</td>
                          <td className="py-2.5 px-3">{p.category || "General"}</td>
                          <td className="py-2.5 px-3 font-semibold">₹{Number(p.selling_price).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            {stock} {p.unit || "pcs"}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {p.track_inventory ? (
                              isLow ? (
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                  Low Stock
                                </span>
                              ) : (
                                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                  In Stock
                                </span>
                              )
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Not Tracked</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedProduct(p);
                                setAdjustmentData({ movement_type: "ADJUSTMENT", quantity: "", notes: "" });
                                setAdjustModalOpen(true);
                              }}
                              className="h-7 text-xs"
                            >
                              Adjust Stock
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 2: Immutable Movement Ledger */}
      {activeTab === "ledger" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit Trail & Movement Ledger</CardTitle>
            <CardDescription className="text-xs">
              Every stock increase or decrease is cryptographically linked to sales, returns, purchases, or user adjustments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {movements.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No inventory movements recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">Movement Type</th>
                      <th className="py-2.5 px-3 text-right">Qty Change</th>
                      <th className="py-2.5 px-3 text-right">Prev $\rightarrow$ New</th>
                      <th className="py-2.5 px-3">Reference / Notes</th>
                      <th className="py-2.5 px-3">Operator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {movements.map((m) => {
                      const qty = Number(m.quantity) || 0;
                      const isPositive = qty > 0;

                      return (
                        <tr key={m.id} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {new Date(m.created_at).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">
                            {m.product_name} <span className="font-mono text-muted-foreground">({m.sku})</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`rounded px-1.5 py-0.5 font-bold text-[10px] ${
                                m.movement_type === "SALE"
                                  ? "bg-blue-500/15 text-blue-700"
                                  : m.movement_type === "PURCHASE"
                                  ? "bg-emerald-500/15 text-emerald-700"
                                  : m.movement_type === "RETURN"
                                  ? "bg-purple-500/15 text-purple-700"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {m.movement_type}
                            </span>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold ${isPositive ? "text-emerald-600" : "text-destructive"}`}>
                            {isPositive ? `+${qty}` : qty}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                            {m.previous_stock} $\rightarrow$ <span className="font-bold text-foreground">{m.new_stock}</span>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {m.reference_id ? `${m.reference_type}: ${m.reference_id}` : m.notes || "—"}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">{m.user_name || "System"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: Supplier Purchases */}
      {activeTab === "purchases" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Supplier Purchase Orders</CardTitle>
              <CardDescription className="text-xs">
                Invoices received from suppliers and warehouse stock replenishment.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setPurchaseModalOpen(true)} className="gap-1.5 text-xs">
              <PlusCircle className="h-3.5 w-3.5" />
              New Purchase Entry
            </Button>
          </CardHeader>
          <CardContent>
            {purchases.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No purchase orders recorded yet. Record stock-ins using the button above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">PO Number</th>
                      <th className="py-2.5 px-3">Supplier</th>
                      <th className="py-2.5 px-3">Invoice Ref</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Items Count</th>
                      <th className="py-2.5 px-3 text-right">Total Amount</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {purchases.map((po) => (
                      <tr key={po.id} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 font-mono font-bold">{po.po_number}</td>
                        <td className="py-2.5 px-3 font-medium">{po.supplier}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{po.supplier_invoice_number || "—"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {new Date(po.purchase_date || po.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">{po.items?.length || 0}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-foreground">
                          ₹{Number(po.total_amount).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase">
                            {po.status || "Received"}
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
      )}

      {/* MODAL: Stock Adjustment */}
      <Dialog open={adjustModalOpen} onOpenChange={setAdjustModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Stock: {selectedProduct?.name}</DialogTitle>
          </DialogHeader>

          {selectedProduct && (
            <form onSubmit={handleAdjustStock} className="space-y-3 py-2 text-xs">
              <div className="rounded bg-muted p-2.5">
                <p className="font-semibold text-muted-foreground">Current Stock</p>
                <p className="text-lg font-black text-foreground">
                  {selectedProduct.current_stock} {selectedProduct.unit || "pcs"}
                </p>
              </div>

              <div>
                <label className="font-semibold">Reason / Movement Type *</label>
                <select
                  value={adjustmentData.movement_type}
                  onChange={(e) => setAdjustmentData({ ...adjustmentData, movement_type: e.target.value })}
                  className="mt-1 h-9 w-full rounded border px-2 text-xs"
                >
                  <option value="ADJUSTMENT">Physical Audit Count Adjustment</option>
                  <option value="DAMAGE">Damaged / Expired Goods</option>
                  <option value="OPENING_STOCK">Opening Stock Correction</option>
                  <option value="TRANSFER">Internal Store Transfer</option>
                </select>
              </div>

              <div>
                <label className="font-semibold">Quantity Delta (+ to increase, - to decrease) *</label>
                <Input
                  required
                  type="number"
                  step="any"
                  placeholder="e.g. 5 or -2"
                  value={adjustmentData.quantity}
                  onChange={(e) => setAdjustmentData({ ...adjustmentData, quantity: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold">Audit Notes / Reference</label>
                <Input
                  placeholder="e.g. Physical inventory check on shelf B"
                  value={adjustmentData.notes}
                  onChange={(e) => setAdjustmentData({ ...adjustmentData, notes: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdjustModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submittingAdjust}>
                  {submittingAdjust ? "Saving..." : "Commit Adjustment"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: Supplier Stock-in Purchase */}
      <Dialog open={purchaseModalOpen} onOpenChange={setPurchaseModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Supplier Stock-In</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreatePurchase} className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold">Supplier Name *</label>
                <Input
                  required
                  placeholder="e.g. Asian Paints Distributor"
                  value={poForm.supplier}
                  onChange={(e) => setPoForm({ ...poForm, supplier: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="font-semibold">Supplier Bill / Invoice #</label>
                <Input
                  placeholder="e.g. AP-9921"
                  value={poForm.supplier_invoice_number}
                  onChange={(e) => setPoForm({ ...poForm, supplier_invoice_number: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold">Product *</label>
              <select
                required
                value={poForm.product_id}
                onChange={(e) => {
                  const pid = e.target.value;
                  const match = products.find((p) => p.id === pid);
                  setPoForm({
                    ...poForm,
                    product_id: pid,
                    purchase_price: match ? String(match.purchase_price) : "",
                  });
                }}
                className="mt-1 h-9 w-full rounded border px-2 text-xs"
              >
                <option value="">-- Select Product --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold">Quantity Received *</label>
                <Input
                  required
                  type="number"
                  min="1"
                  value={poForm.quantity}
                  onChange={(e) => setPoForm({ ...poForm, quantity: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="font-semibold">Purchase Price / Unit (₹) *</label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={poForm.purchase_price}
                  onChange={(e) => setPoForm({ ...poForm, purchase_price: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold">Notes</label>
              <Input
                placeholder="Optional supplier notes"
                value={poForm.notes}
                onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPurchaseModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Record & Increase Stock</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
