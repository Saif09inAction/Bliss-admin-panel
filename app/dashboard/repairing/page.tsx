"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  Calculator,
  CheckCircle2,
  ChevronDown,
  Wrench,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type {
  KaarigerOrder,
  OrderRepair,
  RepairItemType,
  RepairLineItem,
} from "@/lib/types";
import { uuid } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

const EXTRA_ITEMS: { type: RepairItemType; label: string }[] = [
  { type: "RUNNER", label: "Runner" },
  { type: "FITTING", label: "Fitting" },
  { type: "ASTAR", label: "Astar" },
  { type: "MATERIAL", label: "Material" },
];

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function orderPricePerPiece(order: KaarigerOrder): number {
  if (order.pricePerPiece && order.pricePerPiece > 0) return order.pricePerPiece;
  const base = order.originalDealAmount ?? order.totalDealAmount;
  if (order.targetQuantity > 0 && base > 0) return base / order.targetQuantity;
  return 0;
}

function netDeal(order: KaarigerOrder): number {
  const original = order.originalDealAmount ?? order.totalDealAmount;
  return Math.max(0, original - (order.repairDeductionTotal || 0));
}

type ExtraDraft = Record<RepairItemType, { qty: string; price: string }>;

const emptyExtras = (): ExtraDraft => ({
  RUNNER: { qty: "", price: "" },
  FITTING: { qty: "", price: "" },
  ASTAR: { qty: "", price: "" },
  MATERIAL: { qty: "", price: "" },
});

export default function RepairingPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [repairs, setRepairs] = useState<OrderRepair[]>([]);
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [faultyQty, setFaultyQty] = useState("");
  const [faultyPrice, setFaultyPrice] = useState("");
  const [extras, setExtras] = useState<ExtraDraft>(emptyExtras);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const unsubOrders = onSnapshot(collection(getDb(), "kaariger_orders"), (snap) => {
      setOrders(
        snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              kaarigerId: (data.kaarigerId as string) || "",
              kaarigerName: (data.kaarigerName as string) || "",
              productName: (data.productName as string) || "",
              targetQuantity: (data.targetQuantity as number) || 0,
              color: (data.color as string) || "",
              rawMaterials: [],
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
            } satisfies KaarigerOrder;
          })
          .sort((a, b) => b.createdAt - a.createdAt)
      );
    });

    const unsubRepairs = onSnapshot(collection(getDb(), "order_repairs"), (snap) => {
      setRepairs(
        snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              orderId: data.orderId as string,
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
    });

    return () => {
      unsubOrders();
      unsubRepairs();
    };
  }, []);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  useEffect(() => {
    if (!selectedOrder) return;
    setFaultyPrice(String(Number(orderPricePerPiece(selectedOrder).toFixed(2))));
    setFaultyQty("");
    setExtras(emptyExtras());
    setNotes("");
    setMsg("");
  }, [selectedOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (!q) return true;
      return (
        o.productName.toLowerCase().includes(q) ||
        o.kaarigerName.toLowerCase().includes(q) ||
        o.status.toLowerCase().includes(q)
      );
    });
  }, [orders, search]);

  const calc = useMemo(() => {
    const fQty = Number(faultyQty) || 0;
    const fPrice = Number(faultyPrice) || 0;
    const faultyTotal = fQty * fPrice;
    // Only include lines the admin actually filled (qty + price). Empty rows are skipped.
    const items: RepairLineItem[] = EXTRA_ITEMS.map(({ type, label }) => {
      const qty = Number(extras[type].qty) || 0;
      const price = Number(extras[type].price) || 0;
      return {
        type,
        label,
        quantity: qty,
        pricePerPiece: price,
        lineTotal: qty * price,
      };
    }).filter((it) => it.quantity > 0 && it.pricePerPiece > 0);

    const extrasTotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const totalRepairCost = faultyTotal + extrasTotal;
    const original = selectedOrder
      ? selectedOrder.originalDealAmount ?? selectedOrder.totalDealAmount
      : 0;
    const alreadyDeducted = selectedOrder?.repairDeductionTotal || 0;
    const dealAfter = Math.max(0, original - alreadyDeducted - totalRepairCost);

    return { fQty, fPrice, faultyTotal, items, extrasTotal, totalRepairCost, original, alreadyDeducted, dealAfter };
  }, [faultyQty, faultyPrice, extras, selectedOrder]);

  async function submitRepair(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) {
      setMsg("Select an order first.");
      return;
    }
    // Only filled lines count — faulty / materials / notes are all optional
    if (calc.fQty <= 0 && calc.items.length === 0) {
      setMsg("Enter faulty qty or at least one material with qty + ₹/pc.");
      return;
    }
    if (calc.fQty > 0 && calc.fPrice < 0) {
      setMsg("Faulty price per piece cannot be negative.");
      return;
    }
    if (calc.totalRepairCost <= 0) {
      setMsg("Add a price so the deduction is greater than ₹0.");
      return;
    }

    setSaving(true);
    setMsg("");
    try {
      const original = selectedOrder.originalDealAmount ?? selectedOrder.totalDealAmount;
      const prevDeduction = selectedOrder.repairDeductionTotal || 0;
      const newDeduction = prevDeduction + calc.totalRepairCost;
      const dealAfter = Math.max(0, original - newDeduction);
      const id = uuid();

      // Never write undefined — Firestore rejects it (empty notes must be "")
      const repair = {
        id,
        orderId: selectedOrder.id,
        kaarigerId: selectedOrder.kaarigerId,
        kaarigerName: selectedOrder.kaarigerName,
        productName: selectedOrder.productName,
        faultyQuantity: calc.fQty,
        faultyPricePerPiece: calc.fPrice,
        faultyTotal: calc.faultyTotal,
        items: calc.items,
        totalRepairCost: calc.totalRepairCost,
        originalDealAmount: original,
        dealAfterThisRepair: dealAfter,
        notes: notes.trim(),
        createdBy: session?.name || "Admin",
        createdAt: Date.now(),
      };

      await setDoc(doc(getDb(), "order_repairs", id), repair);
      await updateDoc(doc(getDb(), "kaariger_orders", selectedOrder.id), {
        originalDealAmount: original,
        repairDeductionTotal: newDeduction,
      });

      setMsg(`Repair saved. Deducted ${money(calc.totalRepairCost)}. Remaining deal ${money(dealAfter)}.`);
      setFaultyQty("");
      setExtras(emptyExtras());
      setNotes("");
      setExpandedId(id);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to save repair.");
    } finally {
      setSaving(false);
    }
  }

  const filteredRepairs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return repairs;
    return repairs.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        r.kaarigerName.toLowerCase().includes(q)
    );
  }, [repairs, search]);

  return (
    <div className="space-y-5">
      <PageToolbar title="Repairing">
        <p className="section-sub">
          Deduct faulty pcs + Runner / Fitting / Astar / Material from order deal
        </p>
      </PageToolbar>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <form onSubmit={submitRepair} className="surface h-fit space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
              <Wrench size={18} />
            </div>
            <div>
              <h3 className="font-display text-base font-bold">New repair deduction</h3>
              <p className="text-xs text-[var(--text-muted)]">Visible to kaariger on payments</p>
            </div>
          </div>

          <div>
            <label className="label">Select order *</label>
            <select
              className="input"
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              required
            >
              <option value="">Choose kaariger order…</option>
              {orderOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.productName} · {o.kaarigerName || "—"} · {o.status.replace(/_/g, " ")} ·{" "}
                  {money(netDeal(o))} left
                </option>
              ))}
            </select>
          </div>

          {selectedOrder && (
            <div className="rounded-xl bg-[var(--surface-mist)] p-3 text-sm">
              <p className="font-semibold capitalize">{selectedOrder.productName}</p>
              <p className="text-[var(--text-muted)]">
                {selectedOrder.kaarigerName} · Approved {selectedOrder.approvedQuantity}/
                {selectedOrder.targetQuantity}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[var(--text-faint)]">Original deal</p>
                  <p className="font-bold">
                    {money(selectedOrder.originalDealAmount ?? selectedOrder.totalDealAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--text-faint)]">Already deducted</p>
                  <p className="font-bold text-danger">
                    {money(selectedOrder.repairDeductionTotal || 0)}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[var(--text-faint)]">Current remaining deal</p>
                  <p className="font-display text-lg font-bold text-jade-deep">
                    {money(netDeal(selectedOrder))}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Faulty product qty (optional)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={faultyQty}
                onChange={(e) => setFaultyQty(e.target.value)}
                placeholder="e.g. 20"
              />
            </div>
            <div>
              <label className="label">Price / pc (₹)</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={faultyPrice}
                onChange={(e) => setFaultyPrice(e.target.value)}
              />
            </div>
          </div>
          {calc.fQty > 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              Faulty line: {calc.fQty} × {money(calc.fPrice)} ={" "}
              <span className="font-semibold text-[var(--text)]">{money(calc.faultyTotal)}</span>
            </p>
          )}

          <div>
            <p className="label mb-1">Materials given by admin (optional)</p>
            <p className="mb-2 text-[11px] text-[var(--text-muted)]">
              Fill only what you need — empty rows are skipped.
            </p>
            <div className="space-y-2">
              {EXTRA_ITEMS.map(({ type, label }) => (
                <div
                  key={type}
                  className="grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] items-end gap-2 rounded-xl border border-[var(--border)] p-2.5"
                >
                  <p className="pb-2 text-sm font-semibold">{label}</p>
                  <div>
                    <label className="label !text-[10px]">Qty</label>
                    <input
                      className="input !w-full !py-2"
                      type="number"
                      min={0}
                      value={extras[type].qty}
                      onChange={(e) =>
                        setExtras({
                          ...extras,
                          [type]: { ...extras[type], qty: e.target.value },
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="label !text-[10px]">₹ / pc</label>
                    <input
                      className="input !w-full !py-2"
                      type="number"
                      min={0}
                      step="0.01"
                      value={extras[type].price}
                      onChange={(e) =>
                        setExtras({
                          ...extras,
                          [type]: { ...extras[type], price: e.target.value },
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — leave blank if not needed"
            />
          </div>

          <div className="rounded-2xl border border-jade/20 bg-jade-soft/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-jade-deep">
              <Calculator size={16} />
              <p className="text-xs font-bold uppercase tracking-wider">Auto total</p>
            </div>
            <div className="space-y-1 text-sm">
              <Row label="Faulty products" value={money(calc.faultyTotal)} />
              <Row label="Runner / Fitting / Astar / Material" value={money(calc.extrasTotal)} />
              <div className="my-2 border-t border-jade/20" />
              <Row label="This repair total" value={money(calc.totalRepairCost)} bold />
              <Row label="Deal after update" value={money(calc.dealAfter)} bold accent />
            </div>
          </div>

          {msg && (
            <p
              className={`rounded-xl px-3 py-2 text-sm ${
                msg.includes("saved") || msg.includes("Deducted")
                  ? "bg-jade-soft text-jade-deep"
                  : "bg-red-50 text-danger"
              }`}
            >
              {msg}
            </p>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={saving || !selectedOrder}>
            {saving ? "Saving…" : "Update · deduct from order"}
          </button>
        </form>

        <div className="space-y-4">
          <AdminSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search repairs or filter orders by product / kaariger…"
          />

          <p className="mobile-section-label">Repair history · visible to kaariger</p>

          {filteredRepairs.length === 0 ? (
            <div className="surface py-14 text-center text-sm text-[var(--text-muted)]">
              No repairing records yet.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRepairs.map((r) => {
                const open = expandedId === r.id;
                return (
                  <div key={r.id} className="surface overflow-hidden">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 p-4 text-left"
                      onClick={() => setExpandedId(open ? null : r.id)}
                    >
                      <div className="min-w-0">
                        <p className="font-display font-bold">{r.productName}</p>
                        <p className="text-sm text-[var(--text-muted)]">
                          {r.kaarigerName} · {new Date(r.createdAt).toLocaleDateString("en-IN")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-right">
                          <p className="font-bold text-danger">−{money(r.totalRepairCost)}</p>
                          <p className="text-xs text-[var(--text-faint)]">
                            left {money(r.dealAfterThisRepair)}
                          </p>
                        </div>
                        <ChevronDown
                          size={16}
                          className={`text-[var(--text-faint)] transition ${open ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>
                    {open && (
                      <div className="border-t border-[var(--border)] bg-[var(--surface-mist)]/50 px-4 py-3">
                        <Breakup repair={r} />
                        {r.notes && (
                          <p className="mt-2 text-xs text-[var(--text-muted)]">Note: {r.notes}</p>
                        )}
                        <p className="mt-2 flex items-center gap-1 text-xs text-jade-deep">
                          <CheckCircle2 size={12} /> By {r.createdBy}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span
        className={`${bold ? "font-bold" : "font-medium"} ${accent ? "text-jade-deep" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function Breakup({ repair }: { repair: OrderRepair }) {
  return (
    <div className="space-y-1.5 text-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">Breakup</p>
      {repair.faultyQuantity > 0 && (
        <Row
          label={`Faulty product × ${repair.faultyQuantity} @ ${money(repair.faultyPricePerPiece)}`}
          value={money(repair.faultyTotal)}
        />
      )}
      {repair.items.map((it) => (
        <Row
          key={it.type}
          label={`${it.label} × ${it.quantity} @ ${money(it.pricePerPiece)}`}
          value={money(it.lineTotal)}
        />
      ))}
      <div className="border-t border-[var(--border)] pt-1.5">
        <Row label="Original deal" value={money(repair.originalDealAmount)} />
        <Row label="This deduction" value={`−${money(repair.totalRepairCost)}`} bold />
        <Row label="Remaining deal" value={money(repair.dealAfterThisRepair)} bold accent />
      </div>
    </div>
  );
}

