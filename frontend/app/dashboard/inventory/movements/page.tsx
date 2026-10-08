"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi } from "@/services/api";
import type { InventoryMovement } from "@/types";
import {
  History,
  Search,
  Filter,
  Boxes,
  SlidersHorizontal,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApi.getInventoryMovements({ page_size: 100 });
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.results || [];
      setMovements(list);
    } catch (err) {
      console.error("Failed to load inventory movements:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredMovements = movements.filter((m) => {
    const term = searchTerm.toLowerCase();
    const pName = (m.product_name || "").toLowerCase();
    const ref = (m.reference_id || "").toLowerCase();
    const notes = (m.notes || "").toLowerCase();
    const matchesSearch = pName.includes(term) || ref.includes(term) || notes.includes(term);

    const matchesType = typeFilter === "all" || m.movement_type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
              <History className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Stock Movements Ledger</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Complete, immutable audit trail of all physical inventory changes (Sales, Purchases, Returns, Adjustments).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/inventory">
            <Button variant="outline" className="gap-2">
              <Boxes className="w-4 h-4" />
              Current Stock
            </Button>
          </Link>
          <Link href="/dashboard/inventory/adjustments">
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Stock Adjustments
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by product name, invoice #, PO #, or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="w-full md:w-56">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
            >
              <option value="all">All Movement Types</option>
              <option value="SALE">SALE</option>
              <option value="PURCHASE">PURCHASE</option>
              <option value="RETURN">RETURN</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
              <option value="DAMAGE">DAMAGE</option>
              <option value="LOSS">LOSS</option>
              <option value="FOUND">FOUND</option>
              <option value="CORRECTION">CORRECTION</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="OPENING_STOCK">OPENING_STOCK</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Movements Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Product</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Movement Type</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Quantity Delta</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Previous</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">New Stock</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Reference</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Operator / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Loading inventory movement ledger...
                    </td>
                  </tr>
                ) : filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      No stock movements found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((m) => {
                    const delta = parseFloat(m.quantity);
                    const isPositive = delta > 0;
                    return (
                      <tr key={m.id} className="hover:bg-muted/20">
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                          {new Date(m.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-medium">{m.product_name}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold",
                              m.movement_type === "SALE"
                                ? "bg-blue-500/10 text-blue-700"
                                : m.movement_type === "PURCHASE"
                                ? "bg-emerald-500/10 text-emerald-700"
                                : m.movement_type === "RETURN"
                                ? "bg-purple-500/10 text-purple-700"
                                : "bg-amber-500/10 text-amber-700"
                            )}
                          >
                            {m.movement_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs font-bold">
                          <span className={isPositive ? "text-emerald-600" : "text-rose-600"}>
                            {isPositive ? `+${delta}` : delta}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs">{m.previous_stock}</td>
                        <td className="py-3 px-4 text-center font-mono text-xs font-semibold">{m.new_stock}</td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                          {m.reference_id ? (
                            <span>
                              {m.reference_type ? `${m.reference_type}: ` : ""}
                              {m.reference_id}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs max-w-xs truncate">
                          {m.notes || <span className="text-muted-foreground italic">No notes</span>}
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
    </div>
  );
}
