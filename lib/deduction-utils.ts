import type { Attendance, AttendanceSettings } from "./types";
import {
  computeEarlyLeaveMinutes,
  computeLateMinutes,
  dateKey,
  daysInMonth,
  normalizeTime,
  timeToMinutes,
} from "./attendance-utils";

export type DayKind = "HOLIDAY" | "WORKING";

/** Override stored in Firestore calendar_days/{yyyy-MM-dd} */
export interface CalendarDayOverride {
  date: string;
  kind: DayKind;
}

/**
 * Default: Sunday = holiday, Mon–Sat = working.
 * Firestore overrides win when present.
 */
export function resolveDayKind(
  dateStr: string,
  overrides: Map<string, DayKind> | Record<string, DayKind>
): DayKind {
  const override =
    overrides instanceof Map ? overrides.get(dateStr) : overrides[dateStr];
  if (override === "HOLIDAY" || override === "WORKING") return override;

  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return dow === 0 ? "HOLIDAY" : "WORKING";
}

export function isWorkingDay(
  dateStr: string,
  overrides: Map<string, DayKind> | Record<string, DayKind>
): boolean {
  return resolveDayKind(dateStr, overrides) === "WORKING";
}

/** Shift length in minutes (supports overnight shifts). */
export function shiftMinutes(settings: AttendanceSettings): number {
  const start = timeToMinutes(normalizeTime(settings.dailySignInTime));
  const end = timeToMinutes(normalizeTime(settings.dailySignOutTime));
  if (start == null || end == null) return 8 * 60;
  let mins = end - start;
  if (mins <= 0) mins += 24 * 60;
  return Math.max(mins, 1);
}

export function countWorkingDaysInMonth(
  year: number,
  month: number,
  overrides: Map<string, DayKind> | Record<string, DayKind>,
  upToDate?: string
): number {
  const total = daysInMonth(year, month);
  let count = 0;
  for (let d = 1; d <= total; d++) {
    const key = dateKey(year, month, d);
    if (upToDate && key > upToDate) continue;
    if (isWorkingDay(key, overrides)) count++;
  }
  return Math.max(count, 1);
}

export function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0 min";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min`;
  if (h > 0) return `${h} hr`;
  return `${m} min`;
}

export type DayDeduction = {
  date: string;
  lateMinutes: number;
  earlyMinutes: number;
  lostMinutes: number;
  amount: number;
  note: string;
};

export type MonthDeductionSummary = {
  workingDays: number;
  shiftMinutes: number;
  perMinuteRate: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
  totalLostMinutes: number;
  totalDeduction: number;
  netSalary: number;
  days: DayDeduction[];
};

/**
 * Deduct salary for late arrival + early leave on working days only.
 * Holidays (incl. default Sundays) are excluded.
 */
export function computeMonthDeductions(
  monthlySalary: number,
  year: number,
  month: number,
  records: Attendance[],
  settings: AttendanceSettings,
  overrides: Map<string, DayKind> | Record<string, DayKind>
): MonthDeductionSummary {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const workingDays = countWorkingDaysInMonth(year, month, overrides);
  const shiftMins = shiftMinutes(settings);
  const perMinuteRate =
    monthlySalary > 0 ? monthlySalary / (workingDays * shiftMins) : 0;

  const days: DayDeduction[] = [];
  let totalLate = 0;
  let totalEarly = 0;

  const total = daysInMonth(year, month);
  for (let d = 1; d <= total; d++) {
    const key = dateKey(year, month, d);
    if (!isWorkingDay(key, overrides)) continue;

    const rec = byDate.get(key);
    if (!rec?.signInTime) continue;

    const late = computeLateMinutes(rec.signInTime, settings.dailySignInTime);
    const early = computeEarlyLeaveMinutes(rec.signOutTime, settings.dailySignOutTime);
    const lost = late + early;
    if (lost <= 0) continue;

    const amount = Math.round(lost * perMinuteRate * 100) / 100;
    const parts: string[] = [];
    if (late > 0) parts.push(`${formatDurationMinutes(late)} late`);
    if (early > 0) parts.push(`${formatDurationMinutes(early)} early`);

    days.push({
      date: key,
      lateMinutes: late,
      earlyMinutes: early,
      lostMinutes: lost,
      amount,
      note: parts.join(" · "),
    });
    totalLate += late;
    totalEarly += early;
  }

  const totalLost = totalLate + totalEarly;
  const totalDeduction = Math.round(totalLost * perMinuteRate * 100) / 100;
  const netSalary = Math.max(0, Math.round((monthlySalary - totalDeduction) * 100) / 100);

  return {
    workingDays,
    shiftMinutes: shiftMins,
    perMinuteRate,
    totalLateMinutes: totalLate,
    totalEarlyMinutes: totalEarly,
    totalLostMinutes: totalLost,
    totalDeduction,
    netSalary,
    days: days.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export type EarnedDay = {
  date: string;
  dayGross: number;
  lateMinutes: number;
  earlyMinutes: number;
  lostMinutes: number;
  deduction: number;
  dayNet: number;
};

export type EarnedSalarySummary = {
  /** Working days in the full month (used to split monthly → day/hour). */
  workingDaysInMonth: number;
  shiftMinutes: number;
  perDayRate: number;
  perHourRate: number;
  perMinuteRate: number;
  /** Working days from join…today with a sign-in. */
  daysWorked: number;
  /** Sum of day rates for days worked (before late cuts). */
  grossEarned: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
  totalLostMinutes: number;
  totalDeduction: number;
  /** What staff has earned till now after late/early cuts. */
  earnedNet: number;
  /** Full-month target after late/early (for “Pay full” option). */
  fullMonthNet: number;
  days: EarnedDay[];
};

/**
 * Prorate monthly salary by working days/hours from join date up to `asOfDate`.
 * Only days with a sign-in count as worked. Late + early leave cut that day's pay.
 *
 * Example: joined yesterday on time → 1 × dayRate.
 * Today late 1 hour → dayRate − 1h + yesterday = pay amount.
 */
export function computeEarnedSalary(opts: {
  monthlySalary: number;
  year: number;
  month: number;
  joiningDate?: string;
  asOfDate: string;
  records: Attendance[];
  settings: AttendanceSettings;
  overrides: Map<string, DayKind> | Record<string, DayKind>;
}): EarnedSalarySummary {
  const {
    monthlySalary,
    year,
    month,
    joiningDate,
    asOfDate,
    records,
    settings,
    overrides,
  } = opts;

  const workingDaysInMonth = countWorkingDaysInMonth(year, month, overrides);
  const shiftMins = shiftMinutes(settings);
  const perDayRate = monthlySalary > 0 ? monthlySalary / workingDaysInMonth : 0;
  const perMinuteRate =
    monthlySalary > 0 ? monthlySalary / (workingDaysInMonth * shiftMins) : 0;
  const perHourRate = perMinuteRate * 60;

  const monthStart = dateKey(year, month, 1);
  const monthEnd = dateKey(year, month, daysInMonth(year, month));
  const join = joiningDate && joiningDate >= monthStart ? joiningDate : monthStart;
  const until = asOfDate < monthEnd ? asOfDate : monthEnd;

  const byDate = new Map(records.map((r) => [r.date, r]));
  const days: EarnedDay[] = [];
  let totalLate = 0;
  let totalEarly = 0;
  let grossEarned = 0;
  let totalDeduction = 0;

  if (until >= join && monthlySalary > 0) {
    const total = daysInMonth(year, month);
    for (let d = 1; d <= total; d++) {
      const key = dateKey(year, month, d);
      if (key < join || key > until) continue;
      if (!isWorkingDay(key, overrides)) continue;

      const rec = byDate.get(key);
      if (!rec?.signInTime) continue;

      const late = computeLateMinutes(rec.signInTime, settings.dailySignInTime);
      const early = computeEarlyLeaveMinutes(rec.signOutTime, settings.dailySignOutTime);
      const lost = late + early;
      const deduction = Math.round(lost * perMinuteRate * 100) / 100;
      const dayGross = Math.round(perDayRate * 100) / 100;
      const dayNet = Math.max(0, Math.round((dayGross - deduction) * 100) / 100);

      days.push({
        date: key,
        dayGross,
        lateMinutes: late,
        earlyMinutes: early,
        lostMinutes: lost,
        deduction,
        dayNet,
      });

      grossEarned += dayGross;
      totalDeduction += deduction;
      totalLate += late;
      totalEarly += early;
    }
  }

  // Full-month late cut (all signed-in days in month) for “Pay full” baseline
  const fullMonthDeductions = computeMonthDeductions(
    monthlySalary,
    year,
    month,
    records,
    settings,
    overrides
  );

  const earnedNet = Math.max(0, Math.round((grossEarned - totalDeduction) * 100) / 100);

  return {
    workingDaysInMonth,
    shiftMinutes: shiftMins,
    perDayRate: Math.round(perDayRate * 100) / 100,
    perHourRate: Math.round(perHourRate * 100) / 100,
    perMinuteRate,
    daysWorked: days.length,
    grossEarned: Math.round(grossEarned * 100) / 100,
    totalLateMinutes: totalLate,
    totalEarlyMinutes: totalEarly,
    totalLostMinutes: totalLate + totalEarly,
    totalDeduction: Math.round(totalDeduction * 100) / 100,
    earnedNet,
    fullMonthNet: fullMonthDeductions.netSalary,
    days: days.sort((a, b) => b.date.localeCompare(a.date)),
  };
}
