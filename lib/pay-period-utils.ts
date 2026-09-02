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

/** Pay period / month offset cannot go past the current period (0 = current, negative = past). */
export function clampPayPeriodOffset(periodOffset: number): number {
  return Math.min(0, periodOffset);
}

export type CalendarMonth = { year: number; month: number };

/** Calendar month relative to today: 0 = this month, -1 = last month, etc. */
export function calendarMonthFromOffset(asOfDate: string, monthOffset: number): CalendarMonth {
  const offset = clampPayPeriodOffset(monthOffset);
  const { y, m } = parseIso(asOfDate);
  const dt = new Date(y, m - 1 + offset, 1);
  return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
}

export function calendarMonthBounds(year: number, month: number): { start: string; end: string } {
  const start = toIsoDate(year, month, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const end = toIsoDate(year, month, lastDay);
  return { start, end };
}

export function formatCalendarMonthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Pay period with the most overlap in a calendar month (e.g. viewing August → Aug 8–Sep 7 for Aug 8 join).
 */
export function payPeriodOverlappingCalendarMonth(
  joinDate: string,
  year: number,
  month: number
): PayPeriod | null {
  const { start: monthStart, end: monthEnd } = calendarMonthBounds(year, month);
  const join = joinDate?.trim();
  if (!join || monthEnd < join) return null;

  let best: PayPeriod | null = null;
  let bestOverlap = 0;

  for (let idx = 0; idx < 600; idx++) {
    const p = payPeriodForIndex(join, idx);
    if (p.start > monthEnd) break;
    if (p.end < monthStart) continue;

    const overlapStart = p.start > monthStart ? p.start : monthStart;
    const overlapEnd = p.end < monthEnd ? p.end : monthEnd;
    const overlap = daysInclusive(overlapStart, overlapEnd);
    if (overlap <= 0) continue;

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = p;
      continue;
    }

    if (overlap === bestOverlap && best) {
      const startMonth = parseIso(p.start).m;
      const bestStartMonth = parseIso(best.start).m;
      if (startMonth === month && bestStartMonth !== month) best = p;
    }
  }

  return best;
}

/** Pay period that contains a specific date (for per-day rate inside a calendar month). */
export function payPeriodContainingDate(joinDate: string, dateStr: string): PayPeriod | null {
  const join = joinDate?.trim();
  if (!join || dateStr < join) return null;
  let idx = 0;
  while (idx < 600) {
    const p = payPeriodForIndex(join, idx);
    if (dateStr < p.start) return null;
    if (dateStr >= p.start && dateStr <= p.end) return p;
    idx++;
  }
  return null;
}

/** Last date to count for a calendar month view (today or month end). */
export function asOfDateForCalendarMonth(viewMonth: CalendarMonth, today: string): string {
  const { end: monthEnd } = calendarMonthBounds(viewMonth.year, viewMonth.month);
  return today <= monthEnd ? today : monthEnd;
}

/** Sum salary paid across all join-based periods overlapping a calendar month. */
export function salaryPaidInCalendarMonth(
  payments: PaymentTransaction[],
  joinDate: string,
  year: number,
  month: number
): number {
  const join = joinDate?.trim();
  if (!join) return 0;
  const { start: monthStart, end: monthEnd } = calendarMonthBounds(year, month);
  let total = 0;
  for (let idx = 0; idx < 600; idx++) {
    const p = payPeriodForIndex(join, idx);
    if (p.start > monthEnd) break;
    if (p.end < monthStart) continue;
    total += salaryPaidInPeriod(payments, p.start, p.end);
  }
  return total;
}

/** Resolve each staff member's pay period for a calendar month (offset 0 = current month). */
export function resolvePayPeriodForCalendarOffset(
  joinDate: string,
  monthOffset: number,
  asOfDate: string
): PayPeriod | null {
  const { year, month } = calendarMonthFromOffset(asOfDate, monthOffset);
  return payPeriodOverlappingCalendarMonth(joinDate, year, month);
}

export function earnedAsOfDateForCalendarView(
  _period: PayPeriod,
  viewMonth: CalendarMonth,
  today: string
): string {
  return asOfDateForCalendarMonth(viewMonth, today);
}

/** Resolve pay period relative to today (offset 0 = current, -1 = previous, …). */
export function resolvePayPeriod(
  joinDate: string,
  periodOffset: number,
  asOfDate: string
): PayPeriod {
  const join = joinDate?.trim() || asOfDate;
  const current = currentPayPeriodIndex(join, asOfDate);
  const offset = clampPayPeriodOffset(periodOffset);
  const index = Math.max(0, current + offset);
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

/** Primary month for a pay period (start month) — e.g. July, August, September. */
export function formatPayPeriodMonthLabel(start: string, _end?: string): string {
  const { y, m } = parseIso(start);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function paymentsInCalendarMonth(
  payments: PaymentTransaction[],
  joinDate: string,
  year: number,
  month: number
): PaymentTransaction[] {
  const join = joinDate?.trim();
  if (!join) return [];
  const { start: monthStart, end: monthEnd } = calendarMonthBounds(year, month);
  const seen = new Set<string>();
  const result: PaymentTransaction[] = [];
  for (let idx = 0; idx < 600; idx++) {
    const p = payPeriodForIndex(join, idx);
    if (p.start > monthEnd) break;
    if (p.end < monthStart) continue;
    for (const pay of payments) {
      if (seen.has(pay.id)) continue;
      if (paymentAppliesToPeriod(pay, p.start, p.end)) {
        seen.add(pay.id);
        result.push(pay);
      }
    }
  }
  return result;
}

export function paymentAppliesToPeriod(
  payment: PaymentTransaction,
  start: string,
  end: string
): boolean {
  if (payment.type !== "SALARY_PAYMENT") return false;
  if (payment.periodStart && payment.periodEnd) {
    return payment.periodStart === start && payment.periodEnd === end;
  }
  return payment.date >= start && payment.date <= end;
}

export function salaryPaidInPeriod(
  payments: PaymentTransaction[],
  start: string,
  end: string
): number {
  return payments
    .filter((p) => paymentAppliesToPeriod(p, start, end))
    .reduce((sum, p) => sum + p.amount, 0);
}

export function paymentsInPeriod(
  payments: PaymentTransaction[],
  start: string,
  end: string
): PaymentTransaction[] {
  return payments.filter((p) => paymentAppliesToPeriod(p, start, end));
}
