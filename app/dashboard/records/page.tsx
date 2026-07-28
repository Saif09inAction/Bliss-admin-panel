"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { KaarigerOrder, PickupRecord, ReturnRecord } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";

type Tab = "kaariger" | "pickups" | "returns";

export default function RecordsPage() {
  const [tab, setTab] = useState<Tab>("kaariger");
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [pickups, setPickups] = useState<PickupRecord[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);

  useEffect(() => {
    async function load() {
      const db = getDb();
      const [oSnap, pSnap, rSnap] = await Promise.all([
        getDocs(collection(db, "kaariger_orders")),
        getDocs(collection(db, "pickup_records")),
        getDocs(collection(db, "return_records")),
      ]);

      setOrders(
        oSnap.docs.map((d) => {
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
            status: (data.status as string) === "APPROVED" ? "COMPLETED" : ((data.status as string) || ""),
            approvedQuantity: (data.approvedQuantity as number) || 0,
            deliveredQuantity: data.deliveredQuantity as number | undefined,
            verifiedBy: data.verifiedBy as string | undefined,
            createdBy: (data.createdBy as string) || "",
            createdAt: (data.createdAt as number) || 0,
          };
        }).sort((a, b) => b.createdAt - a.createdAt)
      );

      setPickups(
        pSnap.docs.map((d) => {
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
            timestamp: (data.timestamp as number) || 0,
          };
        }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      );

      setReturns(
        rSnap.docs.map((d) => {
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
            timestamp: (data.timestamp as number) || 0,
          };
        }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
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

  return (
    <div className="space-y-4">
      <PageToolbar
        actions={<button className="btn-secondary" onClick={exportCsv}>Export CSV</button>}
      />

      <div className="flex flex-wrap gap-2">
        {(["kaariger", "pickups", "returns"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? "bg-navy text-white" : "bg-slate-200"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="card !p-0">
        <div className="scroll-table">
        {tab === "kaariger" && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Kaariger</th>
                <th className="py-2 pr-3">Progress</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Verified By</th>
                <th className="py-2">Deal</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100">
                  <td className="py-3 pr-3">{o.productName}</td>
                  <td className="py-3 pr-3">{o.kaarigerName}</td>
                  <td className="py-3 pr-3">{o.approvedQuantity}/{o.targetQuantity}</td>
                  <td className="py-3 pr-3">{o.status.replace(/_/g, " ")}</td>
                  <td className="py-3 pr-3">{o.verifiedBy || "—"}</td>
                  <td className="py-3">₹{o.totalDealAmount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "pickups" && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Partner</th>
                <th className="py-2 pr-3">Qty</th>
                <th className="py-2 pr-3">Staff</th>
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {pickups.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-3 pr-3">{p.productName} ({p.color})</td>
                  <td className="py-3 pr-3">{p.partner}</td>
                  <td className="py-3 pr-3">{p.quantity}</td>
                  <td className="py-3 pr-3">{p.staffName}</td>
                  <td className="py-3">{p.date} {p.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "returns" && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-3 pr-3">Partner</th>
                <th className="py-2 pr-3">Qty</th>
                <th className="py-2">Staff</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-3 pr-3">{r.productName} ({r.color})</td>
                  <td className="py-3 pr-3">{r.returnType}</td>
                  <td className="py-3 pr-3">{r.partner}</td>
                  <td className="py-3 pr-3">{r.quantity}</td>
                  <td className="py-3">{r.staffName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </div>
  );
}
