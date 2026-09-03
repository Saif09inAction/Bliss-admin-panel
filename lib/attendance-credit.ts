import { doc, writeBatch } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { dateKey, parseDate } from "@/lib/attendance-utils";
import { todayStr } from "@/lib/csv";

const BATCH_LIMIT = 400;

/** Inclusive list of YYYY-MM-DD dates from `from` through `to`. */
export function eachDateInclusive(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const keys: string[] = [];
  let cursor = parseDate(from);
  const end = parseDate(to);
  while (cursor <= end) {
    keys.push(dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return keys;
}

/**
 * Mark every day from `fromDate` through `toDate` (inclusive) as full-day present.
 * Skips future days past today. Preserves existing fields via merge.
 */
export async function markPresentDateRange(opts: {
  employeeId: string;
  fromDate: string;
  toDate?: string;
  creditedBy: string;
}): Promise<number> {
  const today = todayStr();
  const from = opts.fromDate.trim();
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return 0;
  const toRaw = (opts.toDate || today).trim();
  const to = toRaw > today ? today : toRaw;
  if (from > to) return 0;

  const days = eachDateInclusive(from, to);
  if (days.length === 0) return 0;

  const db = getDb();
  const creditedAt = Date.now();
  const creditedBy = opts.creditedBy || "Admin";

  for (let i = 0; i < days.length; i += BATCH_LIMIT) {
    const chunk = days.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const date of chunk) {
      const id = `${opts.employeeId}_${date}`;
      batch.set(
        doc(db, "attendance", id),
        {
          id,
          employeeId: opts.employeeId,
          date,
          dayCredit: "FULL",
          dayCreditBy: creditedBy,
          dayCreditAt: creditedAt,
          status: "PRESENT",
          lateMinutes: 0,
          workingHours: 0,
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  return days.length;
}
