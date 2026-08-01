"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import {
  ArrowDownLeft,
  ClipboardList,
  Download,
  Package,
  Pencil,
  ShoppingBag,
  Trash2,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { KaarigerOrder, OrderProductLine, PickupRecord, RepairLineItem, ReturnRecord } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

type Tab = "kaariger" | "pickups" | "returns";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "kaariger", label: "Kaariger", icon: ClipboardList },
  { id: "pickups", label: "Pickups", icon: Truck },
  { id: "returns", label: "Returns", icon: ArrowDownLeft },
];

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function recordStatusBadge(status: string) {
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

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export default function RecordsPage() {
  const [tab, setTab] = useState<Tab>("kaariger");
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [pickups, setPickups] = useState<PickupRecord[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [search, setSearch] = useState("");
  const [editPickup, setEditPickup] = useState<PickupRecord | null>(null);
  const [editReturn, setEditReturn] = useState<ReturnRecord | null>(null);
  const [editOrder, setEditOrder] = useState<KaarigerOrder | null>(null);
  const [viewOrder, setViewOrder] = useState<KaarigerOrder | null>(null);
  const [pickupForm, setPickupForm] = useState({
    quantity: "",
    partner: "",
    deliveryPartner: "",
    staffName: "",
    date: "",
    time: "",
  });
  const [returnForm, setReturnForm] = useState({
    quantity: "",
    partner: "",
    deliveryPartner: "",
    returnType: "",
    staffName: "",
    date: "",
    time: "",
    notes: "",
  });
  const [orderForm, setOrderForm] = useState({
    productName: "",
    targetQuantity: "",
    approvedQuantity: "",
    status: "",
    totalDealAmount: "",
    kaarigerName: "",
    notes: "",
  });

  useEffect(() => {
    async function load() {
      const db = getDb();
      const [oSnap, pSnap, rSnap] = await Promise.all([
        getDocs(collection(db, "kaariger_orders")),
        getDocs(collection(db, "pickup_records")),
        getDocs(collection(db, "return_records")),
      ]);

      setOrders(
        oSnap.docs
          .map((d) => {
            const data = d.data();
            const products = ((data.products as OrderProductLine[]) || []).map((p) => ({
              productName: p.productName,
              quantity: Number(p.quantity) || 0,
              pricePerPiece: Number(p.pricePerPiece) || 0,
              lineTotal: Number(p.lineTotal) || 0,
            }));
            const materialDeductions = ((data.materialDeductions as RepairLineItem[]) || []).map((it) => ({
              type: it.type,
              label: it.label,
              quantity: Number(it.quantity) || 0,
              pricePerPiece: Number(it.pricePerPiece) || 0,
              lineTotal: Number(it.lineTotal) || 0,
            }));
            return {
              id: (data.id as string) || d.id,
              kaarigerId: data.kaarigerId as string,
              kaarigerName: data.kaarigerName as string,
              productName: data.productName as string,
              targetQuantity: (data.targetQuantity as number) || 0,
              color: (data.color as string) || "",
              rawMaterials: [],
              totalDealAmount: (data.totalDealAmount as number) || 0,
              pricingType: (data.pricingType as "OVERALL" | "PER_PIECE") || "OVERALL",
              status: (data.status as string) === "APPROVED" ? "COMPLETED" : (data.status as string) || "",
              approvedQuantity: (data.approvedQuantity as number) || 0,
              deliveredQuantity: data.deliveredQuantity as number | undefined,
              verifiedBy: data.verifiedBy as string | undefined,
              createdBy: (data.createdBy as string) || "",
              createdAt: (data.createdAt as number) || 0,
              notes: data.notes as string | undefined,
              originalDealAmount: data.originalDealAmount as number | undefined,
              repairDeductionTotal: (data.repairDeductionTotal as number) || 0,
              products,
              productsTotal: data.productsTotal as number | undefined,
              materialDeductions,
              materialDeductionsTotal: data.materialDeductionsTotal as number | undefined,
              kharchaGiven: data.kharchaGiven as number | undefined,
            };
          })
          .sort((a, b) => b.createdAt - a.createdAt)
      );

      setPickups(
        pSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              productName: (data.productName as string) || "",
              color: (data.color as string) || "",
              quantity: (data.quantity as number) || 0,
              partner: (data.partner as string) || "",
              deliveryPartner: (data.deliveryPartner as string) || "",
              staffName: (data.staffName as string) || "",
              date: (data.date as string) || "",
              time: (data.time as string) || "",
            };
          })
          .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
      );

      setReturns(
        rSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              productName: (data.productName as string) || "",
              color: (data.color as string) || "",
              quantity: (data.quantity as number) || 0,
              partner: (data.partner as string) || "",
              deliveryPartner: (data.deliveryPartner as string) || "",
              returnType: (data.returnType as string) || "",
              staffName: (data.staffName as string) || "",
              date: (data.date as string) || "",
              time: (data.time as string) || "",
              notes: data.notes as string | undefined,
            };
          })
          .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
      );
    }
    load();
  }, []);

  function exportCsv() {
    if (tab === "kaariger") {
      downloadCsv(
        "kaariger_orders.csv",
        ["Product", "Kaariger", "Approved", "Target", "Status", "Verified By", "Deal"],
        orders.map((o) => [
          o.productName,
          o.kaarigerName,
          String(o.approvedQuantity),
          String(o.targetQuantity),
          o.status,
          o.verifiedBy || "",
          String(o.totalDealAmount),
        ])
      );
    } else if (tab === "pickups") {
      downloadCsv(
        "pickups.csv",
        ["Partner", "Delivery Partner", "Qty", "Staff", "Date", "Time"],
        pickups.map((p) => [p.partner, p.deliveryPartner, String(p.quantity), p.staffName, p.date, p.time])
      );
    } else {
      downloadCsv(
        "returns.csv",
        ["Type", "Partner", "Delivery Partner", "Qty", "Staff", "Date", "Time", "Notes"],
        returns.map((r) => [r.returnType, r.partner, r.deliveryPartner, String(r.quantity), r.staffName, r.date, r.time, r.notes || ""])
      );
    }
  }

  const q = search.trim().toLowerCase();
  const filteredOrders = useMemo(() => {
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.productName.toLowerCase().includes(q) ||
        o.kaarigerName.toLowerCase().includes(q) ||
        o.status.toLowerCase().includes(q)
    );
  }, [orders, q]);

  const filteredPickups = useMemo(() => {
    if (!q) return pickups;
    return pickups.filter(
      (p) =>
        p.partner.toLowerCase().includes(q) ||
        p.deliveryPartner.toLowerCase().includes(q) ||
        p.staffName.toLowerCase().includes(q)
    );
  }, [pickups, q]);

  const filteredReturns = useMemo(() => {
    if (!q) return returns;
    return returns.filter(
      (r) =>
        r.partner.toLowerCase().includes(q) ||
        r.deliveryPartner.toLowerCase().includes(q) ||
        r.staffName.toLowerCase().includes(q) ||
        r.returnType.toLowerCase().includes(q)
    );
  }, [returns, q]);

  const count =
    tab === "kaariger"
      ? filteredOrders.length
      : tab === "pickups"
        ? filteredPickups.length
        : filteredReturns.length;

  function openPickupEdit(p: PickupRecord) {
    setEditPickup(p);
    setPickupForm({
      quantity: String(p.quantity),
      partner: p.partner,
      deliveryPartner: p.deliveryPartner,
      staffName: p.staffName,
      date: p.date,
      time: p.time,
    });
  }

  async function savePickup(e: React.FormEvent) {
    e.preventDefault();
    if (!editPickup) return;
    await setDoc(
      doc(getDb(), "pickup_records", editPickup.id),
      {
        quantity: Number(pickupForm.quantity) || 0,
        partner: pickupForm.partner.trim(),
        deliveryPartner: pickupForm.deliveryPartner.trim(),
        staffName: pickupForm.staffName.trim(),
        date: pickupForm.date,
        time: pickupForm.time,
      },
      { merge: true }
    );
    setEditPickup(null);
    const snap = await getDocs(collection(getDb(), "pickup_records"));
    setPickups(
      snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            productName: (data.productName as string) || "",
            color: (data.color as string) || "",
            quantity: (data.quantity as number) || 0,
            partner: (data.partner as string) || "",
            deliveryPartner: (data.deliveryPartner as string) || "",
            staffName: (data.staffName as string) || "",
            date: (data.date as string) || "",
            time: (data.time as string) || "",
          };
        })
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    );
  }

  function openReturnEdit(r: ReturnRecord) {
    setEditReturn(r);
    setReturnForm({
      quantity: String(r.quantity),
      partner: r.partner,
      deliveryPartner: r.deliveryPartner,
      returnType: r.returnType,
      staffName: r.staffName,
      date: r.date,
      time: r.time,
      notes: r.notes || "",
    });
  }

  async function saveReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!editReturn) return;
    await setDoc(
      doc(getDb(), "return_records", editReturn.id),
      {
        quantity: Number(returnForm.quantity) || 0,
        partner: returnForm.partner.trim(),
        deliveryPartner: returnForm.deliveryPartner.trim(),
        returnType: returnForm.returnType.trim(),
        staffName: returnForm.staffName.trim(),
        date: returnForm.date,
        time: returnForm.time,
        notes: returnForm.notes.trim(),
      },
      { merge: true }
    );
    setEditReturn(null);
    const snap = await getDocs(collection(getDb(), "return_records"));
    setReturns(
      snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            productName: (data.productName as string) || "",
            color: (data.color as string) || "",
            quantity: (data.quantity as number) || 0,
            partner: (data.partner as string) || "",
            deliveryPartner: (data.deliveryPartner as string) || "",
            returnType: (data.returnType as string) || "",
            staffName: (data.staffName as string) || "",
            date: (data.date as string) || "",
            time: (data.time as string) || "",
            notes: data.notes as string | undefined,
          };
        })
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    );
  }

  function openOrderEdit(o: KaarigerOrder) {
    setEditOrder(o);
    setOrderForm({
      productName: o.productName,
      targetQuantity: String(o.targetQuantity),
      approvedQuantity: String(o.approvedQuantity),
      status: o.status,
      totalDealAmount: String(o.totalDealAmount || ""),
      kaarigerName: o.kaarigerName,
      notes: o.notes || "",
    });
  }

  async function saveOrderRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrder) return;
    await setDoc(
      doc(getDb(), "kaariger_orders", editOrder.id),
      {
        productName: orderForm.productName.trim(),
        targetQuantity: Number(orderForm.targetQuantity) || 0,
        approvedQuantity: Number(orderForm.approvedQuantity) || 0,
        status: orderForm.status,
        totalDealAmount: Number(orderForm.totalDealAmount) || 0,
        kaarigerName: orderForm.kaarigerName.trim(),
        notes: orderForm.notes.trim(),
      },
      { merge: true }
    );
    setEditOrder(null);
    // refresh orders list in place
    setOrders((prev) =>
      prev.map((o) =>
        o.id === editOrder.id
          ? {
              ...o,
              productName: orderForm.productName.trim(),
              targetQuantity: Number(orderForm.targetQuantity) || 0,
              approvedQuantity: Number(orderForm.approvedQuantity) || 0,
              status: orderForm.status,
              totalDealAmount: Number(orderForm.totalDealAmount) || 0,
              kaarigerName: orderForm.kaarigerName.trim(),
              notes: orderForm.notes.trim() || undefined,
            }
          : o
      )
    );
  }


  async function deleteOrderRecord(o: KaarigerOrder) {
    if (!confirm(`Delete order "${o.productName}" for ${o.kaarigerName}? Related payments/repairs will also be removed.`)) return;
    const db = getDb();
    await deleteDoc(doc(db, "kaariger_orders", o.id));
    try {
      const [paySnap, repairSnap, approvalSnap] = await Promise.all([
        getDocs(query(collection(db, "kaariger_payments"), where("orderId", "==", o.id))),
        getDocs(query(collection(db, "order_repairs"), where("orderId", "==", o.id))),
        getDocs(query(collection(db, "order_approval_records"), where("orderId", "==", o.id))),
      ]);
      await Promise.all([
        ...paySnap.docs.map((d) => deleteDoc(d.ref)),
        ...repairSnap.docs.map((d) => deleteDoc(d.ref)),
        ...approvalSnap.docs.map((d) => deleteDoc(d.ref)),
      ]);
    } catch {
      // best-effort related cleanup
    }
    setOrders((prev) => prev.filter((x) => x.id !== o.id));
    if (editOrder?.id === o.id) setEditOrder(null);
    if (viewOrder?.id === o.id) setViewOrder(null);
  }

  async function deletePickupRecord(rec: PickupRecord) {
    if (!confirm(`Delete pickup of ${rec.quantity} pcs via ${rec.partner}?`)) return;
    await deleteDoc(doc(getDb(), "pickup_records", rec.id));
    setPickups((prev) => prev.filter((x) => x.id !== rec.id));
    if (editPickup?.id === rec.id) setEditPickup(null);
  }

  async function deleteReturnRecord(rec: ReturnRecord) {
    if (!confirm(`Delete return of ${rec.quantity} pcs via ${rec.partner}?`)) return;
    await deleteDoc(doc(getDb(), "return_records", rec.id));
    setReturns((prev) => prev.filter((x) => x.id !== rec.id));
    if (editReturn?.id === rec.id) setEditReturn(null);
  }

  return (
    <div className="stagger space-y-5">
      <PageToolbar
        title="Records"
        actions={
          <button type="button" className="btn btn-secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        }
      >
        <p className="section-sub">{count} record{count !== 1 ? "s" : ""}</p>
      </PageToolbar>

      <AdminSearchBar value={search} onChange={setSearch} placeholder="Search records..." />

      <div className="mobile-chip-scroll flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`filter-pill gap-1.5 ${tab === id ? "active" : ""}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Kaariger orders — table on desktop, cards on mobile. Click a row to see the full bill breakdown. */}
      {tab === "kaariger" && (
        <>
          <div className="data-table-wrap hidden lg:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Kaariger</th>
                    <th>Progress</th>
                    <th className="text-right">Deal</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="cursor-pointer" onClick={() => setViewOrder(o)}>
                      <td>
                        <p className="font-semibold">{o.productName}</p>
                        {o.color && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{o.color}</p>}
                      </td>
                      <td className="text-[var(--text-muted)]">{o.kaarigerName}</td>
                      <td>{o.approvedQuantity} / {o.targetQuantity} pcs</td>
                      <td className="text-right font-semibold">₹{o.totalDealAmount.toLocaleString("en-IN")}</td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openOrderEdit(o)} aria-label="Edit">
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deleteOrderRecord(o)} aria-label="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredOrders.length === 0 && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">No records found.</p>
            )}
          </div>
          <div className="space-y-3 lg:hidden">
            {filteredOrders.map((o) => (
              <button
                key={o.id}
                type="button"
                className="record-card block w-full text-left"
                onClick={() => setViewOrder(o)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display font-bold">{o.productName}</p>
                    <p className="text-sm text-[var(--text-muted)]">{o.kaarigerName}</p>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openOrderEdit(o)} aria-label="Edit">
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deleteOrderRecord(o)} aria-label="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Field label="Progress" value={`${o.approvedQuantity} / ${o.targetQuantity} pcs`} />
                  <Field label="Deal" value={`₹${o.totalDealAmount.toLocaleString("en-IN")}`} />
                  {o.color && <Field label="Color" value={o.color} />}
                </div>
              </button>
            ))}
            {filteredOrders.length === 0 && (
              <div className="card py-10 text-center text-sm text-[var(--text-muted)]">No records found.</div>
            )}
          </div>
        </>
      )}

      {/* Pickups */}
      {tab === "pickups" && (
        <>
          <div className="data-table-wrap hidden lg:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Delivery Partner</th>
                    <th>Qty</th>
                    <th>Staff</th>
                    <th>Date & Time</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPickups.map((p) => (
                    <tr key={p.id}>
                      <td className="font-semibold">{p.partner || "—"}</td>
                      <td className="text-[var(--text-muted)]">{p.deliveryPartner || "—"}</td>
                      <td>{p.quantity}</td>
                      <td>{p.staffName}</td>
                      <td className="text-[var(--text-muted)]">{p.date} {p.time}</td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openPickupEdit(p)} aria-label="Edit">
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deletePickupRecord(p)} aria-label="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredPickups.length === 0 && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">No records found.</p>
            )}
          </div>
          <div className="space-y-3 lg:hidden">
            {filteredPickups.map((p) => (
              <div key={p.id} className="record-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-bold">{p.partner || "—"}</p>
                  <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openPickupEdit(p)} aria-label="Edit">
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deletePickupRecord(p)} aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Field label="Delivery Partner" value={p.deliveryPartner || "—"} />
                  <Field label="Quantity" value={String(p.quantity)} />
                  <Field label="Staff" value={p.staffName} />
                  <Field label="Date" value={`${p.date} ${p.time}`} />
                </div>
              </div>
            ))}
            {filteredPickups.length === 0 && (
              <div className="card py-10 text-center text-sm text-[var(--text-muted)]">No records found.</div>
            )}
          </div>
        </>
      )}

      {/* Returns */}
      {tab === "returns" && (
        <>
          <div className="data-table-wrap hidden lg:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Partner</th>
                    <th>Delivery Partner</th>
                    <th>Qty</th>
                    <th>Staff</th>
                    <th>Date & Time</th>
                    <th>Notes</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.map((r) => (
                    <tr key={r.id}>
                      <td><span className="badge badge-neutral">{r.returnType}</span></td>
                      <td className="font-semibold">{r.partner || "—"}</td>
                      <td className="text-[var(--text-muted)]">{r.deliveryPartner || "—"}</td>
                      <td>{r.quantity}</td>
                      <td>{r.staffName}</td>
                      <td className="text-[var(--text-muted)]">{r.date} {r.time}</td>
                      <td className="max-w-[200px] truncate text-[var(--text-muted)]">{r.notes || "—"}</td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openReturnEdit(r)} aria-label="Edit">
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deleteReturnRecord(r)} aria-label="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredReturns.length === 0 && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">No records found.</p>
            )}
          </div>
          <div className="space-y-3 lg:hidden">
            {filteredReturns.map((r) => (
              <div key={r.id} className="record-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-bold">{r.partner || "—"}</p>
                  <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openReturnEdit(r)} aria-label="Edit">
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deleteReturnRecord(r)} aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Field label="Type" value={r.returnType} />
                  <Field label="Delivery Partner" value={r.deliveryPartner || "—"} />
                  <Field label="Quantity" value={String(r.quantity)} />
                  <Field label="Staff" value={r.staffName} />
                  <Field label="Date" value={`${r.date} ${r.time}`} />
                  {r.notes && <Field label="Notes" value={r.notes} />}
                </div>
              </div>
            ))}
            {filteredReturns.length === 0 && (
              <div className="card py-10 text-center text-sm text-[var(--text-muted)]">No records found.</div>
            )}
          </div>
        </>
      )}

      {viewOrder && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setViewOrder(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="surface !overflow-y-auto max-h-[90vh] w-full max-w-2xl space-y-5 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold">{viewOrder.productName}</h3>
                    <span className={recordStatusBadge(viewOrder.status)}>{statusLabel(viewOrder.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {viewOrder.kaarigerName} · {viewOrder.approvedQuantity}/{viewOrder.targetQuantity} pcs
                  </p>
                  {viewOrder.verifiedBy && (
                    <p className="mt-1 text-xs text-[var(--jade-deep)]">Last verified by {viewOrder.verifiedBy}</p>
                  )}
                </div>
                <button type="button" className="btn-icon shrink-0" onClick={() => setViewOrder(null)} aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="stat-card !p-3">
                  <p className="stat-card-label">Deal Amount</p>
                  <p className="stat-card-value !text-xl">
                    ₹{(viewOrder.originalDealAmount ?? viewOrder.totalDealAmount).toLocaleString("en-IN")}
                  </p>
                  {(viewOrder.repairDeductionTotal || 0) > 0 && (
                    <p className="mt-0.5 text-xs text-danger">
                      Repair −₹{(viewOrder.repairDeductionTotal || 0).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
                <div className="stat-card !p-3">
                  <p className="stat-card-label">Created</p>
                  <p className="stat-card-value !text-xl">
                    {new Date(viewOrder.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">by {viewOrder.createdBy}</p>
                </div>
              </div>

              {viewOrder.products && viewOrder.products.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <ShoppingBag className="h-4 w-4 text-[var(--text-muted)]" />
                    Products
                  </h4>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>₹/pc</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewOrder.products.map((p, i) => (
                          <tr key={i}>
                            <td className="font-medium">{p.productName}</td>
                            <td>{p.quantity}</td>
                            <td>₹{p.pricePerPiece}</td>
                            <td className="text-right font-semibold">{money(p.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-jade-soft/50 px-3 py-2 text-sm">
                    <span className="font-semibold text-jade-deep">Products Total</span>
                    <span className="font-bold text-jade-deep">{money(viewOrder.productsTotal ?? 0)}</span>
                  </div>
                </div>
              )}

              {viewOrder.materialDeductions && viewOrder.materialDeductions.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Wrench className="h-4 w-4 text-[var(--text-muted)]" />
                    Runner / Fitting / Astar / Material
                  </h4>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>₹/pc</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewOrder.materialDeductions.map((it, i) => (
                          <tr key={i}>
                            <td className="font-medium">{it.label}</td>
                            <td>{it.quantity}</td>
                            <td>₹{it.pricePerPiece}</td>
                            <td className="text-right font-semibold text-danger">−{money(it.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-[var(--surface-mist)] px-3 py-2 text-sm">
                    <span className="font-medium text-[var(--text-muted)]">Deductions Total</span>
                    <span className="font-bold text-danger">−{money(viewOrder.materialDeductionsTotal ?? 0)}</span>
                  </div>
                </div>
              )}

              {(viewOrder.kharchaGiven || 0) > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-[var(--text-muted)]">
                    <Package className="h-3.5 w-3.5" />
                    Kharcha given at creation
                  </span>
                  <span className="font-bold">{money(viewOrder.kharchaGiven || 0)}</span>
                </div>
              )}

              {viewOrder.notes && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold">Notes</h4>
                  <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-2.5 text-sm text-[var(--text-muted)]">
                    {viewOrder.notes}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => {
                    openOrderEdit(viewOrder);
                    setViewOrder(null);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  className="btn flex-1 !bg-danger/10 !text-danger hover:!bg-danger/20"
                  onClick={() => deleteOrderRecord(viewOrder)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {editPickup && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditPickup(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form onSubmit={savePickup} className="surface w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-lg font-bold">Edit pickup</h3>
              {(["quantity", "partner", "deliveryPartner", "staffName", "date", "time"] as const).map((key) => (
                <div key={key}>
                  <label className="label capitalize">{key.replace(/([A-Z])/g, " $1")}</label>
                  <input
                    className="input"
                    type={key === "quantity" ? "number" : "text"}
                    value={pickupForm[key]}
                    onChange={(e) => setPickupForm({ ...pickupForm, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditPickup(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary flex-1">Save</button>
              </div>
            </form>
          </div>
        </>
      )}

      {editReturn && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditReturn(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form onSubmit={saveReturn} className="surface !overflow-y-auto max-h-[90vh] w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-lg font-bold">Edit return</h3>
              {(["quantity", "partner", "deliveryPartner", "returnType", "staffName", "date", "time", "notes"] as const).map((key) => (
                <div key={key}>
                  <label className="label capitalize">{key.replace(/([A-Z])/g, " $1")}</label>
                  <input
                    className="input"
                    type={key === "quantity" ? "number" : "text"}
                    value={returnForm[key]}
                    onChange={(e) => setReturnForm({ ...returnForm, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditReturn(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary flex-1">Save</button>
              </div>
            </form>
          </div>
        </>
      )}

      {editOrder && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditOrder(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form onSubmit={saveOrderRecord} className="surface w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-lg font-bold">Edit order record</h3>
              <div>
                <label className="label">Product / SKU</label>
                <input className="input" value={orderForm.productName} onChange={(e) => setOrderForm({ ...orderForm, productName: e.target.value })} />
              </div>
              <div>
                <label className="label">Kaariger name</label>
                <input className="input" value={orderForm.kaarigerName} onChange={(e) => setOrderForm({ ...orderForm, kaarigerName: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Target</label>
                  <input className="input" type="number" value={orderForm.targetQuantity} onChange={(e) => setOrderForm({ ...orderForm, targetQuantity: e.target.value })} />
                </div>
                <div>
                  <label className="label">Approved</label>
                  <input className="input" type="number" value={orderForm.approvedQuantity} onChange={(e) => setOrderForm({ ...orderForm, approvedQuantity: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={orderForm.status} onChange={(e) => setOrderForm({ ...orderForm, status: e.target.value })}>
                  {["ASSIGNED", "PENDING_APPROVAL", "COMPLETED", "CANCELLED"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Deal ₹</label>
                <input className="input" type="number" value={orderForm.totalDealAmount} onChange={(e) => setOrderForm({ ...orderForm, totalDealAmount: e.target.value })} />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditOrder(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary flex-1">Save</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
