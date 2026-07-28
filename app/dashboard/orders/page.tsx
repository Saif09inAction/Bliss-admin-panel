"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Employee, KaarigerOrder, KaarigerPayment, OrderMaterial, RawMaterial } from "@/lib/types";
import { nowTimeStr, todayStr, uuid } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";

export default function OrdersPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [kaarigers, setKaarigers] = useState<Employee[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [payments, setPayments] = useState<KaarigerPayment[]>([]);
  const [paymentForm, setPaymentForm] = useState({ amount: "", remarks: "" });

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
    const kaariger = kaarigers.find((k) => k.phone === form.kaarigerId);
    if (!kaariger) return;

    const orderMaterials: OrderMaterial[] = form.selectedMaterials
      .filter((s) => s.materialId && Number(s.quantity) > 0)
      .map((s) => {
        const mat = materials.find((m) => m.id === s.materialId)!;
        return {
          materialId: mat.id,
          materialName: mat.name,
          quantity: Number(s.quantity),
          unit: mat.unit,
        };
      });

    const qty = Number(form.targetQuantity) || 0;
    const inputAmount = Number(form.totalDealAmount) || 0;
    const pricePerPiece = form.pricingType === "PER_PIECE" ? inputAmount : (qty > 0 ? inputAmount / qty : 0);
    const totalDealAmount = form.pricingType === "PER_PIECE" ? inputAmount * qty : inputAmount;
    const id = uuid();

    const order: KaarigerOrder = {
      id,
      kaarigerId: kaariger.phone.trim(),
      kaarigerName: kaariger.name,
      productName: form.productName.trim(),
      targetQuantity: qty,
      color: form.color.trim(),
      rawMaterials: orderMaterials,
      totalDealAmount,
      pricePerPiece,
      pricingType: form.pricingType,
      status: "ASSIGNED",
      approvedQuantity: 0,
      createdBy: session?.name || "Admin",
      createdAt: Date.now(),
      notes: form.notes || undefined,
    };

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

  function addMaterialRow() {
    setForm({
      ...form,
      selectedMaterials: [...form.selectedMaterials, { materialId: "", quantity: "" }],
    });
  }

  const previewTotal = (() => {
    const qty = Number(form.targetQuantity) || 0;
    const amt = Number(form.totalDealAmount) || 0;
    if (form.pricingType === "PER_PIECE") return amt * qty;
    return amt;
  })();

  return (
    <div className="space-y-4">
      <PageToolbar
        meta={`${orders.length} order${orders.length === 1 ? "" : "s"}`}
        actions={
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Create Order"}
          </button>
        }
      />

      {showForm && (
        <form onSubmit={createOrder} className="card space-y-3">
          <div className="grid gap-3">
            <div>
              <label className="label">Kaariger</label>
              <select className="input" value={form.kaarigerId} onChange={(e) => setForm({ ...form, kaarigerId: e.target.value })} required>
                <option value="">Select kaariger</option>
                {kaarigers.map((k) => (
                  <option key={k.phone} value={k.phone}>{k.name} ({k.phone})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Product Name</label>
              <input className="input" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} required />
            </div>
            <div>
              <label className="label">Target Quantity</label>
              <input className="input" type="number" value={form.targetQuantity} onChange={(e) => setForm({ ...form, targetQuantity: e.target.value })} required />
            </div>
            <div>
              <label className="label">Color</label>
              <input className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </div>
            <div>
              <label className="label">{form.pricingType === "PER_PIECE" ? "Price Per Piece (₹)" : "Total Deal Amount (₹)"}</label>
              <input className="input" type="number" value={form.totalDealAmount} onChange={(e) => setForm({ ...form, totalDealAmount: e.target.value })} required />
              {form.pricingType === "PER_PIECE" && Number(form.targetQuantity) > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  Total deal: ₹{previewTotal.toLocaleString("en-IN")} ({form.totalDealAmount || 0}/pc × {form.targetQuantity} pcs)
                </p>
              )}
            </div>
            <div>
              <label className="label">Pricing</label>
              <select className="input" value={form.pricingType} onChange={(e) => setForm({ ...form, pricingType: e.target.value as "OVERALL" | "PER_PIECE" })}>
                <option value="OVERALL">Overall deal</option>
                <option value="PER_PIECE">Per piece</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">Raw Materials</label>
              <button type="button" className="text-xs font-semibold text-navy-light" onClick={addMaterialRow}>+ Add material</button>
            </div>
            {form.selectedMaterials.map((row, i) => (
              <div key={i} className="mb-2 grid grid-cols-2 gap-2">
                <select
                  className="input"
                  value={row.materialId}
                  onChange={(e) => {
                    const next = [...form.selectedMaterials];
                    next[i] = { ...next[i], materialId: e.target.value };
                    setForm({ ...form, selectedMaterials: next });
                  }}
                >
                  <option value="">Material</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={(e) => {
                    const next = [...form.selectedMaterials];
                    next[i] = { ...next[i], quantity: e.target.value };
                    setForm({ ...form, selectedMaterials: next });
                  }}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary">Create Order</button>
        </form>
      )}

      <div className="space-y-4">
        <div className="card !p-0">
          <div className="scroll-table">
            <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-2">Product</th>
                <th className="py-2 pr-2">Kaariger</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2">Deal</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className={`cursor-pointer border-b border-slate-100 ${selectedOrder === o.id ? "bg-ice/30" : ""}`}
                  onClick={() => setSelectedOrder(o.id)}
                >
                  <td className="py-3 pr-2 font-medium">{o.productName}</td>
                  <td className="py-3 pr-2">{o.kaarigerName}</td>
                  <td className="py-3 pr-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{o.status.replace(/_/g, " ")}</span>
                    <p className="text-xs text-slate-500">{o.approvedQuantity}/{o.targetQuantity} pcs</p>
                  </td>
                  <td className="py-3">₹{o.totalDealAmount.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {selectedOrder && (
          <div className="card">
            {(() => {
              const o = orders.find((x) => x.id === selectedOrder)!;
              const paid = payments.reduce((s, p) => s + p.amount, 0);
              return (
                <>
                  <h2 className="font-bold text-navy">{o.productName}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {o.kaarigerName} · {o.approvedQuantity}/{o.targetQuantity} pcs approved
                    {o.status === "PENDING_APPROVAL" && o.deliveredQuantity ? ` · ${o.deliveredQuantity} awaiting approval` : ""}
                  </p>
                  {o.verifiedBy && (
                    <p className="mt-2 text-xs text-green-700">Last verified by {o.verifiedBy}</p>
                  )}
                  <p className="mt-3 text-sm">
                    Deal: ₹{o.totalDealAmount.toLocaleString("en-IN")}
                    {o.pricingType === "PER_PIECE" && o.pricePerPiece ? ` (₹${o.pricePerPiece}/pc)` : ""}
                    {" · "}Paid: ₹{paid.toLocaleString("en-IN")} · Balance: ₹{(o.totalDealAmount - paid).toLocaleString("en-IN")}
                  </p>
                  {o.rawMaterials.length > 0 && (
                    <>
                      <h3 className="mt-4 text-sm font-semibold">Raw Materials</h3>
                      <ul className="mt-2 space-y-1 text-sm">
                        {o.rawMaterials.map((m) => (
                          <li key={m.materialId}>
                            {m.materialName}: {m.quantity} {m.unit}
                            {m.usedQuantity != null && ` · Used: ${m.usedQuantity} · Left: ${m.remainingQuantity ?? 0}`}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  <h3 className="mt-4 text-sm font-semibold">Advance Payments</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {payments.map((p) => (
                      <li key={p.id}>₹{p.amount} on {p.date} {p.remarks && `— ${p.remarks}`}</li>
                    ))}
                    {payments.length === 0 && <li className="text-slate-500">No payments yet</li>}
                  </ul>

                  <form onSubmit={addPayment} className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input className="input" type="number" placeholder="Amount" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required />
                    <input className="input" placeholder="Remarks" value={paymentForm.remarks} onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })} />
                    <button type="submit" className="btn-primary whitespace-nowrap">Add</button>
                  </form>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
