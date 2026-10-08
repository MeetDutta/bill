"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi } from "@/services/api";
import {
  TrendingUp,
  FileSpreadsheet,
  Calendar,
  CreditCard,
  Tag,
  ArrowUpRight,
  Filter,
  BarChart3,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SalesReportPage() {
  const [period, setPeriod] = useState("this_month");
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApi.getSalesReport({ period });
      setReportData(res.data);
    } catch (err) {
      console.error("Failed to load sales report:", err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = reportData?.summary || {};
  const transactions = reportData?.transactions || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
              <TrendingUp className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Business Sales Report</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Macro-level commercial sales performance, merchandise analytics, gross margins, and revenue breakdown.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/reports/pos">
            <Button variant="outline" className="gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              POS Register Report
            </Button>
          </Link>
          <Link href="/dashboard/analytics">
            <Button variant="outline" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Advanced Analytics
            </Button>
          </Link>
        </div>
      </div>

      {/* Date Filter Bar */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2 items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Time Period:</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "this_week", label: "This Week" },
              { id: "this_month", label: "This Month" },
              { id: "all", label: "All Time" },
            ].map((p) => (
              <Button
                key={p.id}
                variant={period === p.id ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Gross Total Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              ₹{parseFloat(summary.total_sales || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total revenue collected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Invoices Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.bill_count || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Processed transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Average Invoice Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ₹{parseFloat(summary.average_bill_value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per transaction basket size</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Tax Collected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              ₹{parseFloat(summary.total_tax || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">GST collected</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Sales Breakdown */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold">Sales Ledger</CardTitle>
          <p className="text-xs text-muted-foreground">
            Itemized list of customer transactions in this reporting timeframe.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Invoice #</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Date</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Customer</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Subtotal (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Discount (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Tax (₹)</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Total (₹)</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Payment Mode</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      Generating sales report...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      No sales recorded in this timeframe.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx: any) => (
                    <tr key={tx.id} className="hover:bg-muted/20">
                      <td className="py-3 px-4 font-mono font-semibold">{tx.invoice_number}</td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {new Date(tx.date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-medium">{tx.customer}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs">₹{parseFloat(tx.subtotal).toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-rose-500">
                        ₹{parseFloat(tx.discount).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-600">
                        ₹{parseFloat(tx.tax).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-bold">
                        ₹{parseFloat(tx.total).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-muted">
                          {tx.payment_method?.toUpperCase() || "CASH"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-700">
                          {tx.payment_status?.toUpperCase() || "PAID"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
