"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi } from "@/services/api";
import type { InventoryMovement } from "@/types";
import {
  ArrowUpFromLine,
  Search,
  Plus,
  RefreshCw,
  Boxes,
  ShoppingCart,
  SlidersHorizontal,
  History,
  AlertTriangle,
  Receipt,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StockOutwardPage() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [outwardTypeFilter, setOutwardTypeFilter] = useState("all");

  const loadMovements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApi.getInventoryMovements({ page_size: 200 });
      const list: InventoryMovement[] = Array.isArray(res.data)
        ? res.data
        : (res.data as any)?.results || [];
      // Filter for outward stock movements (quantity < 0 or outward types)
      const outwardList = list.filter((m) => {
        const qty = parseFloat(String(m.quantity || 0));
        return (
          qty < 0 ||
          m.movement_type === "SALE" ||
          m.movement_type === "DAMAGE" ||
          m.movement_type === "LOSS"
        );
      });
      setMovements(outwardList);
    } catch (err) {
      console.error("Failed to load outward stock movements:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const filtered = movements.filter((m) => {
    const term = searchTerm.toLowerCase();
    const pName = (m.product_name || "").toLowerCase();
    const ref = (m.reference_id || "").toLowerCase();
    const notes = (m.notes || "").toLowerCase();
    const matchesSearch = pName.includes(term) || ref.includes(term) || notes.includes(term);

    const matchesType =
      outwardTypeFilter === "all" || m.movement_type === outwardTypeFilter;
    return matchesSearch && matchesType;
  });

  const totalOutwardUnits = movements.reduce((acc, m) => {
    const q = Math.abs(parseFloat(String(m.quantity || 0)));
    return acc + (isNaN(q) ? 0 : q);
  }, 0);

  const saleCount = movements.filter((m) => m.movement_type === "SALE").length;
  const damageCount = movements.filter((m) => m.movement_type === "DAMAGE" || m.movement_type === "LOSS").length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-rose-500/10 text-rose-600">
              <ArrowUpFromLine className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Stock Outward</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Audit all outbound inventory deductions, POS billing sales, damaged items, and loss dispatches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMovements}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Link href="/dashboard/billing">
            <Button size="sm" className="gap-1.5 text-xs font-semibold">
              <Receipt className="w-4 h-4" />
              New Sale Bill
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Outward Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{movements.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Recorded outbound deductions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Units Outward
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">
              -{totalOutwardUnits.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Units deducted from stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Sales Deductions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{saleCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Sold at POS register</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Damaged / Lost Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{damageCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Reported write-offs</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Ledger Table */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by product name, invoice #, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs sm:text-sm"
              />
            </div>

            <div className="w-full sm:w-56">
              <select
                value={outwardTypeFilter}
                onChange={(e) => setOutwardTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-xs sm:text-sm bg-background"
              >
                <option value="all">All Outward Types</option>
                <option value="SALE">SALE (POS Customer Checkout)</option>
                <option value="DAMAGE">DAMAGE (Damaged / Spoiled)</option>
                <option value="LOSS">LOSS (Loss / Theft)</option>
              </select>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Timestamp</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Product</th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">Outward Type</th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">Units Deducted</th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">Prev Stock</th>
                    <th className="py-3 px-4 text-center font-medium text-muted-foreground">New Stock</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Reference / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                        Loading outward stock movements...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        {searchTerm ? `No outward movements found matching "${searchTerm}"` : "No outward stock records found."}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((m) => {
                      const qty = Math.abs(parseFloat(String(m.quantity || 0)));
                      return (
                        <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                            {new Date(m.created_at).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-3 px-4 font-semibold text-foreground">
                            {m.product_name}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                              {m.movement_type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-rose-600">
                            -{qty}
                          </td>
                          <td className="py-3 px-4 text-center text-muted-foreground">
                            {m.previous_stock ?? "—"}
                          </td>
                          <td className="py-3 px-4 text-center font-medium text-foreground">
                            {m.new_stock ?? "—"}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs">
                            <div className="font-mono text-foreground">{m.reference_id || "Direct Outward"}</div>
                            {m.notes && <div className="text-[11px] text-muted-foreground truncate max-w-xs">{m.notes}</div>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
