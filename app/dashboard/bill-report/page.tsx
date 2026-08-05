"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  IndianRupee,
  Link2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import PageToolbar from "@/components/admin/PageToolbar";
import { useAuth } from "@/lib/auth-context";
import { companyTotals } from "@/lib/bill-report";
import { formatRupee, nowTimeStr, todayStr, uuid } from "@/lib/csv";
import { getDb } from "@/lib/firebase";
import type { BillCompany, BillEntry, BillEntryType, BillOwner } from "@/lib/types";

const OWNERS: { id: BillOwner; label: string }[] = [
  { id: "CLARIS", label: "Claris" },
  { id: "BLISS", label: "Bliss" },
];

function parseAmount(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export default function BillReportPage() {
  const { session } = useAuth();
  const [owner, setOwner] = useState<BillOwner>("CLARIS");
  const [companies, setCompanies] = useState<BillCompany[]>([]);
  const [entries, setEntries] = useState<BillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: "", openingBalance: "", notes: "" });
  const [savingCompany, setSavingCompany] = useState(false);

  const [entryModal, setEntryModal] = useState<BillEntryType | null>(null);
  const [entryForm, setEntryForm] = useState({
    amount: "",
    date: todayStr(),
    time: nowTimeStr(),
    driveLink: "",
    remarks: "",
    transferDone: true,
  });
  const [savingEntry, setSavingEntry] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = getDb();
      const [coSnap, enSnap] = await Promise.all([
        getDocs(query(collection(db, "bill_companies"), where("owner", "==", owner))),
        getDocs(query(collection(db, "bill_entries"), where("owner", "==", owner))),
      ]);
      setCompanies(
        coSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              name: (data.name as string) || "",
              owner: (data.owner as BillOwner) || owner,
              openingBalance: Number(data.openingBalance) || 0,
              notes: (data.notes as string) || undefined,
              createdAt: (data.createdAt as number) || 0,
              createdBy: (data.createdBy as string) || "",
              updatedAt: (data.updatedAt as number) || undefined,
            } satisfies BillCompany;
          })
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEntries(
        enSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              companyId: (data.companyId as string) || "",
              owner: (data.owner as BillOwner) || owner,
              type: (data.type as BillEntryType) || "EXTRA_BILL",
              amount: Number(data.amount) || 0,
              date: (data.date as string) || "",
              time: (data.time as string) || "",
              driveLink: (data.driveLink as string) || undefined,
              remarks: (data.remarks as string) || undefined,
              transferDone: data.transferDone === undefined ? true : Boolean(data.transferDone),
              createdAt: (data.createdAt as number) || 0,
              createdBy: (data.createdBy as string) || "",
            } satisfies BillEntry;
          })
          .sort((a, b) => {
            const dk = `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`);
            return dk !== 0 ? dk : b.createdAt - a.createdAt;
          })
      );
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => {
    setSelectedId(null);
    setSearch("");
    setMessage("");
    load();
  }, [load]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  const selected = useMemo(
    () => companies.find((c) => c.id === selectedId) || null,
    [companies, selectedId]
  );

  const selectedEntries = useMemo(
    () => (selected ? entries.filter((e) => e.companyId === selected.id) : []),
    [entries, selected]
  );

  const ownerTotals = useMemo(() => {
    let extraBill = 0;
    let transfer = 0;
    let remaining = 0;
    for (const c of companies) {
      const t = companyTotals(c, entries);
      extraBill += t.extraBill;
      transfer += t.transfer;
      remaining += t.remaining;
    }
    return { extraBill, transfer, remaining };
  }, [companies, entries]);

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    const name = companyForm.name.trim();
    if (!name) {
      setMessage("Enter company name.");
      return;
    }
    if (companies.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setMessage("This company already exists under " + owner + ".");
      return;
    }
    const opening = companyForm.openingBalance.trim()
      ? parseAmount(companyForm.openingBalance)
      : 0;
    if (Number.isNaN(opening) || opening < 0) {
      setMessage("Opening / remaining balance must be a valid number.");
      return;
    }

    setSavingCompany(true);
    setMessage("");
    try {
      const id = uuid();
      const notes = companyForm.notes.trim();
      const company: BillCompany = {
        id,
        name,
        owner,
        openingBalance: opening,
        createdAt: Date.now(),
        createdBy: session?.name || "Admin",
        ...(notes ? { notes } : {}),
      };
      // Firestore rejects undefined — only write defined fields.
      await setDoc(doc(getDb(), "bill_companies", id), {
        id: company.id,
        name: company.name,
        owner: company.owner,
        openingBalance: company.openingBalance,
        createdAt: company.createdAt,
        createdBy: company.createdBy,
        ...(notes ? { notes } : {}),
      });
      setCompanies((cur) => [...cur, company].sort((a, b) => a.name.localeCompare(b.name)));
      setShowCompanyForm(false);
      setCompanyForm({ name: "", openingBalance: "", notes: "" });
      setMessage(`${name} added.`);
      setSelectedId(id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save company.");
    } finally {
      setSavingCompany(false);
    }
  }

  async function deleteCompany(company: BillCompany) {
    const n = entries.filter((e) => e.companyId === company.id).length;
    const warn =
      n > 0
        ? `Delete "${company.name}" and its ${n} bill/transfer record(s)?`
        : `Delete "${company.name}"?`;
    if (!confirm(warn)) return;
    try {
      const db = getDb();
      const related = entries.filter((e) => e.companyId === company.id);
      await Promise.all([
        deleteDoc(doc(db, "bill_companies", company.id)),
        ...related.map((e) => deleteDoc(doc(db, "bill_entries", e.id))),
      ]);
      setCompanies((cur) => cur.filter((c) => c.id !== company.id));
      setEntries((cur) => cur.filter((e) => e.companyId !== company.id));
      if (selectedId === company.id) setSelectedId(null);
      setMessage(`${company.name} deleted.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  function openEntryModal(type: BillEntryType) {
    setEntryForm({
      amount: "",
      date: todayStr(),
      time: nowTimeStr(),
      driveLink: "",
      remarks: "",
      transferDone: true,
    });
    setEntryModal(type);
    setMessage("");
  }

  async function saveEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !entryModal) return;
    const amount = parseAmount(entryForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a valid amount greater than 0.");
      return;
    }
    if (!entryForm.date) {
      setMessage("Pick a date.");
      return;
    }

    setSavingEntry(true);
    setMessage("");
    try {
      const id = uuid();
      const driveLink = entryForm.driveLink.trim();
      const remarks = entryForm.remarks.trim();
      const entry: BillEntry = {
        id,
        companyId: selected.id,
        owner,
        type: entryModal,
        amount,
        date: entryForm.date,
        time: entryForm.time.trim() || nowTimeStr(),
        createdAt: Date.now(),
        createdBy: session?.name || "Admin",
        ...(driveLink ? { driveLink } : {}),
        ...(remarks ? { remarks } : {}),
        ...(entryModal === "TRANSFER" ? { transferDone: entryForm.transferDone } : {}),
      };
      // Firestore rejects undefined — build payload with only defined fields.
      await setDoc(doc(getDb(), "bill_entries", id), {
        id: entry.id,
        companyId: entry.companyId,
        owner: entry.owner,
        type: entry.type,
        amount: entry.amount,
        date: entry.date,
        time: entry.time,
        createdAt: entry.createdAt,
        createdBy: entry.createdBy,
        ...(driveLink ? { driveLink } : {}),
        ...(remarks ? { remarks } : {}),
        ...(entryModal === "TRANSFER" ? { transferDone: entryForm.transferDone } : {}),
      });
      setEntries((cur) =>
        [entry, ...cur].sort((a, b) => {
          const dk = `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`);
          return dk !== 0 ? dk : b.createdAt - a.createdAt;
        })
      );
      setEntryModal(null);
      setMessage(
        entryModal === "EXTRA_BILL"
          ? `Extra bill ${formatRupee(amount)} added — remaining went up.`
          : `Transfer ${formatRupee(amount)} recorded — remaining went down.`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save entry.");
    } finally {
      setSavingEntry(false);
    }
  }

  async function deleteEntry(entry: BillEntry) {
    if (!confirm("Delete this record?")) return;
    try {
      await deleteDoc(doc(getDb(), "bill_entries", entry.id));
      setEntries((cur) => cur.filter((e) => e.id !== entry.id));
      setMessage("Record deleted.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  async function toggleTransferDone(entry: BillEntry) {
    if (entry.type !== "TRANSFER") return;
    const next = !entry.transferDone;
    try {
      await setDoc(
        doc(getDb(), "bill_entries", entry.id),
        { transferDone: next },
        { merge: true }
      );
      setEntries((cur) =>
        cur.map((e) => (e.id === entry.id ? { ...e, transferDone: next } : e))
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update.");
    }
  }

  const ledgerTotals = selected ? companyTotals(selected, entries) : null;

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Bill Report"
        actions={
          !selected ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setCompanyForm({ name: "", openingBalance: "", notes: "" });
                setShowCompanyForm(true);
                setMessage("");
              }}
            >
              <Plus size={16} />
              Add Company
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => openEntryModal("EXTRA_BILL")}>
                <Plus size={16} />
                Extra Bill
              </button>
              <button type="button" className="btn btn-primary" onClick={() => openEntryModal("TRANSFER")}>
                <IndianRupee size={16} />
                Transfer
              </button>
            </div>
          )
        }
      >
        <p className="section-sub">
          Companies you buy from — track extra bills (to pay) and transfers (already paid)
        </p>
      </PageToolbar>

      {/* Claris / Bliss picker */}
      <div className="flex flex-wrap gap-2">
        {OWNERS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`filter-pill ${owner === o.id ? "active" : ""}`}
            onClick={() => setOwner(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Owner summary */}
      {!selected && !loading && companies.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Total Extra Bill" value={formatRupee(ownerTotals.extraBill)} tone="amber" />
          <SummaryTile label="Total Transfer" value={formatRupee(ownerTotals.transfer)} tone="jade" />
          <SummaryTile
            label="Total Remaining"
            value={formatRupee(ownerTotals.remaining)}
            tone={ownerTotals.remaining > 0 ? "amber" : "jade"}
          />
        </div>
      )}

      {message && (
        <p className="rounded-xl bg-jade-soft px-4 py-3 text-sm text-jade-deep">{message}</p>
      )}

      {loading ? (
        <div className="surface py-14 text-center text-sm text-[var(--text-muted)]">Loading…</div>
      ) : selected && ledgerTotals ? (
        <CompanyLedger
          company={selected}
          ownerLabel={OWNERS.find((o) => o.id === owner)?.label || owner}
          entries={selectedEntries}
          totals={ledgerTotals}
          onBack={() => setSelectedId(null)}
          onDeleteCompany={() => deleteCompany(selected)}
          onDeleteEntry={deleteEntry}
          onToggleTransferDone={toggleTransferDone}
        />
      ) : (
        <>
          <AdminSearchBar
            value={search}
            onChange={setSearch}
            placeholder={`Search ${owner === "CLARIS" ? "Claris" : "Bliss"} companies…`}
          />
          {filteredCompanies.length === 0 ? (
            <div className="surface py-14 text-center text-sm text-[var(--text-muted)]">
              {companies.length === 0
                ? `No companies under ${owner === "CLARIS" ? "Claris" : "Bliss"} yet. Add one to start.`
                : "No company matches your search."}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCompanies.map((company) => {
                const t = companyTotals(company, entries);
                return (
                  <button
                    key={company.id}
                    type="button"
                    className="surface mobile-row w-full text-left transition hover:border-[var(--jade)]"
                    onClick={() => setSelectedId(company.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="shrink-0 text-[var(--text-muted)]" />
                          <p className="truncate font-display font-bold">{company.name}</p>
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Extra {formatRupee(t.extraBill)} · Transfer {formatRupee(t.transfer)}
                          {company.openingBalance > 0
                            ? ` · Opening ${formatRupee(company.openingBalance)}`
                            : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                          Remaining
                        </p>
                        <p
                          className={`font-display text-lg font-bold ${
                            t.remaining > 0 ? "text-[var(--bronze)]" : "text-jade-deep"
                          }`}
                        >
                          {formatRupee(t.remaining)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Add company modal */}
      {showCompanyForm && (
        <Modal title={`Add company — ${owner === "CLARIS" ? "Claris" : "Bliss"}`} onClose={() => setShowCompanyForm(false)}>
          <form className="space-y-4" onSubmit={saveCompany}>
            <div>
              <label className="label">Company name</label>
              <input
                className="input"
                value={companyForm.name}
                onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Kosmik India"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Opening remaining (optional)</label>
              <input
                className="input"
                inputMode="decimal"
                step="any"
                value={companyForm.openingBalance}
                onChange={(e) => setCompanyForm((f) => ({ ...f, openingBalance: e.target.value }))}
                placeholder="Old balance still to pay"
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                If you already owed them money before using this app, put it here.
              </p>
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <input
                className="input"
                value={companyForm.notes}
                onChange={(e) => setCompanyForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCompanyForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingCompany}>
                {savingCompany ? "Saving…" : "Save company"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Extra bill / Transfer modal */}
      {entryModal && selected && (
        <Modal
          title={entryModal === "EXTRA_BILL" ? `Extra bill — ${selected.name}` : `Transfer — ${selected.name}`}
          onClose={() => setEntryModal(null)}
        >
          <form className="space-y-4" onSubmit={saveEntry}>
            <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
              {entryModal === "EXTRA_BILL"
                ? "Extra bill = money this company billed you. Remaining to pay goes UP."
                : "Transfer = money you sent them. Remaining to pay goes DOWN."}
            </p>
            <div>
              <label className="label">Amount (₹)</label>
              <input
                className="input"
                inputMode="decimal"
                step="any"
                value={entryForm.amount}
                onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                autoFocus
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={entryForm.date}
                  onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Time</label>
                <input
                  className="input"
                  value={entryForm.time}
                  onChange={(e) => setEntryForm((f) => ({ ...f, time: e.target.value }))}
                  placeholder="e.g. 4:30 pm"
                />
              </div>
            </div>
            <div>
              <label className="label">Bill Google Drive link (optional)</label>
              <input
                className="input"
                value={entryForm.driveLink}
                onChange={(e) => setEntryForm((f) => ({ ...f, driveLink: e.target.value }))}
                placeholder="https://drive.google.com/…"
              />
            </div>
            <div>
              <label className="label">Remarks (optional)</label>
              <input
                className="input"
                value={entryForm.remarks}
                onChange={(e) => setEntryForm((f) => ({ ...f, remarks: e.target.value }))}
              />
            </div>
            {entryModal === "TRANSFER" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={entryForm.transferDone}
                  onChange={(e) => setEntryForm((f) => ({ ...f, transferDone: e.target.checked }))}
                />
                Transfer done
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEntryModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingEntry}>
                {savingEntry ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "jade" | "amber";
}) {
  return (
    <div
      className={`surface px-4 py-4 ${
        tone === "jade" ? "border-jade/30 bg-jade-soft/40" : "border-[var(--bronze)]/25 bg-[var(--bronze-soft)]"
      }`}
    >
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 font-display text-xl font-bold ${tone === "jade" ? "text-jade-deep" : "text-[var(--bronze)]"}`}>
        {value}
      </p>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="surface max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-bold">{title}</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CompanyLedger({
  company,
  ownerLabel,
  entries,
  totals,
  onBack,
  onDeleteCompany,
  onDeleteEntry,
  onToggleTransferDone,
}: {
  company: BillCompany;
  ownerLabel: string;
  entries: BillEntry[];
  totals: { extraBill: number; transfer: number; remaining: number };
  onBack: () => void;
  onDeleteCompany: () => void;
  onDeleteEntry: (e: BillEntry) => void;
  onToggleTransferDone: (e: BillEntry) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          <ArrowLeft size={14} />
          All companies
        </button>
        <span className="badge badge-neutral">{ownerLabel}</span>
        <button type="button" className="btn btn-secondary btn-sm ml-auto text-red-700" onClick={onDeleteCompany}>
          <Trash2 size={14} />
          Delete company
        </button>
      </div>

      <div className="surface p-5">
        <h3 className="font-display text-xl font-bold">{company.name}</h3>
        {company.notes && <p className="mt-1 text-sm text-[var(--text-muted)]">{company.notes}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Extra Bill" value={formatRupee(totals.extraBill)} tone="amber" />
          <SummaryTile label="Transfer" value={formatRupee(totals.transfer)} tone="jade" />
          <SummaryTile
            label="Remaining to pay"
            value={formatRupee(totals.remaining)}
            tone={totals.remaining > 0 ? "amber" : "jade"}
          />
        </div>
        {company.openingBalance > 0 && (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Opening balance: {formatRupee(company.openingBalance)}
          </p>
        )}
      </div>

      <div className="surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <p className="font-display text-sm font-bold">Records</p>
        </div>
        {entries.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
            No extra bills or transfers yet.
          </p>
        ) : (
          <>
            <div className="data-table-wrap hidden md:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Bill link</th>
                    <th>Remarks</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <div>{formatDisplayDate(entry.date)}</div>
                        {entry.time && (
                          <div className="text-xs text-[var(--text-muted)]">{entry.time}</div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            entry.type === "EXTRA_BILL" ? "badge-warn" : "badge-success"
                          }`}
                        >
                          {entry.type === "EXTRA_BILL" ? "Extra Bill" : "Transfer"}
                        </span>
                      </td>
                      <td className="font-semibold">
                        {entry.type === "EXTRA_BILL" ? "+" : "−"}
                        {formatRupee(entry.amount)}
                      </td>
                      <td>
                        {entry.type === "TRANSFER" ? (
                          <button
                            type="button"
                            className={`badge ${entry.transferDone ? "badge-success" : "badge-neutral"}`}
                            onClick={() => onToggleTransferDone(entry)}
                          >
                            {entry.transferDone ? "done" : "pending"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {entry.driveLink ? (
                          <a
                            href={entry.driveLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-jade-deep underline"
                          >
                            <Link2 size={14} />
                            Open
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-[12rem] truncate text-sm text-[var(--text-muted)]">
                        {entry.remarks || "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onDeleteEntry(entry)}
                          aria-label="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 p-3 md:hidden">
              {entries.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-[var(--border)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`badge ${
                          entry.type === "EXTRA_BILL" ? "badge-warn" : "badge-success"
                        }`}
                      >
                        {entry.type === "EXTRA_BILL" ? "Extra Bill" : "Transfer"}
                      </span>
                      <p className="mt-2 font-display text-lg font-bold">
                        {entry.type === "EXTRA_BILL" ? "+" : "−"}
                        {formatRupee(entry.amount)}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatDisplayDate(entry.date)}
                        {entry.time ? ` · ${entry.time}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onDeleteEntry(entry)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {entry.type === "TRANSFER" && (
                    <button
                      type="button"
                      className={`badge mt-2 ${entry.transferDone ? "badge-success" : "badge-neutral"}`}
                      onClick={() => onToggleTransferDone(entry)}
                    >
                      {entry.transferDone ? "done" : "pending"}
                    </button>
                  )}
                  {entry.driveLink && (
                    <a
                      href={entry.driveLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm text-jade-deep underline"
                    >
                      <Link2 size={14} />
                      Bill PDF
                    </a>
                  )}
                  {entry.remarks && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{entry.remarks}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatDisplayDate(iso: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
  } catch {
    return iso;
  }
}
