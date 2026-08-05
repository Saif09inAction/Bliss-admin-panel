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

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function nowTimeStr() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
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
