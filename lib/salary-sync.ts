import { doc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Attendance, AttendanceSettings, Employee, PaymentTransaction } from "@/lib/types";
import { computeEarnedSalary, type OverrideMap } from "@/lib/deduction-utils";
import { earnedAsOfDate, resolvePayPeriod, salaryPaidInPeriod } from "@/lib/pay-period-utils";

/** Recompute earned due for the current pay period and write to employees/{phone}.salaryRemaining. */
export async function syncEmployeeSalaryRemaining(opts: {
  employee: Employee;
  payments: PaymentTransaction[];
  attendance: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideMap;
  periodOffset: number;
  today: string;
}): Promise<number> {
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
  const earnedDue = Math.max(0, Math.round((earned.earnedNet - paid) * 100) / 100);

  if (periodOffset === 0) {
    await updateDoc(doc(getDb(), "employees", phone), {
      salaryRemaining: earnedDue,
    });
  }

  return earnedDue;
}
