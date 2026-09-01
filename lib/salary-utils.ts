import type { PaymentTransaction } from "./types";
import { daysInMonth, dateKey } from "./attendance-utils";

export type SalaryFilter = "ALL" | "PAID" | "UNPAID" | "PARTIAL";

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function currentMonthParts(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function monthDateRange(year: number, month: number): { start: string; end: string } {
  const total = daysInMonth(year, month);
  return {
    start: dateKey(year, month, 1),
    end: dateKey(year, month, total),
  };
}

export function salaryPaidInMonth(payments: PaymentTransaction[], monthPrefix: string): number {
  return payments
    .filter((p) => p.type === "SALARY_PAYMENT" && p.date.startsWith(monthPrefix))
    .reduce((sum, p) => sum + p.amount, 0);
}

export function salaryStatus(
  monthlySalary: number,
  paid: number
): "PAID" | "UNPAID" | "PARTIAL" | "NONE" {
  if (monthlySalary <= 0) return "NONE";
  if (paid >= monthlySalary) return "PAID";
  if (paid <= 0) return "UNPAID";
  return "PARTIAL";
}

export { nowTimeStr } from "@/lib/csv";

export function todayDateStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function parsePayment(id: string, data: Record<string, unknown>): PaymentTransaction {
  return {
    id: (data.id as string) || id,
    employeeId: (data.employeeId as string) || "",
    amount: (data.amount as number) || 0,
    type: ((data.type as string) || "SALARY_PAYMENT") as PaymentTransaction["type"],
    date: (data.date as string) || "",
    time: (data.time as string) || "",
    remarks: (data.remarks as string) || undefined,
    createdBy: (data.createdBy as string) || "Admin",
    periodStart: (data.periodStart as string) || undefined,
    periodEnd: (data.periodEnd as string) || undefined,
  };
}
