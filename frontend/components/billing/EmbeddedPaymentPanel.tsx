"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  Plus,
  QrCode,
  Receipt,
  Split,
  Trash2,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  computeQuickCashAmounts,
  formatPaise,
  fromPaise,
  getAllocationDisplayLabel,
  type AllocationMethod,
  type OtherPaymentSubMethod,
  type PaymentAllocation,
  type PaymentMetrics,
  type PrimaryPaymentMethod,
} from "@/lib/smartPayment";
import type { Customer } from "@/types";

interface EmbeddedPaymentPanelProps {
  cartLength: number;
  allocations: PaymentAllocation[];
  metrics: PaymentMetrics;
  isSplitMode: boolean;
  otherPaymentMethod: OtherPaymentSubMethod;
  isWalkIn: boolean;
  selectedCustomer: Customer | null;
  creditSalesEnabled: boolean;
  upiId: string;
  upiUrl: string;
  upiQrAmount: number;
  validationMessage: string | null;
  checkoutError: string;
  containerRef?: React.RefObject<HTMLDivElement>;
  firstMethodButtonRef?: React.RefObject<HTMLButtonElement>;
  onSelectMethod: (method: PrimaryPaymentMethod) => void;
  onEnableSplitMode: () => void;
  onDisableSplitMode: () => void;
  onAddSplitAllocation: () => void;
  onResetSelection: () => void;
  onChangeOtherMethod: (method: OtherPaymentSubMethod) => void;
  onChangeAllocationMethod: (id: string, method: AllocationMethod) => void;
  onChangeAllocationAmount: (id: string, raw: string) => void;
  onBlurAllocationAmount: (id: string) => void;
  onChangeAllocationReference: (id: string, ref: string) => void;
  onFillRemaining: (id: string) => void;
  onQuickCash: (id: string, amountRupees: number) => void;
  onRemoveAllocation: (id: string) => void;
  onOpenCustomerModal: () => void;
}

const OTHER_SUB_METHODS: {
  id: OtherPaymentSubMethod;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "NETBANKING", label: "Net Banking", icon: Landmark },
  { id: "CHEQUE", label: "Cheque", icon: Receipt },
  { id: "WALLET", label: "Wallet", icon: Wallet },
];

function isOtherMethod(method: AllocationMethod): boolean {
  return method === "NETBANKING" || method === "CHEQUE" || method === "WALLET";
}

export function EmbeddedPaymentPanel({
  cartLength,
  allocations,
  metrics,
  isSplitMode,
  otherPaymentMethod,
  isWalkIn,
  selectedCustomer,
  creditSalesEnabled,
  upiId,
  upiUrl,
  upiQrAmount,
  validationMessage,
  checkoutError,
  containerRef,
  firstMethodButtonRef,
  onSelectMethod,
  onEnableSplitMode,
  onDisableSplitMode,
  onAddSplitAllocation,
  onResetSelection,
  onChangeOtherMethod,
  onChangeAllocationMethod,
  onChangeAllocationAmount,
  onBlurAllocationAmount,
  onChangeAllocationReference,
  onFillRemaining,
  onQuickCash,
  onRemoveAllocation,
  onOpenCustomerModal,
}: EmbeddedPaymentPanelProps) {
  const [showReferenceField, setShowReferenceField] = useState(false);

  if (cartLength === 0) {
    return (
      <div
        ref={containerRef}
        className="rounded-lg border border-dashed bg-muted/20 p-3 text-center text-[11px] text-muted-foreground"
      >
        Add products to the bill to select a payment method.
      </div>
    );
  }

  const singleAllocation = !isSplitMode && allocations.length === 1 ? allocations[0] : null;
  const activeOtherSelected = allocations.some((a) => isOtherMethod(a.method));

  const billTotalRupees = fromPaise(metrics.billTotalPaise);
  const quickCashAmounts = computeQuickCashAmounts(billTotalRupees);

  const currentCreditOutstanding = Number(selectedCustomer?.outstanding_credit || 0);
  const creditAfterPurchase = currentCreditOutstanding + billTotalRupees;
  const creditLimit = Number(selectedCustomer?.credit_limit || 0);

  const primaryButtons: {
    id: PrimaryPaymentMethod;
    label: string;
    shortcut: string;
    active: boolean;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    hidden?: boolean;
  }[] = [
    {
      id: "CASH",
      label: "Cash",
      shortcut: "F1",
      active: singleAllocation?.method === "CASH" || (isSplitMode && allocations.some((a) => a.method === "CASH")),
      icon: Banknote,
      accent: "text-emerald-600",
    },
    {
      id: "UPI",
      label: "UPI",
      shortcut: "F2",
      active: singleAllocation?.method === "UPI" || (isSplitMode && allocations.some((a) => a.method === "UPI")),
      icon: QrCode,
      accent: "text-blue-600",
    },
    {
      id: "CARD",
      label: "Card",
      shortcut: "F3",
      active: singleAllocation?.method === "CARD" || (isSplitMode && allocations.some((a) => a.method === "CARD")),
      icon: CreditCard,
      accent: "text-purple-600",
    },
    {
      id: "CREDIT",
      label: "Credit",
      shortcut: "F4",
      active: singleAllocation?.method === "CREDIT" || (isSplitMode && allocations.some((a) => a.method === "CREDIT")),
      icon: UserCheck,
      accent: "text-amber-600",
      hidden: !creditSalesEnabled,
    },
    {
      id: "OTHER",
      label: "Other",
      shortcut: "",
      active:
        (singleAllocation ? isOtherMethod(singleAllocation.method) : false) ||
        (isSplitMode && activeOtherSelected),
      icon: Landmark,
      accent: "text-slate-600",
    },
  ];

  // Suppress duplicate validation error when the Credit panel already shows missing-customer CTA
  const isWalkInCreditOnlyWarning =
    singleAllocation?.method === "CREDIT" && (isWalkIn || !selectedCustomer);

  return (
    <div
      ref={containerRef}
      className="rounded-xl border bg-background p-3 space-y-3 shadow-sm"
    >
      {/* Clean Header: Total Payable */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            {isSplitMode ? "Split Payment" : "Payment"}
          </span>
          <span className="text-xs font-semibold text-foreground">Total Payable</span>
        </div>
        <div className="text-right">
          <span className="text-lg font-black text-primary tabular-nums">
            ₹{formatPaise(metrics.billTotalPaise)}
          </span>
        </div>
      </div>

      {/* =================================================================== */}
      {/* DEFAULT NORMAL MODE (FAST SINGLE-PAYMENT EXPERIENCE)                */}
      {/* =================================================================== */}
      {!isSplitMode && (
        <div className="space-y-2.5">
          {/* Payment Method Tiles */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
              Select Payment Method
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {primaryButtons
                .filter((btn) => !btn.hidden)
                .map((btn, idx) => {
                  const Icon = btn.icon;
                  return (
                    <button
                      key={btn.id}
                      ref={idx === 0 ? firstMethodButtonRef : undefined}
                      type="button"
                      onClick={() => {
                        setShowReferenceField(false);
                        onSelectMethod(btn.id);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs font-bold transition-all cursor-pointer",
                        btn.active
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30 shadow-xs"
                          : "border-border bg-card text-foreground hover:bg-accent/70"
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon className={cn("h-4 w-4 shrink-0", btn.accent)} />
                        <span>{btn.label}</span>
                      </span>
                      {btn.shortcut && (
                        <span className="text-[9px] font-mono text-muted-foreground opacity-75">
                          {btn.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Selected Single Payment View */}
          {singleAllocation && (
            <div className="rounded-lg border border-primary/25 bg-muted/20 p-2.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-foreground">
                    Payment Method:{" "}
                    <span className="text-primary">
                      {getAllocationDisplayLabel(singleAllocation.method)}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowReferenceField(false);
                    onResetSelection();
                  }}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                >
                  Change
                </button>
              </div>

              {/* Other Sub-Method Selector */}
              {isOtherMethod(singleAllocation.method) && (
                <div className="grid grid-cols-3 gap-1.5">
                  {OTHER_SUB_METHODS.map((om) => {
                    const Icon = om.icon;
                    return (
                      <button
                        key={om.id}
                        type="button"
                        onClick={() => onChangeOtherMethod(om.id)}
                        className={cn(
                          "flex items-center justify-center gap-1 rounded-md border py-1.5 px-1.5 text-[11px] font-semibold transition-colors cursor-pointer",
                          otherPaymentMethod === om.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{om.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* CASH SINGLE PAYMENT FLOW */}
              {singleAllocation.method === "CASH" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Cash Received</span>
                    <div className="relative w-32">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                        ₹
                      </span>
                      <Input
                        id={`payment-amount-${singleAllocation.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={singleAllocation.amountDraft}
                        onChange={(e) => onChangeAllocationAmount(singleAllocation.id, e.target.value)}
                        onBlur={() => onBlurAllocationAmount(singleAllocation.id)}
                        className="h-9 pl-6 pr-2 text-right font-extrabold text-sm tabular-nums bg-background"
                      />
                    </div>
                  </div>

                  {/* Quick Tender Buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onQuickCash(singleAllocation.id, billTotalRupees)}
                      className="rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 text-[11px] font-bold text-blue-700 cursor-pointer tabular-nums"
                    >
                      Exact ₹{formatPaise(metrics.billTotalPaise)}
                    </button>
                    {quickCashAmounts.map((denom) => (
                      <button
                        key={denom}
                        type="button"
                        onClick={() => onQuickCash(singleAllocation.id, denom)}
                        className="rounded-md bg-background hover:bg-accent border px-2 py-1 text-[11px] font-bold text-foreground cursor-pointer tabular-nums"
                      >
                        ₹{denom.toLocaleString("en-IN")}
                      </button>
                    ))}
                  </div>

                  {/* Received & Change Display */}
                  {metrics.changePaise > 0 ? (
                    <div className="flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-2 text-xs">
                      <span className="text-emerald-800 font-semibold">
                        Received: ₹{formatPaise(metrics.totalPaidPaise)}
                      </span>
                      <span className="text-sm font-black text-emerald-700 tabular-nums">
                        Change: ₹{formatPaise(metrics.changePaise)}
                      </span>
                    </div>
                  ) : metrics.remainingPaise > 0 ? (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
                      <span className="font-semibold tabular-nums">
                        Short by ₹{formatPaise(metrics.remainingPaise)}
                      </span>
                      <button
                        type="button"
                        onClick={onEnableSplitMode}
                        className="rounded bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 font-bold cursor-pointer shrink-0"
                      >
                        + Split Remaining
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-md bg-emerald-50/70 border border-emerald-200 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
                      <span>Received: ₹{formatPaise(metrics.totalPaidPaise)}</span>
                      <span>Change: ₹0.00</span>
                    </div>
                  )}
                </div>
              )}

              {/* DIGITAL SINGLE PAYMENT FLOW (UPI / CARD / OTHER) */}
              {singleAllocation.method !== "CASH" && singleAllocation.method !== "CREDIT" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md bg-background border px-2.5 py-2 text-xs">
                    <span className="text-muted-foreground font-medium">Auto-filled Amount</span>
                    <span className="text-base font-black text-foreground tabular-nums">
                      ₹{formatPaise(singleAllocation.amountPaise)}
                    </span>
                  </div>

                  {/* UPI Dynamic QR */}
                  {singleAllocation.method === "UPI" && upiId && upiQrAmount > 0 && (
                    <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50/60 p-2">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(
                          upiUrl
                        )}`}
                        alt="UPI QR Code"
                        className="h-20 w-20 rounded border bg-white p-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-[11px] font-bold text-blue-900">
                          Scan to Pay ₹{upiQrAmount.toFixed(2)}
                        </p>
                        <p className="text-[10px] font-mono text-blue-700 truncate">
                          {upiId}
                        </p>
                        <p className="text-[10px] text-blue-700/80">
                          Customer can scan via GPay, PhonePe, or Paytm.
                        </p>
                      </div>
                    </div>
                  )}

                  {showReferenceField || singleAllocation.reference ? (
                    <Input
                      type="text"
                      placeholder={
                        singleAllocation.method === "UPI"
                          ? "Optional UPI UTR / Reference #"
                          : "Optional Auth / Ref / Cheque #"
                      }
                      value={singleAllocation.reference}
                      onChange={(e) =>
                        onChangeAllocationReference(singleAllocation.id, e.target.value)
                      }
                      className="h-7 text-[11px] bg-background"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowReferenceField(true)}
                      className="text-[10px] font-semibold text-muted-foreground hover:text-primary cursor-pointer"
                    >
                      + Add {singleAllocation.method === "UPI" ? "UTR / " : ""}Reference (optional)
                    </button>
                  )}
                </div>
              )}

              {/* CREDIT SINGLE PAYMENT FLOW */}
              {singleAllocation.method === "CREDIT" && (
                <div className="space-y-2">
                  {isWalkIn || !selectedCustomer ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 space-y-2 text-xs">
                      <div className="flex items-start gap-2 text-amber-900 font-semibold">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>Please select a registered customer before using Credit.</span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onOpenCustomerModal}
                        className="w-full h-8 text-xs font-bold border-amber-400 text-amber-900 bg-white hover:bg-amber-100"
                      >
                        Select Customer
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50/70 p-2.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-800 font-medium">Customer</span>
                        <span className="font-bold text-amber-950 truncate max-w-[180px]">
                          {selectedCustomer.full_name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-amber-800 font-medium">Credit (This Bill)</span>
                        <span className="font-bold text-amber-950 tabular-nums">
                          ₹{formatPaise(metrics.billTotalPaise)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-amber-200/80 pt-1.5">
                        <span className="text-amber-900 font-bold">
                          Outstanding Balance After Purchase
                        </span>
                        <span className="font-black text-amber-950 tabular-nums">
                          ₹{creditAfterPurchase.toFixed(2)}
                        </span>
                      </div>
                      {creditLimit > 0 && (
                        <div className="text-[10px] text-amber-800 text-right tabular-nums">
                          Credit Limit: ₹{creditLimit.toFixed(2)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Split Payment Explicit Trigger (Hidden complexity behind button) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEnableSplitMode}
            className="w-full h-8 text-xs font-bold border-dashed text-muted-foreground hover:text-primary hover:border-primary gap-1.5 cursor-pointer"
          >
            <Split className="h-3.5 w-3.5" />
            <span>+ Split Payment</span>
            <span className="text-[9px] font-mono opacity-75 ml-1">F5</span>
          </Button>
        </div>
      )}

      {/* =================================================================== */}
      {/* ADVANCED SPLIT PAYMENT MODE (SHOWN ONLY WHEN EXPLICITLY OPENED)     */}
      {/* =================================================================== */}
      {isSplitMode && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-primary flex items-center gap-1">
              <Split className="h-3.5 w-3.5" />
              Split Payment Allocations
            </span>
            <button
              type="button"
              onClick={onDisableSplitMode}
              className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Single Payment</span>
            </button>
          </div>

          {/* Summary Strip */}
          <div className="grid grid-cols-3 gap-1.5 rounded-lg border bg-muted/30 p-2 text-[11px]">
            <div>
              <span className="block text-[9px] uppercase text-muted-foreground font-semibold">
                Total
              </span>
              <span className="font-extrabold text-foreground tabular-nums">
                ₹{formatPaise(metrics.billTotalPaise)}
              </span>
            </div>
            <div className="text-center">
              <span className="block text-[9px] uppercase text-muted-foreground font-semibold">
                Paid
              </span>
              <span className="font-extrabold text-foreground tabular-nums">
                ₹{formatPaise(metrics.totalPaidPaise)}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[9px] uppercase text-muted-foreground font-semibold">
                {metrics.changePaise > 0 ? "Change" : "Remaining"}
              </span>
              <span
                className={cn(
                  "font-extrabold tabular-nums",
                  metrics.changePaise > 0
                    ? "text-amber-600"
                    : metrics.remainingPaise > 0 || metrics.isElectronicOverpay
                      ? "text-rose-600"
                      : "text-emerald-600"
                )}
              >
                ₹{formatPaise(metrics.changePaise > 0 ? metrics.changePaise : metrics.remainingPaise)}
              </span>
            </div>
          </div>

          {/* Allocation Rows */}
          <div className="space-y-2">
            {allocations.map((row) => {
              const otherPaidPaise = metrics.totalPaidPaise - row.amountPaise;
              const exactNeededRupees = fromPaise(Math.max(0, metrics.billTotalPaise - otherPaidPaise));
              return (
                <div
                  key={row.id}
                  className="rounded-md border bg-muted/20 p-2 space-y-1.5 text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <select
                      value={row.method}
                      onChange={(e) =>
                        onChangeAllocationMethod(row.id, e.target.value as AllocationMethod)
                      }
                      className="h-7 rounded border bg-background px-1.5 text-[11px] font-bold uppercase text-foreground w-24 shrink-0"
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">Card</option>
                      {creditSalesEnabled && <option value="CREDIT">Credit</option>}
                      <option value="NETBANKING">Bank</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="WALLET">Wallet</option>
                    </select>

                    <div className="relative flex-1">
                      <span className="absolute left-2 top-1.5 text-[11px] text-muted-foreground font-bold">
                        ₹
                      </span>
                      <Input
                        id={`payment-amount-${row.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={row.amountDraft}
                        onChange={(e) => onChangeAllocationAmount(row.id, e.target.value)}
                        onBlur={() => onBlurAllocationAmount(row.id)}
                        className="h-7 pl-5 pr-2 text-right font-bold text-xs tabular-nums"
                      />
                    </div>

                    {metrics.remainingPaise > 0 && (
                      <button
                        type="button"
                        onClick={() => onFillRemaining(row.id)}
                        className="rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-1 text-[10px] font-bold text-blue-700 cursor-pointer shrink-0 tabular-nums"
                      >
                        Fill ₹{formatPaise(metrics.remainingPaise)}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onRemoveAllocation(row.id)}
                      className="p-1 text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
                      aria-label="Remove payment method"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {row.method === "CASH" && exactNeededRupees > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => onQuickCash(row.id, exactNeededRupees)}
                        className="rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 cursor-pointer"
                      >
                        Exact ₹{exactNeededRupees.toFixed(2)}
                      </button>
                      {computeQuickCashAmounts(exactNeededRupees).map((denom) => (
                        <button
                          key={denom}
                          type="button"
                          onClick={() => onQuickCash(row.id, denom)}
                          className="rounded bg-background hover:bg-accent border px-1.5 py-0.5 text-[10px] font-medium cursor-pointer"
                        >
                          ₹{denom}
                        </button>
                      ))}
                    </div>
                  )}

                  {row.method !== "CASH" && row.method !== "CREDIT" && (
                    <Input
                      type="text"
                      placeholder={
                        row.method === "UPI"
                          ? "Optional UPI UTR / Ref..."
                          : "Optional Ref / Auth / Cheque #..."
                      }
                      value={row.reference}
                      onChange={(e) => onChangeAllocationReference(row.id, e.target.value)}
                      className="h-6.5 text-[10px] bg-background"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Payment Method Actions */}
          <div className="space-y-1.5">
            {metrics.remainingPaise > 0 && (
              <div className="flex flex-wrap gap-1">
                {(["CASH", "UPI", "CARD", ...(creditSalesEnabled ? ["CREDIT"] : []), "OTHER"] as PrimaryPaymentMethod[]).map(
                  (m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onSelectMethod(m)}
                      className="rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 text-[10px] font-bold text-blue-700 cursor-pointer"
                    >
                      + {m === "OTHER" ? "Other" : m === "CREDIT" ? "Credit" : m === "UPI" ? "UPI" : m === "CARD" ? "Card" : "Cash"} (₹{formatPaise(metrics.remainingPaise)})
                    </button>
                  )
                )}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddSplitAllocation}
              className="w-full h-7 text-[11px] font-bold gap-1 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Payment Method</span>
            </Button>
          </div>

          {/* Split UPI QR */}
          {allocations.some((a) => a.method === "UPI" && a.amountPaise > 0) &&
            upiId &&
            upiQrAmount > 0 && (
            <div className="flex items-center gap-2.5 rounded-md border border-blue-200 bg-blue-50/70 p-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(
                  upiUrl
                )}`}
                alt="UPI QR"
                className="h-14 w-14 rounded border bg-white p-0.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-blue-900">
                  Scan UPI QR · ₹{upiQrAmount.toFixed(2)}
                </p>
                <p className="text-[10px] font-mono text-blue-700 truncate">{upiId}</p>
              </div>
            </div>
          )}

          {/* Split Change Banner */}
          {metrics.changePaise > 0 && (
            <div className="flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-xs font-bold text-emerald-800">
              <span>Change to Return:</span>
              <span className="text-sm font-black tabular-nums">
                ₹{formatPaise(metrics.changePaise)}
              </span>
            </div>
          )}

          {/* Split Credit Policy Warning */}
          {metrics.usesCredit && (isWalkIn || !selectedCustomer) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-1.5 text-[11px] text-amber-900">
              <p className="font-semibold">
                Please select a registered customer before using Credit.
              </p>
              <button
                type="button"
                onClick={onOpenCustomerModal}
                className="rounded bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 text-[10px] font-bold cursor-pointer"
              >
                Select Customer
              </button>
            </div>
          )}
        </div>
      )}

      {/* Validation / Checkout Errors */}
      {checkoutError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2 text-[11px] text-destructive flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{checkoutError}</span>
        </div>
      )}

      {!checkoutError && validationMessage && !isWalkInCreditOnlyWarning && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
          <span>{validationMessage}</span>
        </div>
      )}
    </div>
  );
}
