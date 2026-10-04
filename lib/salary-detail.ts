import type { Attendance, AttendanceSettings, Employee, PaymentTransaction } from "@/lib/types";
import {
  computeEarnedSalary,
  formatDurationMinutes,
  isWorkingDay,
  isPaidOffDay,
  resolveShiftSettings,
  type EarnedSalarySummary,
  type OverrideMap,
} from "@/lib/deduction-utils";
import { computeShiftWorkingHours } from "@/lib/attendance-utils";
import { addDaysIso } from "@/lib/pay-period-utils";
import {
  currentPayPeriodIndex,
  earnedAsOfDate,
  formatPayPeriodLabel,
  payPeriodContainingDate,
  payPeriodForIndex,
  resolvePayPeriod,
  type PayPeriod,
} from "@/lib/pay-period-utils";

/** Ignore payments booked for periods entirely before the staff joining date. */
export function paymentCountsTowardSalary(
  payment: PaymentTransaction,
  joinDate: string
): boolean {
  if (payment.type !== "SALARY_PAYMENT") return false;
  const join = joinDate.trim();
  if (!join) return true;
  if (payment.periodEnd && payment.periodEnd < join) return false;
  if (payment.periodStart && payment.periodStart < join) {
    // Tagged before join with no end, or end also before join → ignore
    if (!payment.periodEnd || payment.periodEnd < join) return false;
  }
  if (!payment.periodStart && payment.date && payment.date < join) return false;
  return true;
}
export type CarryForwardLine = {
  label: string;
  periodStart: string;
  periodEnd: string;
  earned: number;
  paid: number;
  /** earned − paid; negative when admin overpaid that period */
  balance: number;
  /** @deprecated use balance */
  unpaid: number;
};

export type AllocatedMonthBalance = {
  label: string;
  year: number;
  month: number;
  monthOffset: number;
  monthStart: string;
  monthEnd: string;
  periodStart: string;
  periodEnd: string;
  earned: number;
  paid: number;
  balance: number;
};

/** Date that decides which join cycle a payment is listed under. */
export function paymentCycleAnchor(payment: PaymentTransaction): string {
  return (payment.periodStart || payment.date || "").trim().slice(0, 10);
}

/** Salary payments whose booked period (or date) falls inside this join cycle. */
export function paymentsInJoinPeriod(
  payments: PaymentTransaction[],
  joinDate: string,
  periodStart: string,
  periodEnd: string
): PaymentTransaction[] {
  return payments
    .filter((pay) => {
      if (!paymentCountsTowardSalary(pay, joinDate)) return false;
      const anchor = paymentCycleAnchor(pay);
      return Boolean(anchor) && anchor >= periodStart && anchor <= periodEnd;
    })
    .sort((a, b) => {
      const byDate = (b.date || "").localeCompare(a.date || "");
      if (byDate !== 0) return byDate;
      return (b.time || "").localeCompare(a.time || "");
    });
}

/**
 * Oldest join-cycle first, through the cycle that contains today.
 * A cycle is join day → day before the next join day (10 Sep–9 Oct, then 10 Oct–9 Nov).
 * Past cycles are covered up to earned; leftover payment parks on the current cycle.
 */
export function allocateStaffSalaryByMonth(opts: {
  employee: Employee;
  payments: PaymentTransaction[];
  attendance: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideMap;
  today: string;
}): AllocatedMonthBalance[] {
  const { employee, payments, attendance, settings, overrides, today } = opts;
  const join = employee.joiningDate?.trim() || today;
  const phone = employee.phone;
  const empPayments = payments.filter(
    (p) =>
      p.employeeId === phone &&
      p.type === "SALARY_PAYMENT" &&
      paymentCountsTowardSalary(p, join)
  );
  const empAtt = attendance.filter(
    (a) => a.employeeId === phone || a.employeeId === employee.id
  );

  const currentIndex = currentPayPeriodIndex(join, today);
  const months: AllocatedMonthBalance[] = [];
  for (let index = 0; index <= currentIndex; index++) {
    const period = payPeriodForIndex(join, index);
    const isCurrent = index === currentIndex;
    const asOfDate = isCurrent ? earnedAsOfDate(period, today) : period.end;
    const earnedSummary = computeEarnedSalary({
      monthlySalary: employee.monthlySalary,
      periodStart: period.start,
      periodEnd: period.end,
      asOfDate,
      records: empAtt,
      settings,
      overrides,
      employeePhone: phone,
      employeeShift: employee,
      salaryHistory: employee.salaryHistory,
      excludedDates: employee.salaryExcludedDates,
    });
    const [yearStr, monthStr] = period.start.split("-");

    months.push({
      label: formatPayPeriodLabel(period.start, period.end),
      year: Number(yearStr) || 0,
      month: Number(monthStr) || 0,
      monthOffset: index - currentIndex,
      monthStart: period.start,
      monthEnd: period.end,
      periodStart: period.start,
      periodEnd: period.end,
      earned: earnedSummary.earnedNet,
      paid: 0,
      balance: earnedSummary.earnedNet,
    });
  }

  let pool = Math.round(empPayments.reduce((sum, p) => sum + (p.amount || 0), 0) * 100) / 100;
  for (const row of months) {
    if (row.monthOffset === 0) {
      row.paid = Math.round(pool * 100) / 100;
      pool = 0;
    } else {
      const cover = Math.min(row.earned, pool);
      row.paid = Math.round(cover * 100) / 100;
      pool = Math.round((pool - cover) * 100) / 100;
    }
    row.balance = Math.round((row.earned - row.paid) * 100) / 100;
  }

  return months;
}

export function findAllocatedMonth(
  allocated: AllocatedMonthBalance[],
  monthOffset: number
): AllocatedMonthBalance | null {
  return allocated.find((m) => m.monthOffset === monthOffset) ?? null;
}

export type SalaryStaffDetail = {
  period: PayPeriod;
  periodLabel: string;
  asOfDate: string;
  isCurrentPeriod: boolean;
  carryForward: CarryForwardLine[];
  carryForwardTotal: number;
  attendance: {
    workingDays: number;
    fullDays: number;
    halfDays: number;
    absentDays: number;
    holidayDays: number;
    totalWorkingHours: number;
  };
  earnings: {
    fullDayCount: number;
    fullDayAmount: number;
    halfDayCount: number;
    halfDayAmount: number;
    grossEarned: number;
  };
  deductions: {
    lateMinutes: number;
    earlyMinutes: number;
    lateAmount: number;
    earlyAmount: number;
    total: number;
  };
  earned: EarnedSalarySummary;
  paid: number;
  periodDue: number;
  totalDue: number;
  payments: PaymentTransaction[];
  /** When current month has leftover credit from a prior-month payment (no new txn booked). */
  priorSettlementCredit: {
    sourcePaymentAmount: number;
    sourceMonthLabel: string;
    priorSettledAmount: number;
    creditApplied: number;
  } | null;
};

function countAttendanceInPeriod(opts: {
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
  records: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideMap;
  employeePhone?: string;
  employeeShift?: Employee;
}) {
  const {
    periodStart,
    periodEnd,
    asOfDate,
    records,
    settings,
    overrides,
    employeePhone,
    employeeShift,
  } = opts;
  const until = asOfDate < periodEnd ? asOfDate : periodEnd;
  const byDate = new Map(records.map((r) => [r.date, r]));

  let workingDays = 0;
  let fullDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let holidayDays = 0;
  let totalWorkingHours = 0;

  if (until < periodStart) {
    return { workingDays, fullDays, halfDays, absentDays, holidayDays, totalWorkingHours };
  }

  let cursor = periodStart;
  while (cursor <= periodEnd) {
    const key = cursor;
    cursor = addDaysIso(cursor, 1);
    if (key > until) continue;

    if (!isWorkingDay(key, overrides, employeePhone)) {
      holidayDays++;
      // Admin OFF / Sunday is paid as present for salary.
      if (isPaidOffDay(key, overrides, employeePhone)) {
        fullDays++;
      }
      continue;
    }

    workingDays++;
    const rec = byDate.get(key);
    const credit = rec?.dayCredit;
    const isHalf =
      credit === "HALF" || rec?.status === "HALF_DAY" || rec?.status === "HALF DAY";
    const hasPunch = Boolean(rec?.signInTime);
    const creditedFull = credit === "FULL";

    const dayShift = resolveShiftSettings(
      employeeShift,
      settings,
      key,
      overrides,
      employeePhone
    );
    const shiftHours =
      rec?.signInTime && rec?.signOutTime
        ? computeShiftWorkingHours(
            rec.signInTime,
            rec.signOutTime,
            dayShift.dailySignInTime,
            dayShift.dailySignOutTime
          )
        : 0;

    if (isHalf) {
      halfDays++;
      totalWorkingHours += shiftHours;
    } else if (hasPunch || creditedFull) {
      fullDays++;
      totalWorkingHours += shiftHours;
    } else {
      absentDays++;
    }
  }

  return { workingDays, fullDays, halfDays, absentDays, holidayDays, totalWorkingHours };
}

export function computeCalendarMonthBalance(opts: {
  employee: Employee;
  payments: PaymentTransaction[];
  attendance: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideMap;
  monthOffset: number;
  today: string;
  fullMonth?: boolean;
}): {
  label: string;
  year: number;
  month: number;
  monthStart: string;
  monthEnd: string;
  periodStart: string;
  periodEnd: string;
  earned: number;
  paid: number;
  balance: number;
} {
  const allocated = allocateStaffSalaryByMonth(opts);
  const period = resolvePayPeriod(opts.employee.joiningDate, opts.monthOffset, opts.today);
  const row =
    allocated.find((m) => m.periodStart === period.start) ??
    findAllocatedMonth(allocated, opts.monthOffset);
  const [yearStr, monthStr] = period.start.split("-");
  if (!row) {
    return {
      label: formatPayPeriodLabel(period.start, period.end),
      year: Number(yearStr) || 0,
      month: Number(monthStr) || 0,
      monthStart: period.start,
      monthEnd: period.end,
      periodStart: period.start,
      periodEnd: period.end,
      earned: 0,
      paid: 0,
      balance: 0,
    };
  }
  return {
    label: row.label,
    year: row.year,
    month: row.month,
    monthStart: row.monthStart,
    monthEnd: row.monthEnd,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    earned: row.earned,
    paid: row.paid,
    balance: row.balance,
  };
}

export function computeCarryForwardUnpaid(opts: {
  employee: Employee;
  payments: PaymentTransaction[];
  attendance: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideMap;
  periodOffset: number;
  today: string;
}): { lines: CarryForwardLine[]; total: number } {
  const allocated = allocateStaffSalaryByMonth(opts);
  const viewed = resolvePayPeriod(opts.employee.joiningDate, opts.periodOffset, opts.today);
  const lines: CarryForwardLine[] = [];
  let total = 0;

  for (const monthBalance of allocated) {
    if (monthBalance.periodStart >= viewed.start) continue;
    // Waterfall parks excess on the current month, so past months are either
    // unpaid (positive) or settled (0). Skip settled.
    const pending = Math.round(monthBalance.balance);
    if (pending === 0) continue;
    lines.push({
      label: monthBalance.label,
      periodStart: monthBalance.periodStart,
      periodEnd: monthBalance.periodEnd,
      earned: monthBalance.earned,
      paid: monthBalance.paid,
      balance: monthBalance.balance,
      unpaid: monthBalance.balance,
    });
    total += monthBalance.balance;
  }

  return { lines, total: Math.round(total * 100) / 100 };
}

export function buildSalaryStaffDetail(opts: {
  employee: Employee;
  payments: PaymentTransaction[];
  attendance: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideMap;
  periodOffset: number;
  today: string;
}): SalaryStaffDetail {
  const { employee, payments, attendance, settings, overrides, periodOffset, today } = opts;
  const join = employee.joiningDate?.trim() || today;
  const period = resolvePayPeriod(employee.joiningDate, periodOffset, today);
  const asOfDate = earnedAsOfDate(period, today);
  const phone = employee.phone;
  const empPayments = payments.filter((p) => p.employeeId === phone);
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
    salaryHistory: employee.salaryHistory,
    excludedDates: employee.salaryExcludedDates,
  });

  const allocated = allocateStaffSalaryByMonth(opts);
  const monthRow =
    allocated.find((m) => m.periodStart === period.start) ??
    findAllocatedMonth(allocated, periodOffset);
  const paid = monthRow?.paid ?? 0;
  const { lines: carryForward, total: carryForwardTotal } = computeCarryForwardUnpaid(opts);
  const periodDue = Math.round(((monthRow?.earned ?? earned.earnedNet) - paid) * 100) / 100;
  const totalDue = Math.round((carryForwardTotal + periodDue) * 100) / 100;

  const attendanceStats = countAttendanceInPeriod({
    periodStart: period.start,
    periodEnd: period.end,
    asOfDate,
    records: empAtt,
    settings,
    overrides,
    employeePhone: phone,
    employeeShift: employee,
  });

  let fullDayAmount = 0;
  let halfDayAmount = 0;
  let fullDayCount = 0;
  let halfDayCount = 0;
  let lateAmount = 0;
  let earlyAmount = 0;

  for (const day of earned.days) {
    if (day.payExcluded) continue;
    const factor = day.dayFactor ?? 1;
    if (factor < 1) {
      halfDayCount++;
      halfDayAmount += day.dayGross;
    } else {
      fullDayCount++;
      fullDayAmount += day.dayGross;
    }
    lateAmount += day.lateDeduction ?? 0;
    earlyAmount += day.earlyDeduction ?? 0;
  }

  const monthPayments = paymentsInJoinPeriod(empPayments, join, period.start, period.end);

  let priorSettlementCredit: SalaryStaffDetail["priorSettlementCredit"] = null;
  if (periodOffset === 0 && monthPayments.length === 0 && paid > 0) {
    const priorPays = empPayments
      .filter((p) => paymentCountsTowardSalary(p, join))
      .filter((p) => {
        const anchor = paymentCycleAnchor(p);
        return Boolean(anchor) && anchor < period.start;
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const source = priorPays[0];
    if (source) {
      const anchor = paymentCycleAnchor(source);
      const priorRow = allocated.find(
        (m) => anchor >= m.periodStart && anchor <= m.periodEnd
      );
      const ownedPeriod = payPeriodContainingDate(join, anchor);
      priorSettlementCredit = {
        sourcePaymentAmount: source.amount,
        sourceMonthLabel:
          priorRow?.label ||
          (ownedPeriod
            ? formatPayPeriodLabel(ownedPeriod.start, ownedPeriod.end)
            : anchor),
        priorSettledAmount: priorRow?.paid ?? 0,
        creditApplied: paid,
      };
    }
  }

  return {
    period,
    periodLabel: formatPayPeriodLabel(period.start, period.end),
    asOfDate,
    isCurrentPeriod: periodOffset === 0,
    carryForward,
    carryForwardTotal,
    attendance: {
      workingDays: attendanceStats.workingDays,
      fullDays: attendanceStats.fullDays,
      halfDays: attendanceStats.halfDays,
      absentDays: attendanceStats.absentDays,
      holidayDays: attendanceStats.holidayDays,
      totalWorkingHours: Math.round(attendanceStats.totalWorkingHours * 100) / 100,
    },
    earnings: {
      fullDayCount,
      fullDayAmount: Math.round(fullDayAmount * 100) / 100,
      halfDayCount,
      halfDayAmount: Math.round(halfDayAmount * 100) / 100,
      grossEarned: earned.grossEarned,
    },
    deductions: {
      lateMinutes: earned.totalLateMinutes,
      earlyMinutes: earned.totalEarlyMinutes,
      lateAmount: Math.round(lateAmount * 100) / 100,
      earlyAmount: Math.round(earlyAmount * 100) / 100,
      total: earned.totalDeduction,
    },
    earned,
    paid,
    periodDue,
    totalDue,
    payments: monthPayments,
    priorSettlementCredit,
  };
}

export { formatDurationMinutes };
