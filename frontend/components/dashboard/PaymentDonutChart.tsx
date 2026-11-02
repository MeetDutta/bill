"use client";

import React, { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { PaymentMethodBreakdownItem } from "@/types";

interface PaymentDonutChartProps {
  paymentMethods?: PaymentMethodBreakdownItem[];
  totalCollected: number;
  onSelectMethod: (method: string) => void;
}

const METHOD_COLORS: Record<string, string> = {
  CASH: "#059669", // Emerald
  UPI: "#0f172a", // Dark slate / primary
  CARD: "#3b82f6", // Blue
  CREDIT_CARD: "#3b82f6",
  DEBIT: "#2563eb",
  CREDIT: "#ef4444", // Red (receivable)
  OTHER: "#8b5cf6", // Purple
};

export function PaymentDonutChart({
  paymentMethods = [],
  totalCollected = 0,
  onSelectMethod,
}: PaymentDonutChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const chartData = useMemo(() => {
    if (!paymentMethods || paymentMethods.length === 0) return [];
    return paymentMethods.map((p) => {
      const upper = (p.payment_method || "OTHER").toUpperCase();
      return {
        name: upper,
        value: Number(p.total || 0),
        count: p.count,
        percentage: p.percentage,
        color: METHOD_COLORS[upper] || "#64748b",
      };
    });
  }, [paymentMethods]);

  if (!mounted || chartData.length === 0) {
    return (
      <div className="h-28 w-28 rounded-full border-4 border-dashed border-muted flex items-center justify-center text-[10px] text-muted-foreground mx-auto">
        No sales yet
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center relative">
      <div className="h-32 w-32 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md">
                      <p className="font-bold text-foreground">{d.name}</p>
                      <p className="font-mono text-emerald-600 font-bold">{formatCurrency(d.value)}</p>
                      <p className="text-[10px] text-muted-foreground">{d.percentage}% ({d.count} bills)</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={36}
              outerRadius={52}
              paddingAngle={3}
              dataKey="value"
              onClick={(entry) => onSelectMethod(entry.name)}
              className="cursor-pointer"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  className="hover:opacity-80 transition-opacity"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center Donut Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
            Collected
          </span>
          <span className="text-[11px] font-black font-mono text-foreground leading-tight">
            {formatCurrency(totalCollected)}
          </span>
        </div>
      </div>
    </div>
  );
}
