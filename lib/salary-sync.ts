import { doc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Attendance, AttendanceSettings, Employee, PaymentTransaction } from "@/lib/types";
import { computeCarryForwardUnpaid } from "@/lib/salary-detail";
import { computeEarnedSalary, type OverrideMap } from "@/lib/deduction-utils";
import { earnedAsOfDate, resolvePayPeriod, salaryPaidInPeriod } from "@/lib/pay-period-utils";

export function computeStaffEarnedDue(opts: {
  employee: Employee;
  payments: PaymentTransaction[];
  attendance: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideMap;
  periodOffset: number;
  today: string;
}): number {
  const { employee, payments, attendance, settings, overrides, periodOffset, today } = opts;
  const phone = employee.phone?.trim();
  if (!phone) return 0;

  const period = resolvePayPeriod(employee.joiningDate, periodOffset, today);
  const asOfDate = earnedAsOfDate(period, today);
  const empPayments = payments.filter((p) => p.employeeId === phone);
  const paid = salaryPaidInPeriod(empPayments, period.start, period.end);
  const empAtt = attendance.filter(
    (a) => a.employeeId === phone || a.employeeId === employee.id
  );
  const earned = computeEarnedSalary({
    monthlySalary: employee.monthlySalary,
    periodStart: period.start,
    periodEnd: period.end,
    asOfDate,
    records: empAtt,
    settings,
    overrides,
    employeePhone: phone,
    employeeShift: employee,
  });
  const periodDue = Math.max(0, Math.round((earned.earnedNet - paid) * 100) / 100);
  const { total: carryForward } = computeCarryForwardUnpaid(opts);
  return Math.round((carryForward + periodDue) * 100) / 100;
}

/** Recompute earned due and write to employees/{phone}.salaryRemaining (clears manual override). */
export async function syncEmployeeSalaryRemaining(opts: {
  employee: Employee;
  payments: PaymentTransaction[];
  attendance: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideMap;
  periodOffset: number;
  today: string;
}): Promise<number> {
  const earnedDue = computeStaffEarnedDue(opts);
  const phone = opts.employee.phone?.trim();
  if (phone && opts.periodOffset === 0) {
    await updateDoc(doc(getDb(), "employees", phone), {
      salaryRemaining: earnedDue,
      salaryDueManual: false,
    });
  }
  return earnedDue;
}

/** Admin manually sets remaining salary due (staff app reads salaryRemaining). */
export async function setManualSalaryRemaining(
  employeePhone: string,
  amount: number
): Promise<void> {
  const phone = employeePhone.trim();
  if (!phone) throw new Error("Missing staff phone.");
  const rounded = Math.max(0, Math.round(amount * 100) / 100);
  await updateDoc(doc(getDb(), "employees", phone), {
    salaryRemaining: rounded,
    salaryDueManual: true,
  });
}
