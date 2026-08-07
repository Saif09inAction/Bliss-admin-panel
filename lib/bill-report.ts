import { formatDisplayTime, timeSortKey } from "@/lib/csv";
import { downloadCsvRows } from "@/lib/csv";
import type { BillCompany, BillEntry, BillOwner } from "@/lib/types";

/** Remaining to pay = opening + extra bills − transfers. */
export function companyRemaining(company: BillCompany, entries: BillEntry[]): number {
  const scoped = entries.filter((e) => e.companyId === company.id);
  const extras = scoped.filter((e) => e.type === "EXTRA_BILL").reduce((s, e) => s + e.amount, 0);
  const transfers = scoped.filter((e) => e.type === "TRANSFER").reduce((s, e) => s + e.amount, 0);
  return (company.openingBalance || 0) + extras - transfers;
}

export function companyTotals(company: BillCompany, entries: BillEntry[]) {
  const scoped = entries.filter((e) => e.companyId === company.id);
  const extraBill = scoped
    .filter((e) => e.type === "EXTRA_BILL")
    .reduce((s, e) => s + e.amount, 0);
  const transfer = scoped
    .filter((e) => e.type === "TRANSFER")
    .reduce((s, e) => s + e.amount, 0);
  const remaining = (company.openingBalance || 0) + extraBill - transfer;
  return { extraBill, transfer, remaining };
}

function moneyCell(n: number) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return String(v);
}

function ownerLabel(owner: BillOwner) {
  return owner === "CLARIS" ? "Claris" : "Bliss";
}

/**
 * Export Bill Report as CSV (opens in Excel), shaped like the client's sheet:
 * DATE | TRANSFER AMOUNT | EXTRA BILL | TRANS DONE | BILL DATE | DRIVE LINK | COMPANY
 * plus per-company and owner totals.
 */
export function exportBillReportCsv(opts: {
  owner: BillOwner;
  companies: BillCompany[];
  entries: BillEntry[];
  /** If set, export only this company. */
  companyId?: string;
}) {
  const { owner, companies, entries, companyId } = opts;
  const list = companyId
    ? companies.filter((c) => c.id === companyId)
    : [...companies].sort((a, b) => a.name.localeCompare(b.name));

  const rows: string[][] = [];
  rows.push([`${ownerLabel(owner).toUpperCase()} BILLS REPORT`]);
  rows.push([]);
  rows.push([
    "DATE",
    "TRANSFER AMOUNT",
    "EXTRA BILL",
    "TRANS DONE",
    "BILL DATE",
    "DRIVE LINK",
    "COMPANY",
    "REMARKS",
  ]);

  let wroteAny = false;

  for (const company of list) {
    const scoped = entries
      .filter((e) => e.companyId === company.id)
      .sort((a, b) => `${a.date} ${timeSortKey(a.time)}`.localeCompare(`${b.date} ${timeSortKey(b.time)}`));

    if (company.openingBalance > 0) {
      rows.push([
        "",
        "",
        moneyCell(company.openingBalance),
        "",
        "",
        "",
        company.name,
        "Opening remaining",
      ]);
      wroteAny = true;
    }

    if (scoped.length === 0 && company.openingBalance <= 0) {
      rows.push(["", "", "", "", "", "", company.name, "No records yet"]);
      wroteAny = true;
    }

    for (const entry of scoped) {
      const isTransfer = entry.type === "TRANSFER";
      const isExtra = entry.type === "EXTRA_BILL";
      rows.push([
        entry.date,
        isTransfer ? moneyCell(entry.amount) : "0",
        isExtra ? moneyCell(entry.amount) : "0",
        isTransfer ? (entry.transferDone ? "done" : "pending") : "",
        isExtra ? entry.date : "",
        entry.driveLink || "",
        company.name,
        [formatDisplayTime(entry.time), entry.remarks].filter(Boolean).join(" · "),
      ]);
      wroteAny = true;
    }
  }

  if (!wroteAny) {
    rows.push(["", "", "", "", "", "", "", "No companies yet"]);
  }

  const totalsExtraBills = list.reduce((s, c) => s + companyTotals(c, entries).extraBill, 0);
  const totalsTransfer = list.reduce((s, c) => s + companyTotals(c, entries).transfer, 0);
  const totalsOpening = list.reduce((s, c) => s + (c.openingBalance || 0), 0);
  const totalsRemaining = list.reduce((s, c) => s + companyTotals(c, entries).remaining, 0);

  rows.push([]);
  rows.push(["SUMMARY"]);
  rows.push(["Opening", moneyCell(totalsOpening)]);
  rows.push(["Extra Bill", moneyCell(totalsExtraBills)]);
  rows.push(["Transfer amount", moneyCell(totalsTransfer)]);
  rows.push(["Remaining to pay", moneyCell(totalsRemaining)]);

  const stamp = new Date().toISOString().slice(0, 10);
  const scope = companyId
    ? (list[0]?.name || "company").replace(/[^a-z0-9]+/gi, "_").toLowerCase()
    : "all";
  downloadCsvRows(
    `bill_report_${ownerLabel(owner).toLowerCase()}_${scope}_${stamp}.csv`,
    rows
  );
}
