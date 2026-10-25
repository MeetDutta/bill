"use client";

import React, { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { adminStaffSalesApi } from "@/services/api";
import {
  Users,
  Search,
  Calendar,
  Download,
  RefreshCw,
  TrendingUp,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

interface StaffRow {
  staff_id: string | null;
  name: string;
  email: string;
  role: string;
  completed_sales: number;
  gross_sales: number;
  discounts: number;
  returns: number;
  net_sales: number;
  collected_amount: number;
  outstanding_credit: number;
  last_transaction: string | null;
}

interface SummaryData {
  completed_sales: number;
  gross_sales: number;
  discounts: number;
  returns: number;
  net_sales: number;
  collected_amount: number;
  outstanding_credit: number;
}

export function StaffSalesBreakdownTable() {
  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await adminStaffSalesApi.getBreakdown({
        search: searchTerm || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setStaffRows(res.data.staff_breakdown || []);
      setSummary(res.data.summary || null);
    } catch (err) {
      console.error("Failed to load admin staff sales breakdown:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchTerm, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    params.set("export", "csv");
    if (searchTerm) params.set("search", searchTerm);
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    window.open(`/api/v1/billing/admin/staff-sales/?${params.toString()}`, "_blank");
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-foreground" />
            <h3 className="text-base font-bold text-foreground">Staff Performance &amp; Attribution</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Server-side sales aggregation, collections, and credit attribution per staff member
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh Staff Performance"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground transition-colors"
            title="Export CSV Report"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-48 sm:w-60">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search staff name, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border bg-background text-foreground text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 rounded-lg border bg-background text-foreground text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1.5 rounded-lg border bg-background text-foreground text-xs"
            />
          </div>

          {(searchTerm || startDate || endDate) && (
            <button
              onClick={() => {
                setSearchTerm("");
                setStartDate("");
                setEndDate("");
              }}
              className="text-xs font-semibold text-foreground hover:underline"
            >
              Reset
            </button>
          )}
        </div>

        {summary && (
          <div className="text-xs font-semibold text-muted-foreground">
            Total Completed: <span className="text-foreground font-bold">{summary.completed_sales}</span> bills &bull; Net:{" "}
            <span className="text-foreground font-bold">{formatCurrency(summary.net_sales)}</span>
          </div>
        )}
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-muted/40 text-muted-foreground uppercase text-[10px] font-bold">
            <tr>
              <th className="py-2.5 px-3">Staff Member</th>
              <th className="py-2.5 px-3">Role</th>
              <th className="py-2.5 px-3 text-center">Completed Sales</th>
              <th className="py-2.5 px-3 text-right">Gross Sales</th>
              <th className="py-2.5 px-3 text-right">Discounts</th>
              <th className="py-2.5 px-3 text-right">Returns</th>
              <th className="py-2.5 px-3 text-right">Net Sales</th>
              <th className="py-2.5 px-3 text-right">Actual Collected</th>
              <th className="py-2.5 px-3 text-right">Outstanding Credit</th>
              <th className="py-2.5 px-3 text-right">Last Transaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted-foreground">
                  Calculating staff sales aggregation...
                </td>
              </tr>
            ) : staffRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted-foreground">
                  No transactions recorded for the selected criteria.
                </td>
              </tr>
            ) : (
              staffRows.map((row, idx) => {
                const isLegacy = !row.staff_id || row.name.includes("Legacy");
                return (
                  <tr key={row.staff_id || `legacy-${idx}`} className="hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-foreground">
                      {row.name}
                      {row.email && row.email !== "N/A" && (
                        <div className="text-[10px] text-muted-foreground font-normal">{row.email}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          isLegacy
                            ? "bg-muted text-muted-foreground"
                            : "bg-foreground/5 text-foreground border border-border"
                        }`}
                      >
                        {row.role.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-foreground">
                      {row.completed_sales}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                      {formatCurrency(row.gross_sales)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                      - {formatCurrency(row.discounts)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                      {formatCurrency(row.returns)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-foreground">
                      {formatCurrency(row.net_sales)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(row.collected_amount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-red-700 dark:text-red-400">
                      {formatCurrency(row.outstanding_credit)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground">
                      {row.last_transaction
                        ? new Date(row.last_transaction).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* TOTALS FOOTER */}
          {summary && (
            <tfoot className="border-t-2 border-foreground bg-muted/40 font-bold text-foreground">
              <tr>
                <td className="py-2.5 px-3">BUSINESS TOTALS</td>
                <td className="py-2.5 px-3"></td>
                <td className="py-2.5 px-3 text-center font-mono">{summary.completed_sales}</td>
                <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(summary.gross_sales)}</td>
                <td className="py-2.5 px-3 text-right font-mono">- {formatCurrency(summary.discounts)}</td>
                <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(summary.returns)}</td>
                <td className="py-2.5 px-3 text-right font-mono font-black">{formatCurrency(summary.net_sales)}</td>
                <td className="py-2.5 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(summary.collected_amount)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-red-700 dark:text-red-400">
                  {formatCurrency(summary.outstanding_credit)}
                </td>
                <td className="py-2.5 px-3 text-right"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
