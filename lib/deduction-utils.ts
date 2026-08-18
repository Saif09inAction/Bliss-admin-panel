import type { Attendance, AttendanceSettings } from "./types";
import {
  computeEarlyLeaveMinutes,
  computeLateMinutes,
  dateKey,
  daysInMonth,
  normalizeTime,
  timeToMinutes,
} from "./attendance-utils";
import { addDaysIso, daysInclusive } from "./pay-period-utils";

export type DayKind = "HOLIDAY" | "WORKING";
export type HolidayScope = "ALL" | "SELECTED";

/** Override stored in Firestore calendar_days/{yyyy-MM-dd} */
export interface CalendarDayOverride {
  date: string;
  kind: DayKind;
  /** ALL = every staff; SELECTED = only employeeIds */
  appliesTo: HolidayScope;
  /** Employee phones when appliesTo === SELECTED */
  employeeIds: string[];
}

export type OverrideMap = Map<string, CalendarDayOverride>;

/** Accept legacy Map<date, DayKind> or full override objects. */
export type OverrideSource =
  | OverrideMap
  | Map<string, DayKind>
  | Record<string, DayKind | CalendarDayOverride>;

export function parseCalendarOverride(
  date: string,
  data: Record<string, unknown>
): CalendarDayOverride | null {
  const kind = data.kind as DayKind;
  if (kind !== "HOLIDAY" && kind !== "WORKING") return null;
  const appliesTo =
    data.appliesTo === "SELECTED" ? "SELECTED" : "ALL";
  const employeeIds = Array.isArray(data.employeeIds)
    ? (data.employeeIds as unknown[])
        .map((x) => String(x).trim())
        .filter(Boolean)
    : [];
  return {
    date: (data.date as string) || date,
    kind,
    appliesTo,
    employeeIds,
  };
}

function defaultKindForDate(dateStr: string): DayKind {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return dow === 0 ? "HOLIDAY" : "WORKING";
}

function lookupOverride(
  dateStr: string,
  overrides: OverrideSource
): CalendarDayOverride | null {
  const raw =
    overrides instanceof Map ? overrides.get(dateStr) : overrides[dateStr];
  if (!raw) return null;
  if (typeof raw === "string") {
    if (raw !== "HOLIDAY" && raw !== "WORKING") return null;
    return { date: dateStr, kind: raw, appliesTo: "ALL", employeeIds: [] };
  }
  return {
    date: raw.date || dateStr,
    kind: raw.kind,
    appliesTo: raw.appliesTo === "SELECTED" ? "SELECTED" : "ALL",
    employeeIds: raw.employeeIds || [],
  };
}

/**
 * Resolve holiday/working for a date.
 * Pass employeePhone for per-employee holidays; omit for global calendar view
 * (SELECTED holidays still show as holiday on the calendar).
 */
export function resolveDayKind(
  dateStr: string,
  overrides: OverrideSource,
  employeePhone?: string
): DayKind {
  const override = lookupOverride(dateStr, overrides);
  if (!override) return defaultKindForDate(dateStr);

  if (override.appliesTo === "ALL" || !employeePhone) {
    return override.kind;
  }

  const listed = override.employeeIds.some(
    (id) => id === employeePhone || id.toLowerCase() === employeePhone.toLowerCase()
  );
  if (listed) return override.kind;
  // Selected holiday/working does not apply to this employee → default rule
  return defaultKindForDate(dateStr);
}

export function isWorkingDay(
  dateStr: string,
  overrides: OverrideSource,
  employeePhone?: string
): boolean {
  return resolveDayKind(dateStr, overrides, employeePhone) === "WORKING";
}

export function overrideAppliesToAll(override: CalendarDayOverride | null): boolean {
  return !override || override.appliesTo === "ALL";
}

/** Shift length in minutes (supports overnight shifts). Admin-set sign-in/out. */
export function shiftMinutes(settings: AttendanceSettings): number {
  const start = timeToMinutes(normalizeTime(settings.dailySignInTime));
  const end = timeToMinutes(normalizeTime(settings.dailySignOutTime));
  if (start == null || end == null) return 8 * 60;
  let mins = end - start;
  if (mins <= 0) mins += 24 * 60;
  return Math.max(mins, 1);
}

/** Calendar days in month (31 for July, 30 for June, 28/29 Feb). */
export function calendarDaysInMonth(year: number, month: number): number {
  return Math.max(daysInMonth(year, month), 1);
}

export function countWorkingDaysInRange(
  start: string,
  end: string,
  overrides: OverrideSource,
  employeePhone?: string
): number {
  if (!start || !end || end < start) return 1;
  let count = 0;
  let cursor = start;
  while (cursor <= end) {
    if (isWorkingDay(cursor, overrides, employeePhone)) count++;
    cursor = addDaysIso(cursor, 1);
  }
  return Math.max(count, 1);
}

export function countWorkingDaysInMonth(
  year: number,
  month: number,
  overrides: OverrideSource,
  upToDate?: string,
  employeePhone?: string
): number {
  const total = daysInMonth(year, month);
  const start = dateKey(year, month, 1);
  const end =
    upToDate && upToDate < dateKey(year, month, total)
      ? upToDate
      : dateKey(year, month, total);
  return countWorkingDaysInRange(start, end, overrides, employeePhone);
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
  /** Days in the calendar month (28–31). Used for ₹/day and ₹/hour. */
  calendarDays: number;
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
 * Deduct salary for late arrival + early leave within a join-based pay period.
 * Rates = monthlySalary ÷ (days in pay period × shift minutes).
 */
export function computePeriodDeductions(
  monthlySalary: number,
  periodStart: string,
  periodEnd: string,
  records: Attendance[],
  settings: AttendanceSettings,
  overrides: OverrideSource,
  employeePhone?: string
): MonthDeductionSummary {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const calendarDays = Math.max(daysInclusive(periodStart, periodEnd), 1);
  const workingDays = countWorkingDaysInRange(
    periodStart,
    periodEnd,
    overrides,
    employeePhone
  );
  const shiftMins = shiftMinutes(settings);
  const perMinuteRate =
    monthlySalary > 0 ? monthlySalary / (calendarDays * shiftMins) : 0;

  const days: DayDeduction[] = [];
  let totalLate = 0;
  let totalEarly = 0;

  let cursor = periodStart;
  while (cursor <= periodEnd) {
    const key = cursor;
    cursor = addDaysIso(cursor, 1);
    if (!isWorkingDay(key, overrides, employeePhone)) continue;

    const rec = byDate.get(key);
    if (rec?.dayCredit === "FULL" || rec?.dayCredit === "HALF") continue;
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
    calendarDays,
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

/** @deprecated use computePeriodDeductions */
export function computeMonthDeductions(
  monthlySalary: number,
  year: number,
  month: number,
  records: Attendance[],
  settings: AttendanceSettings,
  overrides: OverrideSource,
  employeePhone?: string
): MonthDeductionSummary {
  const start = dateKey(year, month, 1);
  const end = dateKey(year, month, daysInMonth(year, month));
  return computePeriodDeductions(
    monthlySalary,
    start,
    end,
    records,
    settings,
    overrides,
    employeePhone
  );
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
  periodStart: string;
  periodEnd: string;
  /** Days in the join-based pay period (e.g. 18 Aug – 17 Sep = 31). */
  daysInPeriod: number;
  /** @deprecated alias for daysInPeriod */
  calendarDaysInMonth: number;
  workingDaysInMonth: number;
  shiftMinutes: number;
  perDayRate: number;
  perHourRate: number;
  perMinuteRate: number;
  daysWorked: number;
  grossEarned: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
  totalLostMinutes: number;
  totalDeduction: number;
  earnedNet: number;
  fullMonthNet: number;
  days: EarnedDay[];
};

/**
 * Prorate monthly salary across the join-based pay period (join date → day before next anniversary).
 * Only signed-in working days count as earned.
 */
export function computeEarnedSalary(opts: {
  monthlySalary: number;
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
  records: Attendance[];
  settings: AttendanceSettings;
  overrides: OverrideSource;
  employeePhone?: string;
}): EarnedSalarySummary {
  const {
    monthlySalary,
    periodStart,
    periodEnd,
    asOfDate,
    records,
    settings,
    overrides,
    employeePhone,
  } = opts;

  const daysInPeriod = Math.max(daysInclusive(periodStart, periodEnd), 1);
  const workingDaysInMonth = countWorkingDaysInRange(
    periodStart,
    periodEnd,
    overrides,
    employeePhone
  );
  const shiftMins = shiftMinutes(settings);
  const perDayRate = monthlySalary > 0 ? monthlySalary / daysInPeriod : 0;
  const perMinuteRate =
    monthlySalary > 0 ? monthlySalary / (daysInPeriod * shiftMins) : 0;
  const perHourRate = perMinuteRate * 60;

  const until = asOfDate < periodEnd ? asOfDate : periodEnd;

  const byDate = new Map(records.map((r) => [r.date, r]));
  const days: EarnedDay[] = [];
  let totalLate = 0;
  let totalEarly = 0;
  let grossEarned = 0;
  let totalDeduction = 0;

  if (until >= periodStart && monthlySalary > 0) {
    let cursor = periodStart;
    while (cursor <= periodEnd) {
      const key = cursor;
      cursor = addDaysIso(cursor, 1);
      if (key < periodStart || key > until) continue;
      if (!isWorkingDay(key, overrides, employeePhone)) continue;

      const rec = byDate.get(key);
      const credit = rec?.dayCredit;
      const hasPunch = Boolean(rec?.signInTime);
      if (!hasPunch && credit !== "FULL" && credit !== "HALF") continue;

      const dayFactor = credit === "HALF" ? 0.5 : 1;
      const late =
        credit === "FULL" || credit === "HALF"
          ? 0
          : computeLateMinutes(rec!.signInTime, settings.dailySignInTime);
      const early =
        credit === "FULL" || credit === "HALF"
          ? 0
          : computeEarlyLeaveMinutes(rec!.signOutTime, settings.dailySignOutTime);
      const lost = late + early;
      const deduction = Math.round(lost * perMinuteRate * 100) / 100;
      const dayGross = Math.round(perDayRate * dayFactor * 100) / 100;
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

  const fullMonthDeductions = computePeriodDeductions(
    monthlySalary,
    periodStart,
    periodEnd,
    records,
    settings,
    overrides,
    employeePhone
  );

  const earnedNet = Math.max(0, Math.round((grossEarned - totalDeduction) * 100) / 100);

  return {
    periodStart,
    periodEnd,
    daysInPeriod,
    calendarDaysInMonth: daysInPeriod,
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
