"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import {
  History,
  IndianRupee,
  Package,
  Plus,
  Receipt,
  ShoppingBag,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { nowTimeStr, todayStr, uuid } from "@/lib/csv";
import type {
  Employee,
  KaarigerOrder,
  KaarigerPayment,
  OrderMaterial,
  OrderProductLine,
  OrderRepair,
  RepairLineItem,
} from "@/lib/types";
import PageToolbar from "@/components/admin/PageToolbar";
import SearchSelect from "@/components/admin/SearchSelect";

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function orderNetDeal(order: KaarigerOrder) {
  const deal = order.originalDealAmount ?? order.totalDealAmount;
  return Math.max(0, deal - (order.repairDeductionTotal || 0));
}

function orderStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return "badge badge-success";
    case "PENDING_APPROVAL":
      return "badge badge-warn";
    case "IN_PROGRESS":
    case "DELIVERED":
      return "badge badge-gold";
    case "CANCELLED":
      return "badge badge-danger";
    default:
      return "badge badge-neutral";
  }
}

function formatDate(ts: number) {
  return ts ? new Date(ts).toLocaleDateString("en-IN") : "—";
}

function formatTime(ts: number) {
  return ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
}

export default function HisaabPage() {
  const { session } = useAuth();
  const [kaarigers, setKaarigers] = useState<Employee[]>([]);
  const [kaarigerId, setKaarigerId] = useState("");
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [payments, setPayments] = useState<KaarigerPayment[]>([]);
  const [repairs, setRepairs] = useState<OrderRepair[]>([]);
  const [loading, setLoading] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", remarks: "" });
  const [paySaving, setPaySaving] = useState(false);
  const [payMsg, setPayMsg] = useState("");
  const [historyOrderId, setHistoryOrderId] = useState("");

  async function loadKaarigers() {
    const snap = await getDocs(collection(getDb(), "employees"));
    setKaarigers(
      snap.docs
        .filter((d) => d.data().role === "KAARIGER")
        .map((d) => ({
          id: d.id,
          name: (d.data().name as string) || "",
          phone: (d.data().phone as string) || "",
          joiningDate: "",
          monthlySalary: 0,
          attendancePercentage: 0,
          role: "KAARIGER" as const,
          creditBalance: (d.data().creditBalance as number) || 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  useEffect(() => {
    loadKaarigers();
  }, []);

  async function loadKaarigerData(id: string) {
    if (!id) {
      setOrders([]);
      setPayments([]);
      setRepairs([]);
      return;
    }
    setLoading(true);
    try {
      const db = getDb();
      const [orderSnap, paySnap, repairSnap] = await Promise.all([
        getDocs(query(collection(db, "kaariger_orders"), where("kaarigerId", "==", id))),
        getDocs(query(collection(db, "kaariger_payments"), where("kaarigerId", "==", id))),
        getDocs(query(collection(db, "order_repairs"), where("kaarigerId", "==", id))),
      ]);

      const loadedOrders = orderSnap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: (data.id as string) || d.id,
            kaarigerId: data.kaarigerId as string,
            kaarigerName: data.kaarigerName as string,
            productName: (data.productName as string) || "",
            targetQuantity: (data.targetQuantity as number) || 0,
            color: (data.color as string) || "",
            rawMaterials: (data.rawMaterials as OrderMaterial[]) || [],
            totalDealAmount: (data.totalDealAmount as number) || 0,
            pricePerPiece: data.pricePerPiece as number | undefined,
            pricingType: (data.pricingType as "OVERALL" | "PER_PIECE") || "OVERALL",
            status: (data.status as string) === "APPROVED" ? "COMPLETED" : ((data.status as string) || "ASSIGNED"),
            approvedQuantity: (data.approvedQuantity as number) || 0,
            createdBy: (data.createdBy as string) || "",
            createdAt: (data.createdAt as number) || 0,
            notes: data.notes as string | undefined,
            originalDealAmount: data.originalDealAmount as number | undefined,
            repairDeductionTotal: (data.repairDeductionTotal as number) || 0,
            products: (data.products as OrderProductLine[]) || [],
            productsTotal: data.productsTotal as number | undefined,
            materialDeductions: (data.materialDeductions as RepairLineItem[]) || [],
            materialDeductionsTotal: data.materialDeductionsTotal as number | undefined,
            kharchaGiven: data.kharchaGiven as number | undefined,
          } satisfies KaarigerOrder;
        })
        .sort((a, b) => b.createdAt - a.createdAt);
      setOrders(loadedOrders);

      const loadedPayments = paySnap.docs
        .map((d) => {
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
        })
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      setPayments(loadedPayments);

      // Self-heal the stored credit balance: it should always equal total
      // fresh kharcha cash minus total net deal across every order for this
      // kaariger. An older bug could under-credit extra kharcha added to
      // an order that was already completed, so correct any drift here.
      // "Credit carried…" entries are excluded — they're a re-recording of
      // cash counted once already at the order where the credit originated,
      // not new money, so including them would double-count it.
      const totalDealAll = loadedOrders.reduce((s, o) => s + orderNetDeal(o), 0);
      const totalFreshCashPaid = loadedPayments
        .filter((p) => p.remarks !== "Credit carried from previous overpaid bill")
        .reduce((s, p) => s + p.amount, 0);
      const correctCredit = Math.max(0, totalFreshCashPaid - totalDealAll);
      const storedCredit = kaarigers.find((k) => k.phone === id)?.creditBalance || 0;
      if (Math.abs(correctCredit - storedCredit) > 0.5) {
        await updateDoc(doc(db, "employees", id), { creditBalance: correctCredit });
        setKaarigers((prev) =>
          prev.map((k) => (k.phone === id ? { ...k, creditBalance: correctCredit } : k))
        );
      }

      setRepairs(
        repairSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              orderId: (data.orderId as string) || "",
              kaarigerId: (data.kaarigerId as string) || "",
              kaarigerName: (data.kaarigerName as string) || "",
              productName: (data.productName as string) || "",
              faultyQuantity: (data.faultyQuantity as number) || 0,
              faultyPricePerPiece: (data.faultyPricePerPiece as number) || 0,
              faultyTotal: (data.faultyTotal as number) || 0,
              items: ((data.items as RepairLineItem[]) || []).map((it) => ({
                type: it.type,
                label: it.label,
                quantity: Number(it.quantity) || 0,
                pricePerPiece: Number(it.pricePerPiece) || 0,
                lineTotal: Number(it.lineTotal) || 0,
              })),
              totalRepairCost: (data.totalRepairCost as number) || 0,
              originalDealAmount: (data.originalDealAmount as number) || 0,
              dealAfterThisRepair: (data.dealAfterThisRepair as number) || 0,
              notes: data.notes as string | undefined,
              createdBy: (data.createdBy as string) || "",
              createdAt: (data.createdAt as number) || 0,
            } satisfies OrderRepair;
          })
          .sort((a, b) => b.createdAt - a.createdAt)
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadKaarigerData(kaarigerId);
    setHistoryOrderId("");
  }, [kaarigerId]);

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payOrderId || !session) return;
    const order = orders.find((o) => o.id === payOrderId);
    if (!order) return;

    const amount = Number(payForm.amount) || 0;
    if (amount <= 0) return;

    setPaySaving(true);
    setPayMsg("");
    try {
      const id = uuid();
      const payment: KaarigerPayment = {
        id,
        orderId: order.id,
        kaarigerId: order.kaarigerId,
        amount,
        date: todayStr(),
        time: nowTimeStr(),
        remarks: payForm.remarks || undefined,
        createdBy: session.name,
      };
      await setDoc(doc(getDb(), "kaariger_payments", id), payment);

      // Auto-complete the order once fully paid, carrying any overpayment
      // forward as credit that's auto-applied to this kaariger's next bill.
      // If the order was ALREADY completed, every rupee of this new kharcha
      // is pure overpayment — the whole amount becomes credit, not just the
      // excess past a threshold (that bug was under-crediting kaarigers).
      let excess = 0;
      if (order.status !== "COMPLETED") {
        const netDeal = orderNetDeal(order);
        const totalPaidBefore = payments.filter((p) => p.orderId === order.id).reduce((s, p) => s + p.amount, 0);
        const totalPaidAfter = totalPaidBefore + amount;
        if (totalPaidAfter >= netDeal) {
          excess = totalPaidAfter - netDeal;
          await updateDoc(doc(getDb(), "kaariger_orders", order.id), { status: "COMPLETED" });
        }
      } else {
        excess = amount;
      }

      if (excess > 0) {
        const currentCredit = kaarigers.find((k) => k.phone === order.kaarigerId)?.creditBalance || 0;
        await updateDoc(doc(getDb(), "employees", order.kaarigerId), {
          creditBalance: currentCredit + excess,
        });
        setPayMsg(`${money(excess)} extra kharcha carried forward as credit.`);
      } else {
        setPayMsg("Kharcha recorded.");
      }

      setPayForm({ amount: "", remarks: "" });
      setPayOrderId(null);
      await Promise.all([loadKaarigerData(kaarigerId), loadKaarigers()]);
    } catch (err) {
      setPayMsg(err instanceof Error ? err.message : "Failed to record kharcha.");
    } finally {
      setPaySaving(false);
    }
  }

  const kaarigerOptions = kaarigers.map((k) => ({ id: k.phone, label: k.name, sublabel: k.phone }));
  const selectedKaariger = kaarigers.find((k) => k.phone === kaarigerId);

  const orderPaidMap = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((p) => map.set(p.orderId, (map.get(p.orderId) || 0) + p.amount));
    return map;
  }, [payments]);

  // Once an order is fully paid it moves entirely out of the active view —
  // its products, deductions, repairs and kharcha are only reachable via
  // "See previous hisaab". The active view never merges multiple orders
  // together; each one gets its own separate card.
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== "COMPLETED"), [orders]);
  const completedOrders = useMemo(() => orders.filter((o) => o.status === "COMPLETED"), [orders]);

  const activeTotals = useMemo(() => {
    const deal = activeOrders.reduce((s, o) => s + orderNetDeal(o), 0);
    const paid = activeOrders.reduce((s, o) => s + (orderPaidMap.get(o.id) || 0), 0);
    const balance = Math.max(0, deal - paid);
    return { deal, paid, balance };
  }, [activeOrders, orderPaidMap]);

  const previousHisaabOptions = completedOrders.map((o) => ({
    id: o.id,
    label: o.productName,
    sublabel: `${formatDate(o.createdAt)} · Deal ${money(orderNetDeal(o))}`,
  }));

  const historyOrder = completedOrders.find((o) => o.id === historyOrderId) || null;

  return (
    <div className="space-y-5">
      <PageToolbar title="Hisaab">
        <p className="section-sub">Full payment & kharcha history per kaariger</p>
      </PageToolbar>

      <div className="card grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label">Select kaariger</label>
          <SearchSelect
            value={kaarigerId}
            onSelect={setKaarigerId}
            options={kaarigerOptions}
            placeholder="Search or select a kaariger…"
            emptyText="No kaarigers found"
          />
        </div>
        <div>
          <label className="label">
            <span className="inline-flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              See previous hisaab
            </span>
          </label>
          <SearchSelect
            value={historyOrderId}
            onSelect={setHistoryOrderId}
            options={previousHisaabOptions}
            placeholder={!kaarigerId ? "Select a kaariger first…" : "Search a completed order…"}
            emptyText="No completed orders yet"
            disabled={!kaarigerId || previousHisaabOptions.length === 0}
          />
        </div>
      </div>

      {!kaarigerId ? (
        <div className="surface flex flex-col items-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-jade-soft text-jade-deep">
            <Receipt size={22} />
          </div>
          <p className="mt-3 font-semibold">Select a kaariger to view their hisaab</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            You&apos;ll see their active orders in full detail, and can pull up any completed
            order&apos;s history separately above.
          </p>
        </div>
      ) : loading ? (
        <div className="surface py-14 text-center text-sm text-[var(--text-muted)]">Loading hisaab…</div>
      ) : (
        <div className="space-y-5">
          <div className="surface flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
              <Wallet size={20} />
            </div>
            <div className="flex-1">
              <p className="font-display text-lg font-bold">{selectedKaariger?.name}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {selectedKaariger?.phone} · {activeOrders.length} active
                {completedOrders.length > 0 ? ` · ${completedOrders.length} completed` : ""}
              </p>
            </div>
            {(selectedKaariger?.creditBalance || 0) > 0 && (
              <div className="rounded-xl bg-jade-soft px-3 py-2 text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-jade-deep">Credit available</p>
                <p className="font-display text-base font-bold text-jade-deep">
                  {money(selectedKaariger?.creditBalance || 0)}
                </p>
              </div>
            )}
          </div>

          {(selectedKaariger?.creditBalance || 0) > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-jade/30 bg-jade-soft/50 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                <Wallet size={16} />
              </div>
              <p className="text-sm text-jade-deep">
                <strong>{selectedKaariger?.name}</strong> has been paid{" "}
                <strong>{money(selectedKaariger?.creditBalance || 0)}</strong> extra on a previous bill. This
                will be automatically deducted (adjusted) from their next hisaab when a new bill is created — no
                action needed.
              </p>
            </div>
          )}

          {activeOrders.length === 0 ? (
            <div className="surface py-10 text-center text-sm text-[var(--text-muted)]">
              {completedOrders.length > 0
                ? "No active orders — everything is fully settled. Use \u201cSee previous hisaab\u201d above to review past orders."
                : "No orders for this kaariger yet."}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="stat-card">
                  <p className="stat-card-label">Active Deal</p>
                  <p className="stat-card-value">{money(activeTotals.deal)}</p>
                </div>
                <div className="stat-card">
                  <p className="stat-card-label">Active Kharcha Paid</p>
                  <p className="stat-card-value text-jade-deep">{money(activeTotals.paid)}</p>
                </div>
                <div className="stat-card">
                  <p className="stat-card-label">Active Balance</p>
                  <p className="stat-card-value">{money(activeTotals.balance)}</p>
                </div>
              </div>

              <div className="space-y-4">
                {activeOrders.map((o) => (
                  <OrderDetailCard
                    key={o.id}
                    order={o}
                    payments={payments}
                    repairs={repairs}
                    onPay={() => {
                      setPayOrderId(o.id);
                      setPayForm({ amount: "", remarks: "" });
                      setPayMsg("");
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {historyOrder && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setHistoryOrderId("")} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div
              className="max-h-[88vh] w-full max-w-2xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  className="btn-icon !bg-white"
                  onClick={() => setHistoryOrderId("")}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <OrderDetailCard
                order={historyOrder}
                payments={payments}
                repairs={repairs}
                onPay={() => {
                  setPayOrderId(historyOrder.id);
                  setPayForm({ amount: "", remarks: "" });
                  setPayMsg("");
                }}
              />
            </div>
          </div>
        </>
      )}

      {payOrderId && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setPayOrderId(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={submitPayment}
              className="surface w-full max-w-sm space-y-4 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold">Add Kharcha</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {orders.find((o) => o.id === payOrderId)?.productName}
                  </p>
                </div>
                <button type="button" className="btn-icon" onClick={() => setPayOrderId(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="label">Amount (₹) *</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  autoFocus
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  placeholder="e.g. 500"
                  required
                />
              </div>
              <div>
                <label className="label">Remarks (optional)</label>
                <input
                  className="input"
                  value={payForm.remarks}
                  onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                  placeholder="Optional note"
                />
              </div>
              {payMsg && (
                <p className="rounded-xl bg-jade-soft px-3 py-2 text-sm text-jade-deep">{payMsg}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => setPayOrderId(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={paySaving}>
                  <Plus className="h-4 w-4" />
                  {paySaving ? "Saving…" : "Add Kharcha"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

/** Full, self-contained breakdown for a single order — products, deductions,
 * repairs and kharcha timeline all scoped to just this one order. Orders are
 * never merged together; each gets rendered as its own card. */
function OrderDetailCard({
  order,
  payments,
  repairs,
  onPay,
}: {
  order: KaarigerOrder;
  payments: KaarigerPayment[];
  repairs: OrderRepair[];
  onPay?: () => void;
}) {
  const orderPayments = payments
    .filter((p) => p.orderId === order.id)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const orderRepairs = repairs.filter((r) => r.orderId === order.id);

  const net = orderNetDeal(order);
  const paid = orderPayments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, net - paid);
  const isCompleted = order.status === "COMPLETED" || balance <= 0;

  return (
    <div className="surface space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-bold">{order.productName}</p>
            <span className={orderStatusBadge(order.status)}>{order.status.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {formatDate(order.createdAt)} · {order.approvedQuantity}/{order.targetQuantity} pcs
          </p>
        </div>
        {onPay && (
          <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={onPay}>
            <IndianRupee className="h-3.5 w-3.5" />
            Pay
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--surface-mist)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Deal</p>
          <p className="font-display text-sm font-bold">{money(net)}</p>
        </div>
        <div className="rounded-xl bg-jade-soft/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-jade-deep">Paid</p>
          <p className="font-display text-sm font-bold text-jade-deep">{money(paid)}</p>
        </div>
        <div className={`rounded-xl px-3 py-2 ${isCompleted ? "bg-jade-soft/60" : "bg-amber-50"}`}>
          <p
            className={`text-[10px] font-bold uppercase tracking-wider ${
              isCompleted ? "text-jade-deep" : "text-amber-700"
            }`}
          >
            Balance
          </p>
          <p className={`font-display text-sm font-bold ${isCompleted ? "text-jade-deep" : "text-amber-700"}`}>
            {isCompleted ? "All Paid" : money(balance)}
          </p>
        </div>
      </div>

      {order.products && order.products.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <ShoppingBag className="h-3.5 w-3.5" />
            Products
          </p>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <tbody>
                {order.products.map((p, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-[var(--surface-mist)]" : undefined}>
                    <td className="px-3 py-2 font-medium">{p.productName}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {p.quantity} × ₹{p.pricePerPiece}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{money(p.lineTotal)}</td>
                  </tr>
                ))}
                <tr className="bg-jade-soft/40">
                  <td colSpan={2} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-jade-deep">
                    Products Total
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-jade-deep">
                    {money(order.productsTotal ?? 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {order.materialDeductions && order.materialDeductions.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Package className="h-3.5 w-3.5" />
            Runner / Fitting / Astar / Material
          </p>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <tbody>
                {order.materialDeductions.map((it, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-[var(--surface-mist)]" : undefined}>
                    <td className="px-3 py-2 font-medium">{it.label}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {it.quantity} × ₹{it.pricePerPiece}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-danger">−{money(it.lineTotal)}</td>
                  </tr>
                ))}
                <tr className="bg-red-50">
                  <td colSpan={2} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-danger">
                    Deductions Total
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-danger">
                    −{money(order.materialDeductionsTotal ?? 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {orderRepairs.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Wrench className="h-3.5 w-3.5" />
            Repairing Deductions
          </p>
          <div className="space-y-0 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
            {orderRepairs.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.faultyQuantity > 0 ? `${r.faultyQuantity} pcs × ${money(r.faultyPricePerPiece)}` : "—"}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatDate(r.createdAt)} {formatTime(r.createdAt)} · by {r.createdBy}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-bold text-danger">−{money(r.totalRepairCost)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-red-50 px-3 py-2 text-sm">
              <span className="font-bold text-danger">Repair Total</span>
              <span className="font-bold text-danger">
                −{money(order.repairDeductionTotal || orderRepairs.reduce((s, r) => s + r.totalRepairCost, 0))}
              </span>
            </div>
          </div>
        </div>
      )}

      {orderPayments.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <IndianRupee className="h-3.5 w-3.5" />
            Kharcha Timeline
          </p>
          <div className="space-y-0 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
            {orderPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.date} · {p.time} · by {p.createdBy}
                  </p>
                  {p.remarks && <p className="text-xs text-[var(--text-muted)]">{p.remarks}</p>}
                </div>
                <span className="shrink-0 font-bold text-jade-deep">{money(p.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-jade-soft/50 px-3 py-2 text-sm">
              <span className="font-bold text-jade-deep">Kharcha Total</span>
              <span className="font-bold text-jade-deep">{money(paid)}</span>
            </div>
          </div>
        </div>
      )}

      <GrandTotalBox order={order} paid={paid} net={net} />
    </div>
  );
}

/** Products − Runner/Fitting/Astar/Material − Repairing = Total, compared
 * against total kharcha paid: shows exactly how much extra was paid, how
 * much is still remaining, or that it's fully cleared. */
function GrandTotalBox({ order, paid, net }: { order: KaarigerOrder; paid: number; net: number }) {
  const productsTotal = order.productsTotal ?? 0;
  const deductionsTotal = order.materialDeductionsTotal ?? 0;
  const repairTotal = order.repairDeductionTotal || 0;
  const diff = paid - net;

  return (
    <div className="rounded-2xl border border-jade/20 bg-jade-soft/30 p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-jade-deep">Grand Total</p>
      <div className="space-y-1 text-sm">
        <Row label="Product cost total" value={money(productsTotal)} />
        {deductionsTotal > 0 && (
          <Row label="Less: Runner/Fitting/Astar/Material" value={`−${money(deductionsTotal)}`} />
        )}
        {repairTotal > 0 && <Row label="Less: Repairing" value={`−${money(repairTotal)}`} />}
        <div className="my-1.5 border-t border-jade/20" />
        <Row label="Total" value={money(net)} bold />
        <Row label="Total Kharcha Paid" value={money(paid)} />
        <div className="my-1.5 border-t border-jade/20" />
        {diff > 0 ? (
          <Row label="Extra paid" value={`+${money(diff)}`} bold accent="green" />
        ) : diff < 0 ? (
          <Row label="Total remaining" value={money(-diff)} bold accent="amber" />
        ) : (
          <Row label="Fully cleared" value="₹0" bold accent="green" />
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: "green" | "amber";
}) {
  const accentClass = accent === "green" ? "text-jade-deep" : accent === "amber" ? "text-amber-700" : "";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={`${bold ? "font-bold" : "font-medium"} ${accentClass}`}>{value}</span>
    </div>
  );
}
