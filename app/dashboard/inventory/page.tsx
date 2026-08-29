"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  History,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type {
  Employee,
  RawMaterialBill,
  RawMaterialKaarigerEntry,
  RawMaterialRoll,
} from "@/lib/types";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import SearchSelect from "@/components/admin/SearchSelect";

// ─── helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtTs(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function rupee(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function uuid() {
  return crypto.randomUUID();
}

function calcKaariger(k: RawMaterialKaarigerEntry): RawMaterialKaarigerEntry {
  const totalQuantity = k.rolls.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmount = totalQuantity * (Number(k.ratePerPiece) || 0);
  return { ...k, totalQuantity, totalAmount };
}

function emptyRoll(rollNumber: number): RawMaterialRoll {
  return { rollNumber, quantity: 0 };
}

function emptyKaariger(): RawMaterialKaarigerEntry {
  return {
    id: uuid(),
    kaarigerId: "",
    kaarigerName: "",
    materialName: "",
    ratePerPiece: 0,
    rolls: [emptyRoll(1)],
    totalQuantity: 0,
    totalAmount: 0,
    adjustmentStatus: "pending",
  };
}

// ─── types for the form ───────────────────────────────────────────────────────

type FormKaariger = {
  id: string;
  kaarigerId: string;   // employee phone (Firestore doc id)
  materialName: string;
  ratePerPiece: string;
  rolls: { rollNumber: number; quantity: string }[];
};

function emptyFormKaariger(): FormKaariger {
  return {
    id: uuid(),
    kaarigerId: "",
    materialName: "",
    ratePerPiece: "",
    rolls: [{ rollNumber: 1, quantity: "" }],
  };
}

function calcFormKaariger(k: FormKaariger) {
  const totalQty = k.rolls.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const rate = Number(k.ratePerPiece) || 0;
  return { totalQty, totalAmount: totalQty * rate };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function KaarigerFormCard({
  idx,
  k,
  kaarigerOptions,
  onChange,
  onRemove,
  canRemove,
}: {
  idx: number;
  k: FormKaariger;
  kaarigerOptions: { id: string; label: string; sublabel?: string }[];
  onChange: (updated: FormKaariger) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { totalQty, totalAmount } = calcFormKaariger(k);
  const rate = Number(k.ratePerPiece) || 0;

  function updateRoll(rollIdx: number, qty: string) {
    const rolls = k.rolls.map((r, i) => (i === rollIdx ? { ...r, quantity: qty } : r));
    onChange({ ...k, rolls });
  }

  function addRoll() {
    onChange({ ...k, rolls: [...k.rolls, { rollNumber: k.rolls.length + 1, quantity: "" }] });
  }

  function removeRoll(rollIdx: number) {
    const rolls = k.rolls
      .filter((_, i) => i !== rollIdx)
      .map((r, i) => ({ ...r, rollNumber: i + 1 }));
    onChange({ ...k, rolls });
  }

  return (
    <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-raised)] p-4 sm:p-5">
      {/* Kaariger header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--jade-deep)]">
          Kaariger {idx + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="btn-icon !h-7 !w-7 hover:!border-danger hover:!bg-red-50 hover:!text-danger"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Kaariger *</label>
          <SearchSelect
            value={k.kaarigerId}
            onSelect={(id) => onChange({ ...k, kaarigerId: id })}
            options={kaarigerOptions}
            placeholder="Select kaariger…"
            emptyText="No kaarigers found"
          />
        </div>
        <div>
          <label className="label">Material Name *</label>
          <input
            className="input"
            placeholder="e.g. Nafa"
            value={k.materialName}
            onChange={(e) => onChange({ ...k, materialName: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Rate per Piece (₹) *</label>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            placeholder="0"
            value={k.ratePerPiece}
            onChange={(e) => onChange({ ...k, ratePerPiece: e.target.value })}
          />
        </div>
      </div>

      {/* Rolls */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">Rolls</p>
        <div className="space-y-2">
          {k.rolls.map((roll, ri) => (
            <div key={ri} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-medium text-[var(--text-muted)]">
                Roll {roll.rollNumber}
              </span>
              <input
                className="input flex-1"
                type="number"
                min={0}
                step="any"
                placeholder="Quantity (pcs)"
                value={roll.quantity}
                onChange={(e) => updateRoll(ri, e.target.value)}
              />
              <span className="w-8 shrink-0 text-xs text-[var(--text-faint)]">pcs</span>
              {k.rolls.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRoll(ri)}
                  className="btn-icon !h-7 !w-7 shrink-0 hover:!border-danger hover:!bg-red-50 hover:!text-danger"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRoll}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--jade-deep)] px-3 py-1.5 text-xs font-semibold text-[var(--jade-deep)] transition hover:bg-[var(--jade-soft)]"
        >
          <Plus size={13} /> Add Roll
        </button>
      </div>

      {/* Kaariger totals */}
      {(totalQty > 0 || rate > 0) && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--jade-soft)] px-4 py-2.5">
          <div className="text-sm text-[var(--jade-deep)]">
            <span className="font-bold">{totalQty.toLocaleString("en-IN")} pcs</span>
            {rate > 0 && (
              <span className="ml-1 text-[var(--text-muted)]">× {rupee(rate)}</span>
            )}
          </div>
          <div className="font-display text-base font-extrabold text-[var(--jade-deep)]">
            {rupee(totalAmount)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bill detail modal ────────────────────────────────────────────────────────

function BillDetailModal({
  bill,
  onClose,
}: {
  bill: RawMaterialBill;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 inset-y-8 z-50 mx-auto flex max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--surface-raised)] shadow-2xl sm:inset-x-auto sm:w-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-bold">Bill #{bill.billNo}</h3>
            <p className="text-sm text-[var(--text-muted)]">
              {bill.companyName && <span className="font-semibold text-[var(--text)]">{bill.companyName} · </span>}
              {fmtDate(bill.date)} · {bill.kaarigers.length} Kaariger
              {bill.kaarigers.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {bill.kaarigers.map((k, i) => (
            <div
              key={k.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-[var(--jade-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--jade-deep)]">
                  Kaariger {i + 1}
                </span>
                <span className="font-semibold">{k.kaarigerName}</span>
                {k.adjustmentStatus === "adjusted" ? (
                  <span className="ml-auto flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                    <CheckCircle2 size={10} /> Adjusted
                  </span>
                ) : (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    Pending
                  </span>
                )}
              </div>
              <div className="mb-3 flex flex-wrap gap-3 text-sm text-[var(--text-muted)]">
                <span>
                  Material: <span className="font-medium text-[var(--text)]">{k.materialName}</span>
                </span>
                <span>
                  Rate:{" "}
                  <span className="font-medium text-[var(--text)]">
                    {rupee(k.ratePerPiece)}/pc
                  </span>
                </span>
              </div>

              {/* Rolls table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="pb-1 text-left text-xs font-semibold text-[var(--text-muted)]">
                      Roll
                    </th>
                    <th className="pb-1 text-right text-xs font-semibold text-[var(--text-muted)]">
                      Quantity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {k.rolls.map((r) => (
                    <tr key={r.rollNumber} className="border-b border-[var(--border)]/50">
                      <td className="py-1.5 text-[var(--text-muted)]">Roll {r.rollNumber}</td>
                      <td className="py-1.5 text-right font-medium">
                        {r.quantity.toLocaleString("en-IN")} pcs
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="pt-2">Total</td>
                    <td className="pt-2 text-right text-[var(--jade-deep)]">
                      {k.totalQuantity.toLocaleString("en-IN")} pcs
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--jade-soft)] px-3 py-2">
                <span className="text-sm text-[var(--jade-deep)]">Amount</span>
                <span className="font-display font-extrabold text-[var(--jade-deep)]">
                  {rupee(k.totalAmount)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer totals */}
        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--text-muted)]">
              Grand Total Quantity:{" "}
              <span className="font-bold text-[var(--text)]">
                {bill.grandTotalQuantity.toLocaleString("en-IN")} pcs
              </span>
            </div>
            <div className="font-display text-xl font-extrabold text-[var(--jade-deep)]">
              {rupee(bill.grandTotalAmount)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteConfirmModal({
  bill,
  onConfirm,
  onClose,
}: {
  bill: RawMaterialBill;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 z-50 mx-auto w-full max-w-sm -translate-y-1/2 rounded-2xl bg-[var(--surface-raised)] p-6 shadow-2xl sm:inset-x-auto">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
          <Trash2 size={22} className="text-danger" />
        </div>
        <h3 className="mb-2 font-display text-lg font-bold">Delete Bill?</h3>
        <p className="mb-5 text-sm text-[var(--text-muted)]">
          Bill <span className="font-semibold text-[var(--text)]">#{bill.billNo}</span> will be moved
          to <span className="font-semibold">Raw Material History</span>. You can restore it later.
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn flex-1 bg-danger text-white hover:bg-red-600"
            onClick={onConfirm}
          >
            Move to History
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Permanent delete confirmation ────────────────────────────────────────────

function PermanentDeleteModal({
  bill,
  onConfirm,
  onClose,
}: {
  bill: RawMaterialBill;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 z-50 mx-auto w-full max-w-sm -translate-y-1/2 rounded-2xl bg-[var(--surface-raised)] p-6 shadow-2xl sm:inset-x-auto">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100">
          <Trash2 size={22} className="text-danger" />
        </div>
        <h3 className="mb-1 font-display text-lg font-bold text-danger">Permanently Delete?</h3>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          This will <span className="font-bold text-danger">permanently</span> delete Bill{" "}
          <span className="font-semibold">#{bill.billNo}</span>. This action cannot be undone.
        </p>
        <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
          Type <span className="font-bold text-[var(--text)]">DELETE</span> to confirm
        </p>
        <input
          className="input mb-4"
          placeholder="DELETE"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={typed !== "DELETE"}
            className="btn flex-1 bg-danger text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onConfirm}
          >
            Delete Forever
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Bill row card ────────────────────────────────────────────────────────────

function BillCard({
  bill,
  onView,
  onDelete,
}: {
  bill: RawMaterialBill;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mobile-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={onView} className="flex flex-1 flex-col gap-1 text-left">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold">#{bill.billNo}</span>
          {bill.companyName && (
            <span className="text-xs text-[var(--text-muted)]">({bill.companyName})</span>
          )}
          <span className="rounded-full bg-[var(--jade-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--jade-deep)]">
            Active
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          {fmtDate(bill.date)} · {bill.kaarigers.length} Kaariger
          {bill.kaarigers.length !== 1 ? "s" : ""}
        </p>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          <span className="text-[var(--text-muted)]">
            {bill.grandTotalQuantity.toLocaleString("en-IN")} pcs
          </span>
          <span className="font-bold text-[var(--jade-deep)]">
            {rupee(bill.grandTotalAmount)}
          </span>
        </div>
        {/* Per-kaariger adjustment status */}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {bill.kaarigers.map((k) => (
            <span
              key={k.id}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                k.adjustmentStatus === "adjusted"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {k.kaarigerName}: {k.adjustmentStatus === "adjusted" ? "Adjusted" : "Pending"}
            </span>
          ))}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm gap-1.5"
          onClick={onView}
        >
          <FileText size={13} /> View
        </button>
        <button
          type="button"
          className="btn btn-sm gap-1.5 border border-danger/30 bg-red-50 text-danger hover:bg-red-100"
          onClick={onDelete}
        >
          <Archive size={13} /> Delete
        </button>
      </div>
    </div>
  );
}

// ─── History bill card ────────────────────────────────────────────────────────

function HistoryBillCard({
  bill,
  onView,
  onRestore,
  onPermanentDelete,
}: {
  bill: RawMaterialBill;
  onView: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  return (
    <div className="mobile-card flex flex-col gap-3 border-[var(--border)] opacity-80 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={onView} className="flex flex-1 flex-col gap-1 text-left">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold">#{bill.billNo}</span>
          {bill.companyName && (
            <span className="text-xs text-[var(--text-muted)]">({bill.companyName})</span>
          )}
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
            Archived
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Bill Date: {fmtDate(bill.date)} · {bill.kaarigers.length} Kaariger
          {bill.kaarigers.length !== 1 ? "s" : ""}
        </p>
        {bill.deletedAt && (
          <p className="text-xs text-[var(--text-faint)]">
            Archived: {fmtTs(bill.deletedAt)}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          <span className="text-[var(--text-muted)]">
            {bill.grandTotalQuantity.toLocaleString("en-IN")} pcs
          </span>
          <span className="font-bold text-[var(--text-muted)]">
            {rupee(bill.grandTotalAmount)}
          </span>
        </div>
      </button>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm gap-1.5"
          onClick={onView}
        >
          <FileText size={13} /> View
        </button>
        <button
          type="button"
          className="btn btn-sm gap-1.5 border border-[var(--jade-deep)]/30 bg-[var(--jade-soft)] text-[var(--jade-deep)] hover:bg-[var(--jade-soft)]/80"
          onClick={onRestore}
        >
          <RotateCcw size={13} /> Restore
        </button>
        <button
          type="button"
          className="btn btn-sm gap-1.5 border border-danger/30 bg-red-50 text-danger hover:bg-red-100"
          onClick={onPermanentDelete}
        >
          <Trash2 size={13} /> Delete Forever
        </button>
      </div>
    </div>
  );
}

// ─── Add Bill Modal ───────────────────────────────────────────────────────────

function AddBillModal({
  onClose,
  onSave,
  saving,
  kaarigers,
  initialBill,
}: {
  onClose: () => void;
  onSave: (bill: Omit<RawMaterialBill, "id" | "createdAt" | "createdBy">) => void;
  saving: boolean;
  kaarigers: Employee[];
  initialBill?: RawMaterialBill;
}) {
  const isEdit = !!initialBill;

  const [billNo, setBillNo] = useState(initialBill?.billNo ?? "");
  const [date, setDate] = useState(initialBill?.date ?? today());
  const [companyName, setCompanyName] = useState(initialBill?.companyName ?? "");
  const [kaarigerEntries, setKaarigerEntries] = useState<FormKaariger[]>(() => {
    if (initialBill?.kaarigers?.length) {
      return initialBill.kaarigers.map((k) => ({
        id: k.id,
        kaarigerId: k.kaarigerId,
        materialName: k.materialName,
        ratePerPiece: String(k.ratePerPiece),
        rolls: k.rolls.map((r) => ({ rollNumber: r.rollNumber, quantity: String(r.quantity) })),
      }));
    }
    return [emptyFormKaariger()];
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const kaarigerOptions = kaarigers.map((k) => ({
    id: k.phone,
    label: k.name,
    sublabel: k.phone,
  }));

  function updateKaariger(idx: number, updated: FormKaariger) {
    setKaarigerEntries((ks) => ks.map((k, i) => (i === idx ? updated : k)));
  }

  function addKaariger() {
    setKaarigerEntries((ks) => [...ks, emptyFormKaariger()]);
  }

  function removeKaariger(idx: number) {
    setKaarigerEntries((ks) => ks.filter((_, i) => i !== idx));
  }

  const grandTotals = useMemo(() => {
    return kaarigerEntries.reduce(
      (acc, k) => {
        const { totalQty, totalAmount } = calcFormKaariger(k);
        return { qty: acc.qty + totalQty, amount: acc.amount + totalAmount };
      },
      { qty: 0, amount: 0 }
    );
  }, [kaarigerEntries]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!billNo.trim()) errs.billNo = "Bill No. is required.";
    if (!date) errs.date = "Date is required.";
    kaarigerEntries.forEach((k, i) => {
      if (!k.kaarigerId) errs[`k${i}_name`] = `Kaariger ${i + 1}: Please select a Kaariger.`;
      if (!k.materialName.trim()) errs[`k${i}_material`] = `Kaariger ${i + 1}: Material is required.`;
      if (!k.ratePerPiece || Number(k.ratePerPiece) <= 0)
        errs[`k${i}_rate`] = `Kaariger ${i + 1}: Rate must be > 0.`;
      const hasQty = k.rolls.some((r) => Number(r.quantity) > 0);
      if (!hasQty) errs[`k${i}_rolls`] = `Kaariger ${i + 1}: At least one roll must have a quantity.`;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const builtKaarigers: RawMaterialKaarigerEntry[] = kaarigerEntries.map((k) => {
      const kaarigName = kaarigers.find((emp) => emp.phone === k.kaarigerId)?.name || k.kaarigerId;
      const rolls: RawMaterialRoll[] = k.rolls.map((r) => ({
        rollNumber: r.rollNumber,
        quantity: Number(r.quantity) || 0,
      }));
      const entry: RawMaterialKaarigerEntry = {
        id: k.id,
        kaarigerId: k.kaarigerId,
        kaarigerName: kaarigName,
        materialName: k.materialName.trim(),
        ratePerPiece: Number(k.ratePerPiece) || 0,
        rolls,
        totalQuantity: 0,
        totalAmount: 0,
        adjustmentStatus: "pending",
      };
      return calcKaariger(entry);
    });

    const grandTotalQuantity = builtKaarigers.reduce((s, k) => s + k.totalQuantity, 0);
    const grandTotalAmount = builtKaarigers.reduce((s, k) => s + k.totalAmount, 0);

    onSave({
      billNo: billNo.trim(),
      date,
      companyName: companyName.trim(),
      kaarigers: builtKaarigers,
      grandTotalQuantity,
      grandTotalAmount,
      status: "active",
    });
  }

  const errorList = Object.values(errors);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-2 inset-y-4 z-50 mx-auto flex max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-2xl sm:inset-x-auto sm:w-full">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-raised)] px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-bold">
              {isEdit ? `Edit Bill #${initialBill!.billNo}` : "New Raw Material Bill"}
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              {isEdit ? "Update bill details and kaariger entries" : "Fill in bill details and add Kaarigers"}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Form body */}
        <form
          id="add-bill-form"
          onSubmit={handleSave}
          className="flex-1 space-y-4 overflow-y-auto p-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Bill info */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Bill No. *</label>
              <input
                className={`input ${errors.billNo ? "border-danger" : ""}`}
                placeholder="e.g. RM-001"
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
              />
              {errors.billNo && <p className="mt-1 text-xs text-danger">{errors.billNo}</p>}
            </div>
            <div>
              <label className="label">Date *</label>
              <input
                className={`input ${errors.date ? "border-danger" : ""}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Company Name</label>
              <input
                className="input"
                placeholder="e.g. shaafin pvt ltd"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          {/* Validation errors */}
          {errorList.length > 0 && (
            <div className="rounded-xl border border-danger/30 bg-red-50 p-3">
              <p className="mb-1 text-xs font-bold text-danger">Please fix the following:</p>
              <ul className="list-inside list-disc space-y-0.5">
                {errorList.map((e, i) => (
                  <li key={i} className="text-xs text-danger">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Kaarigers */}
          <div className="space-y-3">
            {kaarigerEntries.map((k, i) => (
              <KaarigerFormCard
                key={k.id}
                idx={i}
                k={k}
                kaarigerOptions={kaarigerOptions}
                onChange={(updated) => updateKaariger(i, updated)}
                onRemove={() => removeKaariger(i)}
                canRemove={kaarigerEntries.length > 1}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addKaariger}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--jade-deep)]/40 py-3 text-sm font-semibold text-[var(--jade-deep)] transition hover:border-[var(--jade-deep)] hover:bg-[var(--jade-soft)]"
          >
            <Plus size={16} /> Add Kaariger
          </button>

          {/* Grand totals */}
          {grandTotals.qty > 0 && (
            <div className="rounded-2xl border border-[var(--jade-deep)]/20 bg-gradient-to-r from-[var(--jade-soft)] to-white p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--jade-deep)]">
                Grand Total
              </p>
              <div className="flex items-center justify-between">
                <span className="text-[var(--jade-deep)]">
                  {grandTotals.qty.toLocaleString("en-IN")} pcs across {kaarigerEntries.length} Kaariger
                  {kaarigerEntries.length !== 1 ? "s" : ""}
                </span>
                <span className="font-display text-2xl font-extrabold text-[var(--jade-deep)]">
                  {rupee(grandTotals.amount)}
                </span>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex gap-2 border-t border-[var(--border)] bg-[var(--surface-raised)] px-5 py-4">
          <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="add-bill-form"
            className="btn btn-primary flex-1"
            disabled={saving}
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Bill"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RawMaterialPage() {
  const { session } = useAuth();
  const [bills, setBills] = useState<RawMaterialBill[]>([]);
  const [kaarigers, setKaarigers] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "history">("active");
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewBill, setViewBill] = useState<RawMaterialBill | null>(null);
  const [editBill, setEditBill] = useState<RawMaterialBill | null>(null);
  const [deletingBill, setDeletingBill] = useState<RawMaterialBill | null>(null);
  const [permDeleteBill, setPermDeleteBill] = useState<RawMaterialBill | null>(null);
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());

  // Load kaarigers once
  useEffect(() => {
    getDocs(collection(getDb(), "employees")).then((snap) => {
      setKaarigers(
        snap.docs
          .filter((d) => d.data().role === "KAARIGER")
          .map((d) => ({
            id: d.id,
            name: (d.data().name as string) || d.id,
            phone: (d.data().phone as string) || d.id,
            joiningDate: "",
            monthlySalary: 0,
            attendancePercentage: 0,
            role: "KAARIGER" as const,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);
  useEffect(() => {
    const unsub = onSnapshot(collection(getDb(), "raw_material_bills"), (snap) => {
      setBills(
        snap.docs
          .map((d) => {
            const data = d.data() as Omit<RawMaterialBill, "id">;
            return { id: d.id, ...data };
          })
          .sort((a, b) => b.createdAt - a.createdAt)
      );
    });
    return () => unsub();
  }, []);

  const activeBills = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bills
      .filter((b) => b.status === "active")
      .filter(
        (b) =>
          !q ||
          b.billNo.toLowerCase().includes(q) ||
          (b.companyName && b.companyName.toLowerCase().includes(q)) ||
          b.kaarigers.some(
            (k) =>
              k.kaarigerName.toLowerCase().includes(q) ||
              k.materialName.toLowerCase().includes(q)
          )
      );
  }, [bills, search]);

  const historyBills = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bills
      .filter((b) => b.status === "deleted")
      .filter(
        (b) =>
          !q ||
          b.billNo.toLowerCase().includes(q) ||
          (b.companyName && b.companyName.toLowerCase().includes(q)) ||
          b.kaarigers.some(
            (k) =>
              k.kaarigerName.toLowerCase().includes(q) ||
              k.materialName.toLowerCase().includes(q)
          )
      );
  }, [bills, search]);

  // Stat summaries
  const activeStats = useMemo(() => ({
    bills: activeBills.length,
    qty: activeBills.reduce((s, b) => s + b.grandTotalQuantity, 0),
    amount: activeBills.reduce((s, b) => s + b.grandTotalAmount, 0),
  }), [activeBills]);

  async function handleSaveBill(
    partial: Omit<RawMaterialBill, "id" | "createdAt" | "createdBy">
  ) {
    setSaving(true);
    try {
      const id = uuid();
      const bill: RawMaterialBill = {
        ...partial,
        id,
        createdAt: Date.now(),
        createdBy: session?.name || "Admin",
      };
      await setDoc(doc(getDb(), "raw_material_bills", id), bill);
      setShowAddModal(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save bill.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBill(bill: RawMaterialBill) {
    try {
      await updateDoc(doc(getDb(), "raw_material_bills", bill.id), {
        status: "deleted",
        deletedAt: Date.now(),
      });
      setDeletingBill(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to archive bill.");
    }
  }

  async function handleRestoreBill(bill: RawMaterialBill) {
    try {
      await updateDoc(doc(getDb(), "raw_material_bills", bill.id), {
        status: "active",
        deletedAt: null,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restore bill.");
    }
  }

  async function handlePermanentDelete(bill: RawMaterialBill) {
    try {
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(getDb(), "raw_material_bills", bill.id));
      setPermDeleteBill(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete bill.");
    }
  }

  async function handleUpdateBill(
    billId: string,
    partial: Omit<RawMaterialBill, "id" | "createdAt" | "createdBy">
  ) {
    setSaving(true);
    try {
      await updateDoc(doc(getDb(), "raw_material_bills", billId), {
        billNo: partial.billNo,
        date: partial.date,
        companyName: partial.companyName ?? "",
        kaarigers: partial.kaarigers,
        grandTotalQuantity: partial.grandTotalQuantity,
        grandTotalAmount: partial.grandTotalAmount,
      });
      setEditBill(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update bill.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stagger space-y-5">
      <PageToolbar
        title="Raw Material"
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={15} />
            Add Raw Material
          </button>
        }
      >
        <p className="section-sub">
          {activeStats.bills} bill{activeStats.bills !== 1 ? "s" : ""} ·{" "}
          {activeStats.qty.toLocaleString("en-IN")} pcs · {rupee(activeStats.amount)}
        </p>
      </PageToolbar>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--jade-soft)]">
              <FileText className="h-5 w-5 text-[var(--jade-deep)]" />
            </div>
            <div>
              <p className="stat-card-label">Active Bills</p>
              <p className="stat-card-value">{activeStats.bills}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bronze-soft)]">
              <Package className="h-5 w-5 text-[#8a6a35]" />
            </div>
            <div>
              <p className="stat-card-label">Total Pieces</p>
              <p className="stat-card-value">{activeStats.qty.toLocaleString("en-IN")} pcs</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--jade-soft)]">
              <Clock className="h-5 w-5 text-[var(--jade-deep)]" />
            </div>
            <div>
              <p className="stat-card-label">Total Amount</p>
              <p className="stat-card-value">{rupee(activeStats.amount)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-1">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
            tab === "active"
              ? "bg-[var(--jade-deep)] text-white shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          <FileText size={14} />
          Raw Material
          {activeBills.length > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === "active" ? "bg-white/20 text-white" : "bg-[var(--jade-soft)] text-[var(--jade-deep)]"
              }`}
            >
              {activeBills.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
            tab === "history"
              ? "bg-[var(--jade-deep)] text-white shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          <History size={14} />
          Raw Material History
          {historyBills.length > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === "history" ? "bg-white/20 text-white" : "bg-red-100 text-danger"
              }`}
            >
              {historyBills.length}
            </span>
          )}
        </button>
      </div>

      {/* Search */}
      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by bill no., kaariger name, material..."
      />

      {/* Active bills — single unified table (no duplicate card view) */}
      {tab === "active" && (
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill No.</th>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Kaarigers</th>
                  <th>Total Qty</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeBills.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-[var(--text-muted)]">
                      {search ? "No bills match your search." : "No raw material bills yet. Click \"+ Add Raw Material\" to create one."}
                    </td>
                  </tr>
                ) : (
                  activeBills.map((bill) => (
                    <>
                      <tr
                        key={bill.id}
                        className="cursor-pointer hover:bg-[var(--surface-mist)]"
                        onClick={() =>
                          setExpandedBills((prev) => {
                            const next = new Set(prev);
                            if (next.has(bill.id)) next.delete(bill.id);
                            else next.add(bill.id);
                            return next;
                          })
                        }
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            {expandedBills.has(bill.id) ? (
                              <ChevronUp size={14} className="text-[var(--text-muted)]" />
                            ) : (
                              <ChevronDown size={14} className="text-[var(--text-muted)]" />
                            )}
                            <span className="font-semibold">#{bill.billNo}</span>
                          </div>
                        </td>
                        <td className="text-[var(--text-muted)]">{fmtDate(bill.date)}</td>
                        <td>{bill.companyName || "—"}</td>
                        <td>{bill.kaarigers.length}</td>
                        <td className="font-semibold">
                          {bill.grandTotalQuantity.toLocaleString("en-IN")} pcs
                        </td>
                        <td className="font-bold text-[var(--jade-deep)]">
                          {rupee(bill.grandTotalAmount)}
                        </td>
                        <td>
                          <span className="badge badge-success">Active</span>
                        </td>
                        <td className="text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              className="btn-icon !h-8 !w-8"
                              title="View"
                              onClick={(e) => { e.stopPropagation(); setViewBill(bill); }}
                            >
                              <FileText size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon !h-8 !w-8"
                              title="Edit"
                              onClick={(e) => { e.stopPropagation(); setEditBill(bill); }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon !h-8 !w-8 hover:!border-danger hover:!bg-red-50 hover:!text-danger"
                              title="Archive"
                              onClick={(e) => { e.stopPropagation(); setDeletingBill(bill); }}
                            >
                              <Archive size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded kaariger rows */}
                      {expandedBills.has(bill.id) &&
                        bill.kaarigers.map((k, ki) => (
                          <tr key={`${bill.id}-k${ki}`} className="bg-[var(--jade-soft)]/30 text-sm">
                            <td className="pl-8 text-[var(--text-muted)]">└ {k.kaarigerName}</td>
                            <td className="text-[var(--text-muted)]">{k.materialName}</td>
                            <td />
                            <td className="text-[var(--text-muted)]">{rupee(k.ratePerPiece)}/pc</td>
                            <td className="font-medium">{k.totalQuantity.toLocaleString("en-IN")} pcs</td>
                            <td className="font-medium text-[var(--jade-deep)]">{rupee(k.totalAmount)}</td>
                            <td>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                k.adjustmentStatus === "adjusted"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}>
                                {k.adjustmentStatus === "adjusted" ? "Adjusted" : "Pending"}
                              </span>
                            </td>
                            <td />
                          </tr>
                        ))}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* History bills */}
      {tab === "history" && (
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill No.</th>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Archived On</th>
                  <th>Kaarigers</th>
                  <th>Total Qty</th>
                  <th>Total Amount</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyBills.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-[var(--text-muted)]">
                      {search ? "No archived bills match." : "No archived bills yet. Deleted bills appear here."}
                    </td>
                  </tr>
                ) : (
                  historyBills.map((bill) => (
                    <tr key={bill.id} className="opacity-75">
                      <td><span className="font-semibold">#{bill.billNo}</span></td>
                      <td className="text-[var(--text-muted)]">{fmtDate(bill.date)}</td>
                      <td>{bill.companyName || "—"}</td>
                      <td className="text-[var(--text-muted)]">{bill.deletedAt ? fmtTs(bill.deletedAt) : "—"}</td>
                      <td>{bill.kaarigers.length}</td>
                      <td>{bill.grandTotalQuantity.toLocaleString("en-IN")} pcs</td>
                      <td className="font-bold text-[var(--text-muted)]">{rupee(bill.grandTotalAmount)}</td>
                      <td className="text-right">
                        <div className="inline-flex gap-1">
                          <button type="button" className="btn-icon !h-8 !w-8" title="View" onClick={() => setViewBill(bill)}>
                            <FileText size={14} />
                          </button>
                          <button type="button" className="btn-icon !h-8 !w-8" title="Restore" onClick={() => handleRestoreBill(bill)}>
                            <RotateCcw size={14} />
                          </button>
                          <button type="button" className="btn-icon !h-8 !w-8 hover:!border-danger hover:!bg-red-50 hover:!text-danger" title="Delete Forever" onClick={() => setPermDeleteBill(bill)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddBillModal
          onClose={() => setShowAddModal(false)}
          onSave={handleSaveBill}
          saving={saving}
          kaarigers={kaarigers}
        />
      )}

      {editBill && (
        <AddBillModal
          onClose={() => setEditBill(null)}
          onSave={(partial) => handleUpdateBill(editBill.id, partial)}
          saving={saving}
          kaarigers={kaarigers}
          initialBill={editBill}
        />
      )}

      {viewBill && (
        <BillDetailModal bill={viewBill} onClose={() => setViewBill(null)} />
      )}

      {deletingBill && (
        <DeleteConfirmModal
          bill={deletingBill}
          onConfirm={() => handleDeleteBill(deletingBill)}
          onClose={() => setDeletingBill(null)}
        />
      )}

      {permDeleteBill && (
        <PermanentDeleteModal
          bill={permDeleteBill}
          onConfirm={() => handlePermanentDelete(permDeleteBill)}
          onClose={() => setPermDeleteBill(null)}
        />
      )}
    </div>
  );
}
