"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { ChevronLeft, ChevronRight, Palmtree, Sparkles } from "lucide-react";
import { getDb } from "@/lib/firebase";
import {
  dateKey,
  daysInMonth,
  monthLabel,
} from "@/lib/attendance-utils";
import {
  resolveDayKind,
  type DayKind,
} from "@/lib/deduction-utils";

function dayButtonClass(kind: DayKind, isToday: boolean, isSelected: boolean): string {
  const base = ["calendar-day", "holiday-cal-day"];
  if (kind === "HOLIDAY") base.push("holiday");
  else base.push("working");
  if (isToday) base.push("is-today");
  if (isSelected) base.push("selected");
  return base.join(" ");
}

export default function HolidaysPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [overrides, setOverrides] = useState<Map<string, DayKind>>(new Map());
  const [selected, setSelected] = useState<string | null>(
    dateKey(now.getFullYear(), now.getMonth(), now.getDate())
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(getDb(), "calendar_days"), (snap) => {
      const map = new Map<string, DayKind>();
      snap.docs.forEach((d) => {
        const data = d.data();
        const kind = data.kind as DayKind;
        if (kind === "HOLIDAY" || kind === "WORKING") {
          map.set((data.date as string) || d.id, kind);
        }
      });
      setOverrides(map);
    });
    return () => unsub();
  }, []);

  const firstDow = new Date(year, month, 1).getDay();
  const totalDays = daysInMonth(year, month);
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= totalDays; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const monthStats = useMemo(() => {
    let holidays = 0;
    let working = 0;
    let sundays = 0;
    for (let d = 1; d <= totalDays; d++) {
      const key = dateKey(year, month, d);
      const kind = resolveDayKind(key, overrides);
      if (kind === "HOLIDAY") holidays++;
      else working++;
      if (new Date(year, month, d).getDay() === 0) sundays++;
    }
    return { holidays, working, sundays };
  }, [year, month, totalDays, overrides]);

  const selectedKind = selected ? resolveDayKind(selected, overrides) : null;
  const selectedIsSunday =
    selected != null &&
    (() => {
      const [y, m, d] = selected.split("-").map(Number);
      return new Date(y, m - 1, d).getDay() === 0;
    })();
  const selectedHasOverride = selected ? overrides.has(selected) : false;

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelected(null);
  }

  async function setKind(dateStr: string, kind: DayKind) {
    setSaving(true);
    setToast("");
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const isSunday = new Date(y, m - 1, d).getDay() === 0;
      const defaultKind: DayKind = isSunday ? "HOLIDAY" : "WORKING";

      // If matching the default rule, remove override to keep data clean
      if (kind === defaultKind) {
        await deleteDoc(doc(getDb(), "calendar_days", dateStr));
      } else {
        await setDoc(doc(getDb(), "calendar_days", dateStr), {
          date: dateStr,
          kind,
          updatedAt: Date.now(),
        });
      }
      setToast(kind === "HOLIDAY" ? "Marked as holiday" : "Marked as working day");
    } catch {
      setToast("Could not save. Try again.");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(""), 2200);
    }
  }

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="space-y-6">
      <div className="page-toolbar">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">Holidays</h2>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Tap any date to mark holiday or working day · Sundays are holidays by default
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_360px]">
        <div className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <button type="button" className="btn-icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="font-display text-lg font-bold">{monthLabel(year, month)}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {monthStats.working} working · {monthStats.holidays} holidays
              </p>
            </div>
            <button type="button" className="btn-icon" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="p-4 sm:p-6">
            <div className="mb-3 grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className={d === "Sun" ? "text-danger" : ""}>
                  {d}
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              {weeks.map((w, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1.5">
                  {w.map((day, di) => {
                    if (day == null) {
                      return <div key={`e-${di}`} className="aspect-square" />;
                    }
                    const key = dateKey(year, month, day);
                    const kind = resolveDayKind(key, overrides);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelected(key)}
                        className={dayButtonClass(kind, key === todayKey, selected === key)}
                        title={`${key} · ${kind === "HOLIDAY" ? "Holiday" : "Working"}`}
                      >
                        <span className="text-sm font-bold">{day}</span>
                        <span className="mt-0.5 hidden text-[9px] font-semibold uppercase sm:block">
                          {kind === "HOLIDAY" ? "Off" : "Work"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[rgba(232,93,76,0.85)]" /> Holiday / off
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-jade" /> Working day
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full ring-2 ring-ink/30" /> Today
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface-ink p-5">
            <div className="flex items-center gap-2 text-bronze">
              <Palmtree size={16} />
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]">Day settings</p>
            </div>
            {selected ? (
              <>
                <h3 className="mt-3 font-display text-xl font-bold text-white">
                  {new Date(selected + "T12:00:00").toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
                <p className="mt-1 text-sm text-white/55">
                  Currently{" "}
                  <span className="font-semibold text-white">
                    {selectedKind === "HOLIDAY" ? "Holiday" : "Working day"}
                  </span>
                  {selectedIsSunday && !selectedHasOverride && " (Sunday default)"}
                  {selectedHasOverride && " (custom override)"}
                </p>

                <div className="mt-5 grid gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    className={`btn w-full !justify-start !rounded-2xl ${
                      selectedKind === "HOLIDAY"
                        ? "!bg-danger/20 !text-white ring-1 ring-danger/40"
                        : "!bg-white/5 !text-white/80 hover:!bg-white/10"
                    }`}
                    onClick={() => setKind(selected, "HOLIDAY")}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-danger/30 text-sm font-bold">
                      H
                    </span>
                    Mark as holiday
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className={`btn w-full !justify-start !rounded-2xl ${
                      selectedKind === "WORKING"
                        ? "!bg-jade/20 !text-white ring-1 ring-jade/40"
                        : "!bg-white/5 !text-white/80 hover:!bg-white/10"
                    }`}
                    onClick={() => setKind(selected, "WORKING")}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-jade/30 text-sm font-bold text-ink">
                      W
                    </span>
                    Mark as working day
                  </button>
                </div>
                {toast && <p className="mt-3 text-xs text-jade-glow">{toast}</p>}
              </>
            ) : (
              <p className="mt-4 text-sm text-white/50">Select a date on the calendar</p>
            )}
          </div>

          <div className="surface p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="font-semibold text-[var(--text)]">How it works</p>
                <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-muted)]">
                  <li>Every Sunday is a holiday unless you mark it working.</li>
                  <li>Other days are working unless you mark them holiday.</li>
                  <li>Late / early leave deductions skip holiday dates.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="stat-card text-center">
              <p className="stat-card-value text-jade-deep">{monthStats.working}</p>
              <p className="stat-card-label">Working</p>
            </div>
            <div className="stat-card text-center">
              <p className="stat-card-value text-danger">{monthStats.holidays}</p>
              <p className="stat-card-label">Holidays</p>
            </div>
            <div className="stat-card text-center">
              <p className="stat-card-value">{monthStats.sundays}</p>
              <p className="stat-card-label">Sundays</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
