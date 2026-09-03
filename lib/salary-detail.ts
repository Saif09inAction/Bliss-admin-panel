import type { Attendance, AttendanceSettings, Employee, PaymentTransaction } from "@/lib/types";
import {
  computeEarnedSalaryForCalendarMonth,
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
  calendarMonthBounds,
  calendarMonthFromOffset,
  earnedAsOfDateForCalendarView,
  formatCalendarMonthLabel,
  paymentsInCalendarMonth,
  resolvePayPeriodForCalendarOffset,
  salaryPaidInCalendarMonth,
  type PayPeriod,
} from "@/lib/pay-period-utils";

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
  const {
    employee,
    payments,
    attendance,
    settings,
    overrides,
    monthOffset,
    today,
    fullMonth = false,
  } = opts;
  const join = employee.joiningDate?.trim() || today;
  const phone = employee.phone;
  const viewedMonth = calendarMonthFromOffset(today, monthOffset);
  const { start: monthStart, end: monthEnd } = calendarMonthBounds(
    viewedMonth.year,
    viewedMonth.month
  );
  const label = formatCalendarMonthLabel(viewedMonth.year, viewedMonth.month);
  const empty = {
    label,
    year: viewedMonth.year,
    month: viewedMonth.month,
    monthStart,
    monthEnd,
    periodStart: monthStart,
    periodEnd: monthEnd,
    earned: 0,
    paid: 0,
    balance: 0,
  };
  if (monthEnd < join) return empty;

  const payPeriod = resolvePayPeriodForCalendarOffset(join, monthOffset, today);
  const asOfDate = fullMonth
    ? monthEnd
    : earnedAsOfDateForCalendarView(
        payPeriod ?? { index: -1, start: monthStart, end: monthEnd, daysInPeriod: 0 },
        viewedMonth,
        today
      );

  const empPayments = payments.filter((p) => p.employeeId === phone);
  const empAtt = attendance.filter(
    (a) => a.employeeId === phone || a.employeeId === employee.id
  );
  const earnedSummary = computeEarnedSalaryForCalendarMonth({
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
  const paid = salaryPaidInCalendarMonth(
    empPayments,
    join,
    viewedMonth.year,
    viewedMonth.month
  );
  const earned = earnedSummary.earnedNet;
  const balance = Math.round((earned - paid) * 100) / 100;

  return {
    label,
    year: viewedMonth.year,
    month: viewedMonth.month,
    monthStart,
    monthEnd,
    periodStart: payPeriod?.start ?? monthStart,
    periodEnd: payPeriod?.end ?? monthEnd,
    earned,
    paid,
    balance,
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
  const { employee, payments, attendance, settings, overrides, periodOffset, today } = opts;
  const join = employee.joiningDate?.trim() || today;

  const pastOffsets: number[] = [];
  let offset = periodOffset - 1;
  while (offset >= periodOffset - 120) {
    const pastMonth = calendarMonthFromOffset(today, offset);
    const { end: monthEnd } = calendarMonthBounds(pastMonth.year, pastMonth.month);
    if (monthEnd < join) break;
    pastOffsets.push(offset);
    offset--;
  }
  pastOffsets.reverse();

  const lines: CarryForwardLine[] = [];
  let total = 0;

  for (const pastOffset of pastOffsets) {
    const monthBalance = computeCalendarMonthBalance({
      employee,
      payments,
      attendance,
      settings,
      overrides,
      monthOffset: pastOffset,
      today,
      fullMonth: true,
    });
    if (monthBalance.balance === 0) continue;
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
  const viewedMonth = calendarMonthFromOffset(today, periodOffset);
  const { start: monthStart, end: monthEnd } = calendarMonthBounds(
    viewedMonth.year,
    viewedMonth.month
  );
  const period = resolvePayPeriodForCalendarOffset(employee.joiningDate, periodOffset, today);
  const asOfDate = earnedAsOfDateForCalendarView(
    period ?? { index: -1, start: monthStart, end: monthEnd, daysInPeriod: 0 },
    viewedMonth,
    today
  );
  const phone = employee.phone;
  const empPayments = payments.filter((p) => p.employeeId === phone);
  const paid = salaryPaidInCalendarMonth(empPayments, join, viewedMonth.year, viewedMonth.month);
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

  const { lines: carryForward, total: carryForwardTotal } = computeCarryForwardUnpaid(opts);
  const periodDue = Math.round((earned.earnedNet - paid) * 100) / 100;
  const totalDue = Math.round((carryForwardTotal + periodDue) * 100) / 100;

  const attendanceStats = countAttendanceInPeriod({
    periodStart: monthStart,
    periodEnd: monthEnd,
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

  return {
    period: period ?? {
      index: -1,
      start: monthStart,
      end: monthEnd,
      daysInPeriod: earned.daysInPeriod,
    },
    periodLabel: formatCalendarMonthLabel(viewedMonth.year, viewedMonth.month),
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
    payments: paymentsInCalendarMonth(
      empPayments.filter((p) => p.type === "SALARY_PAYMENT"),
      join,
      viewedMonth.year,
      viewedMonth.month
    ),
  };
}

export { formatDurationMinutes };
