import type { AttendanceSettings, ShiftScheduleEntry } from "./types";
import { normalizeTime, type ShiftSource } from "./attendance-utils";
import { addDaysIso } from "./pay-period-utils";
import { todayStr } from "./csv";

const HISTORY_START = "1970-01-01";

export function parseShiftHistory(raw: unknown): ShiftScheduleEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ShiftScheduleEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const effectiveFrom = String(o.effectiveFrom || "").trim();
    const dailySignInTime = normalizeTime(String(o.dailySignInTime || ""));
    const dailySignOutTime = normalizeTime(String(o.dailySignOutTime || ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) continue;
    const entry: ShiftScheduleEntry = { effectiveFrom, dailySignInTime, dailySignOutTime };
    if (o.sundaySignInTime) entry.sundaySignInTime = normalizeTime(String(o.sundaySignInTime));
    if (o.sundaySignOutTime) entry.sundaySignOutTime = normalizeTime(String(o.sundaySignOutTime));
    out.push(entry);
  }
  return out.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

export function parseAttendanceSettingsDoc(
  data: Record<string, unknown> | undefined
): AttendanceSettings {
  if (!data) {
    return { dailySignInTime: "09:00", dailySignOutTime: "18:00" };
  }
  const shiftHistory = parseShiftHistory(data.shiftHistory);
  return {
    dailySignInTime: normalizeTime((data.dailySignInTime as string) || "09:00"),
    dailySignOutTime: normalizeTime((data.dailySignOutTime as string) || "18:00"),
    sundaySignInTime: data.sundaySignInTime
      ? normalizeTime(data.sundaySignInTime as string)
      : undefined,
    sundaySignOutTime: data.sundaySignOutTime
      ? normalizeTime(data.sundaySignOutTime as string)
      : undefined,
    shiftHistory: shiftHistory.length > 0 ? shiftHistory : undefined,
  };
}

/** Shift times in effect on a calendar date (uses history when present). */
export function globalSettingsForDate(
  settings: AttendanceSettings,
  date: string
): AttendanceSettings {
  const history = settings.shiftHistory;
  if (!history?.length) return settings;

  let pick: ShiftScheduleEntry | null = null;
  for (const entry of history) {
    if (entry.effectiveFrom <= date) pick = entry;
    else break;
  }
  if (!pick) return settings;

  return {
    ...settings,
    dailySignInTime: pick.dailySignInTime,
    dailySignOutTime: pick.dailySignOutTime,
    sundaySignInTime: pick.sundaySignInTime,
    sundaySignOutTime: pick.sundaySignOutTime,
  };
}

export function employeeShiftForDate(
  employee: ShiftSource,
  date: string,
  history?: ShiftScheduleEntry[]
): Pick<AttendanceSettings, "dailySignInTime" | "dailySignOutTime"> | null {
  if (!employee) return null;
  const hist = history?.length ? history : undefined;
  if (hist) {
    let pick: ShiftScheduleEntry | null = null;
    for (const entry of hist) {
      if (entry.effectiveFrom <= date) pick = entry;
      else break;
    }
    if (pick) {
      return {
        dailySignInTime: pick.dailySignInTime,
        dailySignOutTime: pick.dailySignOutTime,
      };
    }
  }
  const inTime = employee.dailySignInTime?.trim();
  const outTime = employee.dailySignOutTime?.trim();
  if (!inTime && !outTime) return null;
  return {
    dailySignInTime: inTime ? normalizeTime(inTime) : "09:00",
    dailySignOutTime: outTime ? normalizeTime(outTime) : "18:00",
  };
}

export type ShiftTimesInput = {
  dailySignInTime: string;
  dailySignOutTime: string;
  sundaySignInTime?: string;
  sundaySignOutTime?: string;
};

/** Build Firestore payload: new times apply from tomorrow; past dates keep prior schedule. */
export function buildGlobalShiftScheduleSave(
  current: AttendanceSettings,
  next: ShiftTimesInput,
  asOfDate: string = todayStr()
): {
  payload: Record<string, unknown>;
  settings: AttendanceSettings;
  effectiveFrom: string;
  changed: boolean;
} {
  const dailySignInTime = normalizeTime(next.dailySignInTime);
  const dailySignOutTime = normalizeTime(next.dailySignOutTime);
  const sundaySignInTime = next.sundaySignInTime?.trim()
    ? normalizeTime(next.sundaySignInTime)
    : undefined;
  const sundaySignOutTime = next.sundaySignOutTime?.trim()
    ? normalizeTime(next.sundaySignOutTime)
    : undefined;

  const effectiveFrom = addDaysIso(asOfDate, 1);

  const sameAsCurrent =
    dailySignInTime === normalizeTime(current.dailySignInTime) &&
    dailySignOutTime === normalizeTime(current.dailySignOutTime) &&
    (sundaySignInTime || "") === (current.sundaySignInTime || "") &&
    (sundaySignOutTime || "") === (current.sundaySignOutTime || "");

  if (sameAsCurrent) {
    return {
      payload: {},
      settings: current,
      effectiveFrom,
      changed: false,
    };
  }

  let history = [...(current.shiftHistory || [])];

  if (history.length === 0) {
    history.push({
      effectiveFrom: HISTORY_START,
      dailySignInTime: normalizeTime(current.dailySignInTime),
      dailySignOutTime: normalizeTime(current.dailySignOutTime),
      sundaySignInTime: current.sundaySignInTime,
      sundaySignOutTime: current.sundaySignOutTime,
    });
  }

  history = history.filter((e) => e.effectiveFrom < effectiveFrom);
  history.push({
    effectiveFrom,
    dailySignInTime,
    dailySignOutTime,
    sundaySignInTime,
    sundaySignOutTime,
  });
  history.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const settings: AttendanceSettings = {
    dailySignInTime,
    dailySignOutTime,
    sundaySignInTime,
    sundaySignOutTime,
    shiftHistory: history,
  };

  const payload: Record<string, unknown> = {
    dailySignInTime,
    dailySignOutTime,
    shiftHistory: history,
  };
  if (sundaySignInTime) payload.sundaySignInTime = sundaySignInTime;
  else payload.sundaySignInTime = "";
  if (sundaySignOutTime) payload.sundaySignOutTime = sundaySignOutTime;
  else payload.sundaySignOutTime = "";

  return { payload, settings, effectiveFrom, changed: true };
}

/** Per-staff custom shift — same next-day rule on the employee document. */
export function buildEmployeeShiftScheduleSave(
  currentIn: string | undefined,
  currentOut: string | undefined,
  currentHistory: ShiftScheduleEntry[] | undefined,
  nextIn: string,
  nextOut: string,
  asOfDate: string = todayStr()
): {
  payload: Record<string, unknown>;
  effectiveFrom: string;
  changed: boolean;
} {
  const dailySignInTime = nextIn.trim() ? normalizeTime(nextIn) : "";
  const dailySignOutTime = nextOut.trim() ? normalizeTime(nextOut) : "";
  const effectiveFrom = addDaysIso(asOfDate, 1);

  const prevIn = currentIn?.trim() ? normalizeTime(currentIn) : "";
  const prevOut = currentOut?.trim() ? normalizeTime(currentOut) : "";
  if (dailySignInTime === prevIn && dailySignOutTime === prevOut) {
    return { payload: {}, effectiveFrom, changed: false };
  }

  let history = [...(currentHistory || [])];
  if (history.length === 0 && (prevIn || prevOut)) {
    history.push({
      effectiveFrom: HISTORY_START,
      dailySignInTime: prevIn || "09:00",
      dailySignOutTime: prevOut || "18:00",
    });
  }

  history = history.filter((e) => e.effectiveFrom < effectiveFrom);
  if (dailySignInTime || dailySignOutTime) {
    history.push({
      effectiveFrom,
      dailySignInTime: dailySignInTime || prevIn || "09:00",
      dailySignOutTime: dailySignOutTime || prevOut || "18:00",
    });
  }
  history.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const payload: Record<string, unknown> = {
    shiftHistory: history,
    dailySignInTime: dailySignInTime || "",
    dailySignOutTime: dailySignOutTime || "",
  };

  return { payload, effectiveFrom, changed: true };
}
