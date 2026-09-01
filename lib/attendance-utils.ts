import type { Attendance, AttendanceSettings, Employee } from "./types";

export type ShiftSource =
  | Pick<Employee, "dailySignInTime" | "dailySignOutTime" | "shiftHistory">
  | null
  | undefined;

export { resolveShiftSettings } from "./deduction-utils";

/** True when this staff has at least one custom shift time saved. */
export function hasCustomShift(employee?: ShiftSource): boolean {
  return Boolean(
    employee?.shiftHistory?.length ||
      employee?.dailySignInTime?.trim() ||
      employee?.dailySignOutTime?.trim()
  );
}

/** Display any stored time as 12-hour (e.g. "2:41 PM"). */
export function formatDisplayTime(time?: string): string {
  if (!time?.trim()) return "";
  const mins = timeToMinutes(time);
  if (mins == null) return time.trim();
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export type DayStatus =
  | "PRESENT"
  | "ON_TIME"
  | "LATE"
  | "LEFT_EARLY"
  | "ABSENT"
  | "HALF_DAY"
  | "FUTURE"
  | "NONE";

export function parseAttendance(id: string, data: Record<string, unknown>): Attendance {
  const creditRaw = data.dayCredit as string | undefined;
  const dayCredit =
    creditRaw === "FULL" || creditRaw === "HALF" ? creditRaw : null;
  return {
    id: (data.id as string) || id,
    employeeId: (data.employeeId as string) || "",
    date: (data.date as string) || "",
    signInTime: (data.signInTime as string) || undefined,
    signOutTime: (data.signOutTime as string) || undefined,
    signInGps: (data.signInGps as string) || undefined,
    signOutGps: (data.signOutGps as string) || undefined,
    signInAddress: (data.signInAddress as string) || undefined,
    signOutAddress: (data.signOutAddress as string) || undefined,
    signInImageLocalPath: (data.signInImageLocalPath as string) || undefined,
    signOutImageLocalPath: (data.signOutImageLocalPath as string) || undefined,
    status: (data.status as string) || "ABSENT",
    lateMinutes: (data.lateMinutes as number) || 0,
    workingHours: (data.workingHours as number) || 0,
    dayCredit,
    dayCreditBy: (data.dayCreditBy as string) || undefined,
    dayCreditAt: (data.dayCreditAt as number) || undefined,
  };
}

export function defaultSettings(): AttendanceSettings {
  return { dailySignInTime: "09:00", dailySignOutTime: "18:00" };
}

export function normalizeTime(value?: string): string {
  if (!value) return "09:00";
  const trimmed = value.trim();
  // Support "10:30 PM" / "10:30AM"
  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (/pm/i.test(ampm[4])) h += 12;
    return `${String(h).padStart(2, "0")}:${ampm[2]}`;
  }
  const parts = trimmed.split(":");
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  }
  return trimmed;
}

/** Minutes from midnight for HH:mm or HH:mm:ss */
export function timeToMinutes(value?: string): number | null {
  if (!value?.trim()) return null;
  const norm = value.trim();
  const ampm = norm.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (/pm/i.test(ampm[4])) h += 12;
    return h * 60 + Number(ampm[2]);
  }
  const parts = norm.split(":").map(Number);
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  return parts[0] * 60 + parts[1];
}

/** Recompute lateness from clock-in vs expected shift (ignores stale stored lateMinutes). */
export function computeLateMinutes(signInTime?: string, expectedSignIn?: string): number {
  const actual = timeToMinutes(signInTime);
  const expected = timeToMinutes(normalizeTime(expectedSignIn));
  if (actual == null || expected == null) return 0;
  return Math.max(0, actual - expected);
}

/** Minutes left before expected logout. */
export function computeEarlyLeaveMinutes(signOutTime?: string, expectedSignOut?: string): number {
  const actual = timeToMinutes(signOutTime);
  const expected = timeToMinutes(normalizeTime(expectedSignOut));
  if (actual == null || expected == null) return 0;
  return Math.max(0, expected - actual);
}

export function formatLateDuration(minutes: number): string {
  if (minutes <= 0) return "On time";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min late`;
  if (h > 0) return `${h} hr late`;
  return `${m} min late`;
}

export function formatEarlyLeaveDuration(minutes: number): string {
  if (minutes <= 0) return "On time";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min early`;
  if (h > 0) return `${h} hr early`;
  return `${m} min early`;
}

/**
 * Day status using current shift settings.
 * Admin dayCredit (FULL / HALF) overrides late/early/absent for display & pay.
 * Left early takes priority over late when both apply (matches app punch logic).
 */
export function effectiveDayStatus(
  record: Attendance | undefined,
  dateStr: string,
  settings?: AttendanceSettings
): DayStatus {
  const today = new Date();
  const day = parseDate(dateStr);
  if (day > startOfDay(today)) return "FUTURE";

  if (record?.dayCredit === "FULL") return "PRESENT";
  if (record?.dayCredit === "HALF") return "HALF_DAY";

  if (!record || !record.signInTime) return "ABSENT";

  const early = computeEarlyLeaveMinutes(record.signOutTime, settings?.dailySignOutTime);
  if (record.signOutTime && early > 0) return "LEFT_EARLY";

  const late = computeLateMinutes(record.signInTime, settings?.dailySignInTime);
  if (late > 0) return "LATE";

  if (record.signOutTime) return "PRESENT";
  return "ON_TIME";
}

export function formatWorkingHours(hours: number): string {
  if (!hours) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "PRESENT":
      return "Present";
    case "ON_TIME":
      return "On Time";
    case "LATE":
      return "Late";
    case "LEFT_EARLY":
      return "Left Early";
    case "HALF_DAY":
      return "Half Day";
    case "ABSENT":
      return "Absent";
    default:
      return status.replace(/_/g, " ");
  }
}

export function dayStatus(record: Attendance | undefined, dateStr: string): DayStatus {
  const today = new Date();
  const day = parseDate(dateStr);
  if (day > startOfDay(today)) return "FUTURE";
  if (!record || !record.signInTime) return "ABSENT";
  return (record.status as DayStatus) || "PRESENT";
}

export function statusColorClass(status: DayStatus | string): string {
  switch (status) {
    case "PRESENT":
    case "ON_TIME":
    case "HALF_DAY":
      return "bg-emerald-500 text-white";
    case "LATE":
      return "bg-amber-400 text-slate-900";
    case "LEFT_EARLY":
      return "bg-orange-400 text-white";
    case "ABSENT":
      return "bg-red-500 text-white";
    case "FUTURE":
      return "bg-slate-100 text-slate-400";
    default:
      return "bg-slate-200 text-slate-600";
  }
}

export function statusBadgeClass(status: DayStatus | string): string {
  switch (status) {
    case "PRESENT":
    case "ON_TIME":
    case "HALF_DAY":
      return "badge-present";
    case "LATE":
      return "badge-late";
    case "LEFT_EARLY":
      return "badge-early";
    case "ABSENT":
      return "badge-absent";
    default:
      return "badge-neutral";
  }
}

export function mapsLink(gps?: string): string | null {
  if (!gps?.trim()) return null;
  const parts = gps.split(",").map((p) => p.trim());
  if (parts.length >= 2) return `https://www.google.com/maps?q=${parts[0]},${parts[1]}`;
  return null;
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isImageUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("gs://")
  );
}

export function resolveAttendanceImage(url?: string): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (isImageUrl(trimmed)) return trimmed;
  return null;
}

export function monthDateRange(year: number, month: number): { start: string; end: string } {
  const total = daysInMonth(year, month);
  return {
    start: dateKey(year, month, 1),
    end: dateKey(year, month, total),
  };
}

export function computeMonthAttendanceStats(
  records: { date: string; status?: string; signInTime?: string }[],
  year: number,
  month: number
) {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const totalDays = daysInMonth(year, month);
  const today = new Date();
  let present = 0;
  let late = 0;
  let absent = 0;
  let workingDays = 0;

  for (let d = 1; d <= totalDays; d++) {
    const key = dateKey(year, month, d);
    const day = new Date(year, month, d);
    if (day > startOfDay(today)) continue;
    workingDays++;
    const rec = byDate.get(key);
    const st = dayStatus(rec as import("./types").Attendance | undefined, key);
    if (st === "ABSENT") absent++;
    else if (st === "LATE") late++;
    else if (st === "PRESENT" || st === "ON_TIME" || st === "LEFT_EARLY" || st === "HALF_DAY") present++;
  }

  const rate = workingDays ? Math.round((present / workingDays) * 100) : 0;
  return { present, late, absent, workingDays, rate };
}
