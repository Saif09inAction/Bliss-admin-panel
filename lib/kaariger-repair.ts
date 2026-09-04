import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { isStandaloneRepair, STANDALONE_REPAIR_ORDER_ID } from "@/lib/types";
import type { KaarigerOrder, OrderRepair } from "@/lib/types";
import { orderMaal, orderMaterialDeductions, orderWeekKharcha } from "@/lib/kaariger-hisaab";

function isApprovedRepair(r: { status?: string }) {
  return !r.status || r.status === "APPROVED";
}

function parseOrder(id: string, data: Record<string, unknown>): KaarigerOrder {
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
    status: ((data.status as string) || "ASSIGNED") as KaarigerOrder["status"],
    approvedQuantity: 0,
    createdBy: "",
    createdAt: (data.createdAt as number) || 0,
    originalDealAmount: data.originalDealAmount as number | undefined,
    repairDeductionTotal: (data.repairDeductionTotal as number) || 0,
    productsTotal: (data.productsTotal as number) || 0,
    materialDeductions: (data.materialDeductions as KaarigerOrder["materialDeductions"]) || [],
    materialDeductionsTotal: (data.materialDeductionsTotal as number) || 0,
    addBalance: data.addBalance as number | undefined,
    openingAtCreation: data.openingAtCreation as number | undefined,
    closingAtCreation: data.closingAtCreation as number | undefined,
    kharchaGiven: (data.kharchaGiven as number) || 0,
  };
}

/** Recalc bill ADD + remaining after approved repairs on this bill change. */
export async function syncOrderRepairAndRemaining(orderId: string): Promise<void> {
  if (!orderId || isStandaloneRepair(orderId)) return;
  const db = getDb();
  const [orderSnap, repairSnap] = await Promise.all([
    getDoc(doc(db, "kaariger_orders", orderId)),
    getDocs(query(collection(db, "order_repairs"), where("orderId", "==", orderId))),
  ]);
  if (!orderSnap.exists()) return;

  const order = parseOrder(orderSnap.id, orderSnap.data() as Record<string, unknown>);
  const approved = repairSnap.docs.filter((d) => isApprovedRepair(d.data() as { status?: string }));
  const newRepairTotal = approved.reduce(
    (sum, d) => sum + ((d.data().totalRepairCost as number) || 0),
    0
  );

  const maal = orderMaal(order);
  const materials = orderMaterialDeductions(order);
  const oldAdd =
    order.addBalance != null && Number.isFinite(order.addBalance)
      ? order.addBalance
      : maal - materials - Math.max(0, order.repairDeductionTotal || 0);
  const newAdd = maal - materials - newRepairTotal;
  const weekKharcha = orderWeekKharcha(order);
  const openingAtCreation = order.openingAtCreation ?? 0;
  const newClosing = Math.round((openingAtCreation + newAdd - weekKharcha) * 100) / 100;
  const oldClosing =
    order.closingAtCreation != null && Number.isFinite(order.closingAtCreation)
      ? order.closingAtCreation
      : Math.round((openingAtCreation + oldAdd - weekKharcha) * 100) / 100;
  const deltaClosing = Math.round((newClosing - oldClosing) * 100) / 100;

  await updateDoc(doc(db, "kaariger_orders", orderId), {
    originalDealAmount: order.originalDealAmount ?? order.totalDealAmount,
    repairDeductionTotal: newRepairTotal,
    addBalance: newAdd,
    closingAtCreation: newClosing,
  });

  await Promise.all(
    approved.map((d) =>
      updateDoc(d.ref, {
        dealAfterThisRepair: Math.max(0, (order.originalDealAmount ?? order.totalDealAmount) - newRepairTotal),
        originalDealAmount: order.originalDealAmount ?? order.totalDealAmount,
      })
    )
  );

  if (deltaClosing === 0 || !order.kaarigerId) return;
  const empSnap = await getDoc(doc(db, "employees", order.kaarigerId));
  if (!empSnap.exists()) return;
  const opening = (empSnap.data().openingBalance as number) || 0;
  await updateDoc(doc(db, "employees", order.kaarigerId), {
    openingBalance: Math.round((opening + deltaClosing) * 100) / 100,
  });
}

export function isArchivedBillStatus(status?: string): boolean {
  return status === "CANCELLED" || status === "REJECTED";
}

/** Newest bill stays live until a newer bill is created. */
export function pickLiveKaarigerBill(orders: KaarigerOrder[]): KaarigerOrder | null {
  return (
    [...orders]
      .filter((o) => !isArchivedBillStatus(o.status))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null
  );
}

export function previousKaarigerBills(orders: KaarigerOrder[]): KaarigerOrder[] {
  const live = pickLiveKaarigerBill(orders);
  return [...orders]
    .filter((o) => o.id !== live?.id && !isArchivedBillStatus(o.status))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Live bill for this kaariger — always the latest bill, if any. */
export async function findLiveKaarigerBill(kaarigerId: string): Promise<KaarigerOrder | null> {
  if (!kaarigerId) return null;
  const snap = await getDocs(
    query(collection(getDb(), "kaariger_orders"), where("kaarigerId", "==", kaarigerId))
  );
  return pickLiveKaarigerBill(
    snap.docs.map((d) => parseOrder(d.id, d.data() as Record<string, unknown>))
  );
}

/**
 * If a bill is live, attach this approved repair to that bill (once).
 * If no bill is live, leave it standalone for the next bill.
 */
export async function attachApprovedRepairToLiveBill(opts: {
  repairId: string;
  kaarigerId: string;
  liveOrder?: KaarigerOrder | null;
}): Promise<{ attachedToOrderId: string | null }> {
  const live = opts.liveOrder ?? (await findLiveKaarigerBill(opts.kaarigerId));
  if (!live) return { attachedToOrderId: null };

  await updateDoc(doc(getDb(), "order_repairs", opts.repairId), {
    orderId: live.id,
    deferToNextBill: false,
  });
  await syncOrderRepairAndRemaining(live.id);
  return { attachedToOrderId: live.id };
}

/**
 * Remove an approved repairing from a bill (undo accidental add).
 * Restores ADD / Total Remaining and puts the repair back on the pending list.
 */
export async function detachRepairFromBill(opts: {
  repairId: string;
  orderId: string;
}): Promise<void> {
  if (!opts.repairId || !opts.orderId || isStandaloneRepair(opts.orderId)) return;

  await updateDoc(doc(getDb(), "order_repairs", opts.repairId), {
    orderId: STANDALONE_REPAIR_ORDER_ID,
    deferToNextBill: true,
  });
  await syncOrderRepairAndRemaining(opts.orderId);
}

/** Fold leftover standalone approved repairs into the current live bill. */
export async function foldStandaloneRepairsIntoLiveBill(opts: {
  kaarigerId: string;
  orders: KaarigerOrder[];
  repairs: OrderRepair[];
}): Promise<number> {
  const live = pickLiveKaarigerBill(opts.orders);
  if (!live) return 0;

  const orphans = opts.repairs.filter(
    (r) =>
      isStandaloneRepair(r.orderId) &&
      isApprovedRepair(r) &&
      !r.deferToNextBill
  );
  for (const r of orphans) {
    await attachApprovedRepairToLiveBill({
      repairId: r.id,
      kaarigerId: opts.kaarigerId,
      liveOrder: live,
    });
  }
  return orphans.length;
}
