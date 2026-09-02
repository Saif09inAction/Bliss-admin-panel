import { doc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Attendance, AttendanceSettings, Employee, PaymentTransaction } from "@/lib/types";
import { computeCarryForwardUnpaid } from "@/lib/salary-detail";
import { computeEarnedSalaryForCalendarMonth, type OverrideMap } from "@/lib/deduction-utils";
import {
  calendarMonthFromOffset,
  earnedAsOfDateForCalendarView,
  salaryPaidInCalendarMonth,
} from "@/lib/pay-period-utils";

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

  const join = employee.joiningDate?.trim() || today;
  const viewedMonth = calendarMonthFromOffset(today, periodOffset);
  const asOfDate = earnedAsOfDateForCalendarView(
    { index: 0, start: "", end: "", daysInPeriod: 0 },
    viewedMonth,
    today
  );
  const empPayments = payments.filter((p) => p.employeeId === phone);
  const paid = salaryPaidInCalendarMonth(
    empPayments,
    join,
    viewedMonth.year,
    viewedMonth.month
  );
  const empAtt = attendance.filter(
    (a) => a.employeeId === phone || a.employeeId === employee.id
  );
  const earned = computeEarnedSalaryForCalendarMonth({
    monthlySalary: employee.monthlySalary,
    joinDate: join,
    year: viewedMonth.year,
    month: viewedMonth.month,
    asOfDate,
    records: empAtt,
    settings,
    overrides,
    employeePhone: phone,
    employeeShift: employee,
  });
  const periodDue = Math.round((earned.earnedNet - paid) * 100) / 100;
  const { total: carryForward } = computeCarryForwardUnpaid(opts);
  const total = Math.round((carryForward + periodDue) * 100) / 100;
  return total;
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
      salaryRemaining: Math.max(0, earnedDue),
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
