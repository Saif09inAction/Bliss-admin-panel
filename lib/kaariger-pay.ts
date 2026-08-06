import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { nowTimeStr, todayStr, uuid } from "@/lib/csv";
import type { KaarigerOrder, KaarigerPayment } from "@/lib/types";

/** Sentinel orderId for kharcha paid against migration / old remaining balance. */
export const OPENING_ORDER_ID = "__opening__";

export function orderNetDeal(order: KaarigerOrder) {
  const deal = order.originalDealAmount ?? order.totalDealAmount;
  return Math.max(0, deal - (order.repairDeductionTotal || 0));
}

/** True when kharcha was applied to opening / old remaining (not credit ledger). */
export function isOpeningPayment(p: { orderId: string; remarks?: string }) {
  const remarks = p.remarks || "";
  // Credit leftovers also use OPENING_ORDER_ID — exclude those from opening totals.
  if (
    remarks === "Extra kharcha — carried as credit" ||
    remarks.toLowerCase().includes("carried as credit")
  ) {
    return false;
  }
  return (
    p.orderId === OPENING_ORDER_ID ||
    remarks === "Opening / old remaining payment" ||
    remarks === "Old remaining payment"
  );
}

/**
 * Pay kharcha to a kaariger:
 * 1) Against openingBalance (old remaining) first
 * 2) Then against active order bills
 * 3) Any leftover becomes creditBalance
 *
 * Works even when the kaariger has no orders.
 */
export async function payKaarigerKharcha(opts: {
  kaarigerId: string;
  amount: number;
  remarks?: string;
  createdBy: string;
  openingBalance: number;
  creditBalance: number;
  /** Prefer passing loaded orders; if omitted, loads from Firestore. */
  orders?: KaarigerOrder[];
  /** Existing payments (to compute remaining per order). If omitted, loads. */
  payments?: KaarigerPayment[];
  /**
   * Approved repairing with no bill — already reduces what is owed on Hisaab.
   * Used so Pay does not clear opening/bills that repairing already covered.
   */
  standaloneRepairTotal?: number;
}): Promise<{ message: string; openingApplied: number; orderApplied: number; creditAdded: number }> {
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
  payments.forEach((p) => paidByOrder.set(p.orderId, (paidByOrder.get(p.orderId) || 0) + p.amount));

  let left = amount;
  let openingApplied = 0;
  let orderApplied = 0;
  let creditAdded = 0;
  const note = opts.remarks?.trim() || "";

  function paymentPayload(fields: {
    id: string;
    orderId: string;
    amount: number;
    remarks?: string;
  }) {
    // Firestore rejects `undefined` field values — only attach remarks when set.
    const payload: Record<string, string | number> = {
      id: fields.id,
      orderId: fields.orderId,
      kaarigerId: opts.kaarigerId,
      amount: fields.amount,
      date: todayStr(),
      time: nowTimeStr(),
      createdBy: opts.createdBy,
    };
    if (fields.remarks) payload.remarks = fields.remarks;
    return payload;
  }

  // Repairing without a bill already reduces what is owed — skip that slice when paying.
  let repairCover = Math.max(0, opts.standaloneRepairTotal || 0);

  // 1) Opening / old remaining
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
        remarks: note || "Old remaining payment",
      })
    );
    await updateDoc(doc(db, "employees", opts.kaarigerId), {
      openingBalance: Math.max(0, opening - openingApplied),
    });
    left -= openingApplied;
  }

  // 2) Active orders with remaining balance (oldest first)
  const active = orders
    .filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED" && o.status !== "REJECTED")
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const order of active) {
    if (left <= 0) break;
    const net = orderNetDeal(order);
    const alreadyPaid = paidByOrder.get(order.id) || 0;
    let remaining = Math.max(0, net - alreadyPaid);
    const billCoveredByRepair = Math.min(remaining, repairCover);
    repairCover -= billCoveredByRepair;
    remaining = Math.max(0, remaining - billCoveredByRepair);
    if (remaining <= 0) continue;

    const apply = Math.min(left, remaining);
    const paymentId = uuid();
    await setDoc(
      doc(db, "kaariger_payments", paymentId),
      paymentPayload({
        id: paymentId,
        orderId: order.id,
        amount: apply,
        ...(note ? { remarks: note } : {}),
      })
    );
    orderApplied += apply;
    left -= apply;

    const totalAfter = alreadyPaid + apply;
    if (totalAfter >= net) {
      await updateDoc(doc(db, "kaariger_orders", order.id), { status: "COMPLETED" });
    }
    paidByOrder.set(order.id, totalAfter);
  }

  // 3) Leftover → credit (advance). Ledger row is excluded from credit self-heal.
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

  const parts: string[] = [];
  if (openingApplied > 0) parts.push(`₹${Math.round(openingApplied).toLocaleString("en-IN")} against old remaining`);
  if (orderApplied > 0) parts.push(`₹${Math.round(orderApplied).toLocaleString("en-IN")} against bill(s)`);
  if (creditAdded > 0) parts.push(`₹${Math.round(creditAdded).toLocaleString("en-IN")} as credit`);
  const message = parts.length ? `Paid: ${parts.join(" · ")}.` : "Kharcha recorded.";

  return { message, openingApplied, orderApplied, creditAdded };
}
