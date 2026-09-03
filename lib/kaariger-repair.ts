import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { isStandaloneRepair } from "@/lib/types";
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
  const deltaAdd = Math.round((newAdd - oldAdd) * 100) / 100;
  const weekKharcha = orderWeekKharcha(order);
  const openingAtCreation = Math.max(0, order.openingAtCreation ?? 0);
  const newClosing = Math.max(0, openingAtCreation + newAdd - weekKharcha);

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

  if (deltaAdd === 0 || !order.kaarigerId) return;
  const empSnap = await getDoc(doc(db, "employees", order.kaarigerId));
  if (!empSnap.exists()) return;
  const opening = Math.max(0, (empSnap.data().openingBalance as number) || 0);
  await updateDoc(doc(db, "employees", order.kaarigerId), {
    openingBalance: Math.max(0, Math.round((opening + deltaAdd) * 100) / 100),
  });
}

/** Live (not completed) bill for this kaariger, if any. */
export async function findLiveKaarigerBill(kaarigerId: string): Promise<KaarigerOrder | null> {
  if (!kaarigerId) return null;
  const snap = await getDocs(
    query(collection(getDb(), "kaariger_orders"), where("kaarigerId", "==", kaarigerId))
  );
  const live = snap.docs
    .map((d) => parseOrder(d.id, d.data() as Record<string, unknown>))
    .filter((o) => o.status && o.status !== "COMPLETED")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return live[0] || null;
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
  });
  await syncOrderRepairAndRemaining(live.id);
  return { attachedToOrderId: live.id };
}

/** Fold leftover standalone approved repairs into the current live bill. */
export async function foldStandaloneRepairsIntoLiveBill(opts: {
  kaarigerId: string;
  orders: KaarigerOrder[];
  repairs: OrderRepair[];
}): Promise<number> {
  const live = [...opts.orders]
    .filter((o) => o.status && o.status !== "COMPLETED")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (!live) return 0;

  const orphans = opts.repairs.filter(
    (r) => isStandaloneRepair(r.orderId) && isApprovedRepair(r)
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
