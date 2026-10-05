import type { SalaryScheduleEntry } from "./types";
import { todayStr } from "./csv";

const HISTORY_START = "1970-01-01";

export function parseSalaryHistory(raw: unknown): SalaryScheduleEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SalaryScheduleEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const effectiveFrom = String(o.effectiveFrom || "").trim();
    const monthlySalary = Number(o.monthlySalary);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) continue;
    if (!Number.isFinite(monthlySalary) || monthlySalary < 0) continue;
    out.push({
      effectiveFrom,
      monthlySalary: Math.round(monthlySalary * 100) / 100,
    });
  }
  return out.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** Monthly salary in effect on a calendar date (history when present). */
export function monthlySalaryForDate(
  monthlySalary: number,
  history: SalaryScheduleEntry[] | undefined,
  date: string
): number {
  if (!history?.length) return Math.max(0, monthlySalary || 0);
  let pick: SalaryScheduleEntry | null = null;
  for (const entry of history) {
    if (entry.effectiveFrom <= date) pick = entry;
    else break;
  }
  if (pick) return Math.max(0, pick.monthlySalary || 0);
  return Math.max(0, monthlySalary || 0);
}

/**
 * Save a salary change that starts on the date the admin picks.
 * Days before that date keep the previous monthly salary.
 */
export function buildEmployeeSalaryScheduleSave(
  currentSalary: number,
  currentHistory: SalaryScheduleEntry[] | undefined,
  nextSalary: number,
  effectiveFrom: string
): {
  payload: Record<string, unknown>;
  effectiveFrom: string;
  changed: boolean;
  history: SalaryScheduleEntry[];
} {
  const roundedNext = Math.round(Math.max(0, nextSalary) * 100) / 100;
  const roundedCurrent = Math.round(Math.max(0, currentSalary) * 100) / 100;
  const start = effectiveFrom.trim();

  let history = parseSalaryHistory(currentHistory);
  if (history.length === 0) {
    history.push({
      effectiveFrom: HISTORY_START,
      monthlySalary: roundedCurrent,
    });
  }

  history = history.filter((e) => e.effectiveFrom < start);
  const rateBefore = history.length ? history[history.length - 1].monthlySalary : roundedCurrent;
  if (rateBefore !== roundedNext) {
    history.push({
      effectiveFrom: start,
      monthlySalary: roundedNext,
    });
  }
  history.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const baseline = parseSalaryHistory(currentHistory);
  const normalizedBaseline =
    baseline.length > 0
      ? baseline
      : [{ effectiveFrom: HISTORY_START, monthlySalary: roundedCurrent }];
  const changed =
    history.length !== normalizedBaseline.length ||
    history.some(
      (entry, i) =>
        entry.effectiveFrom !== normalizedBaseline[i]?.effectiveFrom ||
        entry.monthlySalary !== normalizedBaseline[i]?.monthlySalary
    );

  if (!changed) {
    return {
      payload: {},
      effectiveFrom: start,
      changed: false,
      history: baseline,
    };
  }

  const inEffectToday = monthlySalaryForDate(roundedNext, history, todayStr());

  return {
    payload: {
      monthlySalary: inEffectToday,
      salaryHistory: history,
    },
    effectiveFrom: start,
    changed: true,
    history,
  };
}
