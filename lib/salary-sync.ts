import { doc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Attendance, AttendanceSettings, Employee, PaymentTransaction } from "@/lib/types";
import {
  allocateStaffSalaryByMonth,
  computeCarryForwardUnpaid,
  findAllocatedMonth,
} from "@/lib/salary-detail";
import type { OverrideMap } from "@/lib/deduction-utils";

export function computeStaffEarnedDue(opts: {
  employee: Employee;
  payments: PaymentTransaction[];
  attendance: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideMap;
  periodOffset: number;
  today: string;
}): number {
  const { employee, periodOffset } = opts;
  const phone = employee.phone?.trim();
  if (!phone) return 0;

  const allocated = allocateStaffSalaryByMonth(opts);
  const monthRow = findAllocatedMonth(allocated, periodOffset);
  const paid = monthRow?.paid ?? 0;
  const earnedNet = monthRow?.earned ?? 0;
  const periodDue = Math.round((earnedNet - paid) * 100) / 100;
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
      salaryRemaining: Math.max(0, earnedDue),
      salaryDueManual: false,
    });
  }
  return earnedDue;
}

/** After holiday/calendar changes, refresh salaryRemaining for all STAFF so apps stay correct. */
export async function syncAllStaffSalaryRemaining(opts: {
  employees: Employee[];
  payments: PaymentTransaction[];
  attendance: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideMap;
  today: string;
}): Promise<void> {
  const staff = opts.employees.filter((e) => (e.role || "STAFF") === "STAFF" && e.phone?.trim());
  await Promise.all(
    staff.map((employee) =>
      syncEmployeeSalaryRemaining({
        employee,
        payments: opts.payments,
        attendance: opts.attendance,
        settings: opts.settings,
        overrides: opts.overrides,
        periodOffset: 0,
        today: opts.today,
      }).catch(() => 0)
    )
  );
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
