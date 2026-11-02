"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, DollarSign, Calendar, Clock, ChevronRight } from "lucide-react";

export type TrendPeriod = "7d" | "30d" | "month" | "today";
export type MetricMode = "revenue" | "profit";

interface SalesAnalyticsGraphProps {
  salesTrend30?: {
    date: string;
    formatted_date: string;
    revenue: number;
    profit?: number;
    transactions: number;
  }[];
  hourlySales?: {
    hour: string | number;
    sales: number;
  }[];
  onSelectDate?: (point: {
    date: string;
    formattedDate: string;
    revenue: number;
    profit?: number;
    transactions: number;
  }) => void;
  onOpenAnalytics?: () => void;
}

export function SalesAnalyticsGraph({
  salesTrend30 = [],
  hourlySales = [],
  onSelectDate,
  onOpenAnalytics,
}: SalesAnalyticsGraphProps) {
  const [period, setPeriod] = useState<TrendPeriod>("7d");
  const [metricMode, setMetricMode] = useState<MetricMode>("revenue");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filtered dataset according to period
  const chartData = useMemo(() => {
    if (period === "today") {
      // Map 24 hourly buckets
      return (hourlySales || []).map((h) => {
        const hourLabel = typeof h.hour === "number" ? `${String(h.hour).padStart(2, "0")}:00` : String(h.hour);
        return {
          label: hourLabel,
          date: new Date().toISOString().split("T")[0],
          formattedDate: `Today ${hourLabel}`,
          revenue: Number(h.sales || 0),
          profit: Number(h.sales || 0) * 0.25, // Fallback if hourly profit not itemized
          transactions: Number(h.sales > 0 ? 1 : 0),
        };
      });
    }

    if (!salesTrend30 || salesTrend30.length === 0) return [];

    if (period === "7d") {
      return salesTrend30.slice(-7).map((d) => ({
        label: d.formatted_date,
        date: d.date,
        formattedDate: d.formatted_date,
        revenue: Number(d.revenue || 0),
        profit: Number(d.profit || 0),
        transactions: Number(d.transactions || 0),
      }));
    }

    if (period === "month") {
      const now = new Date();
      const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const thisMonthItems = salesTrend30.filter((d) => d.date.startsWith(currentMonthPrefix));
      const source = thisMonthItems.length > 0 ? thisMonthItems : salesTrend30.slice(-14);
      return source.map((d) => ({
        label: d.formatted_date,
        date: d.date,
        formattedDate: d.formatted_date,
        revenue: Number(d.revenue || 0),
        profit: Number(d.profit || 0),
        transactions: Number(d.transactions || 0),
      }));
    }

    // 30 days
    return salesTrend30.map((d) => ({
      label: d.formatted_date,
      date: d.date,
      formattedDate: d.formatted_date,
      revenue: Number(d.revenue || 0),
      profit: Number(d.profit || 0),
      transactions: Number(d.transactions || 0),
    }));
  }, [period, salesTrend30, hourlySales]);

  // Aggregate totals for the active view
  const periodTotal = useMemo(() => {
    return chartData.reduce(
      (acc, curr) => ({
        revenue: acc.revenue + curr.revenue,
        profit: acc.profit + curr.profit,
        transactions: acc.transactions + curr.transactions,
      }),
      { revenue: 0, profit: 0, transactions: 0 }
    );
  }, [chartData]);

  const activeValue = metricMode === "revenue" ? periodTotal.revenue : periodTotal.profit;
  const isProfit = metricMode === "profit";
  const strokeColor = isProfit ? "#4f46e5" : "#059669"; // Indigo for profit, Emerald for revenue
  const gradientId = isProfit ? "profitGradient" : "revenueGradient";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-xs">
      {/* Graph Header: Title, Aggregates, Period Selectors & Metric Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
              Sales Analytics
            </span>
            <span className="text-[10px] text-muted-foreground/40">·</span>
            {/* Metric Mode Toggle */}
            <div className="inline-flex rounded-md border p-0.5 bg-muted/40 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setMetricMode("revenue")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  metricMode === "revenue"
                    ? "bg-background text-emerald-700 dark:text-emerald-400 shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Revenue
              </button>
              <button
                type="button"
                onClick={() => setMetricMode("profit")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  metricMode === "profit"
                    ? "bg-background text-indigo-700 dark:text-indigo-400 shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Gross Profit
              </button>
            </div>
          </div>

          <div className="flex items-baseline gap-2 mt-1">
            <span className={`font-mono font-black text-xl sm:text-2xl ${isProfit ? "text-indigo-600 dark:text-indigo-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {formatCurrency(activeValue)}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">
              ({periodTotal.transactions} {periodTotal.transactions === 1 ? "bill" : "bills"})
            </span>
          </div>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1 text-[11px] font-semibold self-start sm:self-auto">
          {(["today", "7d", "30d", "month"] as TrendPeriod[]).map((p) => {
            const labels: Record<TrendPeriod, string> = {
              today: "Today",
              "7d": "7D",
              "30d": "30D",
              month: "Month",
            };
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  period === p
                    ? "bg-foreground text-background font-bold shadow-2xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {labels[p]}
              </button>
            );
          })}
          {onOpenAnalytics && (
            <button
              onClick={onOpenAnalytics}
              className="ml-1 text-[11px] text-muted-foreground hover:text-foreground font-semibold flex items-center gap-0.5 p-1 rounded hover:bg-muted"
              title="Open full interactive analytics modal"
            >
              <span>More</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-44 sm:h-52 w-full pt-1">
        {!mounted ? (
          <div className="h-full w-full animate-pulse bg-muted/40 rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg">
            <TrendingUp className="h-6 w-6 mb-1 opacity-40" />
            <span>No transaction data recorded for this period yet.</span>
          </div>
        ) : period === "today" ? (
          /* Bar chart for hourly distribution */
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
              onClick={(state) => {
                if (state && state.activePayload && state.activePayload.length > 0 && onSelectDate) {
                  const pt = state.activePayload[0].payload;
                  onSelectDate(pt);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "currentColor", opacity: 0.6, fontSize: 10 }}
                interval={3}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "currentColor", opacity: 0.6, fontSize: 10 }}
                tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-lg border bg-popover p-2 text-xs shadow-md space-y-1">
                        <p className="font-bold text-foreground">{d.formattedDate}</p>
                        <p className="font-mono text-emerald-600 font-bold">
                          Sales: {formatCurrency(d.revenue)}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey={metricMode}
                fill={strokeColor}
                radius={[4, 4, 0, 0]}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          /* Area chart for 7d, 30d, month */
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
              onClick={(state) => {
                if (state && state.activePayload && state.activePayload.length > 0 && onSelectDate) {
                  const pt = state.activePayload[0].payload;
                  onSelectDate(pt);
                }
              }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "currentColor", opacity: 0.6, fontSize: 10 }}
                interval={period === "30d" ? 4 : 0}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "currentColor", opacity: 0.6, fontSize: 10 }}
                tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md space-y-1">
                        <p className="font-bold text-foreground">{d.formattedDate}</p>
                        <p className="font-mono text-emerald-600 font-bold">
                          Revenue: {formatCurrency(d.revenue)}
                        </p>
                        {d.profit !== undefined && (
                          <p className="font-mono text-indigo-600 font-semibold">
                            Est. Profit: {formatCurrency(d.profit)}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          {d.transactions} {d.transactions === 1 ? "bill" : "bills"} (Click to audit)
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey={metricMode}
                stroke={strokeColor}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
                className="cursor-pointer"
                activeDot={{ r: 5, stroke: strokeColor, strokeWidth: 2, fill: "#ffffff" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5 pt-1 border-t">
        <span>Click any chart node to inspect that day&apos;s invoice ledger</span>
        <span className="font-medium text-foreground">
          {metricMode === "revenue" ? "Gross Sales Total" : "COGS-Based Margin"}
        </span>
      </div>
    </div>
  );
}

