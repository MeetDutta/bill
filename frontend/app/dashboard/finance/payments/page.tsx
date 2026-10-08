"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { posApi } from "@/services/api";
import type { PaymentLedgerItem } from "@/types";
import {
  CreditCard,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  FileSpreadsheet,
  Calendar,
  Building,
  User,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PaymentLedgerPage() {
  const [payments, setPayments] = useState<PaymentLedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posApi.getPaymentLedger();
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.results || [];
      setPayments(list);
    } catch (err) {
      console.error("Failed to load payment ledger:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredPayments = payments.filter((p) => {
    const term = searchTerm.toLowerCase();
    const entity = (p.entity_name || "").toLowerCase();
    const ref = (p.invoice_or_ref || "").toLowerCase();
    const payRef = (p.reference || "").toLowerCase();
    const matchesSearch = entity.includes(term) || ref.includes(term) || payRef.includes(term);

    const matchesDirection = directionFilter === "all" || p.direction === directionFilter;
    const matchesMethod = methodFilter === "all" || p.payment_method.toUpperCase() === methodFilter.toUpperCase();

    return matchesSearch && matchesDirection && matchesMethod;
  });

  const totalInflow = filteredPayments
    .filter((p) => p.direction === "incoming")
    .reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

  const totalOutflow = filteredPayments
    .filter((p) => p.direction === "outgoing")
    .reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

  const netCashFlow = totalInflow - totalOutflow;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
              <CreditCard className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Payment Ledger</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real financial flow ledger: All completed incoming customer payments & outgoing vendor disbursements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/finance/receivables">
            <Button variant="outline" className="gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Receivables (Udhaar)
            </Button>
          </Link>
          <Link href="/dashboard/finance/payables">
            <Button variant="outline" className="gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              Supplier Payables
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" /> Total Inflow (Received)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              ₹{totalInflow.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">From customer sales & Udhaar settlements</p>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-rose-600" /> Total Outflow (Disbursed)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">
              ₹{totalOutflow.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">To supplier orders & vendor payouts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Net Financial Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", netCashFlow >= 0 ? "text-emerald-600" : "text-rose-600")}>
              ₹{netCashFlow.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Net surplus cash / electronic balance</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer/supplier name, invoice #, or payment reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm bg-background"
            >
              <option value="all">All Flow Directions</option>
              <option value="incoming">Incoming (From Customers)</option>
              <option value="outgoing">Outgoing (To Suppliers)</option>
            </select>

            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm bg-background"
            >
              <option value="all">All Payment Methods</option>
              <option value="CASH">CASH</option>
              <option value="UPI">UPI</option>
              <option value="CARD">CARD</option>
              <option value="BANK_TRANSFER">BANK TRANSFER</option>
              <option value="CHEQUE">CHEQUE</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Payment Ledger Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Date & Time</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Direction</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Entity (Payer/Payee)</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Reference / Invoice</th>
                  <th className="py-3 px-4 text-center font-medium text-muted-foreground">Mode</th>
                  <th className="py-3 px-4 text-right font-medium text-muted-foreground">Amount (₹)</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Cashier / Staff</th>
                  <th className="py-3 px-4 text-left font-medium text-muted-foreground">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Loading payment ledger...
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      No payments found in ledger matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => {
                    const isIncoming = p.direction === "incoming";
                    const amt = parseFloat(p.amount);
                    return (
                      <tr key={p.id} className="hover:bg-muted/20">
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                          {new Date(p.date).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold",
                              isIncoming ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"
                            )}
                          >
                            {isIncoming ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                            {isIncoming ? "INCOMING" : "OUTGOING"}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium">{p.entity_name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{p.invoice_or_ref}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-muted">
                            {p.payment_method}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "py-3 px-4 text-right font-mono text-xs font-bold",
                            isIncoming ? "text-emerald-600" : "text-rose-600"
                          )}
                        >
                          {isIncoming ? `+₹${amt.toFixed(2)}` : `-₹${amt.toFixed(2)}`}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{p.cashier_name || "Staff"}</td>
                        <td className="py-3 px-4 text-xs max-w-xs truncate text-muted-foreground">{p.notes || "—"}</td>
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
