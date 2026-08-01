"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import {
  ArrowDownLeft,
  CheckCircle2,
  ClipboardList,
  Download,
  Pencil,
  Trash2,
  Truck,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { KaarigerOrder, OrderApprovalRecord, PickupRecord, ReturnRecord } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

type Tab = "kaariger" | "approvals" | "pickups" | "returns";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "kaariger", label: "Kaariger", icon: ClipboardList },
  { id: "approvals", label: "Approvals", icon: CheckCircle2 },
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

export default function RecordsPage() {
  const [tab, setTab] = useState<Tab>("kaariger");
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [approvals, setApprovals] = useState<OrderApprovalRecord[]>([]);
  const [pickups, setPickups] = useState<PickupRecord[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [search, setSearch] = useState("");
  const [editPickup, setEditPickup] = useState<PickupRecord | null>(null);
  const [editReturn, setEditReturn] = useState<ReturnRecord | null>(null);
  const [editOrder, setEditOrder] = useState<KaarigerOrder | null>(null);
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
      const [oSnap, aSnap, pSnap, rSnap] = await Promise.all([
        getDocs(collection(db, "kaariger_orders")),
        getDocs(collection(db, "order_approval_records")),
        getDocs(collection(db, "pickup_records")),
        getDocs(collection(db, "return_records")),
      ]);

      setOrders(
        oSnap.docs
          .map((d) => {
            const data = d.data();
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
            };
          })
          .sort((a, b) => b.createdAt - a.createdAt)
      );

      setApprovals(
        aSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              orderId: data.orderId as string,
              productName: data.productName as string,
              kaarigerId: data.kaarigerId as string,
              kaarigerName: data.kaarigerName as string,
              batchQuantity: (data.batchQuantity as number) || 0,
              approvedTotalAfter: (data.approvedTotalAfter as number) || 0,
              targetQuantity: (data.targetQuantity as number) || 0,
              color: (data.color as string) || "",
              verifiedByName: data.verifiedByName as string,
              verifiedByPhone: data.verifiedByPhone as string,
              verifiedAt: (data.verifiedAt as number) || 0,
            };
          })
          .sort((a, b) => b.verifiedAt - a.verifiedAt)
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
    } else if (tab === "approvals") {
      downloadCsv(
        "approval_history.csv",
        ["Product", "Kaariger", "Batch Qty", "Progress", "Approved By", "Phone", "Date"],
        approvals.map((a) => [
          a.productName,
          a.kaarigerName,
          String(a.batchQuantity),
          `${a.approvedTotalAfter}/${a.targetQuantity}`,
          a.verifiedByName,
          a.verifiedByPhone,
          new Date(a.verifiedAt).toISOString(),
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

  const filteredApprovals = useMemo(() => {
    if (!q) return approvals;
    return approvals.filter(
      (a) =>
        a.productName.toLowerCase().includes(q) ||
        a.kaarigerName.toLowerCase().includes(q) ||
        a.verifiedByName.toLowerCase().includes(q)
    );
  }, [approvals, q]);

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
      : tab === "approvals"
        ? filteredApprovals.length
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
    if (!confirm(`Delete order "${o.productName}" for ${o.kaarigerName}? Related payments/repairs/approvals will also be removed.`)) return;
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
      if (approvalSnap.size) {
        setApprovals((prev) => prev.filter((a) => a.orderId !== o.id));
      }
    } catch {
      // best-effort related cleanup
    }
    setOrders((prev) => prev.filter((x) => x.id !== o.id));
    if (editOrder?.id === o.id) setEditOrder(null);
  }

  async function deleteApprovalRecord(a: OrderApprovalRecord) {
    if (!confirm(`Delete approval record for "${a.productName}"?`)) return;
    await deleteDoc(doc(getDb(), "order_approval_records", a.id));
    setApprovals((prev) => prev.filter((x) => x.id !== a.id));
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

      {/* Kaariger orders — table on desktop, cards on mobile */}
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
                    <th>Status</th>
                    <th>Verified By</th>
                    <th className="text-right">Deal</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <p className="font-semibold">{o.productName}</p>
                        {o.color && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{o.color}</p>}
                      </td>
                      <td className="text-[var(--text-muted)]">{o.kaarigerName}</td>
                      <td>{o.approvedQuantity} / {o.targetQuantity} pcs</td>
                      <td><span className={recordStatusBadge(o.status)}>{statusLabel(o.status)}</span></td>
                      <td className="text-[var(--text-muted)]">{o.verifiedBy || "—"}</td>
                      <td className="text-right font-semibold">₹{o.totalDealAmount.toLocaleString("en-IN")}</td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1">
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
              <div key={o.id} className="record-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display font-bold">{o.productName}</p>
                    <p className="text-sm text-[var(--text-muted)]">{o.kaarigerName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={recordStatusBadge(o.status)}>{statusLabel(o.status)}</span>
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
                  <Field label="Verified By" value={o.verifiedBy || "—"} />
                  {o.color && <Field label="Color" value={o.color} />}
                </div>
              </div>
            ))}
            {filteredOrders.length === 0 && (
              <div className="card py-10 text-center text-sm text-[var(--text-muted)]">No records found.</div>
            )}
          </div>
        </>
      )}

      {/* Approvals */}
      {tab === "approvals" && (
        <>
          <div className="data-table-wrap hidden lg:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Kaariger</th>
                    <th>Batch</th>
                    <th>Progress</th>
                    <th>Approved By</th>
                    <th>Date</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApprovals.map((a) => (
                    <tr key={a.id}>
                      <td className="font-semibold">{a.productName}</td>
                      <td className="text-[var(--text-muted)]">{a.kaarigerName}</td>
                      <td>{a.batchQuantity} pcs</td>
                      <td>{a.approvedTotalAfter}/{a.targetQuantity}</td>
                      <td>
                        <p>{a.verifiedByName}</p>
                        <p className="text-xs text-[var(--text-muted)]">{a.verifiedByPhone}</p>
                      </td>
                      <td className="text-[var(--text-muted)]">
                        {new Date(a.verifiedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="text-right">
                        <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deleteApprovalRecord(a)} aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredApprovals.length === 0 && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">No records found.</p>
            )}
          </div>
          <div className="space-y-3 lg:hidden">
            {filteredApprovals.map((a) => (
              <div key={a.id} className="record-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display font-bold">{a.productName}</p>
                    <p className="text-sm text-[var(--text-muted)]">{a.kaarigerName}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-icon !h-8 !w-8 !text-danger"
                    onClick={() => deleteApprovalRecord(a)}
                    aria-label="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Field label="Batch" value={`${a.batchQuantity} pcs`} />
                  <Field label="Progress" value={`${a.approvedTotalAfter}/${a.targetQuantity}`} />
                  <Field label="Approved By" value={a.verifiedByName} />
                  <Field
                    label="Date"
                    value={new Date(a.verifiedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  />
                </div>
              </div>
            ))}
            {filteredApprovals.length === 0 && (
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
            <form onSubmit={saveReturn} className="surface max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
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
