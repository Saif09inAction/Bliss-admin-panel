import type { PaymentTransaction } from "./types";

export type PayPeriod = {
  index: number;
  start: string;
  end: string;
  daysInPeriod: number;
};

function parseIso(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

export function toIsoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addMonthsIso(dateStr: string, months: number): string {
  const { y, m, d } = parseIso(dateStr);
  const dt = new Date(y, m - 1 + months, d);
  return toIsoDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

export function addDaysIso(dateStr: string, days: number): string {
  const { y, m, d } = parseIso(dateStr);
  const dt = new Date(y, m - 1, d + days);
  return toIsoDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** Inclusive day count between two ISO dates. */
export function daysInclusive(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  const a = parseIso(start);
  const b = parseIso(end);
  const t0 = Date.UTC(a.y, a.m - 1, a.d);
  const t1 = Date.UTC(b.y, b.m - 1, b.d);
  return Math.floor((t1 - t0) / 86400000) + 1;
}

/**
 * Pay period from join anniversary to day before next anniversary.
 * Join 8 Aug → period 0: 8 Aug – 7 Sep; next period starts 8 Sep.
 */
export function payPeriodForIndex(joinDate: string, index: number): PayPeriod {
  const start = addMonthsIso(joinDate, index);
  const nextStart = addMonthsIso(joinDate, index + 1);
  const end = addDaysIso(nextStart, -1);
  return {
    index,
    start,
    end,
    daysInPeriod: daysInclusive(start, end),
  };
}

export function currentPayPeriodIndex(joinDate: string, asOfDate: string): number {
  if (!joinDate || asOfDate < joinDate) return 0;
  let idx = 0;
  while (idx < 600) {
    const { end } = payPeriodForIndex(joinDate, idx);
    if (asOfDate <= end) return idx;
    idx++;
  }
  return idx;
}

/** Resolve pay period relative to today (offset 0 = current, -1 = previous, …). */
export function resolvePayPeriod(
  joinDate: string,
  periodOffset: number,
  asOfDate: string
): PayPeriod {
  const join = joinDate?.trim() || asOfDate;
  const current = currentPayPeriodIndex(join, asOfDate);
  const index = Math.max(0, current + periodOffset);
  return payPeriodForIndex(join, index);
}

export function earnedAsOfDate(period: PayPeriod, today: string): string {
  if (today < period.start) return addDaysIso(period.start, -1);
  if (today <= period.end) return today;
  return period.end;
}

export function formatPayPeriodLabel(start: string, end: string): string {
  const fmt = (s: string, withYear: boolean) => {
    const { y, m, d } = parseIso(s);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    });
  };
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
}

export function salaryPaidInPeriod(
  payments: PaymentTransaction[],
  start: string,
  end: string
): number {
  return payments
    .filter(
      (p) =>
        p.type === "SALARY_PAYMENT" && p.date >= start && p.date <= end
    )
    .reduce((sum, p) => sum + p.amount, 0);
}

export function paymentsInPeriod(
  payments: PaymentTransaction[],
  start: string,
  end: string
): PaymentTransaction[] {
  return payments.filter((p) => p.date >= start && p.date <= end);
}
