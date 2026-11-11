"use client";

import React from "react";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  Plus,
  QrCode,
  Receipt,
  Split,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types";

export type PaymentMode = "CASH" | "UPI" | "CARD" | "CREDIT" | "OTHER" | "HYBRID" | null;
export type OtherPaymentSubMethod = "NETBANKING" | "CHEQUE" | "WALLET";

export interface SplitPaymentLine {
  method: string;
  amount: number;
  reference?: string;
}

interface EmbeddedPaymentPanelProps {
  cartLength: number;
  grandTotal: number;
  isWalkIn: boolean;
  selectedCustomer: Customer | null;
  creditSalesEnabled: boolean;
  paymentMode: PaymentMode;
  otherPaymentMethod: OtherPaymentSubMethod;
  singleAmountDraft: string;
  singlePayingAmount: number;
  singlePaymentReference: string;
  hybridPayments: SplitPaymentLine[];
  hybridDrafts: Record<number, string>;
  upiId: string;
  upiUrl: string;
  upiQrAmount: number;
  totalPaidSoFar: number;
  remainingDue: number;
  cashChange: number;
  isElectronicOverpay: boolean;
  usesCredit: boolean;
  validationMessage: string | null;
  checkoutError: string;
  containerRef?: React.RefObject<HTMLDivElement>;
  firstMethodButtonRef?: React.RefObject<HTMLButtonElement>;
  onSelectPaymentMode: (mode: Exclude<PaymentMode, null>) => void;
  onChangeOtherMethod: (method: OtherPaymentSubMethod) => void;
  onSingleAmountChange: (raw: string) => void;
  onSingleAmountBlur: () => void;
  onSetExactAmount: () => void;
  onSetQuickCash: (amt: number) => void;
  onChangeSingleReference: (val: string) => void;
  onUpdateHybridMethod: (index: number, method: string) => void;
  onUpdateHybridAmount: (index: number, raw: string) => void;
  onBlurHybridAmount: (index: number) => void;
  onUpdateHybridReference: (index: number, ref: string) => void;
  onFillHybridRemaining: (index: number) => void;
  onAddHybridRow: () => void;
  onRemoveHybridRow: (index: number) => void;
  onOpenCustomerModal: () => void;
}

export function EmbeddedPaymentPanel({
  cartLength,
  grandTotal,
  isWalkIn,
  selectedCustomer,
  creditSalesEnabled,
  paymentMode,
  otherPaymentMethod,
  singleAmountDraft,
  singlePayingAmount,
  singlePaymentReference,
  hybridPayments,
  hybridDrafts,
  upiId,
  upiUrl,
  upiQrAmount,
  totalPaidSoFar,
  remainingDue,
  cashChange,
  isElectronicOverpay,
  usesCredit,
  validationMessage,
  checkoutError,
  containerRef,
  firstMethodButtonRef,
  onSelectPaymentMode,
  onChangeOtherMethod,
  onSingleAmountChange,
  onSingleAmountBlur,
  onSetExactAmount,
  onSetQuickCash,
  onChangeSingleReference,
  onUpdateHybridMethod,
  onUpdateHybridAmount,
  onBlurHybridAmount,
  onUpdateHybridReference,
  onFillHybridRemaining,
  onAddHybridRow,
  onRemoveHybridRow,
  onOpenCustomerModal,
}: EmbeddedPaymentPanelProps) {
  const isSplitMode = paymentMode === "HYBRID";
  const singleMethodOptions = [
    { id: "CASH" as const, label: "Cash", icon: Banknote },
    { id: "UPI" as const, label: "UPI", icon: QrCode },
    { id: "CARD" as const, label: "Card", icon: CreditCard },
    ...(creditSalesEnabled ? [{ id: "CREDIT" as const, label: "Credit", icon: Receipt }] : []),
    { id: "OTHER" as const, label: "Other", icon: Landmark },
  ];

  const isDisabled = cartLength === 0;
  const activeDifference = Math.abs(totalPaidSoFar - grandTotal);

  return (
    <div
      ref={containerRef}
      id="embedded-payment-panel"
      className={cn(
        "rounded-lg border bg-muted/20 p-2.5 space-y-2.5 transition-opacity",
        isDisabled && "opacity-75"
      )}
    >
      {/* Header + Single vs Split Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Payment Method
        </span>
        <div
          className="inline-flex rounded-md border bg-background p-0.5 text-[11px]"
          role="group"
          aria-label="Payment allocation mode"
        >
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => onSelectPaymentMode(paymentMode && paymentMode !== "HYBRID" ? paymentMode : "CASH")}
            aria-pressed={!isSplitMode && paymentMode !== null}
            className={cn(
              "rounded px-2 py-1 font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed",
              !isSplitMode && paymentMode !== null
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Single Payment
          </button>
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => onSelectPaymentMode("HYBRID")}
            aria-pressed={isSplitMode}
            className={cn(
              "rounded px-2 py-1 font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed",
              isSplitMode
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Split className="h-3 w-3" />
            <span>Split Payment</span>
          </button>
        </div>
      </div>

      {/* Single Mode Method Tiles */}
      {!isSplitMode && (
        <div
          className={cn(
            "grid gap-1.5",
            creditSalesEnabled ? "grid-cols-5" : "grid-cols-4"
          )}
          role="group"
          aria-label="Select payment method"
        >
          {singleMethodOptions.map((m, index) => {
            const isSelected = paymentMode === m.id;
            return (
              <button
                key={m.id}
                ref={index === 0 ? firstMethodButtonRef : undefined}
                type="button"
                disabled={isDisabled}
                aria-pressed={isSelected}
                onClick={() => onSelectPaymentMode(m.id)}
                className={cn(
                  "flex flex-col items-center justify-center rounded-md border py-1.5 px-1 text-[11px] font-semibold transition-all gap-0.5 cursor-pointer disabled:cursor-not-allowed",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary font-bold"
                    : "border-border bg-background hover:bg-muted/70 text-muted-foreground hover:text-foreground"
                )}
              >
                <m.icon className={cn("h-3.5 w-3.5", isSelected ? "text-primary" : "text-muted-foreground")} />
                <span className="leading-tight truncate max-w-full">{m.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Single Payment Input Area */}
      {!isSplitMode && paymentMode !== null && cartLength > 0 && (
        <div className="space-y-2 rounded-md border bg-background p-2.5 text-xs">
          {/* Sub-options for Other (Net Banking / Cheque / Wallet) */}
          {paymentMode === "OTHER" && (
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "NETBANKING" as const, label: "Net Banking", icon: Landmark },
                { id: "CHEQUE" as const, label: "Cheque", icon: Receipt },
                { id: "WALLET" as const, label: "Wallet", icon: Wallet },
              ].map((om) => (
                <button
                  key={om.id}
                  type="button"
                  onClick={() => onChangeOtherMethod(om.id)}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded border py-1 px-1.5 text-[11px] font-semibold transition-colors",
                    otherPaymentMethod === om.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <om.icon className="h-3 w-3" />
                  <span>{om.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Quick Tender Pills for Cash */}
          {paymentMode === "CASH" && grandTotal > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSetExactAmount}
                className="h-6 px-2 text-[11px] bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold"
              >
                Exact ₹{grandTotal.toFixed(2)}
              </Button>
              {[100, 200, 500, 1000, 2000]
                .filter((n) => n > grandTotal)
                .slice(0, 3)
                .map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onSetQuickCash(amt)}
                    className="h-6 px-2 text-[11px] font-semibold"
                  >
                    ₹{amt}
                  </Button>
                ))}
            </div>
          )}

          {/* Amount Received + Status Pill */}
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="single-payment-amount-input"
              className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap"
            >
              {paymentMode === "CREDIT" ? "Credit Amount" : "Amount Received"}
            </label>
            <div className="flex items-center gap-2 flex-1 max-w-[230px]">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-2 text-muted-foreground font-bold text-xs">₹</span>
                <Input
                  id="single-payment-amount-input"
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label="Amount received"
                  value={singleAmountDraft !== "" ? singleAmountDraft : singlePayingAmount}
                  onChange={(e) => onSingleAmountChange(e.target.value)}
                  onBlur={onSingleAmountBlur}
                  className="h-8 pl-6 pr-2 text-right font-mono text-xs font-bold tabular-nums"
                />
              </div>
              {paymentMode === "CASH" && cashChange > 0.009 && (
                <span className="rounded bg-amber-500/15 px-1.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 tabular-nums whitespace-nowrap">
                  Change ₹{cashChange.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Compact UPI QR strip */}
          {paymentMode === "UPI" && (
            <div className="flex items-center gap-2.5 rounded border bg-muted/20 p-2">
              <div className="bg-white p-1 rounded border shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(upiUrl)}`}
                  alt="UPI Payment QR"
                  className="h-12 w-12"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="font-semibold truncate">{upiId}</span>
                  <span className="font-bold text-emerald-600 tabular-nums shrink-0">
                    ₹{upiQrAmount.toFixed(2)}
                  </span>
                </div>
                <Input
                  placeholder="UTR / UPI Ref (optional)"
                  aria-label="UPI transaction reference"
                  value={singlePaymentReference}
                  onChange={(e) => onChangeSingleReference(e.target.value)}
                  className="h-7 text-[11px]"
                />
              </div>
            </div>
          )}

          {/* Optional Reference Input for Card / Other */}
          {(paymentMode === "CARD" || paymentMode === "OTHER") && (
            <Input
              placeholder={
                paymentMode === "CARD"
                  ? "Card Approval / Last 4 Digits (optional)"
                  : "Reference / Cheque # / UTR / Txn ID (optional)"
              }
              aria-label="Payment reference"
              value={singlePaymentReference}
              onChange={(e) => onChangeSingleReference(e.target.value)}
              className="h-7 text-[11px]"
            />
          )}
        </div>
      )}

      {/* SPLIT / HYBRID PAYMENT BREAKDOWN */}
      {isSplitMode && cartLength > 0 && (
        <div className="space-y-2 rounded-md border bg-background p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
              Split Allocations
            </span>
            <button
              type="button"
              onClick={onAddHybridRow}
              className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-0.5"
            >
              <Plus className="h-3 w-3" />
              Add Row
            </button>
          </div>

          <div className="divide-y rounded border bg-muted/10">
            {hybridPayments.map((p, idx) => {
              const draft = hybridDrafts[idx];
              return (
                <div key={idx} className="flex flex-wrap items-center gap-1.5 p-1.5 text-xs">
                  <select
                    value={p.method}
                    onChange={(e) => onUpdateHybridMethod(idx, e.target.value)}
                    aria-label={`Split payment method ${idx + 1}`}
                    className="h-7 rounded border bg-background px-1.5 font-bold uppercase text-[11px] w-24 shrink-0"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    {creditSalesEnabled && <option value="CREDIT">Credit</option>}
                    <option value="NETBANKING">Net Banking</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="WALLET">Wallet</option>
                  </select>

                  <div className="relative w-24 shrink-0">
                    <span className="absolute left-2 top-1.5 text-muted-foreground font-bold text-[11px]">₹</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Split amount for ${p.method}`}
                      value={draft !== undefined ? draft : p.amount || ""}
                      placeholder="0.00"
                      onChange={(e) => onUpdateHybridAmount(idx, e.target.value)}
                      onBlur={() => onBlurHybridAmount(idx)}
                      className="h-7 pl-5 pr-1.5 text-right text-[11px] font-bold font-mono tabular-nums"
                    />
                  </div>

                  {remainingDue > 0.009 && (
                    <button
                      type="button"
                      onClick={() => onFillHybridRemaining(idx)}
                      className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10 shrink-0"
                    >
                      Fill ₹{remainingDue.toFixed(2)}
                    </button>
                  )}

                  <Input
                    placeholder="Ref (opt)"
                    aria-label={`Reference for split row ${idx + 1}`}
                    value={p.reference || ""}
                    onChange={(e) => onUpdateHybridReference(idx, e.target.value)}
                    className="h-7 text-[11px] flex-1 min-w-[75px]"
                  />

                  {hybridPayments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveHybridRow(idx)}
                      className="text-destructive hover:text-destructive/80 p-1 rounded hover:bg-destructive/10 shrink-0"
                      aria-label="Remove split row"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mini UPI QR inside Split when UPI > 0 */}
          {hybridPayments.some((p) => p.method === "UPI" && p.amount > 0) && (
            <div className="flex items-center gap-2 rounded border bg-muted/20 p-1.5">
              <div className="bg-white p-0.5 rounded border shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(upiUrl)}`}
                  alt="UPI Split QR"
                  className="h-10 w-10"
                />
              </div>
              <div className="text-[11px]">
                <span className="font-semibold block">{upiId}</span>
                <span className="font-bold text-emerald-600 tabular-nums">
                  UPI Split: ₹{upiQrAmount.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Split Totals Summary */}
          <div className="grid grid-cols-2 gap-2 rounded bg-muted/40 px-2.5 py-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Paid:</span>
              <span className="font-bold text-foreground tabular-nums">₹{totalPaidSoFar.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {cashChange > 0.009 ? "Cash Change:" : isElectronicOverpay ? "Excess:" : "Remaining:"}
              </span>
              <span
                className={cn(
                  "font-bold tabular-nums",
                  cashChange > 0.009
                    ? "text-amber-600"
                    : remainingDue > 0.009 || isElectronicOverpay
                    ? "text-destructive"
                    : "text-emerald-600"
                )}
              >
                ₹
                {cashChange > 0.009
                  ? cashChange.toFixed(2)
                  : isElectronicOverpay
                  ? activeDifference.toFixed(2)
                  : remainingDue.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Credit Customer Status Banner */}
      {usesCredit && cartLength > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-900 dark:text-amber-200">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold flex items-center gap-1">
              <Receipt className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              Credit / Udhaar Customer
            </span>
            {isWalkIn && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onOpenCustomerModal}
                className="h-6 px-2 text-[10px] border-amber-600/40"
              >
                Select Customer
              </Button>
            )}
          </div>
          {isWalkIn ? (
            <p className="text-destructive font-medium mt-0.5">
              Walk-in customers cannot use Credit. Select a registered customer.
            </p>
          ) : (
            <p className="mt-0.5 text-muted-foreground truncate">
              {selectedCustomer?.full_name} • Due: ₹{Number(selectedCustomer?.outstanding_credit || 0).toFixed(2)}
              {Number(selectedCustomer?.credit_limit || 0) > 0
                ? ` / Limit: ₹${Number(selectedCustomer?.credit_limit).toFixed(2)}`
                : ""}
            </p>
          )}
        </div>
      )}

      {/* Live Inline Validation / Backend Error Feedback */}
      <div aria-live="polite" className="space-y-1">
        {cartLength > 0 && paymentMode === null && !checkoutError && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Select a payment method above to complete the sale.</span>
          </div>
        )}

        {cartLength > 0 && validationMessage && !checkoutError && (
          <div className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{validationMessage}</span>
          </div>
        )}

        {checkoutError && (
          <div className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{checkoutError}</span>
          </div>
        )}

        {cartLength > 0 && paymentMode !== null && !validationMessage && !checkoutError && (
          <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-300 px-0.5">
            <span className="inline-flex items-center gap-1 font-medium">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              Ready via {paymentMode === "HYBRID" ? "Split Payment" : paymentMode === "OTHER" ? otherPaymentMethod : paymentMode}
            </span>
            <span className="font-bold tabular-nums">₹{totalPaidSoFar.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
