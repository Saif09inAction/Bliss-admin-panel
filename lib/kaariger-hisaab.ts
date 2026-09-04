import type { KaarigerOrder, KaarigerPayment, OrderRepair } from "@/lib/types";
import { isStandaloneRepair } from "@/lib/types";

/**
 * Simple Remaining + Kharcha:
 *
 *   Opening = old pending (part of Remaining)
 *   Bill create: Remaining += ADD, Remaining −= week kharcha budget
 *   Kharcha box = budget − carryIn − paid (signed; negative = overpay)
 *   Pay only hits the Kharcha box — never Total Remaining
 *   Carry (paid − effective budget) folds into next week's box only
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

/** Full week's kharcha set on the bill (allotment cut from Remaining at create). */
export function orderWeekKharcha(order: KaarigerOrder): number {
  return Math.max(0, order.kharchaGiven || 0);
}

/**
 * Signed carry folded into this week's box at create (paid − budget from prior week).
 * Overpay → positive; underpay left → negative.
 */
export function orderKharchaCarryIn(order: KaarigerOrder): number {
  return order.kharchaCarryIn || 0;
}

/** Week kharcha still open on this bill after legacy fold-outs (budget − rolled). */
export function orderKharchaDue(order: KaarigerOrder): number {
  return Math.max(0, orderWeekKharcha(order) - Math.max(0, order.kharchaCarriedForward || 0));
}

/**
 * Signed Kharcha box: budget − carryIn − paid.
 * Negative = extra paid this week (overpay).
 */
export function orderKharchaBalance(order: KaarigerOrder, paidOnOrder: number): number {
  return orderKharchaDue(order) - orderKharchaCarryIn(order) - Math.max(0, paidOnOrder);
}

/** Left to pay (never negative). Prefer orderKharchaBalance for display that allows overpay. */
export function orderKharchaUnpaid(order: KaarigerOrder, paidOnOrder: number): number {
  return Math.max(0, orderKharchaBalance(order, paidOnOrder));
}

/** Carry to fold into next week: −box at close (= paid − effective start). */
export function orderKharchaCarryOut(order: KaarigerOrder, paidOnOrder: number): number {
  return -orderKharchaBalance(order, paidOnOrder);
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
  return (openingBalance || 0) + orderAddBalance(order) - orderWeekKharcha(order);
}

/**
 * Live Total Remaining:
 *   stored openingBalance (already net of week kharcha at create)
 *   − credit − standalone repairs
 * Pay does not change this. Unpaid week kharcha is NOT added back.
 * Can be negative when week kharcha exceeds ADD.
 */
export function totalRemainingAmount(opts: {
  openingBalance: number;
  /** @deprecated Ignored — Pay no longer reduces Remaining via unpaid. Kept for call-site compat. */
  weekKharchaUnpaid?: number;
  creditBalance?: number;
  standaloneRepairTotal?: number;
}): number {
  return (
    (opts.openingBalance || 0) -
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
  /** Signed — can be negative after overpay. */
  kharchaAfter: number;
  at: number;
  /** Full cash paid on this Pay. */
  paidTotal?: number;
  /** Extra parked as credit on this Pay (legacy). */
  creditAdded?: number;
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
  paidTotal?: number;
  creditAdded?: number;
};

/**
 * Oldest-first ledger with running Total Remaining + signed Kharcha box.
 *
 * Bill ADD +, week kharcha budget − Remaining once and fills the box (net of carryIn).
 * Pay lines: deltaRemaining = 0, deltaKharcha = −paid.
 */
function isApprovedRepair(r: OrderRepair) {
  return !r.status || r.status === "APPROVED";
}

export function buildHisaabLedger(opts: {
  orders: KaarigerOrder[];
  payments: KaarigerPayment[];
  openingBalance: number;
  oldKharcha?: number;
  creditBalance?: number;
  standaloneRepairTotal?: number;
  repairs?: OrderRepair[];
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
  // Legacy folds that were written into openingBalance under the old model.
  const foldTotal = orders.reduce((s, o) => s + Math.max(0, o.kharchaCarriedForward || 0), 0);

  const startOpening =
    (opts.openingBalance || 0) + openingPaidTotal - billNetTotal - foldTotal;

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
    subtitle: undefined,
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
      deltaRemaining: oldK,
      deltaKharcha: 0,
      at: startAt + 1,
    });
  }

  const approvedStandaloneRepairs = (opts.repairs || []).filter(
    (r) =>
      isStandaloneRepair(r.orderId) &&
      isApprovedRepair(r) &&
      !r.deferToNextBill
  );

  if (approvedStandaloneRepairs.length > 0) {
    approvedStandaloneRepairs.forEach((r, idx) => {
      events.push({
        id: `standalone_repair_${r.id}`,
        kind: "repair",
        title: `Repairing - ${r.productName || "Repairing"}`,
        subtitle: r.faultyQuantity > 0 ? `${r.faultyQuantity} × ₹${r.faultyPricePerPiece}` : undefined,
        deltaRemaining: -r.totalRepairCost,
        deltaKharcha: 0,
        at: startAt + 3 + idx * 0.01,
      });
    });
  } else {
    const repair = Math.max(0, opts.standaloneRepairTotal || 0);
    if (repair > 0) {
      events.push({
        id: "standalone_repair",
        kind: "repair",
        title: "Repairing (no bill)",
        deltaRemaining: -repair,
        deltaKharcha: 0,
        at: startAt + 3,
      });
    }
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
        subtitle: order.productName || undefined,
        deltaRemaining: add,
        deltaKharcha: 0,
        at: t,
      });
    }

    const kharcha = orderWeekKharcha(order);
    const carryIn = orderKharchaCarryIn(order);
    if (kharcha > 0 || carryIn !== 0) {
      const boxStart = kharcha - carryIn;
      events.push({
        id: `kharcha-${order.id}`,
        kind: "week_kharcha",
        title: `${week.label} kharcha`,
        deltaRemaining: -kharcha,
        deltaKharcha: boxStart,
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
        title: `${week.label} unused kharcha cleared (legacy)`,
        deltaRemaining: 0,
        deltaKharcha: -carried,
        at: foldAt,
      });
    }
  }

  type PayBucket = {
    id: string;
    payments: KaarigerPayment[];
    at: number;
    date: string;
    time: string;
  };
  const buckets = new Map<string, PayBucket>();
  for (const p of payments) {
    const batch = (p.payBatchId || "").trim();
    const key = batch
      ? `b:${batch}`
      : `t:${p.date}|${p.time}|${p.createdBy || ""}|${Math.floor((p.createdAt || 0) / 2000)}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.payments.push(p);
    } else {
      buckets.set(key, {
        id: key,
        payments: [p],
        at: paymentSortKey(p),
        date: p.date || "",
        time: p.time || "",
      });
    }
  }
  const paymentGroupsChrono = Array.from(buckets.values()).sort((a, b) => a.at - b.at);

  for (const g of paymentGroupsChrono) {
    let remCut = 0;
    let kharchaCut = 0;
    let creditAmt = 0;
    let paidTotal = 0;
    for (const p of g.payments) {
      const amount = Math.max(0, p.amount || 0);
      paidTotal += amount;
      if (payIsCredit(p)) {
        creditAmt += amount;
        continue;
      }
      // Legacy opening / old-kharcha pays still reduced Remaining historically.
      if (payIsOpening(p) || payIsOldKharcha(p)) {
        remCut += amount;
        continue;
      }
      // Normal week Pay: Remaining unchanged; Kharcha box only.
      kharchaCut += amount;
    }

    if (paidTotal <= 0) continue;

    if (remCut <= 0 && kharchaCut <= 0 && creditAmt > 0) {
      events.push({
        id: `pay-batch-${g.id}`,
        kind: "credit",
        title: "Credit (next bill)",
        subtitle: [g.date, g.time, `Extra paid ${Math.round(creditAmt).toLocaleString("en-IN")}`]
          .filter(Boolean)
          .join(" · "),
        deltaRemaining: 0,
        deltaKharcha: 0,
        at: g.at,
        paidTotal,
        creditAdded: creditAmt,
      });
      continue;
    }

    const subtitleParts = [g.date, g.time].filter(Boolean);
    if (kharchaCut > 0 && remCut <= 0) {
      subtitleParts.push(
        `Paid ₹${Math.round(paidTotal).toLocaleString("en-IN")} · Kharcha box only (Remaining unchanged)`
      );
    } else if (creditAmt > 0) {
      subtitleParts.push(
        `Paid ₹${Math.round(paidTotal).toLocaleString("en-IN")} · Credit ₹${Math.round(creditAmt).toLocaleString("en-IN")}`
      );
    }

    events.push({
      id: `pay-batch-${g.id}`,
      kind: "payment",
      title: "Paid",
      subtitle: subtitleParts.join(" · "),
      deltaRemaining: -remCut,
      deltaKharcha: -kharchaCut,
      at: g.at,
      paidTotal,
      creditAdded: creditAmt > 0 ? creditAmt : undefined,
    });
  }

  const creditBal = Math.max(0, opts.creditBalance || 0);
  const creditFromPays = payments
    .filter(payIsCredit)
    .reduce((s, p) => s + Math.max(0, p.amount || 0), 0);
  const creditShow = Math.max(creditBal, creditFromPays);
  if (creditShow > 0) {
    const lastPayAt = paymentGroupsChrono.reduce((m, g) => Math.max(m, g.at), startAt);
    events.push({
      id: "credit_balance",
      kind: "credit",
      title: "Credit (next bill)",
      deltaRemaining: 0,
      deltaKharcha: 0,
      at: lastPayAt + 1,
      creditAdded: creditShow,
    });
  }

  events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  let remaining = 0;
  let kharchaBox = 0;
  const lines: HisaabLedgerLine[] = [];
  for (const e of events) {
    remaining = remaining + e.deltaRemaining;
    kharchaBox = kharchaBox + e.deltaKharcha;
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
  return (
    (opts.openingBalance || 0) + openingPaidTotal - billNetTotal - foldTotal
  );
}

/**
 * Inverse of grossOpeningBeforePays — when admin sets the starting opening to
 * `grossOpening`, write this value to `employees.openingBalance` (running fold).
 */
export function storedOpeningFromGross(opts: {
  orders: KaarigerOrder[];
  payments: KaarigerPayment[];
  grossOpening: number;
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
  return opts.grossOpening - openingPaidTotal + billNetTotal + foldTotal;
}
