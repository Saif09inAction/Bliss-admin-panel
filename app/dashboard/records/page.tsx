"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { KaarigerOrder, OrderApprovalRecord, PickupRecord, ReturnRecord } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

type Tab = "kaariger" | "approvals" | "pickups" | "returns";

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
    <div className="space-y-4">
      <PageToolbar actions={<button className="btn-secondary" onClick={exportCsv}>Export CSV</button>} />

      <AdminSearchBar value={search} onChange={setSearch} placeholder="Search records..." />

      <div className="flex flex-wrap gap-2">
        {(["kaariger", "approvals", "pickups", "returns"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`filter-pill ${tab === t ? "filter-pill-active" : ""}`}
          >
            {t === "approvals" ? "Approvals" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <p className="text-xs font-medium text-slate-500">{count} record{count !== 1 ? "s" : ""}</p>

      <div className="space-y-3">
        {tab === "kaariger" &&
          filteredOrders.map((o) => (
            <div key={o.id} className="record-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-brand">{o.productName}</p>
                  <p className="text-sm text-slate-500">{o.kaarigerName}</p>
                </div>
                <span className="rounded-full bg-[var(--bliss-green-surface)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--bliss-green-dark)]">
                  {statusLabel(o.status)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Field label="Progress" value={`${o.approvedQuantity} / ${o.targetQuantity} pcs`} />
                <Field label="Deal" value={`₹${o.totalDealAmount.toLocaleString("en-IN")}`} />
                <Field label="Verified By" value={o.verifiedBy || "—"} />
                {o.color && <Field label="Color" value={o.color} />}
              </div>
            </div>
          ))}

        {tab === "approvals" &&
          filteredApprovals.map((a) => (
            <div key={a.id} className="record-card">
              <p className="font-bold text-brand">{a.productName}</p>
              <p className="text-sm text-slate-500">{a.kaarigerName}</p>
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

        {tab === "pickups" &&
          filteredPickups.map((p) => (
            <div key={p.id} className="record-card">
              <p className="font-bold text-brand">
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

        {tab === "returns" &&
          filteredReturns.map((r) => (
            <div key={r.id} className="record-card">
              <p className="font-bold text-brand">
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

        {count === 0 && (
          <div className="card py-10 text-center text-sm text-slate-500">No records found.</div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="record-card-label">{label}</p>
      <p className="record-card-value">{value}</p>
    </div>
  );
}
