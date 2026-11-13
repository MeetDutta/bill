import type { Customer } from "@/types";

export type PrimaryPaymentMethod = "CASH" | "UPI" | "CARD" | "CREDIT" | "OTHER";
export type OtherPaymentSubMethod = "NETBANKING" | "CHEQUE" | "WALLET";
export type AllocationMethod =
  | "CASH"
  | "UPI"
  | "CARD"
  | "CREDIT"
  | "NETBANKING"
  | "CHEQUE"
  | "WALLET";

export interface PaymentAllocation {
  id: string;
  method: AllocationMethod;
  amountPaise: number;
  amountDraft: string;
  isManual: boolean;
  reference: string;
}

export interface PaymentMetrics {
  billTotalPaise: number;
  totalPaidPaise: number;
  cashPaidPaise: number;
  nonCashPaidPaise: number;
  creditPaidPaise: number;
  remainingPaise: number;
  excessPaise: number;
  changePaise: number;
  isElectronicOverpay: boolean;
  usesCredit: boolean;
  activeCount: number;
  isSplit: boolean;
}

let allocSeq = 0;
export function createAllocationId(): string {
  allocSeq += 1;
  return `pay-${allocSeq}-${Math.random().toString(36).slice(2, 6)}`;
}

export function toPaise(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const num = typeof amount === "number" ? amount : Number(String(amount).trim());
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

export function fromPaise(paise: number): number {
  return Number((Math.round(paise) / 100).toFixed(2));
}

export function formatPaise(paise: number): string {
  return (Math.round(paise) / 100).toFixed(2);
}

export function hasValidDecimalPrecision(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return /^\d*(\.\d{0,2})?$/.test(trimmed);
}

export function computePaymentMetrics(
  allocations: PaymentAllocation[],
  billTotalPaise: number
): PaymentMetrics {
  const safeTotal = Math.max(0, Math.round(billTotalPaise));
  let totalPaidPaise = 0;
  let cashPaidPaise = 0;
  let creditPaidPaise = 0;
  let activeCount = 0;

  for (const alloc of allocations) {
    const amt = Math.max(0, Math.round(alloc.amountPaise || 0));
    totalPaidPaise += amt;
    if (amt > 0) {
      activeCount += 1;
    }
    if (alloc.method === "CASH") {
      cashPaidPaise += amt;
    } else if (alloc.method === "CREDIT") {
      creditPaidPaise += amt;
    }
  }

  const nonCashPaidPaise = Math.max(0, totalPaidPaise - cashPaidPaise);
  const remainingPaise = Math.max(0, safeTotal - totalPaidPaise);
  const excessPaise = Math.max(0, totalPaidPaise - safeTotal);
  const isElectronicOverpay = excessPaise > 0 && nonCashPaidPaise > safeTotal;
  const changePaise = excessPaise > 0 && !isElectronicOverpay ? excessPaise : 0;

  return {
    billTotalPaise: safeTotal,
    totalPaidPaise,
    cashPaidPaise,
    nonCashPaidPaise,
    creditPaidPaise,
    remainingPaise,
    excessPaise,
    changePaise,
    isElectronicOverpay,
    usesCredit: creditPaidPaise > 0,
    activeCount,
    isSplit: activeCount > 1,
  };
}

/**
 * Selects or adds a payment method using the unified smart allocation flow:
 * - First selection auto-fills the full remaining/bill balance (`isManual: false`).
 * - When remaining balance > 0, clicking a new method appends it pre-filled with Remaining Balance.
 * - When remaining balance == 0 and an untouched system-suggested row exists for another method,
 *   switching methods replaces that unedited suggestion cleanly.
 */
export function selectMethodAllocation(
  allocations: PaymentAllocation[],
  method: AllocationMethod,
  billTotalPaise: number
): { allocations: PaymentAllocation[]; focusedId: string | null } {
  const safeTotal = Math.max(0, Math.round(billTotalPaise));
  const metrics = computePaymentMetrics(allocations, safeTotal);

  if (allocations.length === 0) {
    const id = createAllocationId();
    return {
      allocations: [
        {
          id,
          method,
          amountPaise: safeTotal,
          amountDraft: safeTotal > 0 ? formatPaise(safeTotal) : "0.00",
          isManual: false,
          reference: "",
        },
      ],
      focusedId: id,
    };
  }

  const existingIndex = allocations.findIndex((a) => a.method === method);

  if (metrics.remainingPaise > 0) {
    if (existingIndex === -1) {
      const id = createAllocationId();
      return {
        allocations: [
          ...allocations,
          {
            id,
            method,
            amountPaise: metrics.remainingPaise,
            amountDraft: formatPaise(metrics.remainingPaise),
            isManual: false,
            reference: "",
          },
        ],
        focusedId: id,
      };
    }

    // Method already exists while remaining balance > 0: top up that allocation with remaining balance
    const target = allocations[existingIndex];
    const nextPaise = target.amountPaise + metrics.remainingPaise;
    const next = allocations.map((a, idx) =>
      idx === existingIndex
        ? {
            ...a,
            amountPaise: nextPaise,
            amountDraft: formatPaise(nextPaise),
            isManual: false,
          }
        : a
    );
    return { allocations: next, focusedId: target.id };
  }

  // Remaining balance is 0
  if (existingIndex !== -1) {
    return { allocations, focusedId: allocations[existingIndex].id };
  }

  // If the last auto-suggested allocation was untouched (`!isManual`), switch its method smoothly
  let lastAutoIdx = -1;
  for (let i = allocations.length - 1; i >= 0; i -= 1) {
    if (!allocations[i].isManual) {
      lastAutoIdx = i;
      break;
    }
  }
  if (lastAutoIdx !== -1) {
    const switched = allocations.map((a, idx) =>
      idx === lastAutoIdx ? { ...a, method, reference: "" } : a
    );
    return { allocations: switched, focusedId: allocations[lastAutoIdx].id };
  }

  // Otherwise append as 0.00 so cashier can edit or adjust allocations freely
  const id = createAllocationId();
  return {
    allocations: [
      ...allocations,
      {
        id,
        method,
        amountPaise: 0,
        amountDraft: "",
        isManual: false,
        reference: "",
      },
    ],
    focusedId: id,
  };
}

/**
 * Updates one allocation's amount when the cashier types a new amount.
 * Marks the edited row as `isManual: true` and intelligently adjusts any single
 * unedited (`!isManual`) allocation to absorb the new remaining balance.
 */
export function updateAllocationAmount(
  allocations: PaymentAllocation[],
  id: string,
  rawDraft: string,
  billTotalPaise: number,
  options: { markManual?: boolean } = {}
): PaymentAllocation[] {
  const safeTotal = Math.max(0, Math.round(billTotalPaise));
  const markManual = options.markManual ?? true;
  const trimmed = rawDraft.trim();
  const parsed = trimmed === "" ? 0 : Number(trimmed);
  const parsedPaise =
    Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;

  let next = allocations.map((a) =>
    a.id === id
      ? {
          ...a,
          amountDraft: rawDraft,
          amountPaise: parsedPaise,
          isManual: markManual,
        }
      : a
  );

  // Find trailing untouched (`!isManual`) row other than the one being edited
  let autoIdx = -1;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].id !== id && !next[i].isManual) {
      autoIdx = i;
      break;
    }
  }

  if (autoIdx !== -1) {
    const sumOthers = next.reduce(
      (sum, row, idx) => (idx === autoIdx ? sum : sum + Math.max(0, row.amountPaise)),
      0
    );
    const autoTargetPaise = Math.max(0, safeTotal - sumOthers);
    next = next.map((row, idx) =>
      idx === autoIdx
        ? {
            ...row,
            amountPaise: autoTargetPaise,
            amountDraft: formatPaise(autoTargetPaise),
          }
        : row
    );
  }

  return next;
}

export function blurAllocationAmount(
  allocations: PaymentAllocation[],
  id: string
): PaymentAllocation[] {
  return allocations.map((a) => {
    if (a.id !== id) return a;
    if (a.amountDraft.trim() === "") {
      return { ...a, amountPaise: 0, amountDraft: "0.00" };
    }
    const parsed = Number(a.amountDraft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ...a, amountPaise: 0, amountDraft: "0.00" };
    }
    const paise = Math.round(parsed * 100);
    return { ...a, amountPaise: paise, amountDraft: formatPaise(paise) };
  });
}

export function changeAllocationMethod(
  allocations: PaymentAllocation[],
  id: string,
  newMethod: AllocationMethod
): PaymentAllocation[] {
  return allocations.map((a) => (a.id === id ? { ...a, method: newMethod } : a));
}

export function updateAllocationReference(
  allocations: PaymentAllocation[],
  id: string,
  reference: string
): PaymentAllocation[] {
  return allocations.map((a) => (a.id === id ? { ...a, reference } : a));
}

export function fillAllocationRemaining(
  allocations: PaymentAllocation[],
  id: string,
  billTotalPaise: number
): PaymentAllocation[] {
  const safeTotal = Math.max(0, Math.round(billTotalPaise));
  const otherPaid = allocations.reduce(
    (sum, a) => (a.id === id ? sum : sum + Math.max(0, a.amountPaise)),
    0
  );
  const targetPaise = Math.max(0, safeTotal - otherPaid);
  return allocations.map((a) =>
    a.id === id
      ? {
          ...a,
          amountPaise: targetPaise,
          amountDraft: formatPaise(targetPaise),
          isManual: true,
        }
      : a
  );
}

export function removeAllocationRow(
  allocations: PaymentAllocation[],
  id: string
): PaymentAllocation[] {
  return allocations.filter((a) => a.id !== id);
}

/**
 * Reconciles system-suggested (`!isManual`) allocation when bill total changes
 * (e.g. cart item added/removed, qty updated, or discount applied).
 */
export function reconcileAllocationsForTotal(
  allocations: PaymentAllocation[],
  newTotalPaise: number
): PaymentAllocation[] {
  if (allocations.length === 0) return allocations;
  const safeTotal = Math.max(0, Math.round(newTotalPaise));

  let autoIdx = -1;
  for (let i = allocations.length - 1; i >= 0; i -= 1) {
    if (!allocations[i].isManual) {
      autoIdx = i;
      break;
    }
  }
  if (autoIdx === -1) return allocations;

  const otherPaid = allocations.reduce(
    (sum, a, idx) => (idx === autoIdx ? sum : sum + Math.max(0, a.amountPaise)),
    0
  );
  const newTargetPaise = Math.max(0, safeTotal - otherPaid);
  const current = allocations[autoIdx];
  if (current.amountPaise === newTargetPaise && current.amountDraft === formatPaise(newTargetPaise)) {
    return allocations;
  }

  return allocations.map((a, idx) =>
    idx === autoIdx
      ? {
          ...a,
          amountPaise: newTargetPaise,
          amountDraft: formatPaise(newTargetPaise),
        }
      : a
  );
}

export function validateSmartPayments(
  allocations: PaymentAllocation[],
  billTotalPaise: number,
  options: {
    creditSalesEnabled: boolean;
    isWalkIn: boolean;
    selectedCustomer: Customer | null;
  }
): string | null {
  const safeTotal = Math.max(0, Math.round(billTotalPaise));
  if (allocations.length === 0) return null;

  for (const row of allocations) {
    const trimmed = row.amountDraft.trim();
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return `Enter a valid non-negative amount for ${row.method}.`;
      }
      if (!hasValidDecimalPrecision(trimmed)) {
        return `${row.method} amount supports at most 2 decimal places.`;
      }
    }
  }

  const metrics = computePaymentMetrics(allocations, safeTotal);

  if (safeTotal > 0 && metrics.activeCount === 0) {
    return "Enter a valid payment amount greater than ₹0.00.";
  }

  if (metrics.usesCredit) {
    if (!options.creditSalesEnabled) {
      return "Credit / Udhaar sales are disabled in business settings.";
    }
    if (options.isWalkIn || !options.selectedCustomer) {
      return "Walk-in customers cannot take Credit sales. Select a registered customer first.";
    }
    const creditLimit = toPaise(options.selectedCustomer.credit_limit || 0);
    const currentOutstanding = toPaise(options.selectedCustomer.outstanding_credit || 0);
    if (creditLimit > 0 && currentOutstanding + metrics.creditPaidPaise > creditLimit) {
      return `Credit amount ₹${formatPaise(metrics.creditPaidPaise)} exceeds available customer limit (₹${formatPaise(
        Math.max(0, creditLimit - currentOutstanding)
      )}).`;
    }
  }

  if (metrics.isElectronicOverpay) {
    return `Digital / Credit payments (₹${formatPaise(
      metrics.nonCashPaidPaise
    )}) cannot exceed the bill total (₹${formatPaise(safeTotal)}). Overpayment is only permitted in Cash.`;
  }

  if (metrics.remainingPaise > 0) {
    return `Paid ₹${formatPaise(metrics.totalPaidPaise)} — Remaining balance of ₹${formatPaise(
      metrics.remainingPaise
    )} must be allocated before completing the sale.`;
  }

  return null;
}

export function buildCheckoutPaymentPayload(
  allocations: PaymentAllocation[]
): { payment_method: string; amount: number; reference?: string }[] {
  return allocations
    .filter((a) => a.amountPaise > 0)
    .map((a) => ({
      payment_method: a.method.toLowerCase(),
      amount: fromPaise(a.amountPaise),
      reference: a.reference?.trim() || undefined,
    }));
}

/**
 * Selects a single payment method cleanly for Normal (single-payment) checkout mode,
 * replacing any prior allocations and auto-filling the full bill total.
 */
export function selectSingleMethodAllocation(
  method: AllocationMethod,
  billTotalPaise: number
): PaymentAllocation[] {
  const safeTotal = Math.max(0, Math.round(billTotalPaise));
  return [
    {
      id: createAllocationId(),
      method,
      amountPaise: safeTotal,
      amountDraft: safeTotal > 0 ? formatPaise(safeTotal) : "0.00",
      isManual: false,
      reference: "",
    },
  ];
}

/**
 * Appends another payment method to existing allocations, automatically pre-filling
 * with any remaining balance.
 */
export function addPaymentAllocation(
  allocations: PaymentAllocation[],
  method: AllocationMethod,
  billTotalPaise: number
): PaymentAllocation[] {
  const safeTotal = Math.max(0, Math.round(billTotalPaise));
  const metrics = computePaymentMetrics(allocations, safeTotal);
  const nextPaise = metrics.remainingPaise > 0 ? metrics.remainingPaise : 0;
  const newRow: PaymentAllocation = {
    id: createAllocationId(),
    method,
    amountPaise: nextPaise,
    amountDraft: nextPaise > 0 ? formatPaise(nextPaise) : "0.00",
    isManual: false,
    reference: "",
  };
  return [...allocations, newRow];
}

/**
 * Computes intuitive quick-cash tender denominations strictly higher than the target bill amount.
 */
export function computeQuickCashAmounts(targetRupees: number): number[] {
  const safeTarget = Math.max(0, Number(targetRupees) || 0);
  const candidates = new Set<number>([
    20, 50, 100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000,
  ]);
  if (safeTarget > 50) {
    candidates.add(Math.ceil(safeTarget / 100) * 100);
  }
  if (safeTarget > 500) {
    candidates.add(Math.ceil(safeTarget / 500) * 500);
  }
  return Array.from(candidates)
    .filter((amt) => amt > safeTarget + 0.005)
    .sort((a, b) => a - b)
    .slice(0, 3);
}

export function getAllocationDisplayLabel(method: AllocationMethod): string {
  switch (method) {
    case "CASH":
      return "Cash";
    case "UPI":
      return "UPI";
    case "CARD":
      return "Card";
    case "CREDIT":
      return "Credit";
    case "NETBANKING":
      return "Net Banking";
    case "CHEQUE":
      return "Cheque";
    case "WALLET":
      return "Wallet";
    default:
      return method;
  }
}

