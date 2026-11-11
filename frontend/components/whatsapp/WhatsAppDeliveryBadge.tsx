"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Share2 } from "lucide-react";
import { invoiceApi } from "@/services/api";
import { parseApiError } from "@/lib/utils";
import { resolveWhatsAppPresentation, WhatsAppUiStatus } from "@/lib/whatsappStatus";
import type { WhatsAppDeliverySummary } from "@/types";

interface WhatsAppDeliveryBadgeProps {
  invoiceId: string;
  initialDelivery?: WhatsAppDeliverySummary | null;
  initialBillSent?: boolean;
  customerPhone?: string;
}

export function WhatsAppDeliveryBadge({
  invoiceId,
  initialDelivery,
  initialBillSent,
  customerPhone,
}: WhatsAppDeliveryBadgeProps) {
  const [waState, setWaState] = useState<{ status: WhatsAppUiStatus; message: string }>(() => {
    const p = resolveWhatsAppPresentation(initialDelivery, initialBillSent);
    return { status: p.status, message: p.message };
  });
  const [manualPhone, setManualPhone] = useState(customerPhone || "");
  const [showPhoneInput, setShowPhoneInput] = useState(false);

  useEffect(() => {
    const p = resolveWhatsAppPresentation(initialDelivery, initialBillSent);
    setWaState({ status: p.status, message: p.message });
    setManualPhone(customerPhone || "");
    setShowPhoneInput(false);
  }, [invoiceId, initialDelivery, initialBillSent, customerPhone]);

  useEffect(() => {
    if (!invoiceId || waState.status !== "queued") return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const res = await invoiceApi.getWhatsAppStatus(invoiceId);
        if (cancelled) return;
        const delivery = res.data?.whatsapp_delivery;
        const billSent = Boolean(res.data?.bill_sent);
        const next = resolveWhatsAppPresentation(delivery, billSent);
        if (next.status !== "queued" && next.status !== "idle") {
          setWaState({ status: next.status, message: next.message });
          return;
        }
      } catch {
        // Ignore transient poll errors
      }
      if (!cancelled && attempts < 20) {
        timer = window.setTimeout(poll, 1500);
      }
    };

    let timer = window.setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [invoiceId, waState.status]);

  const handleManualSend = async (phoneArg?: string) => {
    if (!invoiceId || waState.status === "sending" || waState.status === "queued") return;
    const phoneToUse = (phoneArg ?? manualPhone).trim();
    if (!phoneToUse || phoneToUse.toLowerCase().startsWith("walkin")) {
      setShowPhoneInput(true);
      return;
    }

    const prevStatus = waState.status;
    setWaState({ status: "sending", message: "Sending invoice PDF via WhatsApp..." });
    try {
      const res = await invoiceApi.sendWhatsApp(invoiceId, {
        phone: phoneToUse || undefined,
        force: prevStatus === "sent",
      });
      const data = res.data;
      if (data?.status === "sent" || data?.status === "already_sent") {
        setShowPhoneInput(false);
        setWaState({
          status: "sent",
          message: `✓ Invoice sent to WhatsApp${data?.filename ? ` (${data.filename})` : ""}`,
        });
      } else {
        setWaState({
          status: "failed",
          message: `⚠ Delivery failed${data?.error ? `: ${data.error}` : "."}`,
        });
      }
    } catch (err: unknown) {
      setWaState({
        status: "failed",
        message: `⚠ Delivery failed: ${parseApiError(err, "WhatsApp delivery failed.")}`,
      });
    }
  };

  if (waState.status === "idle" && !showPhoneInput) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs text-left space-y-2 ${
        waState.status === "sent"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : waState.status === "failed"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : waState.status === "queued" || waState.status === "sending"
          ? "border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-300"
          : "border-border bg-muted/40 text-foreground"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          {(waState.status === "queued" || waState.status === "sending") && (
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          )}
          {waState.status === "sent" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
          {(waState.status === "failed" || waState.status === "skipped") && (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>{waState.message}</span>
        </div>
        {waState.status === "failed" && (
          <button
            type="button"
            onClick={() => handleManualSend()}
            className="text-[11px] font-bold underline shrink-0"
          >
            Retry
          </button>
        )}
        {waState.status === "skipped" && !showPhoneInput && (
          <button
            type="button"
            onClick={() => setShowPhoneInput(true)}
            className="text-[11px] font-bold underline shrink-0 inline-flex items-center gap-1"
          >
            <Share2 className="h-3 w-3" /> Send Manually
          </button>
        )}
      </div>

      {showPhoneInput && (
        <div className="flex items-center gap-1.5">
          <input
            type="tel"
            value={manualPhone}
            onChange={(e) => setManualPhone(e.target.value)}
            placeholder="WhatsApp mobile (e.g. 9876543210)"
            className="flex-1 rounded border bg-background px-2.5 py-1 text-xs text-foreground"
          />
          <button
            type="button"
            onClick={() => handleManualSend(manualPhone)}
            disabled={!manualPhone.trim() || waState.status === "sending"}
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Send PDF
          </button>
        </div>
      )}
    </div>
  );
}

