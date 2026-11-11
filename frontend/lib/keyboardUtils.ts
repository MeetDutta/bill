export function extractSafeKey(e: { key?: unknown } | null | undefined): string {
  return typeof e?.key === "string" ? e.key : "";
}

export function isEditableEventTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return Boolean(el.isContentEditable);
}

const IGNORED_BARCODE_CONTROL_KEYS = new Set([
  "Process",
  "Unidentified",
  "Dead",
  "Alt",
  "Control",
  "Meta",
  "Tab",
  "Escape",
]);

export interface BarcodeStepInput {
  key: string;
  nowMs: number;
  lastKeyTimeMs: number;
  buffer: string;
  maxInterKeyMs?: number;
  minBarcodeLength?: number;
}

export interface BarcodeStepResult {
  nextBuffer: string;
  nextLastKeyTimeMs: number;
  submittedCode: string | null;
}

export function advanceBarcodeBuffer({
  key,
  nowMs,
  lastKeyTimeMs,
  buffer,
  maxInterKeyMs = 80,
  minBarcodeLength = 3,
}: BarcodeStepInput): BarcodeStepResult {
  if (!key) {
    return { nextBuffer: "", nextLastKeyTimeMs: nowMs, submittedCode: null };
  }

  const diff = nowMs - lastKeyTimeMs;

  if (key === "Enter") {
    const trimmed = buffer.trim();
    if (trimmed.length >= minBarcodeLength && diff < maxInterKeyMs) {
      return { nextBuffer: "", nextLastKeyTimeMs: nowMs, submittedCode: trimmed };
    }
    return { nextBuffer: "", nextLastKeyTimeMs: nowMs, submittedCode: null };
  }

  if (IGNORED_BARCODE_CONTROL_KEYS.has(key)) {
    return { nextBuffer: "", nextLastKeyTimeMs: nowMs, submittedCode: null };
  }

  // Allow Shift/CapsLock between scanner characters without resetting buffer
  if (key === "Shift" || key === "CapsLock") {
    return { nextBuffer: buffer, nextLastKeyTimeMs: lastKeyTimeMs, submittedCode: null };
  }

  if (key.length === 1) {
    const nextBuffer = diff < maxInterKeyMs ? buffer + key : key;
    return { nextBuffer, nextLastKeyTimeMs: nowMs, submittedCode: null };
  }

  // Navigation / editing keys reset any partial barcode buffer
  return { nextBuffer: "", nextLastKeyTimeMs: nowMs, submittedCode: null };
}

