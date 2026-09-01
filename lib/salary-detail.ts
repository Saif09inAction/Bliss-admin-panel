import type { Attendance, AttendanceSettings, Employee, PaymentTransaction } from "@/lib/types";
import {
  computeEarnedSalary,
  formatDurationMinutes,
  isWorkingDay,
  resolveShiftSettings,
  type EarnedSalarySummary,
  type OverrideMap,
} from "@/lib/deduction-utils";
import { computeShiftWorkingHours } from "@/lib/attendance-utils";
import { addDaysIso } from "@/lib/pay-period-utils";
import {
  calendarMonthFromOffset,
  earnedAsOfDateForCalendarView,
  formatCalendarMonthLabel,
  formatPayPeriodMonthLabel,
  payPeriodForIndex,
  paymentsInPeriod,
  resolvePayPeriodForCalendarOffset,
  salaryPaidInPeriod,
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
  const viewedPeriod = resolvePayPeriodForCalendarOffset(join, periodOffset, today);
  if (!viewedPeriod) {
    return { lines: [], total: 0 };
  }
  const viewIdx = viewedPeriod.index;
  const phone = employee.phone;
  const empPayments = payments.filter((p) => p.employeeId === phone);
  const empAtt = attendance.filter(
    (a) => a.employeeId === phone || a.employeeId === employee.id
  );

  const lines: CarryForwardLine[] = [];
  let total = 0;

  for (let i = 0; i < viewIdx; i++) {
    const period = payPeriodForIndex(join, i);
    const paid = salaryPaidInPeriod(empPayments, period.start, period.end);
    const earned = computeEarnedSalary({
      monthlySalary: employee.monthlySalary,
      periodStart: period.start,
      periodEnd: period.end,
      asOfDate: period.end,
      records: empAtt,
      settings,
      overrides,
      employeePhone: phone,
      employeeShift: employee,
    });
    const balance = Math.round((earned.fullMonthNet - paid) * 100) / 100;
    if (balance !== 0) {
      lines.push({
        label: formatPayPeriodMonthLabel(period.start, period.end),
        periodStart: period.start,
        periodEnd: period.end,
        earned: earned.fullMonthNet,
        paid,
        balance,
        unpaid: balance,
      });
      total += balance;
    }
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
  const viewedMonth = calendarMonthFromOffset(today, periodOffset);
  const period = resolvePayPeriodForCalendarOffset(employee.joiningDate, periodOffset, today);
  if (!period) {
    return {
      period: { index: -1, start: "", end: "", daysInPeriod: 0 },
      periodLabel: formatCalendarMonthLabel(viewedMonth.year, viewedMonth.month),
      asOfDate: today,
      isCurrentPeriod: periodOffset === 0,
      carryForward: [],
      carryForwardTotal: 0,
      attendance: {
        workingDays: 0,
        fullDays: 0,
        halfDays: 0,
        absentDays: 0,
        holidayDays: 0,
        totalWorkingHours: 0,
      },
      earnings: {
        fullDayCount: 0,
        fullDayAmount: 0,
        halfDayCount: 0,
        halfDayAmount: 0,
        grossEarned: 0,
      },
      deductions: {
        lateMinutes: 0,
        earlyMinutes: 0,
        lateAmount: 0,
        earlyAmount: 0,
        total: 0,
      },
      earned: {
        periodStart: "",
        periodEnd: "",
        daysInPeriod: 0,
        calendarDaysInMonth: 0,
        workingDaysInMonth: 0,
        shiftMinutes: 0,
        perDayRate: 0,
        perHourRate: 0,
        perMinuteRate: 0,
        daysWorked: 0,
        grossEarned: 0,
        totalLateMinutes: 0,
        totalEarlyMinutes: 0,
        totalLostMinutes: 0,
        totalDeduction: 0,
        earnedNet: 0,
        fullMonthNet: 0,
        days: [],
      },
      paid: 0,
      periodDue: 0,
      totalDue: 0,
      payments: [],
    };
  }
  const asOfDate = earnedAsOfDateForCalendarView(period, viewedMonth, today);
  const phone = employee.phone;
  const empPayments = payments.filter((p) => p.employeeId === phone);
  const empAtt = attendance.filter(
    (a) => a.employeeId === phone || a.employeeId === employee.id
  );
  const paid = salaryPaidInPeriod(empPayments, period.start, period.end);
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

  const { lines: carryForward, total: carryForwardTotal } = computeCarryForwardUnpaid(opts);
  const periodDue = Math.round((earned.earnedNet - paid) * 100) / 100;
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
    period,
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
    payments: paymentsInPeriod(
      empPayments.filter((p) => p.type === "SALARY_PAYMENT"),
      period.start,
      period.end
    ),
  };
}

export { formatDurationMinutes };
