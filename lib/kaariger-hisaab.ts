import type { KaarigerOrder, KaarigerPayment } from "@/lib/types";

/**
 * Weekly Hisaab (sheet installment model):
 *
 *   Running / opening += ADD (MAAL − deductions − repair)
 *   Week kharcha on bill = BUDGET (stored: closing = opening + ADD − budget)
 *   Live Total Remaining = openingBalance + weekKharchaUnpaid − credit − repairs
 *     → budget alone does not drop live remaining; each Pay transfer does
 *   Kharcha box = budget − paid − carried (installment tracking)
 *   Paying week kharcha does NOT write openingBalance (unpaid term drives live drop)
 *   Next Saturday: unused (budget − paid) folds back into opening (+unused)
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
 * Live Total Remaining (sheet installment rule):
 *   stored opening (net of full week budget at create)
 *   + unpaid week kharcha still in the box (so only paid transfers reduce live remaining)
 *   − credit − standalone repairs
 */
export function totalRemainingAmount(opts: {
  openingBalance: number;
  /** Unpaid week kharcha budget (budget − carried − paid). Added back for live display. */
  weekKharchaUnpaid?: number;
  creditBalance?: number;
  standaloneRepairTotal?: number;
}): number {
  return Math.max(
    0,
    Math.max(0, opts.openingBalance) +
      Math.max(0, opts.weekKharchaUnpaid || 0) -
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
  /** Full cash paid on this Pay (may exceed deltaRemaining when part is credit). */
  paidTotal?: number;
  /** Extra parked as credit on this Pay. */
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

  // Live opening reconstructed so playback ends on OB + unpaid.
  // Installment model: budgets/folds do not move remaining in the ledger — only Pay transfers do.
  // Storage still writes closing = open + ADD − budget and folds unused into OB on next bill.
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

  // Do NOT apply creditBalance at the start — that rewrites every old Remaining
  // when an overpay creates credit. Credit is shown on the Pay line + at the end.

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
        title: `${week.label} kharcha budget`,
        subtitle: `Budget ${Math.round(kharcha).toLocaleString("en-IN")} — transfers below (thoda thoda) reduce Total Remaining`,
        // Budget only fills the Kharcha box; live remaining drops on each Pay transfer.
        deltaRemaining: 0,
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
        title: `${week.label} unused kharcha cleared`,
        subtitle:
          "Unused budget folded into next bill’s stored opening — live Total Remaining unchanged (was never deducted)",
        // Unpaid budget was never removed from live remaining (only transfers were), so do not +again.
        deltaRemaining: 0,
        deltaKharcha: -carried,
        at: foldAt,
      });
    }
  }

  // One Pay click → one ledger line (− total), even if Firestore stored splits.
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
      remCut += amount;
      if (!payIsOpening(p)) kharchaCut += amount;
    }

    if (paidTotal <= 0) continue;

    if (remCut <= 0 && creditAmt > 0) {
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
    if (creditAmt > 0) {
      subtitleParts.push(
        `Paid ${Math.round(paidTotal).toLocaleString("en-IN")} · ${Math.round(remCut).toLocaleString("en-IN")} cleared remaining · ${Math.round(creditAmt).toLocaleString("en-IN")} credit`
      );
    }

    events.push({
      id: `pay-batch-${g.id}`,
      kind: "payment",
      title: "Paid",
      subtitle: subtitleParts.join(" · "),
      // Only what was owed — overpay is credit, must not rewrite older Remaining lines.
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
  // Show current credit once at the end (profile may differ slightly from sum of rows).
  const creditShow = Math.max(creditBal, creditFromPays);
  if (creditShow > 0) {
    const lastPayAt = paymentGroupsChrono.reduce((m, g) => Math.max(m, g.at), startAt);
    events.push({
      id: "credit_balance",
      kind: "credit",
      title: "Credit (next bill)",
      subtitle: `Extra paid — will adjust on the next bill`,
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
