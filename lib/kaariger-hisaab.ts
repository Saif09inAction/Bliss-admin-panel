import type { KaarigerOrder, KaarigerPayment } from "@/lib/types";

/**
 * Weekly Hisaab:
 *
 *   Running / opening += ADD (MAAL − deductions − repair)
 *   Week kharcha on bill create = cash GIVEN → subtracts from Total Remaining
 *     (stored in employees.openingBalance at create: closing = opening + ADD − kharcha)
 *   Kharcha box = week budget still open (given − paid − carried) — for breakdown only
 *   Paying week kharcha does NOT reduce Total Remaining again (already deducted at create)
 *   Next Saturday: unused (given − paid) folds back into opening (+unused)
 *
 * Opening payments reduce openingBalance and appear line-by-line on the ledger.
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

/** Full week's kharcha set on the bill (cash given / budget). */
export function orderWeekKharcha(order: KaarigerOrder): number {
  return Math.max(0, order.kharchaGiven || 0);
}

/** Week kharcha still open on this bill (budget − rolled back as unused). */
export function orderKharchaDue(order: KaarigerOrder): number {
  return Math.max(0, orderWeekKharcha(order) - Math.max(0, order.kharchaCarriedForward || 0));
}

/** Unpaid / unused portion still showing in the Kharcha box. */
export function orderKharchaUnpaid(order: KaarigerOrder, paidOnOrder: number): number {
  return Math.max(0, orderKharchaDue(order) - Math.max(0, paidOnOrder));
}

/**
 * ADD to running balance (before kharcha cash given).
 * Week kharcha is subtracted separately at bill create.
 */
export function orderAddBalance(order: KaarigerOrder): number {
  if (order.addBalance != null && Number.isFinite(order.addBalance)) {
    return order.addBalance;
  }
  return orderMaal(order) - orderMaterialDeductions(order) - orderRepairDeductions(order);
}

/** Closing snapshot before storing: opening + ADD − week kharcha given. */
export function orderClosingAfterKharcha(openingBalance: number, order: KaarigerOrder): number {
  return Math.max(0, openingBalance) + orderAddBalance(order) - orderWeekKharcha(order);
}

/**
 * Total remaining from stored running balance (already net of week kharcha given at create).
 * Credit and standalone repairs reduce what is still owed.
 */
export function totalRemainingAmount(opts: {
  openingBalance: number;
  /** @deprecated Ignored — kharcha is deducted at bill create, not added here. */
  weekKharchaUnpaid?: number;
  creditBalance?: number;
  standaloneRepairTotal?: number;
}): number {
  return Math.max(
    0,
    Math.max(0, opts.openingBalance) -
      Math.max(0, opts.creditBalance || 0) -
      Math.max(0, opts.standaloneRepairTotal || 0)
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
  const month = d.getMonth();
  const day = d.getDate();
  const dow = d.getDay();
  const daysSinceSaturday = (dow + 1) % 7;
  const saturdayDate = day - daysSinceSaturday;
  const weekNum = Math.max(1, Math.ceil(Math.max(1, saturdayDate) / 7));
  const monthName = MONTHS[month];
  return {
    label: `${monthName} ${ordinal(weekNum)} week`,
    key: `${year}-${String(month + 1).padStart(2, "0")}-W${weekNum}`,
  };
}

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
  deltaRemaining: number;
  deltaKharcha: number;
  remainingAfter: number;
  kharchaAfter: number;
  at: number;
};

function paymentSortKey(p: KaarigerPayment): number {
  if (p.createdAt && p.createdAt > 0) return p.createdAt;
  const date = (p.date || "").trim();
  const time = (p.time || "00:00").trim();
  const parsed = Date.parse(`${date}T${time.length === 5 ? time : "00:00"}:00`);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
 * Oldest-first ledger with running Total Remaining after each line.
 *
 * Opening line is GROSS (before opening payments), reconstructed from live
 * openingBalance so the ledger ends on Total Remaining even if an old bill
 * snapshot ignored a Pay.
 *
 * Week kharcha given reduces remaining; week kharcha pays only reduce the Kharcha box.
 */
export function buildHisaabLedger(opts: {
  orders: KaarigerOrder[];
  payments: KaarigerPayment[];
  openingBalance: number;
  oldKharcha?: number;
  creditBalance?: number;
  standaloneRepairTotal?: number;
}): HisaabLedgerLine[] {
  const orders = [...opts.orders].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const payments = [...opts.payments].sort((a, b) => paymentSortKey(a) - paymentSortKey(b));
  const events: RawEvent[] = [];

  const openingPays = payments.filter(payIsOpening);
  const openingPaidTotal = openingPays.reduce((s, p) => s + Math.max(0, p.amount || 0), 0);

  const billNetTotal = orders.reduce(
    (s, o) => s + orderAddBalance(o) - orderWeekKharcha(o),
    0
  );
  const foldTotal = orders.reduce((s, o) => s + Math.max(0, o.kharchaCarriedForward || 0), 0);

  // Live opening = start − openingPays + billNets + folds (folds also emitted as lines).
  const startOpening = Math.max(
    0,
    Math.max(0, opts.openingBalance || 0) + openingPaidTotal - billNetTotal - foldTotal
  );

  const startAt =
    openingPays[0] != null
      ? paymentSortKey(openingPays[0]) - 1
      : orders[0]?.createdAt
        ? orders[0].createdAt - 1
        : Date.now() - 1;

  events.push({
    id: "opening",
    kind: "opening",
    title: "Opening balance",
    subtitle: "Starting balance (before payments below)",
    deltaRemaining: startOpening,
    deltaKharcha: 0,
    at: startAt,
  });

  const oldK = Math.max(0, opts.oldKharcha || 0);
  if (oldK > 0) {
    events.push({
      id: "old_kharcha_balance",
      kind: "old_kharcha",
      title: "Old kharcha (on profile)",
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
    const t = order.createdAt || startAt + 100 + i * 10;

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
        title: `${week.label} kharcha given`,
        subtitle: "Cash given to kaariger — deducted from Total Remaining; tracked in Kharcha box",
        deltaRemaining: -kharcha,
        deltaKharcha: kharcha,
        at: t + 1,
      });
    }

    const carried = Math.max(0, order.kharchaCarriedForward || 0);
    if (carried > 0) {
      const nextT = orders[i + 1]?.createdAt;
      const foldAt = nextT && nextT > t ? nextT - 1 : t + 2;
      events.push({
        id: `fold-${order.id}`,
        kind: "kharcha_fold",
        title: `${week.label} unused kharcha returned`,
        subtitle: "Not paid out of the kharcha budget — added back to Total Remaining",
        deltaRemaining: carried,
        deltaKharcha: -carried,
        at: foldAt,
      });
    }
  }

  for (const p of payments) {
    if (payIsCredit(p)) {
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
    if (payIsOpening(p)) {
      events.push({
        id: `pay-${p.id}`,
        kind: "payment",
        title: "Paid · opening / purana baaki",
        subtitle: [p.date, p.time, p.remarks].filter(Boolean).join(" · "),
        deltaRemaining: -amount,
        deltaKharcha: 0,
        at: paymentSortKey(p),
      });
      continue;
    }

    if (payIsOldKharcha(p)) {
      events.push({
        id: `pay-${p.id}`,
        kind: "payment",
        title: "Paid · old kharcha",
        subtitle: [p.date, p.time, p.remarks].filter(Boolean).join(" · "),
        deltaRemaining: 0,
        deltaKharcha: -amount,
        at: paymentSortKey(p),
      });
      continue;
    }

    const order = orders.find((o) => o.id === p.orderId);
    const week = order ? orderWeekMeta(order) : null;
    events.push({
      id: `pay-${p.id}`,
      kind: "payment",
      title: week ? `Paid · ${week.label} kharcha` : "Paid · week kharcha",
      subtitle:
        [p.date, p.time, p.remarks].filter(Boolean).join(" · ") ||
        "Breakdown only — Total Remaining already reduced when kharcha was given on the bill",
      // Already deducted at bill create — do not reduce remaining again.
      deltaRemaining: 0,
      deltaKharcha: -amount,
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

/**
 * Gross opening before any opening payments (for Hisaab "was the opening" copy).
 * Same reconstruction as the ledger opening line.
 */
export function grossOpeningBeforePays(opts: {
  orders: KaarigerOrder[];
  payments: KaarigerPayment[];
  openingBalance: number;
}): number {
  const openingPays = opts.payments.filter(payIsOpening);
  const openingPaidTotal = openingPays.reduce((s, p) => s + Math.max(0, p.amount || 0), 0);
  const billNetTotal = opts.orders.reduce(
    (s, o) => s + orderAddBalance(o) - orderWeekKharcha(o),
    0
  );
  const foldTotal = opts.orders.reduce(
    (s, o) => s + Math.max(0, o.kharchaCarriedForward || 0),
    0
  );
  return Math.max(
    0,
    Math.max(0, opts.openingBalance || 0) + openingPaidTotal - billNetTotal - foldTotal
  );
}
