"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import {
  ClipboardList,
  IndianRupee,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Employee, KaarigerOrder, KaarigerPayment, OrderMaterial, RawMaterial } from "@/lib/types";
import { nowTimeStr, todayStr, uuid } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

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

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export default function OrdersPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [kaarigers, setKaarigers] = useState<Employee[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [payments, setPayments] = useState<KaarigerPayment[]>([]);
  const [paymentForm, setPaymentForm] = useState({ amount: "", remarks: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DONE">("ALL");
  const [editOrder, setEditOrder] = useState<KaarigerOrder | null>(null);
  const [editForm, setEditForm] = useState({
    productName: "",
    targetQuantity: "",
    approvedQuantity: "",
    deliveredQuantity: "",
    totalDealAmount: "",
    status: "",
    notes: "",
    kaarigerId: "",
  });

  const [form, setForm] = useState({
    kaarigerId: "",
    productName: "",
    targetQuantity: "",
    color: "",
    totalDealAmount: "",
    pricingType: "OVERALL" as "OVERALL" | "PER_PIECE",
    notes: "",
    selectedMaterials: [] as { materialId: string; quantity: string }[],
  });

  async function loadOrders() {
    const snap = await getDocs(collection(getDb(), "kaariger_orders"));
    setOrders(
      snap.docs.map((d) => {
        const data = d.data();
        const rawMaterials = ((data.rawMaterials as OrderMaterial[]) || []).map((m) => ({
          materialId: m.materialId,
          materialName: m.materialName,
          quantity: Number(m.quantity) || 0,
          unit: m.unit,
          usedQuantity: m.usedQuantity != null ? Number(m.usedQuantity) : undefined,
          remainingQuantity: m.remainingQuantity != null ? Number(m.remainingQuantity) : undefined,
        }));
        return {
          id: (data.id as string) || d.id,
          kaarigerId: data.kaarigerId as string,
          kaarigerName: data.kaarigerName as string,
          productName: data.productName as string,
          targetQuantity: (data.targetQuantity as number) || 0,
          color: (data.color as string) || "",
          rawMaterials,
          totalDealAmount: (data.totalDealAmount as number) || 0,
          pricePerPiece: data.pricePerPiece as number | undefined,
          pricingType: (data.pricingType as "OVERALL" | "PER_PIECE") || "OVERALL",
          status: (data.status as string) === "APPROVED" ? "COMPLETED" : ((data.status as string) || "ASSIGNED"),
          approvedQuantity: (data.approvedQuantity as number) || 0,
          deliveredQuantity: data.deliveredQuantity as number | undefined,
          deliveryColor: data.deliveryColor as string | undefined,
          verifiedBy: data.verifiedBy as string | undefined,
          verifiedAt: data.verifiedAt as number | undefined,
          materialUsageReported: data.materialUsageReported as boolean | undefined,
          createdBy: (data.createdBy as string) || "",
          createdAt: (data.createdAt as number) || 0,
          notes: data.notes as string | undefined,
          originalDealAmount: data.originalDealAmount as number | undefined,
          repairDeductionTotal: (data.repairDeductionTotal as number) || 0,
        };
      }).sort((a, b) => b.createdAt - a.createdAt)
    );
  }

  async function loadMeta() {
    const [empSnap, matSnap] = await Promise.all([
      getDocs(collection(getDb(), "employees")),
      getDocs(collection(getDb(), "raw_materials")),
    ]);
    setKaarigers(
      empSnap.docs
        .filter((d) => d.data().role === "KAARIGER")
        .map((d) => ({
          id: d.id,
          name: d.data().name as string,
          phone: d.data().phone as string,
          joiningDate: "",
          monthlySalary: 0,
          attendancePercentage: 0,
          role: "KAARIGER" as const,
        }))
    );
    setMaterials(
      matSnap.docs.map((d) => ({
        id: (d.data().id as string) || d.id,
        name: d.data().name as string,
        quantity: (d.data().quantity as number) || 0,
        unit: (d.data().unit as string) || "",
        minimumStock: 0,
        supplier: "",
        lastUpdatedBy: "",
        lastUpdatedTime: 0,
      }))
    );
  }

  async function loadPayments(orderId: string) {
    const snap = await getDocs(
      query(collection(getDb(), "kaariger_payments"), where("orderId", "==", orderId))
    );
    setPayments(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: (data.id as string) || d.id,
          orderId: data.orderId as string,
          kaarigerId: data.kaarigerId as string,
          amount: (data.amount as number) || 0,
          date: data.date as string,
          time: data.time as string,
          remarks: data.remarks as string | undefined,
          createdBy: (data.createdBy as string) || "",
        };
      })
    );
  }

  useEffect(() => {
    loadOrders();
    loadMeta();
  }, []);

  useEffect(() => {
    if (selectedOrder) loadPayments(selectedOrder);
  }, [selectedOrder]);

  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    const productName = form.productName.trim();
    const qty = Number(form.targetQuantity) || 0;
    if (!productName || qty <= 0) {
      alert("Product name and quantity are required.");
      return;
    }
    const kaariger = kaarigers.find((k) => k.phone === form.kaarigerId);

    const orderMaterials: OrderMaterial[] = form.selectedMaterials
      .filter((s) => s.materialId && Number(s.quantity) > 0)
      .flatMap((s) => {
        const mat = materials.find((m) => m.id === s.materialId);
        if (!mat) return [];
        return [
          {
            materialId: mat.id,
            materialName: mat.name,
            quantity: Number(s.quantity),
            unit: mat.unit,
          },
        ];
      });

    const inputAmount = Number(form.totalDealAmount) || 0;
    const pricePerPiece =
      form.pricingType === "PER_PIECE"
        ? inputAmount
        : qty > 0 && inputAmount > 0
          ? inputAmount / qty
          : 0;
    const totalDealAmount =
      form.pricingType === "PER_PIECE" ? inputAmount * qty : inputAmount;
    const id = uuid();

    const order: KaarigerOrder = {
      id,
      kaarigerId: kaariger?.phone.trim() || form.kaarigerId || "",
      kaarigerName: kaariger?.name || "",
      productName,
      targetQuantity: qty,
      color: "",
      rawMaterials: orderMaterials,
      totalDealAmount,
      pricePerPiece,
      pricingType: form.pricingType,
      status: "ASSIGNED",
      approvedQuantity: 0,
      createdBy: session?.name || "Admin",
      createdAt: Date.now(),
      notes: form.notes.trim(),
    };

    try {
      await setDoc(doc(getDb(), "kaariger_orders", id), order);
      setShowForm(false);
      setForm({
        kaarigerId: "",
        productName: "",
        targetQuantity: "",
        color: "",
        totalDealAmount: "",
        pricingType: "OVERALL",
        notes: "",
        selectedMaterials: [],
      });
      loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create order.");
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder || !session) return;
    const order = orders.find((o) => o.id === selectedOrder);
    if (!order) return;

    const id = uuid();
    const payment: KaarigerPayment = {
      id,
      orderId: order.id,
      kaarigerId: order.kaarigerId,
      amount: Number(paymentForm.amount) || 0,
      date: todayStr(),
      time: nowTimeStr(),
      remarks: paymentForm.remarks || undefined,
      createdBy: session.name,
    };
    await setDoc(doc(getDb(), "kaariger_payments", id), payment);
    setPaymentForm({ amount: "", remarks: "" });
    loadPayments(selectedOrder);
  }

  function openEditOrder(order: KaarigerOrder) {
    setEditOrder(order);
    setEditForm({
      productName: order.productName,
      targetQuantity: String(order.targetQuantity),
      approvedQuantity: String(order.approvedQuantity),
      deliveredQuantity: order.deliveredQuantity != null ? String(order.deliveredQuantity) : "",
      totalDealAmount: String(order.totalDealAmount || ""),
      status: order.status,
      notes: order.notes || "",
      kaarigerId: order.kaarigerId,
    });
  }

  async function saveEditOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrder) return;
    const kaariger = kaarigers.find((k) => k.phone === editForm.kaarigerId);
    const productName = editForm.productName.trim();
    const targetQuantity = Number(editForm.targetQuantity) || 0;
    if (!productName || targetQuantity <= 0) {
      alert("Product name and quantity are required.");
      return;
    }
    const deliveredRaw = editForm.deliveredQuantity.trim();
    await setDoc(
      doc(getDb(), "kaariger_orders", editOrder.id),
      {
        productName,
        targetQuantity,
        approvedQuantity: Number(editForm.approvedQuantity) || 0,
        deliveredQuantity: deliveredRaw === "" ? null : Number(deliveredRaw) || 0,
        totalDealAmount: Number(editForm.totalDealAmount) || 0,
        status: editForm.status,
        notes: editForm.notes.trim() || "",
        kaarigerId: editForm.kaarigerId,
        kaarigerName: kaariger?.name || editOrder.kaarigerName,
        color: "",
      },
      { merge: true }
    );
    setEditOrder(null);
    loadOrders();
  }

  function addMaterialRow() {
    setForm({
      ...form,
      selectedMaterials: [...form.selectedMaterials, { materialId: "", quantity: "" }],
    });
  }

  function removeMaterialRow(index: number) {
    setForm({
      ...form,
      selectedMaterials: form.selectedMaterials.filter((_, i) => i !== index),
    });
  }

  const inStockMaterials = useMemo(
    () => materials.filter((m) => m.quantity > 0),
    [materials]
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rank = (status: string) => {
      switch (status) {
        case "PENDING_APPROVAL":
          return 0;
        case "ASSIGNED":
          return 1;
        case "IN_PROGRESS":
          return 2;
        case "DELIVERED":
          return 3;
        case "COMPLETED":
          return 4;
        case "CANCELLED":
          return 5;
        default:
          return 6;
      }
    };
    const isActive = (s: string) =>
      s === "PENDING_APPROVAL" || s === "ASSIGNED" || s === "IN_PROGRESS" || s === "DELIVERED";

    return orders
      .filter((o) => {
        const matchSearch =
          !q ||
          o.productName.toLowerCase().includes(q) ||
          o.kaarigerName.toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q) ||
          o.color.toLowerCase().includes(q);
        const matchStatus =
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE" && isActive(o.status)) ||
          (statusFilter === "DONE" && (o.status === "COMPLETED" || o.status === "CANCELLED"));
        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        const ra = rank(a.status);
        const rb = rank(b.status);
        if (ra !== rb) return ra - rb;
        return b.createdAt - a.createdAt;
      });
  }, [orders, search, statusFilter]);

  const previewTotal = (() => {
    const qty = Number(form.targetQuantity) || 0;
    const amt = Number(form.totalDealAmount) || 0;
    if (form.pricingType === "PER_PIECE") return amt * qty;
    return amt;
  })();

  const selected = selectedOrder ? orders.find((x) => x.id === selectedOrder) : null;
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);

  const formPanel = (
    <form onSubmit={createOrder} className="card space-y-4 lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--jade-soft)]">
            <ClipboardList className="h-4 w-4 text-[var(--jade-deep)]" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold">New Order</h2>
            <p className="text-xs text-[var(--text-muted)]">Assign work to a kaariger</p>
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm lg:hidden"
          onClick={() => setShowForm(false)}
          aria-label="Close form"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="label">Kaariger (optional)</label>
          <select className="input" value={form.kaarigerId} onChange={(e) => setForm({ ...form, kaarigerId: e.target.value })}>
            <option value="">Select kaariger</option>
            {kaarigers.map((k) => (
              <option key={k.phone} value={k.phone}>{k.name} ({k.phone})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Product / SKU name *</label>
          <input className="input" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} required placeholder="Same spelling merges in inventory" />
        </div>
        <div>
          <label className="label">Target Quantity *</label>
          <input className="input" type="number" min={1} value={form.targetQuantity} onChange={(e) => setForm({ ...form, targetQuantity: e.target.value })} required />
        </div>
        <div>
          <label className="label">Pricing (optional)</label>
          <select className="input" value={form.pricingType} onChange={(e) => setForm({ ...form, pricingType: e.target.value as "OVERALL" | "PER_PIECE" })}>
            <option value="OVERALL">Overall deal</option>
            <option value="PER_PIECE">Per piece</option>
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="label">{form.pricingType === "PER_PIECE" ? "Price Per Piece ₹ (optional)" : "Total Deal Amount ₹ (optional)"}</label>
          <input className="input" type="number" value={form.totalDealAmount} onChange={(e) => setForm({ ...form, totalDealAmount: e.target.value })} placeholder="0" />
          {form.pricingType === "PER_PIECE" && Number(form.targetQuantity) > 0 && Number(form.totalDealAmount) > 0 && (
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              Total deal: ₹{previewTotal.toLocaleString("en-IN")} ({form.totalDealAmount || 0}/pc × {form.targetQuantity} pcs)
            </p>
          )}
        </div>
      </div>

      <p className="rounded-xl bg-[var(--surface-mist)] px-3 py-2 text-xs text-[var(--text-muted)]">
        Colours are set by staff when approving delivery. Materials &amp; notes are optional.
      </p>

      {inStockMaterials.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="label mb-0">Raw Materials (optional)</label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addMaterialRow}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
          {form.selectedMaterials.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-muted)]">
              Optional — leave empty to create order without materials.
            </p>
          )}
          <div className="space-y-2">
            {form.selectedMaterials.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_4.75rem_2.75rem] items-center gap-2"
              >
                <select
                  className="input !w-full min-w-0"
                  value={row.materialId}
                  onChange={(e) => {
                    const next = [...form.selectedMaterials];
                    next[i] = { ...next[i], materialId: e.target.value };
                    setForm({ ...form, selectedMaterials: next });
                  }}
                >
                  <option value="">Select material…</option>
                  {inStockMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.quantity} {m.unit})
                    </option>
                  ))}
                </select>
                <input
                  className="input !w-full text-center"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={(e) => {
                    const next = [...form.selectedMaterials];
                    next[i] = { ...next[i], quantity: e.target.value };
                    setForm({ ...form, selectedMaterials: next });
                  }}
                />
                <button
                  type="button"
                  className="btn-icon !h-11 !w-11 shrink-0 hover:!border-danger hover:!bg-red-50 hover:!text-danger"
                  onClick={() => removeMaterialRow(i)}
                  aria-label="Remove material"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
          No materials in stock yet — you can still create the order without materials.
        </div>
      )}

      <div>
        <label className="label">Instructions / notes (optional)</label>
        <input
          className="input"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Optional instructions"
        />
      </div>

      <button type="submit" className="btn btn-primary w-full">
        Create Order
      </button>
    </form>
  );

  return (
    <div className="stagger space-y-5">
      <PageToolbar
        title="Kaariger Orders"
        actions={
          <button
            className="btn btn-primary lg:hidden"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create Order
              </>
            )}
          </button>
        }
      >
        <p className="section-sub">{orders.length} order{orders.length === 1 ? "" : "s"}</p>
      </PageToolbar>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search orders by product, kaariger, status..."
      />

      <div className="mobile-chip-scroll flex flex-wrap gap-2">
        {(
          [
            { id: "ALL" as const, label: "All" },
            { id: "ACTIVE" as const, label: "Needs action" },
            { id: "DONE" as const, label: "Completed" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={`filter-pill ${statusFilter === f.id ? "active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        {/* Form — always visible on desktop, toggle on mobile */}
        <div className={`${showForm ? "block" : "hidden"} lg:block`}>
          {formPanel}
        </div>

        <div className="min-w-0 space-y-5">
          {/* Desktop table */}
          <div className="data-table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Kaariger</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th className="text-right">Deal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr
                      key={o.id}
                      className={`cursor-pointer ${selectedOrder === o.id ? "!bg-[var(--jade-soft)]" : ""}`}
                      onClick={() => setSelectedOrder(o.id)}
                    >
                      <td>
                        <p className="font-semibold">{o.productName}</p>
                        {o.color && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{o.color}</p>}
                      </td>
                      <td className="text-[var(--text-muted)]">{o.kaarigerName}</td>
                      <td>
                        <span className={orderStatusBadge(o.status)}>{statusLabel(o.status)}</span>
                      </td>
                      <td className="text-[var(--text-muted)]">
                        {o.approvedQuantity}/{o.targetQuantity} pcs
                      </td>
                      <td className="text-right font-semibold">₹{o.totalDealAmount.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredOrders.length === 0 && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">
                {search ? "No orders match your search." : "No orders yet."}
              </p>
            )}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden">
            <p className="mobile-section-label">
              {statusFilter === "ACTIVE"
                ? "Needs action first"
                : statusFilter === "DONE"
                  ? "Finished orders"
                  : "Active first · newest"}
            </p>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
              {filteredOrders.map((o, idx) => (
                <button
                  key={o.id}
                  type="button"
                  className={`mobile-row w-full text-left ${idx < filteredOrders.length - 1 ? "" : "!border-b-0"}`}
                  onClick={() => setSelectedOrder(o.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{o.productName}</p>
                      <span className={`${orderStatusBadge(o.status)} shrink-0`}>{statusLabel(o.status)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {o.kaarigerName} · {o.approvedQuantity}/{o.targetQuantity} pcs · ₹
                      {o.totalDealAmount.toLocaleString("en-IN")}
                    </p>
                  </div>
                </button>
              ))}
              {filteredOrders.length === 0 && (
                <p className="py-10 text-center text-sm text-[var(--text-muted)]">
                  {search ? "No orders match your search." : "No orders yet."}
                </p>
              )}
            </div>
          </div>

          {/* Selected order detail — sheet on mobile, inline on desktop */}
          {selected && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/45 md:hidden"
                aria-label="Close order detail"
                onClick={() => setSelectedOrder(null)}
              />
              <div className="card space-y-5 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:max-h-[88vh] max-md:overflow-y-auto max-md:rounded-b-none max-md:rounded-t-3xl max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-md:shadow-[0_-12px_40px_rgba(6,17,13,0.18)]">
                <div className="mx-auto mb-1 hidden h-1 w-10 rounded-full bg-[var(--border-strong)] max-md:block" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-bold">{selected.productName}</h2>
                    <span className={orderStatusBadge(selected.status)}>{statusLabel(selected.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {selected.kaarigerName} · {selected.approvedQuantity}/{selected.targetQuantity} pcs approved
                    {selected.status === "PENDING_APPROVAL" && selected.deliveredQuantity
                      ? ` · ${selected.deliveredQuantity} awaiting approval`
                      : ""}
                  </p>
                  {selected.verifiedBy && (
                    <p className="mt-1 text-xs text-[var(--jade-deep)]">Last verified by {selected.verifiedBy}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEditOrder(selected)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm shrink-0"
                    onClick={() => setSelectedOrder(null)}
                    aria-label="Close order detail"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="stat-card !p-3">
                  <p className="stat-card-label">Deal Amount</p>
                  <p className="stat-card-value !text-xl">
                    ₹{(selected.originalDealAmount ?? selected.totalDealAmount).toLocaleString("en-IN")}
                  </p>
                  {selected.pricingType === "PER_PIECE" && selected.pricePerPiece ? (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">₹{selected.pricePerPiece}/pc</p>
                  ) : null}
                </div>
                <div className="stat-card !p-3">
                  <p className="stat-card-label">Paid</p>
                  <p className="stat-card-value !text-xl text-[var(--jade-deep)]">
                    ₹{paidTotal.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="stat-card !p-3">
                  <p className="stat-card-label">Balance</p>
                  <p className="stat-card-value !text-xl">
                    ₹{Math.max(
                      0,
                      (selected.originalDealAmount ?? selected.totalDealAmount) -
                        (selected.repairDeductionTotal || 0) -
                        paidTotal
                    ).toLocaleString("en-IN")}
                  </p>
                  {(selected.repairDeductionTotal || 0) > 0 && (
                    <p className="mt-0.5 text-xs text-danger">
                      Repair −₹{(selected.repairDeductionTotal || 0).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
              </div>

              {selected.rawMaterials.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Package className="h-4 w-4 text-[var(--text-muted)]" />
                    Raw Materials
                  </h3>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Assigned</th>
                          <th>Used</th>
                          <th>Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.rawMaterials.map((m) => (
                          <tr key={m.materialId}>
                            <td className="font-medium">{m.materialName}</td>
                            <td>{m.quantity} {m.unit}</td>
                            <td>{m.usedQuantity != null ? `${m.usedQuantity} ${m.unit}` : "—"}</td>
                            <td>{m.remainingQuantity != null ? `${m.remainingQuantity} ${m.unit}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                  <IndianRupee className="h-4 w-4 text-[var(--text-muted)]" />
                  Advance Payments
                </h3>
                {payments.length > 0 ? (
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                      >
                        <div>
                          <p className="font-semibold">₹{p.amount.toLocaleString("en-IN")}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {p.date} · {p.createdBy}
                            {p.remarks ? ` · ${p.remarks}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-4 text-center text-sm text-[var(--text-muted)]">
                    No payments recorded yet
                  </p>
                )}

                <form onSubmit={addPayment} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    className="input"
                    type="number"
                    placeholder="Amount (₹)"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    required
                  />
                  <input
                    className="input"
                    placeholder="Remarks (optional)"
                    value={paymentForm.remarks}
                    onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                  />
                  <button type="submit" className="btn btn-primary whitespace-nowrap">
                    <Plus className="h-4 w-4" />
                    Add Payment
                  </button>
                </form>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      {editOrder && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditOrder(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={saveEditOrder}
              className="surface max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <h3 className="font-display text-lg font-bold">Edit order</h3>
                <button type="button" className="btn-icon" onClick={() => setEditOrder(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="label">Product / SKU *</label>
                <input
                  className="input"
                  value={editForm.productName}
                  onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Kaariger</label>
                <select
                  className="input"
                  value={editForm.kaarigerId}
                  onChange={(e) => setEditForm({ ...editForm, kaarigerId: e.target.value })}
                >
                  <option value="">—</option>
                  {kaarigers.map((k) => (
                    <option key={k.phone} value={k.phone}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Target qty *</label>
                  <input
                    className="input"
                    type="number"
                    value={editForm.targetQuantity}
                    onChange={(e) => setEditForm({ ...editForm, targetQuantity: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">Approved qty</label>
                  <input
                    className="input"
                    type="number"
                    value={editForm.approvedQuantity}
                    onChange={(e) => setEditForm({ ...editForm, approvedQuantity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Delivered (pending)</label>
                  <input
                    className="input"
                    type="number"
                    value={editForm.deliveredQuantity}
                    onChange={(e) => setEditForm({ ...editForm, deliveredQuantity: e.target.value })}
                    placeholder="Empty if none"
                  />
                </div>
                <div>
                  <label className="label">Deal ₹</label>
                  <input
                    className="input"
                    type="number"
                    value={editForm.totalDealAmount}
                    onChange={(e) => setEditForm({ ...editForm, totalDealAmount: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                >
                  {["ASSIGNED", "PENDING_APPROVAL", "COMPLETED", "CANCELLED"].map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Notes</label>
                <input
                  className="input"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditOrder(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
