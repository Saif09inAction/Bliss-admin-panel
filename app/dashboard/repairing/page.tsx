"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { Check, Pencil, Trash2, Wrench, X } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { OrderRepair, RepairLineItem, RepairStatus } from "@/lib/types";
import { formatRupee } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

const money = formatRupee;

function formatDate(ts: number) {
  return ts ? new Date(ts).toLocaleDateString("en-IN") : "—";
}

function formatTime(ts: number) {
  return ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
}

/** Older docs without status were already deducted — treat them as APPROVED. */
function repairStatus(r: OrderRepair): RepairStatus {
  return r.status || "APPROVED";
}

function isApproved(r: OrderRepair) {
  return repairStatus(r) === "APPROVED";
}

function parseRepair(d: { id: string; data: () => Record<string, unknown> }): OrderRepair {
  const data = d.data();
  const rawStatus = data.status as string | undefined;
  const status: RepairStatus | undefined =
    rawStatus === "PENDING" || rawStatus === "APPROVED" || rawStatus === "REJECTED"
      ? rawStatus
      : undefined;
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
    status,
    reviewedBy: data.reviewedBy as string | undefined,
    reviewedAt: data.reviewedAt as number | undefined,
  };
}

/** Recalculate order.repairDeductionTotal from APPROVED repairs only. */
async function syncOrderRepairTotal(orderId: string) {
  if (!orderId) return;
  const db = getDb();
  const [orderSnap, repairSnap] = await Promise.all([
    getDoc(doc(db, "kaariger_orders", orderId)),
    getDocs(query(collection(db, "order_repairs"), where("orderId", "==", orderId))),
  ]);
  if (!orderSnap.exists()) return;

  const orderData = orderSnap.data();
  const original =
    (orderData.originalDealAmount as number) ?? (orderData.totalDealAmount as number) ?? 0;

  const approved = repairSnap.docs.filter((d) => {
    const s = d.data().status as string | undefined;
    return !s || s === "APPROVED";
  });
  const totalDeduction = approved.reduce(
    (sum, d) => sum + ((d.data().totalRepairCost as number) || 0),
    0
  );
  const dealAfter = Math.max(0, original - totalDeduction);

  await updateDoc(doc(db, "kaariger_orders", orderId), {
    originalDealAmount: original,
    repairDeductionTotal: totalDeduction,
  });

  await Promise.all(
    approved.map((d) =>
      updateDoc(d.ref, { dealAfterThisRepair: dealAfter, originalDealAmount: original })
    )
  );
}

type FilterTab = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

export default function RepairingPage() {
  const { session } = useAuth();
  const [repairs, setRepairs] = useState<OrderRepair[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("PENDING");
  const [editRepair, setEditRepair] = useState<OrderRepair | null>(null);
  const [editForm, setEditForm] = useState({
    productName: "",
    faultyQuantity: "",
    faultyPricePerPiece: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(getDb(), "order_repairs"), (snap) => {
      setRepairs(
        snap.docs
          .map((d) => parseRepair(d as { id: string; data: () => Record<string, unknown> }))
          .sort((a, b) => b.createdAt - a.createdAt)
      );
    });
    return () => unsub();
  }, []);

  const pendingCount = useMemo(
    () => repairs.filter((r) => repairStatus(r) === "PENDING").length,
    [repairs]
  );
  const approvedTotal = useMemo(
    () => repairs.filter(isApproved).reduce((s, r) => s + r.totalRepairCost, 0),
    [repairs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repairs.filter((r) => {
      const status = repairStatus(r);
      const matchTab = tab === "ALL" || status === tab;
      const matchSearch =
        !q ||
        r.kaarigerName.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.createdBy.toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }, [repairs, search, tab]);

  function openEdit(r: OrderRepair) {
    setEditRepair(r);
    setMsg("");
    setEditForm({
      productName: r.productName,
      faultyQuantity: String(r.faultyQuantity || ""),
      faultyPricePerPiece: String(r.faultyPricePerPiece || ""),
      notes: r.notes || "",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRepair) return;
    const qty = Number(editForm.faultyQuantity) || 0;
    const price = Number(editForm.faultyPricePerPiece) || 0;
    const productName = editForm.productName.trim();
    if (!productName) {
      setMsg("Product name is required.");
      return;
    }
    if (qty <= 0) {
      setMsg("Quantity must be greater than 0.");
      return;
    }
    if (price < 0) {
      setMsg("Price cannot be negative.");
      return;
    }

    const faultyTotal = qty * price;
    setSaving(true);
    setMsg("");
    try {
      await setDoc(
        doc(getDb(), "order_repairs", editRepair.id),
        {
          productName,
          faultyQuantity: qty,
          faultyPricePerPiece: price,
          faultyTotal,
          totalRepairCost: faultyTotal,
          notes: editForm.notes.trim(),
        },
        { merge: true }
      );
      // Only approved entries affect the bill total.
      if (isApproved(editRepair)) {
        await syncOrderRepairTotal(editRepair.orderId);
      }
      setEditRepair(null);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function approveRepair(r: OrderRepair) {
    if (!confirm(`Approve repairing for "${r.productName}" (−${money(r.totalRepairCost)})? This will deduct from the kaariger's bill.`)) {
      return;
    }
    setActingId(r.id);
    try {
      await updateDoc(doc(getDb(), "order_repairs", r.id), {
        status: "APPROVED",
        reviewedBy: session?.name || "Admin",
        reviewedAt: Date.now(),
      });
      await syncOrderRepairTotal(r.orderId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve.");
    } finally {
      setActingId(null);
    }
  }

  async function rejectRepair(r: OrderRepair) {
    if (!confirm(`Reject repairing for "${r.productName}"? Nothing will be deducted from the bill.`)) {
      return;
    }
    setActingId(r.id);
    try {
      await updateDoc(doc(getDb(), "order_repairs", r.id), {
        status: "REJECTED",
        reviewedBy: session?.name || "Admin",
        reviewedAt: Date.now(),
      });
      // Was never deducted while pending; no order sync needed.
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reject.");
    } finally {
      setActingId(null);
    }
  }

  async function deleteRepair(r: OrderRepair) {
    const wasApproved = isApproved(r);
    if (
      !confirm(
        wasApproved
          ? `Delete approved repairing for "${r.productName}" (−${money(r.totalRepairCost)})? This restores that amount on the bill.`
          : `Delete this repairing update for "${r.productName}"?`
      )
    ) {
      return;
    }
    try {
      await deleteDoc(doc(getDb(), "order_repairs", r.id));
      if (wasApproved) await syncOrderRepairTotal(r.orderId);
      if (editRepair?.id === r.id) setEditRepair(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  function statusBadge(status: RepairStatus) {
    switch (status) {
      case "PENDING":
        return "badge badge-warn";
      case "APPROVED":
        return "badge badge-success";
      case "REJECTED":
        return "badge badge-danger";
    }
  }

  return (
    <div className="space-y-5">
      <PageToolbar title="Repairing">
        <p className="section-sub">
          Staff updates land here for approval — only approved ones are deducted from Hisaab
        </p>
      </PageToolbar>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="stat-card">
          <p className="stat-card-label">Awaiting Approval</p>
          <p className="stat-card-value text-amber-700">{pendingCount}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Total Approved Deducted</p>
          <p className="stat-card-value text-danger">{money(approvedTotal)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">All Updates</p>
          <p className="stat-card-value">{repairs.length}</p>
        </div>
      </div>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by kaariger, product or staff name…"
      />

      <div className="mobile-chip-scroll flex flex-wrap gap-2">
        {(
          [
            { id: "PENDING" as const, label: `Pending${pendingCount ? ` (${pendingCount})` : ""}` },
            { id: "APPROVED" as const, label: "Approved" },
            { id: "REJECTED" as const, label: "Rejected" },
            { id: "ALL" as const, label: "All" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTab(f.id)}
            className={`filter-pill ${tab === f.id ? "active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="surface flex flex-col items-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-jade-soft text-jade-deep">
            <Wrench size={22} />
          </div>
          <p className="mt-3 font-semibold">
            {tab === "PENDING" ? "No pending repairing updates" : "No repairing updates yet"}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {tab === "PENDING"
              ? "When staff submit from the mobile Repairing section, they appear here for approval."
              : "Entries staff record from the mobile app will show up here."}
          </p>
        </div>
      ) : (
        <>
          <div className="data-table-wrap hidden lg:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kaariger</th>
                  <th>Product</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th>Updated By</th>
                  <th>Date</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const status = repairStatus(r);
                  const busy = actingId === r.id;
                  return (
                    <tr key={r.id}>
                      <td className="font-medium">{r.kaarigerName || "—"}</td>
                      <td>{r.productName || "—"}</td>
                      <td className="text-right">{r.faultyQuantity}</td>
                      <td className="text-right font-semibold text-danger">−{money(r.totalRepairCost)}</td>
                      <td>
                        <span className={statusBadge(status)}>{status}</span>
                      </td>
                      <td className="text-[var(--text-muted)]">
                        <p>{r.createdBy || "—"}</p>
                        <p className="text-xs">
                          {formatDate(r.createdAt)} · {formatTime(r.createdAt)}
                        </p>
                        {r.reviewedBy && (
                          <p className="text-xs text-[var(--text-faint)]">
                            {status === "APPROVED" ? "Approved" : status === "REJECTED" ? "Rejected" : "Reviewed"} by{" "}
                            {r.reviewedBy}
                          </p>
                        )}
                      </td>
                      <td className="text-[var(--text-muted)]">{formatDate(r.createdAt)}</td>
                      <td className="text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1">
                          {status === "PENDING" && (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={busy}
                                onClick={() => approveRepair(r)}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={busy}
                                onClick={() => rejectRepair(r)}
                              >
                                <X className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="btn-icon !h-8 !w-8"
                            onClick={() => openEdit(r)}
                            aria-label="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon !h-8 !w-8 !text-danger"
                            onClick={() => deleteRepair(r)}
                            aria-label="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {filtered.map((r) => {
              const status = repairStatus(r);
              const busy = actingId === r.id;
              return (
                <div key={r.id} className="record-card space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display font-bold">{r.productName || "—"}</p>
                      <p className="text-sm text-[var(--text-muted)]">{r.kaarigerName}</p>
                    </div>
                    <span className={statusBadge(status)}>{status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Qty</p>
                      <p className="mt-0.5 font-medium">{r.faultyQuantity}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Amount</p>
                      <p className="mt-0.5 font-medium text-danger">−{money(r.totalRepairCost)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">By</p>
                      <p className="mt-0.5 font-medium">{r.createdBy || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Date</p>
                      <p className="mt-0.5 font-medium">
                        {formatDate(r.createdAt)} {formatTime(r.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status === "PENDING" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm flex-1"
                          disabled={busy}
                          onClick={() => approveRepair(r)}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm flex-1"
                          disabled={busy}
                          onClick={() => rejectRepair(r)}
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </>
                    )}
                    <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openEdit(r)} aria-label="Edit">
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn-icon !h-8 !w-8 !text-danger"
                      onClick={() => deleteRepair(r)}
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {editRepair && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditRepair(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={saveEdit}
              className="surface w-full max-w-md space-y-4 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold">Edit repairing</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {editRepair.kaarigerName} · {repairStatus(editRepair)} · by {editRepair.createdBy}
                  </p>
                </div>
                <button type="button" className="btn-icon" onClick={() => setEditRepair(null)} aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <label className="label">Product *</label>
                <input
                  className="input"
                  value={editForm.productName}
                  onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Qty *</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={editForm.faultyQuantity}
                    onChange={(e) => setEditForm({ ...editForm, faultyQuantity: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">₹ / pc *</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={editForm.faultyPricePerPiece}
                    onChange={(e) => setEditForm({ ...editForm, faultyPricePerPiece: e.target.value })}
                    required
                  />
                </div>
              </div>
              {(Number(editForm.faultyQuantity) || 0) > 0 && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">
                  Deduction: −
                  {money((Number(editForm.faultyQuantity) || 0) * (Number(editForm.faultyPricePerPiece) || 0))}
                  {repairStatus(editRepair) === "PENDING" ? " (after approval)" : ""}
                </p>
              )}
              <div>
                <label className="label">Notes (optional)</label>
                <input
                  className="input"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Optional note"
                />
              </div>

              {msg && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{msg}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditRepair(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
