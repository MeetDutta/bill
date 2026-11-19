"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { productApi } from "@/services/api";
import {
  FolderTree,
  Search,
  Plus,
  Boxes,
  Tag,
  CheckCircle2,
  Layers,
  Loader2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CategoryItem {
  id: string;
  name: string;
  code?: string;
  description?: string;
  is_active?: boolean;
  products_count?: number;
  created_at?: string;
}

export default function StockCategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create Category Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productApi.listCategories({ all: true });
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.results || [];
      setCategories(list);
    } catch (err) {
      console.error("Failed to load categories:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) {
      setCreateError("Category name is required.");
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setCreateError("A category with this name already exists.");
      return;
    }

    setCreating(true);
    setCreateError("");
    try {
      const res = await productApi.createCategory({ name });
      const created = res.data;
      setCategories((prev) => [...prev, created]);
      setNewCategoryName("");
      setCreateOpen(false);
    } catch (err: any) {
      const msg = err.response?.data?.name?.[0] || err.response?.data?.detail || "Failed to create category.";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-primary/10 text-primary">
              <FolderTree className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Product Categories</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Organize inventory items into categories for fast POS billing and category-level stock reporting.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadCategories}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setCreateError("");
              setNewCategoryName("");
              setCreateOpen(true);
            }}
            className="gap-1.5 text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Active inventory groups</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              POS Filter Synchronization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5" />
              Synced
            </div>
            <p className="text-xs text-muted-foreground mt-1">Available live on POS Sell Page</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Link href="/dashboard/products">
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  <Tag className="w-3.5 h-3.5" />
                  All Products
                </Button>
              </Link>
              <Link href="/dashboard/inventory">
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  <Boxes className="w-3.5 h-3.5" />
                  Stock Overview
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Table */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search categories by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs sm:text-sm"
            />
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Category Name</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Status</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                      Loading categories...
                    </td>
                  </tr>
                ) : filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-muted-foreground">
                      {search ? `No categories found matching "${search}"` : "No categories created yet."}
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((cat) => (
                    <tr key={cat.id || cat.name} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-semibold text-foreground flex items-center gap-2">
                        <FolderTree className="w-4 h-4 text-muted-foreground" />
                        {cat.name}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          Active
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/dashboard/inventory?category=${encodeURIComponent(cat.name)}`}>
                          <Button variant="ghost" size="sm" className="text-xs gap-1 text-primary hover:text-primary">
                            <span>View Stock</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Category Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateCategory}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-primary" />
                Add New Product Category
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Category Name <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="e.g. Dairy, Beverages, Electronics, Stationery"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  disabled={creating}
                  autoFocus
                  required
                />
              </div>

              {createError && (
                <p className="text-xs text-destructive font-medium bg-destructive/10 p-2 rounded">
                  {createError}
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={creating} className="gap-1.5 font-semibold">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
