export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  downloadCsvRows(filename, [headers, ...rows]);
}

/** Lower-level export for multi-section statements (blank rows, section
 * titles, totals) where a single flat header + rows table isn't enough. */
export function downloadCsvRows(filename: string, rows: string[][]) {
  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) => r.map(escape).join(","));
  // Leading BOM so Excel opens the file as UTF-8 (₹ and other symbols render correctly).
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Calendar date in India (YYYY-MM-DD). Avoids UTC day-rollover around midnight IST. */
export function todayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Display date as dd/mm/yy.
 * Accepts YYYY-MM-DD strings or epoch milliseconds.
 */
export function formatDisplayDate(value?: string | number | null): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(value));
  }
  const iso = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1].slice(-2)}`;
  }
  // Already dd/mm/yy or similar — pass through
  return String(value).trim();
}

/**
 * True when a stored YYYY-MM-DD (or epoch) matches a search query.
 * Supports dd/mm/yy, dd/mm/yyyy, YYYY-MM-DD, and partials like 08/08.
 */
export function dateMatchesSearch(
  stored?: string | number | null,
  query?: string
): boolean {
  const qRaw = query?.trim().toLowerCase() || "";
  if (!qRaw || stored == null || stored === "") return false;

  const iso =
    typeof stored === "number"
      ? todayStrFromEpoch(stored)
      : String(stored).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return formatDisplayDate(stored).toLowerCase().includes(qRaw);
  }

  const display = formatDisplayDate(iso).toLowerCase(); // dd/mm/yy
  const q = qRaw.replace(/[-.]/g, "/");
  if (display.includes(q) || iso.toLowerCase().includes(qRaw)) return true;

  const full = q.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (full) {
    const day = full[1].padStart(2, "0");
    const month = full[2].padStart(2, "0");
    let year = full[3];
    if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    return iso === `${year}-${month}-${day}`;
  }

  const partial = q.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (partial) {
    const day = partial[1].padStart(2, "0");
    const month = partial[2].padStart(2, "0");
    return iso.endsWith(`-${month}-${day}`);
  }

  return false;
}

function todayStrFromEpoch(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

/** Minutes from midnight. Accepts 24h ("14:41", "14:41:05") and 12h ("2:41 PM"). */
export function parseTimeToMinutes(value?: string): number | null {
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

/** Sort key HH:mm so mixed 12h/24h stored times compare correctly. */
export function timeSortKey(time?: string): string {
  const mins = parseTimeToMinutes(time);
  if (mins == null) return "00:00";
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Display any stored time string as 12-hour (e.g. "2:41 PM"). */
export function formatDisplayTime(time?: string): string {
  if (!time?.trim()) return "";
  const mins = parseTimeToMinutes(time);
  if (mins == null) return time.trim();
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** 12h clock in India (e.g. "2:41 PM") for new records. */
export function nowTimeStr() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

/** Format epoch ms as 12h clock in India. */
export function formatClockTime(ts: number, empty = ""): string {
  if (!ts) return empty;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ts));
}

export function uuid() {
  return crypto.randomUUID();
}

/**
 * Format rupees for display. Keeps up to 2 decimal places when present
 * (e.g. 125.5 → ₹125.5) so bill paisa is not silently rounded away.
 */
export function formatRupee(n: number): string {
  const value = Math.round((Number(n) || 0) * 100) / 100;
  const hasPaisa = Math.abs(value % 1) > 1e-9;
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaisa ? 1 : 0,
    maximumFractionDigits: 2,
  })}`;
}
