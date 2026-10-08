"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi } from "@/services/api";
import type { POSRegisterReportSession } from "@/types";
import {
  FileSpreadsheet,
  TrendingUp,
  Landmark,
  User,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function POSRegisterReportPage() {
  const [registers, setRegisters] = useState<POSRegisterReportSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApi.getPOSRegisterReport();
      const list = res.data?.registers || (Array.isArray(res.data) ? res.data : []);
      setRegisters(list);
    } catch (err) {
      console.error("Failed to load POS register report:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalSessions = registers.length;
  const closedSessions = registers.filter((r) => r.status === "closed").length;
  const discrepancySessions = registers.filter(
    (r) => r.status === "closed" && Math.abs(parseFloat(r.cash_variance || "0")) > 0.05
  ).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">POS Register Operational Report</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Cashier shift reconciliation & cash drawer balancing: Audit expected cash, actual counted cash, and variances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/register">
            <Button variant="outline" className="gap-2">
              <Landmark className="w-4 h-4 text-emerald-600" />
              Active Cash Register
            </Button>
          </Link>
          <Link href="/dashboard/reports/sales">
            <Button variant="outline" className="gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Sales Report
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Register Shifts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSessions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {closedSessions} shifts reconciled and closed
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Balanced Cash Shifts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {closedSessions - discrepancySessions} / {closedSessions}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Zero variance drawer close</p>
          </CardContent>
        </Card>

        <Card className={cn(discrepancySessions > 0 ? "border-rose-500/20" : "")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Discrepancies / Variances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", discrepancySessions > 0 ? "text-rose-600" : "text-emerald-600")}>
              {discrepancySessions}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Shortage or overage detected</p>
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation Formula Callout */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between text-xs text-muted-foreground gap-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-foreground">Reconciliation Logic:</span>
            <span>Expected Cash = Opening Cash + Cash Sales - Cash Refunds</span>
          </div>
          <div className="font-mono">
            Variance = Actual Counted Cash - Expected Cash (Shortage if negative, Overage if positive)
          </div>
        </CardContent>
      </Card>

      {/* Register Sessions Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Store</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Cashier</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Opened At</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Closed At</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Opening Cash (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Cash Sales (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Cash Refunds (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Expected Cash (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Actual Cash (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Variance (₹)</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-muted-foreground">
                      Loading register shift records...
                    </td>
                  </tr>
                ) : registers.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-muted-foreground">
                      No register sessions found.
                    </td>
                  </tr>
                ) : (
                  registers.map((reg) => {
                    const variance = parseFloat(reg.cash_variance || "0");
                    const isClosed = reg.status.toLowerCase() === "closed";
                    const isDiscrepant = isClosed && Math.abs(variance) > 0.05;

                    return (
                      <tr key={reg.register_id} className="hover:bg-muted/20">
                        <td className="py-3 px-4 font-medium">{reg.store_name}</td>
                        <td className="py-3 px-4">{reg.cashier_name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                          {new Date(reg.opened_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                          {reg.closed_at ? new Date(reg.closed_at).toLocaleString() : "Still Open"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs">
                          ₹{parseFloat(reg.opening_balance).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-emerald-600">
                          ₹{parseFloat(reg.cash_sales).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-rose-500">
                          ₹{parseFloat(reg.cash_refunds).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-semibold">
                          ₹{parseFloat(reg.expected_closing_cash).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-semibold">
                          {isClosed ? `₹${parseFloat(reg.actual_closing_cash).toFixed(2)}` : "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-bold">
                          {isClosed ? (
                            <span
                              className={cn(
                                isDiscrepant
                                  ? variance < 0
                                    ? "text-rose-600"
                                    : "text-amber-600"
                                  : "text-emerald-600"
                              )}
                            >
                              {variance > 0 ? `+₹${variance.toFixed(2)}` : `₹${variance.toFixed(2)}`}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isClosed ? (
                            isDiscrepant ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-700">
                                <AlertTriangle className="w-3 h-3" /> Discrepancy
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-700">
                                <CheckCircle2 className="w-3 h-3" /> Balanced
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-700">
                              <Clock className="w-3 h-3" /> Open
                            </span>
                          )}
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
