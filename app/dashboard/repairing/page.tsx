"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Wrench } from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { OrderRepair, RepairLineItem } from "@/lib/types";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatDate(ts: number) {
  return ts ? new Date(ts).toLocaleDateString("en-IN") : "—";
}

function formatTime(ts: number) {
  return ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function RepairingPage() {
  const [repairs, setRepairs] = useState<OrderRepair[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(getDb(), "order_repairs"), (snap) => {
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
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return repairs;
    return repairs.filter(
      (r) =>
        r.kaarigerName.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.createdBy.toLowerCase().includes(q)
    );
  }, [repairs, search]);

  const totalDeducted = useMemo(() => repairs.reduce((s, r) => s + r.totalRepairCost, 0), [repairs]);

  return (
    <div className="space-y-5">
      <PageToolbar title="Repairing">
        <p className="section-sub">
          Faulty / rejected quantities updated by staff — automatically deducted from each kaariger&apos;s bill
        </p>
      </PageToolbar>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="stat-card">
          <p className="stat-card-label">Total Updates</p>
          <p className="stat-card-value">{repairs.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Total Deducted</p>
          <p className="stat-card-value text-danger">{money(totalDeducted)}</p>
        </div>
      </div>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by kaariger, product or staff name…"
      />

      {filtered.length === 0 ? (
        <div className="surface flex flex-col items-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-jade-soft text-jade-deep">
            <Wrench size={22} />
          </div>
          <p className="mt-3 font-semibold">No repairing updates yet</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Entries staff record from the mobile app&apos;s Repairing section will show up here.
          </p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kaariger</th>
                <th>Product</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Amount</th>
                <th>Updated By</th>
                <th>Date</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.kaarigerName || "—"}</td>
                  <td>{r.productName || "—"}</td>
                  <td className="text-right">{r.faultyQuantity}</td>
                  <td className="text-right">
                    <span className="font-semibold text-danger">−{money(r.totalRepairCost)}</span>
                    <span className="ml-1.5 text-xs text-[var(--text-faint)]">
                      left {money(r.dealAfterThisRepair)}
                    </span>
                  </td>
                  <td className="text-[var(--text-muted)]">{r.createdBy || "—"}</td>
                  <td className="text-[var(--text-muted)]">{formatDate(r.createdAt)}</td>
                  <td className="text-[var(--text-muted)]">{formatTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
