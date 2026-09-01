"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { ChevronLeft, ChevronRight, Clock, Palmtree, Sparkles, Users } from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { AttendanceSettings, Employee } from "@/lib/types";
import {
  dateKey,
  daysInMonth,
  formatDisplayTime,
  monthLabel,
  normalizeTime,
} from "@/lib/attendance-utils";
import {
  parseCalendarOverride,
  resolveDayKind,
  type CalendarDayOverride,
  type DayKind,
  type HolidayScope,
  type OverrideMap,
} from "@/lib/deduction-utils";
import {
  buildGlobalShiftScheduleSave,
  parseAttendanceSettingsDoc,
} from "@/lib/shift-schedule";
import { formatDisplayDate } from "@/lib/csv";

function dayButtonClass(
  kind: DayKind,
  isToday: boolean,
  isSelected: boolean,
  isPartial: boolean
): string {
  const base = ["calendar-day", "holiday-cal-day"];
  if (kind === "HOLIDAY") base.push("holiday");
  else base.push("working");
  if (isPartial) base.push("partial-holiday");
  if (isToday) base.push("is-today");
  if (isSelected) base.push("selected");
  return base.join(" ");
}

export default function HolidaysPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [overrides, setOverrides] = useState<OverrideMap>(new Map());
  const [staff, setStaff] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<string | null>(
    dateKey(now.getFullYear(), now.getMonth(), now.getDate())
  );
  const [scope, setScope] = useState<HolidayScope>("ALL");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [attendanceSettings, setAttendanceSettings] = useState<AttendanceSettings>({
    dailySignInTime: "09:00",
    dailySignOutTime: "18:00",
  });
  const [sundayShiftForm, setSundayShiftForm] = useState({
    sundaySignInTime: "",
    sundaySignOutTime: "",
  });
  const [savingSundayShift, setSavingSundayShift] = useState(false);
  const [dayShiftForm, setDayShiftForm] = useState({
    dailySignInTime: "",
    dailySignOutTime: "",
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(getDb(), "settings", "attendance"), (snap) => {
      if (!snap.exists()) return;
      const s = parseAttendanceSettingsDoc(snap.data() as Record<string, unknown>);
      setAttendanceSettings(s);
      setSundayShiftForm({
        sundaySignInTime: s.sundaySignInTime || "",
        sundaySignOutTime: s.sundaySignOutTime || "",
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(getDb(), "calendar_days"), (snap) => {
      const map: OverrideMap = new Map();
      snap.docs.forEach((d) => {
        const parsed = parseCalendarOverride(d.id, d.data() as Record<string, unknown>);
        if (parsed) map.set(parsed.date, parsed);
      });
      setOverrides(map);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    getDocs(collection(getDb(), "employees")).then((snap) => {
      setStaff(
        snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              name: (data.name as string) || "",
              phone: (data.phone as string) || d.id,
              joiningDate: (data.joiningDate as string) || "",
              monthlySalary: (data.monthlySalary as number) || 0,
              attendancePercentage: (data.attendancePercentage as number) || 0,
              role: ((data.role as string) || "STAFF") as Employee["role"],
            };
          })
          .filter((e) => e.role === "STAFF")
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  // Sync side panel when selecting a date that already has an override
  useEffect(() => {
    if (!selected) return;
    const ov = overrides.get(selected);
    if (ov?.kind === "HOLIDAY" && ov.appliesTo === "SELECTED") {
      setScope("SELECTED");
      setSelectedEmployees(ov.employeeIds);
    } else {
      setScope("ALL");
      setSelectedEmployees([]);
    }
    setDayShiftForm({
      dailySignInTime: ov?.dailySignInTime || "",
      dailySignOutTime: ov?.dailySignOutTime || "",
    });
  }, [selected, overrides]);

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
    let partial = 0;
    for (let d = 1; d <= totalDays; d++) {
      const key = dateKey(year, month, d);
      const ov = overrides.get(key);
      const kind = resolveDayKind(key, overrides);
      if (kind === "HOLIDAY") holidays++;
      else working++;
      if (new Date(year, month, d).getDay() === 0) sundays++;
      if (ov?.kind === "HOLIDAY" && ov.appliesTo === "SELECTED") partial++;
    }
    return { holidays, working, sundays, partial, calendarDays: totalDays };
  }, [year, month, totalDays, overrides]);

  const selectedOverride: CalendarDayOverride | undefined = selected
    ? overrides.get(selected)
    : undefined;
  const selectedKind = selected ? resolveDayKind(selected, overrides) : null;
  const selectedIsSunday =
    selected != null &&
    (() => {
      const [y, m, d] = selected.split("-").map(Number);
      return new Date(y, m - 1, d).getDay() === 0;
    })();
  const selectedHasOverride = !!selectedOverride;

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelected(null);
  }

  function toggleEmployee(phone: string) {
    setSelectedEmployees((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );
  }

  async function saveSundayShift(e: React.FormEvent) {
    e.preventDefault();
    setSavingSundayShift(true);
    setToast("");
    try {
      const { payload, settings: next, effectiveFrom, changed } = buildGlobalShiftScheduleSave(
        attendanceSettings,
        {
          dailySignInTime: attendanceSettings.dailySignInTime,
          dailySignOutTime: attendanceSettings.dailySignOutTime,
          sundaySignInTime: sundayShiftForm.sundaySignInTime || undefined,
          sundaySignOutTime: sundayShiftForm.sundaySignOutTime || undefined,
        }
      );
      if (!changed) {
        setToast("Sunday shift unchanged.");
        return;
      }
      await setDoc(doc(getDb(), "settings", "attendance"), payload, { merge: true });
      setAttendanceSettings(next);
      setToast(`Sunday shift applies from ${formatDisplayDate(effectiveFrom)}.`);
    } catch {
      setToast("Could not save Sunday shift.");
    } finally {
      setSavingSundayShift(false);
      setTimeout(() => setToast(""), 3000);
    }
  }

  async function saveDayShift(dateStr: string) {
    if (!dateStr || selectedKind !== "WORKING") return;
    setSaving(true);
    setToast("");
    try {
      const ov = overrides.get(dateStr);
      const [y, m, d] = dateStr.split("-").map(Number);
      const isSunday = new Date(y, m - 1, d).getDay() === 0;
      const defaultKind: DayKind = isSunday ? "HOLIDAY" : "WORKING";
      const inT = dayShiftForm.dailySignInTime.trim();
      const outT = dayShiftForm.dailySignOutTime.trim();
      const hasShift = Boolean(inT || outT);

      if (!hasShift && !ov) {
        setToast("Set shift times or mark the day first.");
        setSaving(false);
        return;
      }

      const kind = ov?.kind || (defaultKind === "HOLIDAY" ? "WORKING" : defaultKind);
      const appliesTo = ov?.appliesTo || "ALL";
      const employeeIds = ov?.employeeIds || [];

      if (!hasShift && kind === defaultKind && appliesTo === "ALL") {
        await deleteDoc(doc(getDb(), "calendar_days", dateStr));
        setToast("Per-day shift cleared.");
      } else {
        await setDoc(doc(getDb(), "calendar_days", dateStr), {
          date: dateStr,
          kind,
          appliesTo,
          employeeIds,
          ...(inT ? { dailySignInTime: normalizeTime(inT) } : {}),
          ...(outT ? { dailySignOutTime: normalizeTime(outT) } : {}),
          updatedAt: Date.now(),
        });
        setToast("Shift times saved for this day.");
      }
    } catch {
      setToast("Could not save shift times.");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(""), 2500);
    }
  }

  async function setKind(
    dateStr: string,
    kind: DayKind,
    forceScope?: HolidayScope
  ) {
    setSaving(true);
    setToast("");
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const isSunday = new Date(y, m - 1, d).getDay() === 0;
      const defaultKind: DayKind = isSunday ? "HOLIDAY" : "WORKING";
      const effectiveScope = forceScope ?? scope;

      if (kind === "HOLIDAY" && effectiveScope === "SELECTED" && selectedEmployees.length === 0) {
        setToast("Select at least one employee, or choose All staff.");
        setSaving(false);
        return;
      }

      const appliesTo: HolidayScope =
        kind === "HOLIDAY" && effectiveScope === "SELECTED" ? "SELECTED" : "ALL";
      const employeeIds =
        appliesTo === "SELECTED" ? selectedEmployees : [];

      // Default global rule with no custom scope → remove override
      if (kind === defaultKind && appliesTo === "ALL") {
        await deleteDoc(doc(getDb(), "calendar_days", dateStr));
        setToast(kind === "HOLIDAY" ? "Using Sunday default holiday" : "Marked as working day");
      } else {
        await setDoc(doc(getDb(), "calendar_days", dateStr), {
          date: dateStr,
          kind,
          appliesTo,
          employeeIds,
          ...(dayShiftForm.dailySignInTime
            ? { dailySignInTime: normalizeTime(dayShiftForm.dailySignInTime) }
            : {}),
          ...(dayShiftForm.dailySignOutTime
            ? { dailySignOutTime: normalizeTime(dayShiftForm.dailySignOutTime) }
            : {}),
          updatedAt: Date.now(),
        });
        if (kind === "HOLIDAY") {
          setToast(
            appliesTo === "ALL"
              ? "Holiday for all staff"
              : `Holiday for ${employeeIds.length} staff`
          );
        } else {
          setToast("Marked as working day");
        }
      }
    } catch {
      setToast("Could not save. Try again.");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(""), 2500);
    }
  }

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="space-y-6">
      <div className="page-toolbar">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">Holidays</h2>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Set holiday for all staff or selected employees · {monthStats.calendarDays} days in{" "}
            {monthLabel(year, month)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_380px]">
        <div className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <button type="button" className="btn-icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="font-display text-lg font-bold">{monthLabel(year, month)}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {monthStats.calendarDays} days · {monthStats.working} working ·{" "}
                {monthStats.holidays} holidays
                {monthStats.partial > 0 ? ` · ${monthStats.partial} staff-only` : ""}
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
                    const ov = overrides.get(key);
                    const kind = resolveDayKind(key, overrides);
                    const isPartial =
                      ov?.kind === "HOLIDAY" && ov.appliesTo === "SELECTED";
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelected(key)}
                        className={dayButtonClass(
                          kind,
                          key === todayKey,
                          selected === key,
                          isPartial
                        )}
                        title={
                          isPartial
                            ? `${key} · Holiday for ${ov!.employeeIds.length} staff`
                            : `${key} · ${kind === "HOLIDAY" ? "Holiday" : "Working"}`
                        }
                      >
                        <span className="text-sm font-bold">{day}</span>
                        <span className="mt-0.5 hidden text-[9px] font-semibold uppercase sm:block">
                          {isPartial ? "Some" : kind === "HOLIDAY" ? "Off" : "Work"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[rgba(232,93,76,0.85)]" /> All-staff holiday
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[rgba(232,168,56,0.9)]" /> Selected staff
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-jade" /> Working day
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
                  {selectedOverride?.appliesTo === "SELECTED" &&
                    ` · ${selectedOverride.employeeIds.length} staff`}
                  {selectedIsSunday && !selectedHasOverride && " (Sunday default)"}
                  {selectedHasOverride && selectedOverride?.appliesTo === "ALL" && " (all staff)"}
                </p>

                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/45">
                    <Users size={12} /> Who gets this holiday?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setScope("ALL")}
                      className={`rounded-xl px-3 py-2 text-left text-sm ${
                        scope === "ALL"
                          ? "bg-jade/25 text-white ring-1 ring-jade/50"
                          : "bg-white/5 text-white/70"
                      }`}
                    >
                      <p className="font-bold">All staff</p>
                      <p className="text-[10px] opacity-70">Everyone off</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("SELECTED")}
                      className={`rounded-xl px-3 py-2 text-left text-sm ${
                        scope === "SELECTED"
                          ? "bg-bronze/30 text-white ring-1 ring-bronze/50"
                          : "bg-white/5 text-white/70"
                      }`}
                    >
                      <p className="font-bold">Selected</p>
                      <p className="text-[10px] opacity-70">Pick employees</p>
                    </button>
                  </div>
                </div>

                {scope === "SELECTED" && (
                  <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-xl bg-white/5 p-2">
                    {staff.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-white/50">No staff found</p>
                    ) : (
                      staff.map((e) => {
                        const checked = selectedEmployees.includes(e.phone);
                        return (
                          <label
                            key={e.phone}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/85 hover:bg-white/5"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEmployee(e.phone)}
                              className="accent-[var(--jade)]"
                            />
                            <span className="min-w-0 flex-1 truncate capitalize">{e.name}</span>
                            <span className="text-[10px] text-white/40">{e.phone}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}

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
                    {scope === "SELECTED"
                      ? ` (${selectedEmployees.length || "…" } staff)`
                      : " (all)"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className={`btn w-full !justify-start !rounded-2xl ${
                      selectedKind === "WORKING" && selectedOverride?.appliesTo !== "SELECTED"
                        ? "!bg-jade/20 !text-white ring-1 ring-jade/40"
                        : "!bg-white/5 !text-white/80 hover:!bg-white/10"
                    }`}
                    onClick={() => {
                      setScope("ALL");
                      void setKind(selected, "WORKING", "ALL");
                    }}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-jade/30 text-sm font-bold text-ink">
                      W
                    </span>
                    Mark as working day (all)
                  </button>
                </div>
                {toast && <p className="mt-3 text-xs text-jade-glow">{toast}</p>}

                {selectedKind === "WORKING" && (
                  <div className="mt-4 rounded-xl bg-white/5 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/45">
                      <Clock size={12} /> Shift for this day
                    </p>
                    <p className="mb-2 text-[10px] text-white/50">
                      {selectedIsSunday
                        ? "Optional — overrides default Sunday shift below."
                        : "Optional — leave empty to use weekday shift from Attendance."}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label !mb-1 !text-[10px] !text-white/50">Login</label>
                        <input
                          type="time"
                          className="input !py-2"
                          value={dayShiftForm.dailySignInTime}
                          onChange={(e) =>
                            setDayShiftForm((f) => ({ ...f, dailySignInTime: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="label !mb-1 !text-[10px] !text-white/50">Logout</label>
                        <input
                          type="time"
                          className="input !py-2"
                          value={dayShiftForm.dailySignOutTime}
                          onChange={(e) =>
                            setDayShiftForm((f) => ({ ...f, dailySignOutTime: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      className="btn btn-secondary btn-sm mt-2 w-full"
                      onClick={() => selected && saveDayShift(selected)}
                    >
                      Save shift for this day
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-white/50">Select a date on the calendar</p>
            )}
          </div>

          <div className="surface p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                <Clock size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--text)]">Sunday shift (all working Sundays)</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Weekday shift: {formatDisplayTime(attendanceSettings.dailySignInTime)} –{" "}
                  {formatDisplayTime(attendanceSettings.dailySignOutTime)} (from Attendance settings)
                </p>
                <form onSubmit={saveSundayShift} className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label !text-[10px]">Sunday login</label>
                      <input
                        type="time"
                        className="input !py-2"
                        value={sundayShiftForm.sundaySignInTime}
                        onChange={(e) =>
                          setSundayShiftForm((f) => ({ ...f, sundaySignInTime: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="label !text-[10px]">Sunday logout</label>
                      <input
                        type="time"
                        className="input !py-2"
                        value={sundayShiftForm.sundaySignOutTime}
                        onChange={(e) =>
                          setSundayShiftForm((f) => ({ ...f, sundaySignOutTime: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-secondary btn-sm w-full" disabled={savingSundayShift}>
                    {savingSundayShift ? "Saving…" : "Save Sunday shift"}
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="surface p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="font-semibold text-[var(--text)]">How it works</p>
                <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-muted)]">
                  <li>Salary day rate = monthly ÷ days in month ({monthStats.calendarDays} this month).</li>
                  <li>Choose All staff or pick specific employees for a holiday.</li>
                  <li>Sundays are holidays by default unless marked working.</li>
                  <li>Set a default Sunday shift above, or per-day shift when marking working.</li>
                  <li>Shift changes apply from the next day — past attendance keeps old timings.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="stat-card text-center">
              <p className="stat-card-value">{monthStats.calendarDays}</p>
              <p className="stat-card-label">Days in month</p>
            </div>
            <div className="stat-card text-center">
              <p className="stat-card-value text-jade-deep">{monthStats.working}</p>
              <p className="stat-card-label">Working</p>
            </div>
            <div className="stat-card text-center">
              <p className="stat-card-value text-danger">{monthStats.holidays}</p>
              <p className="stat-card-label">Holidays</p>
            </div>
            <div className="stat-card text-center">
              <p className="stat-card-value text-warning">{monthStats.partial}</p>
              <p className="stat-card-label">Staff-only</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
