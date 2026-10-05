"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { productApi, productIntelligenceApi } from "@/services/api";
import type { Product, ProductAffinityItem, ProductBundleItem } from "@/types";
import { parseApiError } from "@/lib/utils";
import {
  Search,
  Plus,
  Tag,
  PackagePlus,
  Loader2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
} from "lucide-react";

export default function ProductsPage() {
  const [activeTab, setActiveTab] = useState<"catalog" | "intelligence" | "bundles">("catalog");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Product Intelligence State
  const [intelLoading, setIntelLoading] = useState(false);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [decliningProducts, setDecliningProducts] = useState<any[]>([]);
  const [affinities, setAffinities] = useState<ProductAffinityItem[]>([]);
  const [bundles, setBundles] = useState<ProductBundleItem[]>([]);
  const [approvedBundles, setApprovedBundles] = useState<Record<string, boolean>>({});

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

  const fetchIntelligence = async () => {
    setIntelLoading(true);
    try {
      const [rIntel, rAff, rBundles] = await Promise.allSettled([
        productIntelligenceApi.getAnalytics(),
        productIntelligenceApi.getAffinity(),
        productIntelligenceApi.getBundles(),
      ]);

      if (rIntel.status === "fulfilled") {
        setTopProducts(rIntel.value.data.top_products || []);
        setDecliningProducts(rIntel.value.data.declining_products || []);
      }
      if (rAff.status === "fulfilled") {
        setAffinities(rAff.value.data.affinities || rAff.value.data || []);
      }
      if (rBundles.status === "fulfilled") {
        setBundles(rBundles.value.data.bundles || rBundles.value.data || []);
      }
    } finally {
      setIntelLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (activeTab === "intelligence" || activeTab === "bundles") {
      fetchIntelligence();
    }
  }, [activeTab]);

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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Products & Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Manage catalog, discover product affinities, and review AI-suggested bundles.
          </p>
        </div>

        <Dialog
          open={open}
          onOpenChange={(val) => {
            setOpen(val);
            if (!val) setError("");
          }}
        >
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

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "catalog"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Product Catalog ({products.length})
        </button>
        <button
          onClick={() => setActiveTab("intelligence")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "intelligence"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Product Affinity & Trends
        </button>
        <button
          onClick={() => setActiveTab("bundles")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "bundles"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="h-4 w-4" />
          Smart Bundles ({bundles.length})
        </button>
      </div>

      {/* Tab 1: Catalog */}
      {activeTab === "catalog" && (
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
                          <span className="inline-flex rounded-full bg-green-100 dark:bg-green-950/40 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-400">
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
      )}

      {/* Tab 2: Product Affinity & Intelligence */}
      {activeTab === "intelligence" && (
        <div className="space-y-6">
          {intelLoading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Analyzing market basket and product co-occurrences...
            </div>
          ) : (
            <>
              {/* Product Affinity Insights */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Product Affinity Analysis (Market Basket Insights)
                  </CardTitle>
                  <CardDescription>
                    Identifies products frequently purchased together to power cross-sell recommendations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {affinities.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No strong multi-product co-occurrences detected yet. As customers purchase combinations of items, affinities will calculate automatically.
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {affinities.map((aff, i) => (
                        <div
                          key={aff.id || i}
                          className="rounded-xl border p-4 bg-card hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                              Affinity Pair
                            </span>
                            <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-bold">
                              {aff.affinity_score}% Affinity
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm font-semibold my-2">
                            <span>{aff.product_a.name}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>{aff.product_b.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border">
                            💡 {aff.text_insight || `Customers who purchase ${aff.product_a.name} frequently buy ${aff.product_b.name}.`}
                          </p>
                          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Combined Price: ₹{(aff.product_a.price + aff.product_b.price).toLocaleString()}</span>
                            <span>{aff.co_occurrence_count} joint orders</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top & Declining Products */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      Top Performing Products
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {topProducts.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">No sales data recorded yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {topProducts.map((p, i) => (
                          <div key={i} className="flex items-center justify-between border-b pb-2.5 last:border-0">
                            <div>
                              <p className="text-sm font-semibold">{p.product_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.units_sold} units · {p.repeat_purchase_rate}% repeat rate
                              </p>
                            </div>
                            <span className="text-sm font-bold">₹{Number(p.revenue).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-amber-600" />
                      Declining / Attention Needed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {decliningProducts.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">No products currently showing declining momentum.</p>
                    ) : (
                      <div className="space-y-3">
                        {decliningProducts.map((p, i) => (
                          <div key={i} className="flex items-center justify-between border-b pb-2.5 last:border-0">
                            <div>
                              <p className="text-sm font-semibold">{p.product_name}</p>
                              <p className="text-xs text-amber-600 font-medium">
                                -{p.decline_rate}% vs previous period
                              </p>
                            </div>
                            <span className="text-sm font-bold">₹{Number(p.revenue).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 3: Smart Bundles */}
      {activeTab === "bundles" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Smart Product Bundles
                </CardTitle>
                <CardDescription>
                  Algorithmic combo suggestions from high-affinity items. Requires merchant confirmation before publishing.
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Merchant Protected (No Auto-Price Alteration)
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {intelLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Generating smart bundles...
              </div>
            ) : bundles.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No bundle candidates generated yet. Add transactions with multiple items to trigger affinity pairings.
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {bundles.map((b, i) => {
                  const isApproved = approvedBundles[b.bundle_name];
                  return (
                    <div
                      key={i}
                      className="rounded-xl border p-5 bg-card relative overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-primary">
                            Suggested Bundle
                          </span>
                          <span className="rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 text-xs font-semibold">
                            Save ₹{b.savings} ({b.discount_percentage}%)
                          </span>
                        </div>
                        <h3 className="text-lg font-bold mt-2">{b.bundle_name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{b.reason}</p>

                        {/* Included Products */}
                        <div className="mt-4 space-y-1.5 rounded-lg bg-muted/40 p-3 border">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Included Items
                          </p>
                          {b.products.map((p, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span>{p.name}</span>
                              <span className="font-medium">₹{p.price.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>

                        {/* Pricing Comparison */}
                        <div className="mt-4 flex items-baseline justify-between border-t pt-3">
                          <div>
                            <span className="text-xs text-muted-foreground line-through">
                              ₹{b.individual_price.toLocaleString()}
                            </span>
                            <span className="ml-2 text-xl font-extrabold text-foreground">
                              ₹{b.suggested_bundle_price.toLocaleString()}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {b.affinity_score}% affinity
                          </span>
                        </div>
                      </div>

                      {/* Approval Actions */}
                      <div className="mt-5 border-t pt-3 flex items-center justify-between">
                        {isApproved ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                            <CheckCircle className="h-4 w-4" />
                            Approved for Promotion
                          </div>
                        ) : (
                          <div className="flex gap-2 w-full">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() =>
                                setApprovedBundles({
                                  ...approvedBundles,
                                  [b.bundle_name]: true,
                                })
                              }
                            >
                              Approve Bundle
                            </Button>
                            <Button size="sm" variant="ghost">
                              Dismiss
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
