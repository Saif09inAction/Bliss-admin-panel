import type { KaarigerOrder, KaarigerPayment } from "@/lib/types";

/**
 * Weekly Hisaab (aligned with client flow):
 *
 *   Running balance (opening/closing) += MAAL − material/astar/runner/repair
 *   (week kharcha is NOT subtracted from running balance)
 *
 *   Kharcha box     = this week's unpaid kharcha only
 *   Total Remaining = running balance + unpaid week kharcha (− credit − repairs)
 *
 * Paying kharcha reduces both Kharcha and Total Remaining.
 * Next Saturday: unpaid week kharcha folds into running balance; new week
 * kharcha appears in the Kharcha box.
 */

export function orderMaal(order: KaarigerOrder): number {
  if (order.productsTotal != null && order.productsTotal > 0) return order.productsTotal;
  return Math.max(0, order.originalDealAmount ?? order.totalDealAmount ?? 0);
}

export function orderMaterialDeductions(order: KaarigerOrder): number {
  if (order.materialDeductionsTotal != null) return Math.max(0, order.materialDeductionsTotal);
  return (order.materialDeductions || []).reduce((s, it) => s + (it.lineTotal || 0), 0);
}

export function orderRepairDeductions(order: KaarigerOrder): number {
  return Math.max(0, order.repairDeductionTotal || 0);
}

/** Full week's kharcha set on the bill (budget). */
export function orderWeekKharcha(order: KaarigerOrder): number {
  return Math.max(0, order.kharchaGiven || 0);
}

/** Week kharcha still owed on this bill (budget − rolled into running balance). */
export function orderKharchaDue(order: KaarigerOrder): number {
  return Math.max(0, orderWeekKharcha(order) - Math.max(0, order.kharchaCarriedForward || 0));
}

export function orderKharchaUnpaid(order: KaarigerOrder, paidOnOrder: number): number {
  return Math.max(0, orderKharchaDue(order) - Math.max(0, paidOnOrder));
}

/**
 * ADD to running balance (closing − opening for the week).
 * Week kharcha is tracked separately — not part of ADD.
 */
export function orderAddBalance(order: KaarigerOrder): number {
  if (order.addBalance != null && Number.isFinite(order.addBalance)) {
    return order.addBalance;
  }
  return orderMaal(order) - orderMaterialDeductions(order) - orderRepairDeductions(order);
}

export function orderClosing(openingBalance: number, order: KaarigerOrder): number {
  return Math.max(0, openingBalance) + orderAddBalance(order);
}

/**
 * Total remaining = running balance + unpaid week kharcha − credit − standalone repairs.
 * Credit is shown as its own ledger line; it still nets into this total.
 */
export function totalRemainingAmount(opts: {
  openingBalance: number;
  weekKharchaUnpaid: number;
  creditBalance?: number;
  standaloneRepairTotal?: number;
}): number {
  const gross =
    Math.max(0, opts.openingBalance) + Math.max(0, opts.weekKharchaUnpaid);
  return Math.max(
    0,
    gross - Math.max(0, opts.creditBalance || 0) - Math.max(0, opts.standaloneRepairTotal || 0)
  );
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Saturday-start week-of-month from a timestamp.
 * Example: Sat 4 Oct 2025 → { label: "October 1st week", key: "2025-10-W1" }
 */
export function weekLabelFromDate(ms: number): { label: string; key: string } {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) {
    return { label: "Week bill", key: "unknown" };
  }
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-based
  const day = d.getDate();
  // Day of week: 0=Sun … 6=Sat. Days since last Saturday (inclusive of today if Sat).
  const dow = d.getDay();
  const daysSinceSaturday = (dow + 1) % 7;
  const saturdayDate = day - daysSinceSaturday;
  // Week index in month: Saturday falling on day 1–7 → W1, 8–14 → W2, …
  const weekNum = Math.max(1, Math.ceil(Math.max(1, saturdayDate) / 7));
  const monthName = MONTHS[month];
  return {
    label: `${monthName} ${ordinal(weekNum)} week`,
    key: `${year}-${String(month + 1).padStart(2, "0")}-W${weekNum}`,
  };
}

/** Prefer stored weekLabel/weekKey; otherwise derive from createdAt. */
export function orderWeekMeta(order: Pick<KaarigerOrder, "weekLabel" | "weekKey" | "createdAt">): {
  label: string;
  key: string;
} {
  const derived = weekLabelFromDate(order.createdAt || Date.now());
  return {
    label: (order.weekLabel || "").trim() || derived.label,
    key: (order.weekKey || "").trim() || derived.key,
  };
}

export type HisaabLedgerKind =
  | "opening"
  | "credit"
  | "old_kharcha"
  | "bill_add"
  | "week_kharcha"
  | "kharcha_fold"
  | "payment"
  | "repair";

export type HisaabLedgerLine = {
  id: string;
  kind: HisaabLedgerKind;
  title: string;
  subtitle?: string;
  /** Signed change to Total Remaining (+ up, − down). */
  deltaRemaining: number;
  /** Signed change to Kharcha box. */
  deltaKharcha: number;
  remainingAfter: number;
  kharchaAfter: number;
  at: number;
};

function paymentSortKey(p: KaarigerPayment): number {
  if (p.createdAt && p.createdAt > 0) return p.createdAt;
  // Fallback: date + time as rough ms (YYYY-MM-DD + HH:MM)
  const date = (p.date || "").trim();
  const time = (p.time || "00:00").trim();
  const parsed = Date.parse(`${date}T${time.length === 5 ? time : "00:00"}:00`);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Local copies to avoid circular import with kaariger-pay. */
function payIsCredit(p: { orderId: string; remarks?: string }) {
  const remarks = (p.remarks || "").toLowerCase();
  return (
    p.remarks === "Extra kharcha — carried as credit" ||
    remarks.includes("carried as credit") ||
    remarks.includes("credit carried")
  );
}

function payIsOldKharcha(p: { orderId: string; remarks?: string }) {
  if (payIsCredit(p)) return false;
  const remarks = (p.remarks || "").toLowerCase();
  return (
    p.orderId === "__old_kharcha__" ||
    remarks.includes("old kharcha") ||
    remarks.includes("carried kharcha")
  );
}

function payIsOpening(p: { orderId: string; remarks?: string }) {
  if (payIsCredit(p) || payIsOldKharcha(p)) return false;
  const remarks = p.remarks || "";
  return (
    p.orderId === "__opening__" ||
    remarks === "Opening / old remaining payment" ||
    remarks === "Old remaining payment" ||
    remarks === "Opening balance payment" ||
    remarks.toLowerCase().includes("old remaining") ||
    remarks.toLowerCase().includes("opening balance")
  );
}

type RawEvent = {
  id: string;
  kind: HisaabLedgerKind;
  title: string;
  subtitle?: string;
  deltaRemaining: number;
  deltaKharcha: number;
  at: number;
};

/**
 * Build an oldest-first ledger with running Total Remaining and Kharcha after each line.
 * Does not merge payments — each payment is its own row.
 */
export function buildHisaabLedger(opts: {
  orders: KaarigerOrder[];
  payments: KaarigerPayment[];
  /** Current employee opening (used when no bill snapshots exist). */
  openingBalance: number;
  oldKharcha?: number;
  creditBalance?: number;
  standaloneRepairTotal?: number;
}): HisaabLedgerLine[] {
  const orders = [...opts.orders].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const events: RawEvent[] = [];

  const firstOpening =
    orders.find((o) => o.openingAtCreation != null && (o.openingAtCreation as number) >= 0)
      ?.openingAtCreation ?? null;

  const startOpening =
    firstOpening != null
      ? Math.max(0, firstOpening)
      : Math.max(0, opts.openingBalance || 0);

  const startAt = orders[0]?.createdAt ? orders[0].createdAt - 1 : Date.now() - 1;
  events.push({
    id: "opening",
    kind: "opening",
    title: "Opening balance",
    subtitle: "Purana baaki / running balance before this history",
    deltaRemaining: startOpening,
    deltaKharcha: 0,
    at: startAt,
  });

  // Legacy oldKharcha still on profile (not yet folded into a bill opening).
  const oldK = Math.max(0, opts.oldKharcha || 0);
  if (oldK > 0 && firstOpening == null) {
    // Already included in openingBalance when firstOpening is null and UI uses running = opening+old.
    // If openingBalance is stored without oldKharcha, add it.
  } else if (oldK > 0 && firstOpening != null) {
    events.push({
      id: "old_kharcha_balance",
      kind: "old_kharcha",
      title: "Old kharcha (still on profile)",
      subtitle: "Folds into running balance on next Saturday bill",
      deltaRemaining: oldK,
      deltaKharcha: 0,
      at: startAt + 1,
    });
  }

  const credit = Math.max(0, opts.creditBalance || 0);
  if (credit > 0) {
    events.push({
      id: "credit_applied",
      kind: "credit",
      title: "Credit applied",
      subtitle: "Extra paid earlier — reduces Total Remaining",
      deltaRemaining: -credit,
      deltaKharcha: 0,
      at: startAt + 2,
    });
  }

  const repair = Math.max(0, opts.standaloneRepairTotal || 0);
  if (repair > 0) {
    events.push({
      id: "standalone_repair",
      kind: "repair",
      title: "Repairing (no bill)",
      subtitle: "Approved faulty pcs — reduces Total Remaining",
      deltaRemaining: -repair,
      deltaKharcha: 0,
      at: startAt + 3,
    });
  }

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const week = orderWeekMeta(order);
    const add = orderAddBalance(order);
    const t = order.createdAt || startAt + 10 + i * 10;

    if (add !== 0) {
      events.push({
        id: `add-${order.id}`,
        kind: "bill_add",
        title: `Bill · ${week.label}`,
        subtitle: `ADD (MAAL − deductions)${order.productName ? ` · ${order.productName}` : ""}`,
        deltaRemaining: add,
        deltaKharcha: 0,
        at: t,
      });
    }

    const kharcha = orderWeekKharcha(order);
    if (kharcha > 0) {
      events.push({
        id: `kharcha-${order.id}`,
        kind: "week_kharcha",
        title: `${week.label} kharcha`,
        subtitle: "Added to Kharcha box (also in Total Remaining until paid or folded)",
        deltaRemaining: kharcha,
        deltaKharcha: kharcha,
        at: t + 1,
      });
    }

    const carried = Math.max(0, order.kharchaCarriedForward || 0);
    if (carried > 0) {
      // Fold time ≈ next bill create, else shortly after this bill.
      const nextT = orders[i + 1]?.createdAt;
      const foldAt = nextT && nextT > t ? nextT - 1 : t + 2;
      events.push({
        id: `fold-${order.id}`,
        kind: "kharcha_fold",
        title: `${week.label} kharcha carried forward`,
        subtitle: "Unpaid week kharcha folded into running balance (Kharcha box clears)",
        deltaRemaining: 0,
        deltaKharcha: -carried,
        at: foldAt,
      });
    }
  }

  for (const p of opts.payments) {
    if (payIsCredit(p)) {
      // Surplus parked as credit — already reflected in creditBalance line.
      events.push({
        id: `pay-${p.id}`,
        kind: "payment",
        title: "Paid → credit / advance",
        subtitle: [p.date, p.time, p.remarks].filter(Boolean).join(" · "),
        deltaRemaining: 0,
        deltaKharcha: 0,
        at: paymentSortKey(p),
      });
      continue;
    }

    const amount = Math.max(0, p.amount || 0);
    let title = "Paid";
    let deltaKharcha = 0;
    if (payIsOpening(p)) {
      title = "Paid · opening / purana baaki";
    } else if (payIsOldKharcha(p)) {
      title = "Paid · old kharcha";
      deltaKharcha = -amount;
    } else {
      const order = orders.find((o) => o.id === p.orderId);
      const week = order ? orderWeekMeta(order) : null;
      title = week ? `Paid · ${week.label} kharcha` : "Paid · week kharcha";
      deltaKharcha = -amount;
    }

    events.push({
      id: `pay-${p.id}`,
      kind: "payment",
      title,
      subtitle: [p.date, p.time, p.remarks].filter(Boolean).join(" · "),
      deltaRemaining: -amount,
      deltaKharcha,
      at: paymentSortKey(p),
    });
  }

  events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  let remaining = 0;
  let kharchaBox = 0;
  const lines: HisaabLedgerLine[] = [];
  for (const e of events) {
    remaining = Math.max(0, remaining + e.deltaRemaining);
    kharchaBox = Math.max(0, kharchaBox + e.deltaKharcha);
    lines.push({
      ...e,
      remainingAfter: remaining,
      kharchaAfter: kharchaBox,
    });
  }
  return lines;
}
