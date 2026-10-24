"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { posApi, productApi } from "@/services/api";
import type { Product } from "@/types";
import {
  Boxes,
  Search,
  Plus,
  AlertTriangle,
  X,
  CheckCircle2,
  Tag,
  Barcode,
  RefreshCw,
} from "lucide-react";

export default function MobileInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [loading, setLoading] = useState(true);

  // Add Product Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    barcode: "",
    category: "General",
    selling_price: "",
    purchase_price: "",
    tax_rate: "18.00",
    opening_stock: "10.00",
    min_stock: "5.00",
  });

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApi.searchProducts({
        search: searchQuery.trim() || undefined,
        low_stock: stockFilter === "low" ? true : undefined,
        page_size: 50,
      });
      let list: Product[] = res.data?.results || [];
      if (stockFilter === "out") {
        list = list.filter((p: Product) => p.track_inventory && Number(p.current_stock || 0) <= 0);
      }
      setProducts(list);
    } catch (err) {
      console.error("Failed to load inventory:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, stockFilter]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name.trim() || !newProduct.selling_price) {
      alert("Product name and selling price are required.");
      return;
    }

    setFormSubmitting(true);
    try {
      await posApi.quickCreateProduct({
        name: newProduct.name.trim(),
        sku: newProduct.sku.trim() || undefined,
        barcode: newProduct.barcode.trim() || undefined,
        category: newProduct.category,
        selling_price: Number(newProduct.selling_price),
        purchase_price: Number(newProduct.purchase_price || 0),
        tax_rate: Number(newProduct.tax_rate || 0),
        opening_stock: Number(newProduct.opening_stock || 0),
        min_stock: Number(newProduct.min_stock || 5),
      });

      setShowAddModal(false);
      setNewProduct({
        name: "",
        sku: "",
        barcode: "",
        category: "General",
        selling_price: "",
        purchase_price: "",
        tax_rate: "18.00",
        opening_stock: "10.00",
        min_stock: "5.00",
      });
      loadProducts();
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string } } };
      alert(errObj.response?.data?.error || "Failed to create product.");
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 pt-1">
      {/* Header and Add Action */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Inventory Items</h1>
          <p className="text-[11px] text-slate-400">Manage products & current stock levels</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>Add Item</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, SKU or barcode..."
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

      {/* Stock Status Filter Chips */}
      <div className="flex gap-1.5 text-xs font-semibold">
        <button
          onClick={() => setStockFilter("all")}
          className={`flex-1 rounded-xl py-1.5 transition-all text-center ${
            stockFilter === "all"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white border border-slate-200 text-slate-600"
          }`}
        >
          All Items
        </button>
        <button
          onClick={() => setStockFilter("low")}
          className={`flex-1 rounded-xl py-1.5 transition-all text-center ${
            stockFilter === "low"
              ? "bg-amber-600 text-white shadow-sm"
              : "bg-white border border-slate-200 text-amber-700"
          }`}
        >
          Low Stock
        </button>
        <button
          onClick={() => setStockFilter("out")}
          className={`flex-1 rounded-xl py-1.5 transition-all text-center ${
            stockFilter === "out"
              ? "bg-rose-600 text-white shadow-sm"
              : "bg-white border border-slate-200 text-rose-700"
          }`}
        >
          Out of Stock
        </button>
      </div>

      {/* Product List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-16 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <Boxes className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-xs font-semibold text-slate-600">No inventory products found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((item) => {
            const stock = Number(item.current_stock || 0);
            return (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-900 truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                    <span className="font-mono">{item.sku || item.barcode || "NO-SKU"}</span>
                    <span>•</span>
                    <span>{item.category?.name || "General"}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-extrabold text-slate-900 block">
                    {formatCurrency(Number(item.selling_price || item.unit_price || 0))}
                  </span>
                  {item.track_inventory ? (
                    <span
                      className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold ${
                        stock > 5
                          ? "bg-emerald-50 text-emerald-600"
                          : stock > 0
                          ? "bg-amber-50 text-amber-600"
                          : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      {stock} in stock
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-400">Service</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white p-4 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-xs text-slate-900">Add New Product</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="flex-1 overflow-y-auto py-3 space-y-2.5 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fortune Sunflower Oil 1L"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600">Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="180.00"
                    value={newProduct.selling_price}
                    onChange={(e) => setNewProduct({ ...newProduct, selling_price: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600">Cost Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="140.00"
                    value={newProduct.purchase_price}
                    onChange={(e) => setNewProduct({ ...newProduct, purchase_price: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600">Opening Stock</label>
                  <input
                    type="number"
                    placeholder="25"
                    value={newProduct.opening_stock}
                    onChange={(e) => setNewProduct({ ...newProduct, opening_stock: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600">GST Rate (%)</label>
                  <select
                    value={newProduct.tax_rate}
                    onChange={(e) => setNewProduct({ ...newProduct, tax_rate: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs bg-white"
                  >
                    <option value="0.00">0% (Nil)</option>
                    <option value="5.00">5%</option>
                    <option value="12.00">12%</option>
                    <option value="18.00">18%</option>
                    <option value="28.00">28%</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600">SKU (Optional)</label>
                  <input
                    type="text"
                    placeholder="AUTO-GEN"
                    value={newProduct.sku}
                    onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600">Barcode</label>
                  <input
                    type="text"
                    placeholder="890..."
                    value={newProduct.barcode}
                    onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="border-t pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 font-bold text-xs text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 font-bold text-xs text-white shadow-md shadow-blue-500/30"
                >
                  {formSubmitting ? "Saving..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
