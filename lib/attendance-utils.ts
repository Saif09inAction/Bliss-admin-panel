import type { Attendance, AttendanceSettings } from "./types";

export type DayStatus = "PRESENT" | "ON_TIME" | "LATE" | "LEFT_EARLY" | "ABSENT" | "FUTURE" | "NONE";

export function parseAttendance(id: string, data: Record<string, unknown>): Attendance {
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
  };
}

export function defaultSettings(): AttendanceSettings {
  return { dailySignInTime: "09:00", dailySignOutTime: "18:00" };
}

export function normalizeTime(value?: string): string {
  if (!value) return "09:00";
  const parts = value.split(":");
  if (parts.length >= 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  return value;
}

export function formatLateDuration(minutes: number): string {
  if (minutes <= 0) return "On time";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min late`;
  if (h > 0) return `${h} hr late`;
  return `${m} min late`;
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
      return "bg-emerald-500 text-white";
    case "LATE":
      return "bg-amber-400 text-navy";
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
  return url.startsWith("http://") || url.startsWith("https://");
}
