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
