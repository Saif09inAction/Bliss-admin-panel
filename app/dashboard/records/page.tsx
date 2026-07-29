"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import {
  ArrowDownLeft,
  CheckCircle2,
  ClipboardList,
  Download,
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
              productName: data.productName as string,
              color: (data.color as string) || "",
              quantity: (data.quantity as number) || 0,
              partner: (data.partner as string) || "",
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
              productName: data.productName as string,
              color: (data.color as string) || "",
              quantity: (data.quantity as number) || 0,
              partner: (data.partner as string) || "",
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
        ["Product", "Color", "Qty", "Partner", "Staff", "Date", "Time"],
        pickups.map((p) => [p.productName, p.color, String(p.quantity), p.partner, p.staffName, p.date, p.time])
      );
    } else {
      downloadCsv(
        "returns.csv",
        ["Product", "Color", "Qty", "Partner", "Type", "Staff", "Date", "Notes"],
        returns.map((r) => [r.productName, r.color, String(r.quantity), r.partner, r.returnType, r.staffName, r.date, r.notes || ""])
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
        p.productName.toLowerCase().includes(q) ||
        p.partner.toLowerCase().includes(q) ||
        p.staffName.toLowerCase().includes(q)
    );
  }, [pickups, q]);

  const filteredReturns = useMemo(() => {
    if (!q) return returns;
    return returns.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        r.partner.toLowerCase().includes(q) ||
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
                  <span className={recordStatusBadge(o.status)}>{statusLabel(o.status)}</span>
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
                <p className="font-display font-bold">{a.productName}</p>
                <p className="text-sm text-[var(--text-muted)]">{a.kaarigerName}</p>
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
                    <th>Product</th>
                    <th>Color</th>
                    <th>Qty</th>
                    <th>Partner</th>
                    <th>Staff</th>
                    <th>Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPickups.map((p) => (
                    <tr key={p.id}>
                      <td className="font-semibold">{p.productName}</td>
                      <td>{p.color || "—"}</td>
                      <td>{p.quantity}</td>
                      <td className="text-[var(--text-muted)]">{p.partner}</td>
                      <td>{p.staffName}</td>
                      <td className="text-[var(--text-muted)]">{p.date} {p.time}</td>
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
                <p className="font-display font-bold">
                  {p.productName} {p.color ? `(${p.color})` : ""}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Field label="Partner" value={p.partner} />
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
                    <th>Product</th>
                    <th>Color</th>
                    <th>Qty</th>
                    <th>Type</th>
                    <th>Partner</th>
                    <th>Staff</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.map((r) => (
                    <tr key={r.id}>
                      <td className="font-semibold">{r.productName}</td>
                      <td>{r.color || "—"}</td>
                      <td>{r.quantity}</td>
                      <td><span className="badge badge-neutral">{r.returnType}</span></td>
                      <td className="text-[var(--text-muted)]">{r.partner}</td>
                      <td>{r.staffName}</td>
                      <td className="max-w-[200px] truncate text-[var(--text-muted)]">{r.notes || "—"}</td>
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
                <p className="font-display font-bold">
                  {r.productName} {r.color ? `(${r.color})` : ""}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Field label="Type" value={r.returnType} />
                  <Field label="Partner" value={r.partner} />
                  <Field label="Quantity" value={String(r.quantity)} />
                  <Field label="Staff" value={r.staffName} />
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
