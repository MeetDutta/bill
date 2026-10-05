"use client";

import React, { useState, useEffect } from "react";
import {
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  Clock,
  User,
  PlusCircle,
  MinusCircle,
  CheckCircle,
} from "lucide-react";
import { posApi } from "@/services/api";
import { CashRegister } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function RegisterPage() {
  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);
  const [loading, setLoading] = useState(true);

  // Open Register Form
  const [openModal, setOpenModal] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("1000");
  const [openNotes, setOpenNotes] = useState("");

  // Cash In/Out Movement Form
  const [movementModal, setMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<"in" | "out">("in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementNotes, setMovementNotes] = useState("");

  // Close Register Form
  const [closeModal, setCloseModal] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  // Reports / Past Closings
  const [closingReports, setClosingReports] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [regRes, reportRes] = await Promise.all([
        posApi.getRegisterStatus(),
        posApi.getDailyClosingReport(),
      ]);
      setCurrentRegister(regRes.data || null);
      const reports = reportRes.data?.results || reportRes.data || [];
      setClosingReports(Array.isArray(reports) ? reports : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await posApi.openRegister({
        opening_balance: parseFloat(openingBalance) || 0,
        notes: openNotes,
      });
      setCurrentRegister(res.data);
      setOpenModal(false);
      setOpenNotes("");
      loadData();
    } catch (err) {
      alert("Failed to open register.");
    }
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await posApi.addRegisterMovement({
        movement_type: movementType,
        amount: parseFloat(movementAmount) || 0,
        notes: movementNotes,
      });
      setCurrentRegister(res.data);
      setMovementModal(false);
      setMovementAmount("");
      setMovementNotes("");
    } catch (err) {
      alert("Failed to record cash movement.");
    }
  };

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await posApi.closeRegister({
        actual_cash: parseFloat(actualCash) || 0,
        notes: closeNotes,
      });
      setCurrentRegister(null);
      setCloseModal(false);
      setActualCash("");
      setCloseNotes("");
      loadData();
    } catch (err) {
      alert("Failed to close register.");
    }
  };

  const expectedAmount = currentRegister ? parseFloat(currentRegister.expected_cash || "0") : 0;
  const countedCash = parseFloat(actualCash) || 0;
  const discrepancy = countedCash - expectedAmount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Cash Register & Day Closing</h2>
          <p className="text-sm text-muted-foreground">
            Manage daily cash drawer floats, cash sales tally, manual cash in/out, and end-of-day discrepancy reconciliation.
          </p>
        </div>

        {currentRegister ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMovementType("in");
                setMovementModal(true);
              }}
              className="gap-1 text-xs"
            >
              <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
              Cash In / Out
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setActualCash(String(expectedAmount));
                setCloseModal(true);
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1 text-xs font-semibold"
            >
              Close Register (End Day)
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setOpenModal(true)} className="gap-1 text-xs font-semibold">
            <Landmark className="h-4 w-4" />
            Open Cash Drawer / Register
          </Button>
        )}
      </div>

      {/* ACTIVE REGISTER STATE */}
      {currentRegister ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-emerald-500/40 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-emerald-700 font-bold flex items-center justify-between">
                <span>Register Status</span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-800">OPEN</div>
              <p className="text-xs text-muted-foreground mt-1">
                Started: {new Date(currentRegister.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-xs text-muted-foreground">Cashier: {currentRegister.opened_by || "Admin"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground font-semibold">Opening Float</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{parseFloat(currentRegister.opening_balance).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Beginning drawer cash</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground font-semibold">Today&apos;s Cash Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                +₹{parseFloat(currentRegister.total_cash_sales || "0").toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Refunds: -₹{parseFloat(currentRegister.total_cash_refunds || "0").toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/40 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-primary font-bold">Expected In Drawer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-primary">₹{expectedAmount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Float + Sales - Refunds + Movements
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Landmark className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-lg font-bold">No Active Cash Register Session</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
              Open the register at the beginning of the shift by specifying the opening float cash in your physical drawer.
            </p>
            <Button onClick={() => setOpenModal(true)} className="gap-1.5 text-xs font-semibold">
              <Landmark className="h-3.5 w-3.5" />
              Open Register Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Historical Register Closings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Closing History & Discrepancies</CardTitle>
          <CardDescription className="text-xs">
            Review past register sessions, drawer reconciliations, and cash overage/shortage audits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {closingReports.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No closed register sessions yet. Closing summaries will appear here after end-of-day.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Cashier</th>
                    <th className="py-2.5 px-3 text-right">Opening Float</th>
                    <th className="py-2.5 px-3 text-right">Cash Sales</th>
                    <th className="py-2.5 px-3 text-right">Expected Drawer</th>
                    <th className="py-2.5 px-3 text-right">Actual Counted</th>
                    <th className="py-2.5 px-3 text-right">Difference</th>
                    <th className="py-2.5 px-3 text-center">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {closingReports.map((c) => {
                    const diff = parseFloat(c.difference || "0");
                    const isBalanced = Math.abs(diff) < 0.01;
                    const isShort = diff < 0;

                    return (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {new Date(c.opened_at).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 font-semibold">{c.opened_by}</td>
                        <td className="py-2.5 px-3 text-right">₹{parseFloat(c.opening_balance).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-emerald-600">
                          ₹{parseFloat(c.total_cash_sales).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          ₹{parseFloat(c.expected_cash).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          ₹{parseFloat(c.actual_cash || c.expected_cash).toLocaleString()}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold ${
                            isBalanced ? "text-emerald-600" : isShort ? "text-destructive" : "text-blue-600"
                          }`}
                        >
                          {isBalanced ? "₹0.00 (Balanced)" : `${diff > 0 ? "+" : ""}₹${diff.toFixed(2)}`}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isBalanced
                                ? "bg-emerald-500/15 text-emerald-700"
                                : "bg-destructive/15 text-destructive"
                            }`}
                          >
                            {isBalanced ? "Reconciled" : isShort ? "Cash Short" : "Cash Over"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL: Open Register */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Open Register</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleOpenRegister} className="space-y-3 py-2 text-xs">
            <div>
              <label className="font-semibold block mb-1">Opening Cash Balance (₹) *</label>
              <Input
                required
                type="number"
                step="any"
                min="0"
                placeholder="1000.00"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="text-sm font-bold"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Enter the amount of change / petty cash currently in the drawer.
              </p>
            </div>

            <div>
              <label className="font-semibold block mb-1">Notes / Shift</label>
              <Input
                placeholder="e.g. Morning Shift"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                className="text-xs"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit">Open Register</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Cash In / Out Float */}
      <Dialog open={movementModal} onOpenChange={setMovementModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Cash Movement</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddMovement} className="space-y-3 py-2 text-xs">
            <div>
              <label className="font-semibold block mb-1">Movement Type</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={movementType === "in" ? "default" : "outline"}
                  onClick={() => setMovementType("in")}
                  className="text-xs"
                >
                  <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                  Cash In (Add)
                </Button>
                <Button
                  type="button"
                  variant={movementType === "out" ? "default" : "outline"}
                  onClick={() => setMovementType("out")}
                  className="text-xs"
                >
                  <MinusCircle className="mr-1.5 h-3.5 w-3.5" />
                  Cash Out (Take)
                </Button>
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1">Amount (₹) *</label>
              <Input
                required
                type="number"
                min="0.01"
                step="any"
                placeholder="500.00"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                className="text-sm font-bold"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Reason / Note *</label>
              <Input
                required
                placeholder="e.g. Petty cash for supplies or Bank deposit"
                value={movementNotes}
                onChange={(e) => setMovementNotes(e.target.value)}
                className="text-xs"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMovementModal(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Float Movement</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Close Register & Reconciliation */}
      <Dialog open={closeModal} onOpenChange={setCloseModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close Register & Reconcile Drawer</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCloseRegister} className="space-y-4 py-2 text-xs">
            <div className="rounded-lg bg-muted p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected In Drawer:</span>
                <span className="font-black text-sm">₹{expectedAmount.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1">Actual Physical Cash Counted (₹) *</label>
              <Input
                required
                type="number"
                step="any"
                min="0"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                className="text-base font-black"
              />
            </div>

            {/* Live Discrepancy Alert */}
            <div
              className={`rounded-lg border p-3 flex items-center justify-between ${
                Math.abs(discrepancy) < 0.01
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
                  : discrepancy < 0
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-blue-500/40 bg-blue-500/10 text-blue-800"
              }`}
            >
              <div>
                <p className="font-bold">
                  {Math.abs(discrepancy) < 0.01
                    ? "Drawer is Perfectly Balanced!"
                    : discrepancy < 0
                    ? `Discrepancy: Short by ₹${Math.abs(discrepancy).toFixed(2)}`
                    : `Discrepancy: Over by ₹${discrepancy.toFixed(2)}`}
                </p>
                <p className="text-[11px] opacity-90">
                  Expected: ₹{expectedAmount.toFixed(2)} vs Counted: ₹{countedCash.toFixed(2)}
                </p>
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1">End of Day Closing Notes</label>
              <Input
                placeholder="Optional closing remarks"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="text-xs"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloseModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                Reconcile & Close Shift
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
