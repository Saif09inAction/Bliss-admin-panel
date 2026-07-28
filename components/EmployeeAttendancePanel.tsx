"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Attendance, AttendanceSettings, Employee } from "@/lib/types";
import {
  computeMonthAttendanceStats,
  dateKey,
  dayStatus,
  daysInMonth,
  formatLateDuration,
  formatWorkingHours,
  mapsLink,
  monthDateRange,
  monthLabel,
  parseAttendance,
  resolveAttendanceImage,
  statusBadgeClass,
  statusColorClass,
  statusLabel,
} from "@/lib/attendance-utils";

interface Props {
  employee: Employee;
  settings: AttendanceSettings;
  onClose: () => void;
}

export default function EmployeeAttendancePanel({ employee, settings, onClose }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    dateKey(now.getFullYear(), now.getMonth(), now.getDate())
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { start, end } = monthDateRange(year, month);
      try {
        const snap = await getDocs(
          query(
            collection(getDb(), "attendance"),
            where("employeeId", "==", employee.phone),
            where("date", ">=", start),
            where("date", "<=", end)
          )
        );
        if (!cancelled) {
          setRecords(snap.docs.map((d) => parseAttendance(d.id, d.data())));
        }
      } catch {
        const snap = await getDocs(
          query(collection(getDb(), "attendance"), where("employeeId", "==", employee.phone))
        );
        if (!cancelled) {
          const all = snap.docs.map((d) => parseAttendance(d.id, d.data()));
          setRecords(all.filter((r) => r.date >= start && r.date <= end));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [employee.phone, year, month]);

  const byDate = useMemo(() => new Map(records.map((r) => [r.date, r])), [records]);
  const monthStats = useMemo(
    () => computeMonthAttendanceStats(records, year, month),
    [records, year, month]
  );

  const selected = selectedDate ? byDate.get(selectedDate) : undefined;
  const selectedStatus = selectedDate ? dayStatus(selected, selectedDate) : "NONE";

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelectedDate(null);
  }

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" onClick={onClose}>
      <div
        className="panel-slide mt-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:mx-auto sm:my-auto sm:max-h-[88dvh] sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hero-gradient shrink-0 px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/70">Staff Attendance</p>
              <h2 className="text-xl font-bold">{employee.name}</h2>
              <p className="text-sm text-white/80">{employee.phone}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
            >
              Close
            </button>
          </div>
          <div className="profile-stat-grid mt-4">
            <div className="rounded-lg bg-white/10 px-2 py-2 text-center">
              <p className="text-[10px] text-white/70">Present</p>
              <p className="font-bold text-emerald-200">{monthStats.present}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-2 py-2 text-center">
              <p className="text-[10px] text-white/70">Late</p>
              <p className="font-bold text-amber-200">{monthStats.late}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-2 py-2 text-center">
              <p className="text-[10px] text-white/70">Absent</p>
              <p className="font-bold text-red-200">{monthStats.absent}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-2 py-2 text-center">
              <p className="text-[10px] text-white/70">Rate</p>
              <p className="font-bold text-white">{monthStats.rate}%</p>
            </div>
          </div>
        </div>

        <div className="attendance-panel-body p-5">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" className="btn-secondary !px-3 !py-1" onClick={() => shiftMonth(-1)}>
              ← Prev
            </button>
            <h3 className="font-bold text-brand">{monthLabel(year, month)}</h3>
            <button type="button" className="btn-secondary !px-3 !py-1" onClick={() => shiftMonth(1)}>
              Next →
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-emerald-500" /> Present
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-amber-400" /> Late
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-red-500" /> Absent
            </span>
          </div>

          {loading ? (
            <p className="py-8 text-center text-slate-500">Loading calendar...</p>
          ) : (
            <div className="shrink-0">
              <div className="calendar-grid text-center text-xs font-semibold text-slate-500">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {weeks.map((w, wi) => (
                  <div key={wi} className="calendar-grid">
                    {w.map((day, di) => {
                      if (!day) return <div key={di} />;
                      const key = dateKey(year, month, day);
                      const rec = byDate.get(key);
                      const st = dayStatus(rec, key);
                      const isSelected = selectedDate === key;
                      return (
                        <button
                          key={di}
                          type="button"
                          onClick={() => setSelectedDate(key)}
                          className={`calendar-day ${statusColorClass(st)} ${isSelected ? "ring-2 ring-[var(--bliss-green)] ring-offset-1" : ""}`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedDate && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-brand">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </h4>
                <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${statusBadgeClass(selectedStatus)}`}>
                  {statusLabel(String(selectedStatus))}
                </span>
              </div>

              {selected ? (
                <div className="grid gap-4">
                  <DetailBlock
                    title="Clock In"
                    time={selected.signInTime}
                    address={selected.signInAddress}
                    gps={selected.signInGps}
                    image={selected.signInImageLocalPath}
                    extra={
                      selected.lateMinutes > 0
                        ? `Delayed: ${formatLateDuration(selected.lateMinutes)} (expected ${settings.dailySignInTime})`
                        : selected.signInTime
                          ? `On time (expected ${settings.dailySignInTime})`
                          : undefined
                    }
                  />
                  <DetailBlock
                    title="Clock Out"
                    time={selected.signOutTime}
                    address={selected.signOutAddress}
                    gps={selected.signOutGps}
                    image={selected.signOutImageLocalPath}
                    extra={
                      selected.workingHours
                        ? `Worked: ${formatWorkingHours(selected.workingHours)} (expected out ${settings.dailySignOutTime})`
                        : undefined
                    }
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-500">No attendance recorded for this day.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailBlock({
  title,
  time,
  address,
  gps,
  image,
  extra,
}: {
  title: string;
  time?: string;
  address?: string;
  gps?: string;
  image?: string;
  extra?: string;
}) {
  const mapUrl = mapsLink(gps);
  const imageUrl = resolveAttendanceImage(image);
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h5 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h5>
      <p className="text-lg font-bold text-brand">{time || "—"}</p>
      {extra && <p className="mt-1 text-sm text-amber-700">{extra}</p>}
      {address && <p className="mt-2 text-sm text-slate-600">{address}</p>}
      {mapUrl && (
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-sm text-[var(--bliss-green)] underline"
        >
          View on map {gps && `(${gps})`}
        </a>
      )}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`${title} selfie`}
          loading="lazy"
          className="mt-3 max-h-56 w-full rounded-lg object-contain bg-slate-100"
        />
      ) : image?.trim() ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Selfie not synced yet — will appear once uploaded from the app.
        </p>
      ) : null}
    </div>
  );
}
