"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi } from "@/services/api";
import type { POSProduct, InventoryMovement } from "@/types";
import {
  SlidersHorizontal,
  Search,
  Filter,
  ArrowRight,
  Boxes,
  History,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ADJUSTMENT_TYPES = [
  { value: "DAMAGE", label: "Damage (Goods broken or spoiled)" },
  { value: "LOSS", label: "Loss / Theft (Missing from inventory)" },
  { value: "FOUND", label: "Found Stock (Surplus discovered)" },
  { value: "CORRECTION", label: "Data Correction (Audit mismatch)" },
  { value: "COUNT_ADJUSTMENT", label: "Physical Count Adjustment (Cycle count)" },
  { value: "OPENING_STOCK", label: "Opening Stock (Initial migration)" },
  { value: "OTHER", label: "Other Operational Reason" },
];

export default function StockAdjustmentsPage() {
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedProductId, setSelectedProductId] = useState("");
  const [movementType, setMovementType] = useState("DAMAGE");
  const [quantityDelta, setQuantityDelta] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, adjRes] = await Promise.all([
        posApi.searchProducts({ page_size: 100 }),
        posApi.getManualAdjustments(),
      ]);

      const prodList = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data as any)?.results || [];
      setProducts(prodList);

      const adjList = Array.isArray(adjRes.data) ? adjRes.data : (adjRes.data as any)?.results || [];
      setAdjustments(adjList);
    } catch (err) {
      console.error("Failed to load adjustment data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const prevStock = selectedProduct ? parseFloat(String(selectedProduct.current_stock || 0)) : 0;
  const deltaNum = parseFloat(quantityDelta) || 0;
  const calculatedNewStock = prevStock + deltaNum;

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!selectedProductId) {
      setFormError("Please select a product.");
      return;
    }
    if (deltaNum === 0) {
      setFormError("Adjustment quantity cannot be 0.");
      return;
    }

    setSubmitting(true);
    try {
      await posApi.adjustInventory({
        product_id: selectedProductId,
        movement_type: movementType,
        quantity: deltaNum,
        notes: notes || `Manual ${movementType} adjustment`,
      });

      setFormSuccess(`Stock adjusted successfully for ${selectedProduct?.name}.`);
      setQuantityDelta("");
      setNotes("");
      loadData();
    } catch (err: any) {
      setFormError(err.response?.data?.error || "Failed to adjust stock");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
              <SlidersHorizontal className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Stock Adjustments</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manual inventory reconciliations: Log damages, shrinkage, count corrections, and audit reasons.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/inventory">
            <Button variant="outline" className="gap-2">
              <Boxes className="w-4 h-4" />
              Current Stock
            </Button>
          </Link>
          <Link href="/dashboard/inventory/movements">
            <Button variant="outline" className="gap-2">
              <History className="w-4 h-4" />
              Movement Ledger
            </Button>
          </Link>
        </div>
      </div>

      {/* Manual Adjustment Form */}
      <Card className="border-amber-500/20 shadow-sm">
        <CardHeader className="bg-amber-500/5 border-b border-amber-500/10 pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-amber-600" />
            Initiate Manual Stock Adjustment
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmitAdjustment} className="space-y-4">
            {formError && (
              <div className="p-3 text-sm rounded bg-rose-500/10 border border-rose-500/20 text-rose-600">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="p-3 text-sm rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
                {formSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Product to Adjust *</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full mt-1 p-2.5 border rounded-md text-sm bg-background"
                  required
                >
                  <option value="">Select a product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current: {p.current_stock})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Adjustment Reason Type *</label>
                <select
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value)}
                  className="w-full mt-1 p-2.5 border rounded-md text-sm bg-background"
                >
                  {ADJUSTMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Quantity Adjustment (Negative to deduct, Positive to add) *
                </label>
                <Input
                  type="number"
                  step="any"
                  placeholder="e.g. -5 for damage, +10 for found"
                  value={quantityDelta}
                  onChange={(e) => setQuantityDelta(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
            </div>

            {/* Live Calculation Preview */}
            {selectedProduct && (
              <div className="bg-muted/40 p-4 rounded-lg border flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <span className="text-xs text-muted-foreground block">Previous Stock</span>
                    <span className="text-lg font-bold">{prevStock}</span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-muted-foreground" />

                  <div className="text-center">
                    <span className="text-xs text-muted-foreground block">Adjustment Delta</span>
                    <span className={cn("text-lg font-bold", deltaNum >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {deltaNum > 0 ? `+${deltaNum}` : deltaNum}
                    </span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-muted-foreground" />

                  <div className="text-center">
                    <span className="text-xs text-muted-foreground block">Resulting New Stock</span>
                    <span className="text-lg font-bold text-foreground">{calculatedNewStock}</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Movement type: <span className="font-semibold text-foreground">{movementType}</span>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground">Detailed Audit Notes / Reason *</label>
              <Input
                placeholder="e.g. Discovered broken during afternoon warehouse reorganization"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
                required
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting} className="bg-amber-600 hover:bg-amber-700">
                {submitting ? "Processing Adjustment..." : "Commit Stock Adjustment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Manual Adjustments History */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold">Manual Stock Adjustments Audit History</CardTitle>
          <p className="text-xs text-muted-foreground">
            Strict log of manually initiated inventory overrides, damage write-offs, and cycle-count corrections.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Product</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Type</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Previous</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Adjustment</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">New Stock</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Reason / Notes</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Logged By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Loading adjustments audit history...
                    </td>
                  </tr>
                ) : adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      No manual stock adjustments recorded yet.
                    </td>
                  </tr>
                ) : (
                  adjustments.map((adj) => {
                    const delta = parseFloat(adj.quantity);
                    return (
                      <tr key={adj.id} className="hover:bg-muted/20">
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                          {new Date(adj.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-medium">{adj.product_name}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-700">
                            {adj.movement_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs">{adj.previous_stock}</td>
                        <td className="py-3 px-4 text-center font-mono text-xs font-bold">
                          <span className={delta >= 0 ? "text-emerald-600" : "text-rose-600"}>
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs font-bold">{adj.new_stock}</td>
                        <td className="py-3 px-4 text-xs max-w-xs truncate">{adj.notes || "—"}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{adj.user_name || "Merchant"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
