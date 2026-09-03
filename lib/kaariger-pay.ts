import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { nowTimeStr, todayStr, uuid } from "@/lib/csv";
import { orderKharchaBalance } from "@/lib/kaariger-hisaab";
import { pickLiveKaarigerBill } from "@/lib/kaariger-repair";
import type { KaarigerOrder, KaarigerPayment } from "@/lib/types";

/** Sentinel orderId for kharcha paid against migration / old remaining balance. */
export const OPENING_ORDER_ID = "__opening__";

/** Sentinel orderId for payments against carried oldKharcha (weekly kharcha leftover). */
export const OLD_KHARCHA_ORDER_ID = "__old_kharcha__";

export function orderNetDeal(order: KaarigerOrder) {
  const deal = order.originalDealAmount ?? order.totalDealAmount;
  return Math.max(0, deal - (order.repairDeductionTotal || 0));
}

/** True when leftover kharcha was parked as credit / advance. */
export function isCreditPayment(p: { orderId: string; remarks?: string }) {
  const remarks = (p.remarks || "").toLowerCase();
  return (
    p.remarks === "Extra kharcha — carried as credit" ||
    remarks.includes("carried as credit") ||
    remarks.includes("credit carried")
  );
}

/** True when kharcha was applied to opening / old remaining (not credit ledger). */
export function isOpeningPayment(p: { orderId: string; remarks?: string }) {
  if (isCreditPayment(p)) return false;
  if (isOldKharchaPayment(p)) return false;
  const remarks = p.remarks || "";
  return (
    p.orderId === OPENING_ORDER_ID ||
    remarks === "Opening / old remaining payment" ||
    remarks === "Old remaining payment" ||
    remarks === "Opening balance payment" ||
    remarks.toLowerCase().includes("old remaining") ||
    remarks.toLowerCase().includes("opening balance")
  );
}

/** Payments clearing carried weekly kharcha (sheet OLD KHARCHA). */
export function isOldKharchaPayment(p: { orderId: string; remarks?: string }) {
  if (isCreditPayment(p)) return false;
  const remarks = (p.remarks || "").toLowerCase();
  return (
    p.orderId === OLD_KHARCHA_ORDER_ID ||
    remarks.includes("old kharcha") ||
    remarks.includes("carried kharcha")
  );
}

export type PaymentKind = "opening" | "old_kharcha" | "credit" | "bill";

export function paymentKind(p: { orderId: string; remarks?: string }): PaymentKind {
  if (isCreditPayment(p)) return "credit";
  if (isOldKharchaPayment(p)) return "old_kharcha";
  if (isOpeningPayment(p) || p.orderId === OPENING_ORDER_ID) return "opening";
  return "bill";
}

/** Human label for a kharcha row in Transactions. */
export function paymentLabel(
  p: { orderId: string; remarks?: string },
  orderNameById: Map<string, string>
): string {
  const kind = paymentKind(p);
  if (kind === "opening") return "Opening balance (purana baaki)";
  if (kind === "old_kharcha") return "Old kharcha (carry)";
  if (kind === "credit") return "Credit / advance";
  return orderNameById.get(p.orderId) || "Week kharcha";
}

export type PaymentGroup = {
  id: string;
  payments: KaarigerPayment[];
  total: number;
  createdAt: number;
  date: string;
  time: string;
  createdBy: string;
};

/** Group rows from one Pay click (payBatchId) or same date/time/by for older data. */
export function groupPayments(payments: KaarigerPayment[]): PaymentGroup[] {
  const buckets = new Map<string, KaarigerPayment[]>();
  for (const p of payments) {
    const batch = (p.payBatchId || "").trim();
    const key = batch
      ? `b:${batch}`
      : `t:${p.date}|${p.time}|${p.createdBy || ""}|${Math.floor((p.createdAt || 0) / 2000)}`;
    const list = buckets.get(key) || [];
    list.push(p);
    buckets.set(key, list);
  }
  const groups: PaymentGroup[] = [];
  Array.from(buckets.entries()).forEach(([key, list]) => {
    const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const head = sorted[0];
    groups.push({
      id: key,
      payments: sorted,
      total: sorted.reduce((s, p) => s + Math.max(0, p.amount || 0), 0),
      createdAt: head.createdAt || 0,
      date: head.date || "",
      time: head.time || "",
      createdBy: head.createdBy || "",
    });
  });
  return groups.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`);
  });
}

function hasActiveWeekKharcha(orders: KaarigerOrder[]): KaarigerOrder | null {
  const live = pickLiveKaarigerBill(orders);
  if (!live || Math.max(0, live.kharchaGiven || 0) <= 0) return null;
  return live;
}

/**
 * Pay kharcha / remaining:
 * - Default: if an active week has kharcha budget → hits Kharcha box only (can overpay).
 * - If no active kharcha, or preferTarget === "remaining" → cuts Total Remaining
 *   (openingBalance / oldKharcha). Extra beyond remaining becomes credit.
 */
export async function payKaarigerKharcha(opts: {
  kaarigerId: string;
  amount: number;
  remarks?: string;
  createdBy: string;
  openingBalance: number;
  creditBalance: number;
  oldKharcha?: number;
  orders?: KaarigerOrder[];
  payments?: KaarigerPayment[];
  standaloneRepairTotal?: number;
  /** Force settlement against Total Remaining even if a week kharcha box exists. */
  preferTarget?: "kharcha" | "remaining";
}): Promise<{
  message: string;
  oldKharchaApplied: number;
  openingApplied: number;
  orderApplied: number;
  creditAdded: number;
  kharchaBoxAfter: number;
  remainingAfter?: number;
  target: "kharcha" | "remaining";
}> {
  const amount = opts.amount;
  if (amount <= 0) throw new Error("Enter an amount greater than 0.");

  const db = getDb();
  let orders = opts.orders;
  let payments = opts.payments;

  if (!orders) {
    const snap = await getDocs(
      query(collection(db, "kaariger_orders"), where("kaarigerId", "==", opts.kaarigerId))
    );
    orders = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: (data.id as string) || d.id,
        kaarigerId: data.kaarigerId as string,
        kaarigerName: (data.kaarigerName as string) || "",
        productName: (data.productName as string) || "",
        targetQuantity: (data.targetQuantity as number) || 0,
        color: "",
        rawMaterials: [],
        totalDealAmount: (data.totalDealAmount as number) || 0,
        pricingType: (data.pricingType as "OVERALL" | "PER_PIECE") || "OVERALL",
        status: (data.status as string) === "APPROVED" ? "COMPLETED" : ((data.status as string) || "ASSIGNED"),
        approvedQuantity: (data.approvedQuantity as number) || 0,
        createdBy: (data.createdBy as string) || "",
        createdAt: (data.createdAt as number) || 0,
        originalDealAmount: data.originalDealAmount as number | undefined,
        repairDeductionTotal: (data.repairDeductionTotal as number) || 0,
        kharchaGiven: data.kharchaGiven as number | undefined,
        kharchaCarriedForward: data.kharchaCarriedForward as number | undefined,
        kharchaCarryIn: data.kharchaCarryIn as number | undefined,
        productsTotal: data.productsTotal as number | undefined,
        materialDeductionsTotal: data.materialDeductionsTotal as number | undefined,
      } satisfies KaarigerOrder;
    });
  }

  if (!payments) {
    const snap = await getDocs(
      query(collection(db, "kaariger_payments"), where("kaarigerId", "==", opts.kaarigerId))
    );
    payments = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: (data.id as string) || d.id,
        orderId: data.orderId as string,
        kaarigerId: data.kaarigerId as string,
        amount: (data.amount as number) || 0,
        date: (data.date as string) || "",
        time: (data.time as string) || "",
        remarks: data.remarks as string | undefined,
        createdBy: (data.createdBy as string) || "",
      } satisfies KaarigerPayment;
    });
  }

  const paidByOrder = new Map<string, number>();
  payments.forEach((p) => {
    if (isCreditPayment(p) || isOpeningPayment(p) || isOldKharchaPayment(p)) return;
    paidByOrder.set(p.orderId, (paidByOrder.get(p.orderId) || 0) + p.amount);
  });

  const weekOrder = hasActiveWeekKharcha(orders);
  // Prefer remaining when forced, or when there is no active week kharcha.
  const payRemaining =
    opts.preferTarget === "remaining" || (opts.preferTarget !== "kharcha" && !weekOrder);

  const note = opts.remarks?.trim() || "";
  const payBatchId = uuid();
  const batchCreatedAt = Date.now();
  const batchDate = todayStr();
  const batchTime = nowTimeStr();

  function paymentPayload(fields: {
    id: string;
    orderId: string;
    amount: number;
    remarks?: string;
  }) {
    const payload: Record<string, string | number> = {
      id: fields.id,
      orderId: fields.orderId,
      kaarigerId: opts.kaarigerId,
      amount: fields.amount,
      date: batchDate,
      time: batchTime,
      createdAt: batchCreatedAt,
      createdBy: opts.createdBy,
      payBatchId,
    };
    if (fields.remarks) payload.remarks = fields.remarks;
    return payload;
  }

  if (!payRemaining && weekOrder) {
    const alreadyPaid = paidByOrder.get(weekOrder.id) || 0;
    const paymentId = uuid();
    await setDoc(
      doc(db, "kaariger_payments", paymentId),
      paymentPayload({
        id: paymentId,
        orderId: weekOrder.id,
        amount,
        remarks: note || "Week kharcha payment",
      })
    );

    const kharchaBoxAfter = orderKharchaBalance(weekOrder, alreadyPaid + amount);
    const boxLabel = Math.round(kharchaBoxAfter).toLocaleString("en-IN");
    const message = `Paid ₹${Math.round(amount).toLocaleString("en-IN")} · Kharcha box now ₹${boxLabel}${
      kharchaBoxAfter < 0 ? " (extra)" : ""
    }. Total Remaining unchanged.`;

    return {
      message,
      oldKharchaApplied: 0,
      openingApplied: 0,
      orderApplied: amount,
      creditAdded: 0,
      kharchaBoxAfter,
      target: "kharcha",
    };
  }

  // No active kharcha (or Pay against Remaining): cut opening / old remaining.
  let left = amount;
  let oldKharchaApplied = 0;
  let openingApplied = 0;
  let creditAdded = 0;

  const oldKharchaDue = Math.max(0, opts.oldKharcha || 0);
  if (oldKharchaDue > 0 && left > 0) {
    oldKharchaApplied = Math.min(left, oldKharchaDue);
    const paymentId = uuid();
    await setDoc(
      doc(db, "kaariger_payments", paymentId),
      paymentPayload({
        id: paymentId,
        orderId: OLD_KHARCHA_ORDER_ID,
        amount: oldKharchaApplied,
        remarks: note || "Old kharcha payment",
      })
    );
    await updateDoc(doc(db, "employees", opts.kaarigerId), {
      oldKharcha: Math.max(0, oldKharchaDue - oldKharchaApplied),
    });
    left -= oldKharchaApplied;
  }

  let repairCover = Math.max(0, opts.standaloneRepairTotal || 0);
  const opening = Math.max(0, opts.openingBalance || 0);
  const openingCoveredByRepair = Math.min(opening, repairCover);
  repairCover -= openingCoveredByRepair;
  const openingDue = Math.max(0, opening - openingCoveredByRepair);
  if (openingDue > 0 && left > 0) {
    openingApplied = Math.min(left, openingDue);
    const paymentId = uuid();
    await setDoc(
      doc(db, "kaariger_payments", paymentId),
      paymentPayload({
        id: paymentId,
        orderId: OPENING_ORDER_ID,
        amount: openingApplied,
        remarks: note || "Opening balance payment",
      })
    );
    await updateDoc(doc(db, "employees", opts.kaarigerId), {
      openingBalance: Math.max(0, opening - openingApplied),
    });
    left -= openingApplied;
  }

  if (left > 0) {
    creditAdded = left;
    await updateDoc(doc(db, "employees", opts.kaarigerId), {
      creditBalance: Math.max(0, (opts.creditBalance || 0) + creditAdded),
    });
    const paymentId = uuid();
    await setDoc(
      doc(db, "kaariger_payments", paymentId),
      paymentPayload({
        id: paymentId,
        orderId: OPENING_ORDER_ID,
        amount: creditAdded,
        remarks: note || "Extra kharcha — carried as credit",
      })
    );
    left = 0;
  }

  const remCut = oldKharchaApplied + openingApplied;
  const remainingAfter = Math.max(
    0,
    opening -
      openingApplied +
      oldKharchaDue -
      oldKharchaApplied -
      Math.max(0, opts.standaloneRepairTotal || 0)
  );

  let message = "";
  if (remCut > 0 && creditAdded > 0) {
    message = `Paid ₹${Math.round(amount).toLocaleString("en-IN")} · Remaining −₹${Math.round(remCut).toLocaleString("en-IN")} · Credit ₹${Math.round(creditAdded).toLocaleString("en-IN")}.`;
  } else if (remCut > 0) {
    message = `Paid ₹${Math.round(amount).toLocaleString("en-IN")} · Total Remaining now ₹${Math.round(remainingAfter).toLocaleString("en-IN")}.`;
  } else if (creditAdded > 0) {
    message = `Paid ₹${Math.round(creditAdded).toLocaleString("en-IN")} — all as credit for next bill.`;
  } else {
    message = "Nothing was owed on Remaining — recorded as credit if any.";
  }

  return {
    message,
    oldKharchaApplied,
    openingApplied,
    orderApplied: 0,
    creditAdded,
    kharchaBoxAfter: 0,
    remainingAfter,
    target: "remaining",
  };
}
