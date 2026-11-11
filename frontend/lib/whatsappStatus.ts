import type { WhatsAppDeliverySummary } from "@/types";

export type WhatsAppUiStatus = "idle" | "queued" | "sending" | "sent" | "failed" | "skipped";

export interface WhatsAppUiPresentation {
  status: WhatsAppUiStatus;
  message: string;
  filename?: string;
  reason?: string;
  phoneNumber?: string;
}

export function isWhatsAppDeliveryActive(status?: string | null): boolean {
  return status === "queued" || status === "processing";
}

export function isWhatsAppDelivered(
  delivery?: WhatsAppDeliverySummary | null,
  billSent?: boolean | null
): boolean {
  const s = delivery?.status;
  return Boolean(
    billSent || s === "sent" || s === "delivered" || s === "read" || s === "already_sent"
  );
}

export function resolveWhatsAppPresentation(
  delivery?: WhatsAppDeliverySummary | null,
  billSent?: boolean | null
): WhatsAppUiPresentation {
  const filename = delivery?.filename || "";
  const phoneNumber = delivery?.phone_number || "";
  const reason = delivery?.skip_reason || delivery?.failure_reason || "";
  const status = delivery?.status;

  if (isWhatsAppDelivered(delivery, billSent)) {
    const autoPrefix = delivery?.trigger === "automatic" ? "automatically " : "";
    return {
      status: "sent",
      filename,
      phoneNumber,
      message: `✓ Invoice ${autoPrefix}sent to WhatsApp${filename ? ` (${filename})` : ""}${
        phoneNumber ? ` → +${phoneNumber.replace(/^\+/, "")}` : ""
      }`,
    };
  }

  if (status === "queued" || status === "processing") {
    return {
      status: "queued",
      filename,
      phoneNumber,
      message: `Sending invoice PDF via WhatsApp${phoneNumber ? ` to +${phoneNumber.replace(/^\+/, "")}` : ""}...`,
    };
  }

  if (status === "skipped") {
    return {
      status: "skipped",
      filename,
      phoneNumber,
      reason,
      message: reason
        ? `Automatic WhatsApp skipped: ${reason}`
        : "Automatic WhatsApp delivery skipped.",
    };
  }

  if (status === "failed" || status === "error") {
    return {
      status: "failed",
      filename,
      phoneNumber,
      reason,
      message: reason
        ? `⚠ Invoice created successfully, but WhatsApp delivery failed: ${reason}`
        : "⚠ Invoice created successfully, but WhatsApp delivery failed.",
    };
  }

  return { status: "idle", message: "" };
}

