import type { BillCompany, BillEntry } from "@/lib/types";

/** Remaining to pay = opening + extra bills − transfers. Never negative for display of “due”. */
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
