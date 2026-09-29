"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { productApi } from "@/services/api";
import type { Product } from "@/types";
import { parseApiError } from "@/lib/utils";
import { Search, Plus, Tag, PackagePlus, Loader2 } from "lucide-react";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    external_id: "",
    unit_price: "",
    tax_rate: "18.00",
  });

  const fetchProducts = async () => {
    try {
      const res = await productApi.list();
      setProducts(res.data.results || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.unit_price) {
      setError("Product Name and Unit Price are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await productApi.create({
        name: formData.name.trim(),
        sku: formData.sku.trim() || `SKU-${Date.now().toString().slice(-6)}`,
        external_id: formData.external_id.trim() || `P-${Date.now().toString().slice(-6)}`,
        unit_price: Number(formData.unit_price),
        tax_rate: Number(formData.tax_rate || 0),
        is_active: true,
      } as Partial<Product>);

      setOpen(false);
      setFormData({
        name: "",
        sku: "",
        external_id: "",
        unit_price: "",
        tax_rate: "18.00",
      });
      await fetchProducts();
    } catch (err: unknown) {
      setError(parseApiError(err, "Failed to create product. Please check input values."));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = products.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Products</h2>
          <p className="text-sm text-muted-foreground">Manage your product catalog, SKUs, and pricing.</p>
        </div>
        <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) setError(""); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleCreateProduct}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PackagePlus className="h-5 w-5 text-primary" />
                  Add New Product
                </DialogTitle>
                <DialogDescription>
                  Enter product details to add to catalog.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {error && (
                  <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-medium">Product Name *</label>
                  <Input
                    placeholder="Premium Cotton Shirt"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">SKU</label>
                    <Input
                      placeholder="SHIRT-BLK-M"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">External ID</label>
                    <Input
                      placeholder="P1001"
                      value={formData.external_id}
                      onChange={(e) => setFormData({ ...formData, external_id: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Unit Price (₹) *</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="999"
                      value={formData.unit_price}
                      onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Tax Rate (%)</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="18"
                      value={formData.tax_rate}
                      onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="min-w-[120px]">
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Product"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products by name or SKU..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading products...</p>
          ) : filtered.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Tag className="mr-2 h-4 w-4" />
              No products found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                    <th className="pb-3 pr-4">Product Name</th>
                    <th className="pb-3 pr-4">SKU</th>
                    <th className="pb-3 pr-4">External ID</th>
                    <th className="pb-3 pr-4">Price</th>
                    <th className="pb-3 pr-4">Tax Rate</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => (
                    <tr key={product.id} className="border-b">
                      <td className="py-3 pr-4 font-medium">{product.name}</td>
                      <td className="py-3 pr-4">{product.sku || "—"}</td>
                      <td className="py-3 pr-4">{product.external_id || "—"}</td>
                      <td className="py-3 pr-4">₹{Number(product.unit_price).toLocaleString()}</td>
                      <td className="py-3 pr-4">{product.tax_rate}%</td>
                      <td className="py-3">
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                          Active
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
