"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi } from "@/services/api";
import type { POSProduct } from "@/types";
import {
  Boxes,
  AlertTriangle,
  History,
  SlidersHorizontal,
  Search,
  Filter,
  ArrowUpRight,
  PlusCircle,
  Tag,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function CurrentStockPage() {
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // Quick Adjustment Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<POSProduct | null>(null);
  const [adjustmentData, setAdjustmentData] = useState({
    movement_type: "ADJUSTMENT",
    quantity: "",
    notes: "",
  });
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Add Product Modal
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    barcode: "",
    category: "General",
    unit: "PCS",
    selling_price: "",
    purchase_price: "",
    current_stock: "0",
    min_stock: "5",
    tax_rate: "18",
    hsn_code: "",
  });
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [productError, setProductError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const prodRes = await posApi.searchProducts({ page_size: 100 });
      const prodList = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data as any)?.results || [];
      setProducts(prodList);
    } catch (err) {
      console.error("Failed to load inventory products", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setSubmittingAdjust(true);
    try {
      await posApi.adjustInventory({
        product_id: selectedProduct.id,
        movement_type: adjustmentData.movement_type,
        quantity: parseFloat(adjustmentData.quantity) || 0,
        notes: adjustmentData.notes || "Manual stock adjustment",
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

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name.trim()) {
      setProductError("Product name is required.");
      return;
    }
    setSubmittingProduct(true);
    setProductError("");
    try {
      const payload: any = {
        name: newProduct.name.trim(),
        sku: newProduct.sku.trim() || `SKU-${Date.now().toString().slice(-6)}`,
        barcode: newProduct.barcode.trim() || undefined,
        category: newProduct.category || "General",
        unit: newProduct.unit || "PCS",
        selling_price: parseFloat(newProduct.selling_price) || 0,
        purchase_price: parseFloat(newProduct.purchase_price) || 0,
        current_stock: parseFloat(newProduct.current_stock) || 0,
        min_stock: parseFloat(newProduct.min_stock) || 5,
        tax_rate: parseFloat(newProduct.tax_rate) || 18,
        hsn_code: newProduct.hsn_code.trim() || undefined,
      };

      await posApi.quickCreateProduct(payload);
      setAddProductModalOpen(false);
      setNewProduct({
        name: "",
        sku: "",
        barcode: "",
        category: "General",
        unit: "PCS",
        selling_price: "",
        purchase_price: "",
        current_stock: "0",
        min_stock: "5",
        tax_rate: "18",
        hsn_code: "",
      });
      loadData();
    } catch (err: any) {
      setProductError(err.response?.data?.error || "Failed to create product. Check required fields.");
    } finally {
      setSubmittingProduct(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const term = search.toLowerCase();
    const name = (p.name || "").toLowerCase();
    const sku = (p.sku || "").toLowerCase();
    const matchesSearch = name.includes(term) || sku.includes(term);

    const stock = parseFloat(String(p.current_stock || 0));
    const reorder = parseFloat(String((p as any).reorder_level || 5));
    const isLow = stock <= reorder;

    if (showLowStockOnly) {
      return matchesSearch && isLow;
    }
    return matchesSearch;
  });

  const totalSKUs = products.length;
  const lowStockCount = products.filter((p) => {
    const s = parseFloat(String(p.current_stock || 0));
    const r = parseFloat(String((p as any).reorder_level || 5));
    return s <= r;
  }).length;
  const totalStockUnits = products.reduce((acc, p) => acc + (parseFloat(String(p.current_stock || 0)) || 0), 0);
  const totalValuation = products.reduce((acc, p) => {
    const s = parseFloat(String(p.current_stock || 0)) || 0;
    const cost = parseFloat(String((p as any).cost_price || p.purchase_price || (p as any).price || 0)) || 0;
    return acc + s * cost;
  }, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
              <Boxes className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Current Stock Inventory</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time on-hand product inventory, reorder thresholds, and warehouse valuation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setAddProductModalOpen(true)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            + Add Product
          </Button>
          <Link href="/dashboard/inventory/movements">
            <Button variant="outline" className="gap-2">
              <History className="w-4 h-4" />
              Stock Movements
            </Button>
          </Link>
          <Link href="/dashboard/inventory/adjustments">
            <Button variant="outline" className="gap-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300">
              <SlidersHorizontal className="w-4 h-4" />
              Stock Adjustments
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Catalog SKUs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSKUs}</div>
            <p className="text-xs text-muted-foreground mt-1">Active inventory items</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              On-Hand Units
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalStockUnits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Total physical inventory units</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Inventory Valuation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              ₹{totalValuation.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Calculated at cost basis</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{lowStockCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Items at or below reorder level</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products by title, SKU, or barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant={showLowStockOnly ? "destructive" : "outline"}
              size="sm"
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
              className="gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              {showLowStockOnly ? "Showing Low Stock" : "Filter Low Stock"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Product</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Category</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Stock On-Hand</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Reorder Level</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Cost Price (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Selling Price (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Stock Value (₹)</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Status</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted-foreground">
                      Loading current stock...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted-foreground">
                      No products found.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((prod) => {
                    const currentStock = parseFloat(String(prod.current_stock || 0));
                    const reorder = parseFloat(String((prod as any).reorder_level || 5));
                    const cost = parseFloat(String((prod as any).cost_price || (prod as any).purchase_price || 0));
                    const selling = parseFloat(String((prod as any).price || prod.selling_price || 0));
                    const lineValue = currentStock * cost;
                    const isLow = currentStock <= reorder;
                    const isOutOfStock = currentStock <= 0;

                    return (
                      <tr key={prod.id} className="hover:bg-muted/20">
                        <td className="py-3 px-4 font-medium">{prod.name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{prod.sku || "—"}</td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {(prod as any).category_name || (prod as any).category || "General"}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-foreground">{currentStock}</td>
                        <td className="py-3 px-4 text-center font-mono text-xs text-muted-foreground">{reorder}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs">₹{cost.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-semibold">₹{selling.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-emerald-600">
                          ₹{lineValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isOutOfStock ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-500/10 text-red-700 border border-red-500/20">
                              Out of Stock
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-500/10 text-red-700 border border-red-500/20">
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                              In Stock
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              onClick={() => {
                                setSelectedProduct(prod);
                                setAdjustmentData({ movement_type: "ADJUSTMENT", quantity: "", notes: "" });
                                setAdjustModalOpen(true);
                              }}
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" /> Adjust
                            </Button>
                            <Link href={`/dashboard/inventory/movements?product_id=${prod.id}`}>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View Stock Movement Ledger">
                                <History className="w-4 h-4 text-blue-600" />
                              </Button>
                            </Link>
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

      {/* Quick Adjust Modal */}
      {adjustModalOpen && selectedProduct && (
        <Dialog open={adjustModalOpen} onOpenChange={() => setAdjustModalOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Quick Stock Adjustment: {selectedProduct.name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdjustStock} className="space-y-4 my-2">
              <div className="bg-muted/40 p-3 rounded-lg text-sm flex justify-between items-center">
                <span className="text-muted-foreground">Current Stock On-Hand:</span>
                <span className="font-bold text-lg">{selectedProduct.current_stock}</span>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Adjustment Reason Type</label>
                <select
                  value={adjustmentData.movement_type}
                  onChange={(e) => setAdjustmentData({ ...adjustmentData, movement_type: e.target.value })}
                  className="w-full mt-1 p-2 border rounded-md text-sm bg-background"
                >
                  <option value="ADJUSTMENT">Standard Adjustment</option>
                  <option value="DAMAGE">Damage / Broken Goods</option>
                  <option value="LOSS">Loss / Shrinkage</option>
                  <option value="FOUND">Found Stock Surplus</option>
                  <option value="CORRECTION">Audit Count Correction</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Quantity Delta (Negative to reduce, Positive to add) *
                </label>
                <Input
                  type="number"
                  step="any"
                  placeholder="e.g. -2 for damage, 5 for found"
                  value={adjustmentData.quantity}
                  onChange={(e) => setAdjustmentData({ ...adjustmentData, quantity: e.target.value })}
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Audit Reason Notes</label>
                <Input
                  placeholder="e.g. End of day shelf audit"
                  value={adjustmentData.notes}
                  onChange={(e) => setAdjustmentData({ ...adjustmentData, notes: e.target.value })}
                  className="mt-1"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdjustModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submittingAdjust} className="bg-emerald-600 hover:bg-emerald-700">
                  {submittingAdjust ? "Applying..." : "Save Stock Adjustment"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Product Modal (PDF Page 3-4) */}
      <Dialog open={addProductModalOpen} onOpenChange={setAddProductModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <PlusCircle className="h-5 w-5 text-emerald-600" />
              Add New Product to Inventory
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateProduct} className="space-y-4 py-2 text-xs">
            {productError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-destructive font-medium">
                {productError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="font-semibold block mb-1">Product / Item Name *</label>
                <Input
                  required
                  placeholder="e.g. Premium White Shirt 40 / PVC Pipe 2 inch"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">SKU / Item Code</label>
                <Input
                  placeholder="Auto-generated if left blank"
                  value={newProduct.sku}
                  onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Barcode / EAN</label>
                <Input
                  placeholder="Scan or enter barcode"
                  value={newProduct.barcode}
                  onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Category</label>
                <Input
                  placeholder="e.g. Hardware, Apparel, Groceries"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Unit of Measurement</label>
                <select
                  value={newProduct.unit}
                  onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs focus:ring-2 focus:ring-primary/20"
                >
                  <option value="PCS">PCS (Pieces)</option>
                  <option value="KG">KG (Kilograms)</option>
                  <option value="GM">GM (Grams)</option>
                  <option value="MTR">MTR (Meters)</option>
                  <option value="LTR">LTR (Liters)</option>
                  <option value="BOX">BOX (Boxes)</option>
                  <option value="SET">SET (Sets)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Purchase / Cost Price (₹)</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={newProduct.purchase_price}
                  onChange={(e) => setNewProduct({ ...newProduct, purchase_price: e.target.value })}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Selling Price (₹) *</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="0.00"
                  value={newProduct.selling_price}
                  onChange={(e) => setNewProduct({ ...newProduct, selling_price: e.target.value })}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Opening Stock (Qty)</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={newProduct.current_stock}
                  onChange={(e) => setNewProduct({ ...newProduct, current_stock: e.target.value })}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Reorder Threshold (Min Stock)</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="5"
                  value={newProduct.min_stock}
                  onChange={(e) => setNewProduct({ ...newProduct, min_stock: e.target.value })}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">GST Tax Rate (%)</label>
                <select
                  value={newProduct.tax_rate}
                  onChange={(e) => setNewProduct({ ...newProduct, tax_rate: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs focus:ring-2 focus:ring-primary/20"
                >
                  <option value="0">0% (Exempt)</option>
                  <option value="5">5% (Essential)</option>
                  <option value="12">12% (Standard)</option>
                  <option value="18">18% (Standard GST)</option>
                  <option value="28">28% (Luxury / High)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">HSN / SAC Code</label>
                <Input
                  placeholder="e.g. 6205, 8471"
                  value={newProduct.hsn_code}
                  onChange={(e) => setNewProduct({ ...newProduct, hsn_code: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setAddProductModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingProduct} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                {submittingProduct ? "Saving Product..." : "Save Product to Catalog"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
