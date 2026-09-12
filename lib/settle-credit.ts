import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { KaarigerOrder } from "@/lib/types";
import { orderAddBalance, orderWeekKharcha } from "@/lib/kaariger-hisaab";
import { pickLiveKaarigerBill } from "@/lib/kaariger-repair";

function parseOrderLite(id: string, data: Record<string, unknown>): KaarigerOrder {
  return {
    id: (data.id as string) || id,
    kaarigerId: (data.kaarigerId as string) || "",
    kaarigerName: (data.kaarigerName as string) || "",
    productName: (data.productName as string) || "",
    targetQuantity: (data.targetQuantity as number) || 0,
    color: (data.color as string) || "",
    rawMaterials: [],
    totalDealAmount: (data.totalDealAmount as number) || 0,
    pricingType: "PER_PIECE",
    status:
      (data.status as string) === "APPROVED"
        ? "COMPLETED"
        : ((data.status as string) || "ASSIGNED"),
    approvedQuantity: 0,
    createdBy: "",
    createdAt: (data.createdAt as number) || 0,
    repairDeductionTotal: (data.repairDeductionTotal as number) || 0,
    products: (data.products as KaarigerOrder["products"]) || [],
    productsTotal: data.productsTotal as number | undefined,
    materialDeductions: (data.materialDeductions as KaarigerOrder["materialDeductions"]) || [],
    materialDeductionsTotal: data.materialDeductionsTotal as number | undefined,
    kharchaGiven: data.kharchaGiven as number | undefined,
    kharchaCarriedForward: data.kharchaCarriedForward as number | undefined,
    kharchaCarryIn: data.kharchaCarryIn as number | undefined,
    openingAtCreation: data.openingAtCreation as number | undefined,
    addBalance: data.addBalance as number | undefined,
    closingAtCreation: data.closingAtCreation as number | undefined,
    creditApplied: data.creditApplied as number | undefined,
  };
}

/**
 * Move unsettled profile credit into the current live bill so Remaining is net,
 * credit shows on that bill only, and later bills do not repeat it.
 */
export async function settleUnsettledCreditIntoLiveBill(opts: {
  kaarigerId: string;
  creditBalance?: number;
  orders?: KaarigerOrder[];
}): Promise<{ applied: number; creditLeft: number; orderId: string | null }> {
  const kaarigerId = (opts.kaarigerId || "").trim();
  if (!kaarigerId) return { applied: 0, creditLeft: 0, orderId: null };

  const db = getDb();
  const empRef = doc(db, "employees", kaarigerId);
  const empSnap = await getDoc(empRef);
  if (!empSnap.exists()) return { applied: 0, creditLeft: 0, orderId: null };

  const credit = Math.max(
    0,
    opts.creditBalance != null
      ? opts.creditBalance
      : (empSnap.data().creditBalance as number) || 0
  );
  if (credit <= 0) return { applied: 0, creditLeft: 0, orderId: null };

  let orders = opts.orders;
  if (!orders) {
    const snap = await getDocs(
      query(collection(db, "kaariger_orders"), where("kaarigerId", "==", kaarigerId))
    );
    orders = snap.docs.map((d) => parseOrderLite(d.id, d.data() as Record<string, unknown>));
  }

  const live = pickLiveKaarigerBill(orders);
  if (!live) return { applied: 0, creditLeft: credit, orderId: null };

  const opening = live.openingAtCreation ?? 0;
  const add = orderAddBalance(live);
  const kharcha = orderWeekKharcha(live);
  const gross = Math.round((opening + add - kharcha) * 100) / 100;
  const alreadyOnBill = Math.max(0, live.creditApplied || 0);
  const room = Math.max(0, gross - alreadyOnBill);
  const applyNow = Math.min(credit, room);
  if (applyNow <= 0) {
    return { applied: 0, creditLeft: credit, orderId: live.id };
  }

  const newCreditApplied = Math.round((alreadyOnBill + applyNow) * 100) / 100;
  const newClosing = Math.round((gross - newCreditApplied) * 100) / 100;
  const creditLeft = Math.round((credit - applyNow) * 100) / 100;

  await updateDoc(doc(db, "kaariger_orders", live.id), {
    creditApplied: newCreditApplied,
    closingAtCreation: newClosing,
  });
  await updateDoc(empRef, {
    openingBalance: newClosing,
    creditBalance: creditLeft,
  });

  return { applied: applyNow, creditLeft, orderId: live.id };
}

/** Settle open credit for every kaariger who still has creditBalance &gt; 0. */
export async function settleUnsettledCreditForAllKaarigers(
  kaarigers: { phone: string; creditBalance?: number }[]
): Promise<number> {
  let settled = 0;
  for (const k of kaarigers) {
    const credit = Math.max(0, k.creditBalance || 0);
    if (credit <= 0 || !k.phone) continue;
    const result = await settleUnsettledCreditIntoLiveBill({
      kaarigerId: k.phone,
      creditBalance: credit,
    });
    if (result.applied > 0) settled += 1;
  }
  return settled;
}
