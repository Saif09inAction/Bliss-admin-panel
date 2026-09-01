"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { ChevronLeft, ChevronRight, MapPin, X } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Attendance, AttendanceSettings, Employee } from "@/lib/types";
import {
  computeEarlyLeaveMinutes,
  computeLateMinutes,
  dateKey,
  daysInMonth,
  effectiveDayStatus,
  formatDisplayTime,
  formatEarlyLeaveDuration,
  formatLateDuration,
  formatWorkingHours,
  mapsLink,
  monthDateRange,
  monthLabel,
  parseAttendance,
  resolveAttendanceImage,
  resolveShiftSettings,
  statusLabel,
  displayStatusLabel,
} from "@/lib/attendance-utils";
import { parseCalendarOverride, type OverrideMap } from "@/lib/deduction-utils";

interface Props {
  employee: Employee;
  settings: AttendanceSettings;
  onClose: () => void;
}

function calendarDayClass(status: string, isSelected: boolean): string {
  const classes = ["calendar-day"];
  switch (status) {
    case "PRESENT":
    case "ON_TIME":
    case "LEFT_EARLY":
      classes.push("present");
      break;
    case "HALF_DAY":
      classes.push("half-day");
      break;
    case "LATE":
      classes.push("late");
      break;
    case "ABSENT":
      classes.push("absent");
      break;
    case "FUTURE":
      classes.push("muted");
      break;
  }
  if (isSelected) classes.push("selected");
  return classes.join(" ");
}

function badgeClass(status: string): string {
  switch (status) {
    case "PRESENT":
    case "ON_TIME":
      return "badge badge-success";
    case "HALF_DAY":
      return "badge badge-warn";
    case "LATE":
    case "LEFT_EARLY":
      return "badge badge-warn";
    case "ABSENT":
      return "badge badge-danger";
    default:
      return "badge badge-neutral";
  }
}

export default function EmployeeAttendancePanel({ employee, settings, onClose }: Props) {
  const { session } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    dateKey(now.getFullYear(), now.getMonth(), now.getDate())
  );
  const [creditSaving, setCreditSaving] = useState(false);
  const [creditMsg, setCreditMsg] = useState("");
  const [overrides, setOverrides] = useState<OverrideMap>(new Map());

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

  const shiftForDate = (dateStr: string) =>
    resolveShiftSettings(employee, settings, dateStr, overrides, employee.phone);

  useEffect(() => {
    setLoading(true);
    const { start, end } = monthDateRange(year, month);
    let fallbackUnsub: (() => void) | undefined;

    const unsub = onSnapshot(
      query(
        collection(getDb(), "attendance"),
        where("employeeId", "==", employee.phone),
        where("date", ">=", start),
        where("date", "<=", end)
      ),
      (snap) => {
        setRecords(snap.docs.map((d) => parseAttendance(d.id, d.data())));
        setLoading(false);
      },
      () => {
        fallbackUnsub = onSnapshot(
          query(collection(getDb(), "attendance"), where("employeeId", "==", employee.phone)),
          (snap) => {
            const all = snap.docs.map((d) => parseAttendance(d.id, d.data()));
            setRecords(all.filter((r) => r.date >= start && r.date <= end));
            setLoading(false);
          },
          () => setLoading(false)
        );
      }
    );

    return () => {
      unsub();
      fallbackUnsub?.();
    };
  }, [employee.phone, year, month]);

  const byDate = useMemo(() => new Map(records.map((r) => [r.date, r])), [records]);
  const monthStats = useMemo(() => {
    const totalDays = daysInMonth(year, month);
    const today = new Date();
    let present = 0;
    let late = 0;
    let absent = 0;
    let workingDays = 0;
    for (let d = 1; d <= totalDays; d++) {
      const key = dateKey(year, month, d);
      const day = new Date(year, month, d);
      if (day > new Date(today.getFullYear(), today.getMonth(), today.getDate())) continue;
      workingDays++;
      const st = effectiveDayStatus(byDate.get(key), key, shiftForDate(key));
      if (st === "ABSENT") absent++;
      else if (st === "LATE") late++;
      else if (st === "PRESENT" || st === "ON_TIME" || st === "LEFT_EARLY" || st === "HALF_DAY")
        present++;
    }
    const rate = workingDays ? Math.round(((present + late) / workingDays) * 100) : 0;
    return { present, late, absent, workingDays, rate };
  }, [byDate, year, month, overrides, employee, settings]);

  const selected = selectedDate ? byDate.get(selectedDate) : undefined;
  const selectedStatus = selectedDate
    ? effectiveDayStatus(selected, selectedDate, shiftForDate(selectedDate))
    : "NONE";
  const selectedShift = selectedDate ? shiftForDate(selectedDate) : resolveShiftSettings(employee, settings);
  const selectedLate = computeLateMinutes(selected?.signInTime, selectedShift.dailySignInTime);
  const selectedEarly = computeEarlyLeaveMinutes(selected?.signOutTime, selectedShift.dailySignOutTime);
  const showCreditActions =
    selectedDate &&
    selectedStatus !== "FUTURE" &&
    (selectedStatus === "LATE" ||
      selectedStatus === "LEFT_EARLY" ||
      selectedStatus === "ABSENT" ||
      selected?.dayCredit === "FULL" ||
      selected?.dayCredit === "HALF" ||
      selectedLate > 0 ||
      selectedEarly > 0);

  async function setDayCredit(credit: "FULL" | "HALF" | null) {
    if (!selectedDate) return;
    setCreditSaving(true);
    setCreditMsg("");
    try {
      const id = `${employee.phone}_${selectedDate}`;
      const existing = byDate.get(selectedDate);
      const payload: Record<string, unknown> = {
        id,
        employeeId: employee.phone,
        date: selectedDate,
        dayCredit: credit,
        dayCreditBy: credit ? session?.name || "Admin" : null,
        dayCreditAt: credit ? Date.now() : null,
      };
      // Preserve punches when creating a credit-only doc for an absent day.
      if (existing) {
        if (existing.signInTime) payload.signInTime = existing.signInTime;
        if (existing.signOutTime) payload.signOutTime = existing.signOutTime;
        if (existing.status) payload.status = existing.status;
        if (existing.lateMinutes != null) payload.lateMinutes = existing.lateMinutes;
        if (existing.workingHours != null) payload.workingHours = existing.workingHours;
      } else if (credit) {
        payload.status = credit === "HALF" ? "HALF_DAY" : "PRESENT";
        payload.lateMinutes = 0;
        payload.workingHours = 0;
      }
      await setDoc(doc(getDb(), "attendance", id), payload, { merge: true });
      setCreditMsg(
        credit === "FULL"
          ? "Marked as full-day present — late/early cut removed."
          : credit === "HALF"
            ? "Marked as half day — late/early cut removed."
            : "Override cleared — punch times apply again."
      );
    } catch (err) {
      setCreditMsg(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setCreditSaving(false);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelectedDate(null);
    setCreditMsg("");
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
    <div className="fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="panel-slide ml-auto flex w-full max-w-lg flex-col overflow-hidden bg-[var(--surface)] shadow-dock"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="surface-ink shrink-0 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bronze">
                Staff Attendance
              </p>
              <h2 className="mt-1 font-display text-xl font-bold">{employee.name}</h2>
              <p className="text-sm text-white/55">{employee.phone}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-icon !border-white/15 !bg-white/10 !text-white hover:!border-jade hover:!bg-jade/20 hover:!text-white"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { label: "Present", value: monthStats.present, color: "text-jade-glow" },
              { label: "Late", value: monthStats.late, color: "text-warning" },
              { label: "Absent", value: monthStats.absent, color: "text-danger" },
              { label: "Rate", value: `${monthStats.rate}%`, color: "text-white" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-center"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                  {s.label}
                </p>
                <p className={`font-display text-lg font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-5 flex items-center justify-between">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <h3 className="font-display text-base font-bold text-ink">{monthLabel(year, month)}</h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => shiftMonth(1)}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-md border border-jade/40 bg-jade-soft" /> Full day
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-md border border-warning/40 bg-warning/15" /> Half day
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-md border border-warning/40 bg-warning/15" /> Late
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-md border border-danger/30 bg-danger/10" /> Absent
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="skeleton h-8 w-full max-w-xs rounded-xl" />
              <div className="skeleton h-48 w-full rounded-xl" />
            </div>
          ) : (
            <div className="surface p-3 sm:p-4">
              <div className="calendar-grid mb-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {weeks.map((w, wi) => (
                  <div key={wi} className="calendar-grid">
                    {w.map((day, di) => {
                      if (!day) return <div key={di} />;
                      const key = dateKey(year, month, day);
                      const rec = byDate.get(key);
                      const st = effectiveDayStatus(rec, key, shiftForDate(key));
                      const isSelected = selectedDate === key;
                      return (
                        <button
                          key={di}
                          type="button"
                          onClick={() => {
                            setSelectedDate(key);
                            setCreditMsg("");
                          }}
                          className={calendarDayClass(String(st), isSelected)}
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
            <div className="mt-5 surface p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-display text-base font-bold text-ink">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </h4>
                <span className={badgeClass(String(selectedStatus))}>
                  {displayStatusLabel(String(selectedStatus), selected)}
                </span>
              </div>

              {selected ? (
                <div className="grid gap-4">
                  <DetailBlock
                    title="Clock In"
                    time={formatDisplayTime(selected.signInTime)}
                    address={selected.signInAddress}
                    gps={selected.signInGps}
                    image={selected.signInImageLocalPath}
                    extra={
                      selected.dayCredit
                        ? selectedLate > 0
                          ? `Was late (${formatLateDuration(selectedLate)}) — forgiven by admin`
                          : selected.signInTime
                            ? `On time (expected ${formatDisplayTime(selectedShift.dailySignInTime)})`
                            : undefined
                        : selectedLate > 0
                          ? `Delayed: ${formatLateDuration(selectedLate)} (expected ${formatDisplayTime(selectedShift.dailySignInTime)})`
                          : selected.signInTime
                            ? `On time (expected ${formatDisplayTime(selectedShift.dailySignInTime)})`
                            : undefined
                    }
                    extraTone={
                      selected.dayCredit
                        ? "ok"
                        : selectedLate > 0
                          ? "warn"
                          : "ok"
                    }
                  />
                  <DetailBlock
                    title="Clock Out"
                    time={formatDisplayTime(selected.signOutTime)}
                    address={selected.signOutAddress}
                    gps={selected.signOutGps}
                    image={selected.signOutImageLocalPath}
                    extra={
                      selected.signOutTime
                        ? selected.dayCredit && selectedEarly > 0
                          ? `Left early (${formatEarlyLeaveDuration(selectedEarly)}) — forgiven by admin`
                          : selectedEarly > 0
                            ? `Left early: ${formatEarlyLeaveDuration(selectedEarly)} (expected ${formatDisplayTime(selectedShift.dailySignOutTime)})`
                            : `On time (expected ${formatDisplayTime(selectedShift.dailySignOutTime)})`
                        : undefined
                    }
                    extraTone={
                      selected.dayCredit
                        ? "ok"
                        : selectedEarly > 0
                          ? "warn"
                          : undefined
                    }
                    footer={
                      selected.workingHours
                        ? `Worked: ${formatWorkingHours(selected.workingHours)}`
                        : undefined
                    }
                  />
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  No attendance recorded for this day.
                </p>
              )}

              {showCreditActions && (
                <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Admin override
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Forgive late / early leave (or credit an absent day) so salary is not cut.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        selected?.dayCredit === "FULL" ? "btn-primary" : "btn-secondary"
                      }`}
                      disabled={creditSaving}
                      onClick={() => setDayCredit("FULL")}
                    >
                      Full day present
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        selected?.dayCredit === "HALF" ? "btn-primary" : "btn-secondary"
                      }`}
                      disabled={creditSaving}
                      onClick={() => setDayCredit("HALF")}
                    >
                      Half day
                    </button>
                    {(selected?.dayCredit === "FULL" || selected?.dayCredit === "HALF") && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={creditSaving}
                        onClick={() => setDayCredit(null)}
                      >
                        Clear override
                      </button>
                    )}
                  </div>
                  {selected?.dayCredit && selected.dayCreditBy && (
                    <p className="text-xs text-jade-deep">
                      Marked {selected.dayCredit === "HALF" ? "half day" : "full day"} by{" "}
                      {selected.dayCreditBy}
                      {selected.dayCreditAt
                        ? ` · ${new Date(selected.dayCreditAt).toLocaleString("en-IN")}`
                        : ""}
                    </p>
                  )}
                  {creditMsg && (
                    <p className="rounded-xl bg-jade-soft/70 px-3 py-2 text-xs text-jade-deep">
                      {creditMsg}
                    </p>
                  )}
                </div>
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
  extraTone,
  footer,
}: {
  title: string;
  time?: string;
  address?: string;
  gps?: string;
  image?: string;
  extra?: string;
  extraTone?: "warn" | "ok";
  footer?: string;
}) {
  const mapUrl = mapsLink(gps);
  const imageUrl = resolveAttendanceImage(image);
  const extraClass =
    extraTone === "ok"
      ? "mt-1 text-sm text-jade-deep"
      : "mt-1 text-sm text-warning";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h5 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </h5>
      <p className="font-display text-xl font-bold text-ink">{time || "—"}</p>
      {extra && <p className={extraClass}>{extra}</p>}
      {footer && <p className="mt-1 text-sm text-[var(--text-muted)]">{footer}</p>}
      {address && address !== "Address not resolved" ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">{address}</p>
      ) : (
        <p className="mt-2 text-sm text-warning italic">Location not enabled</p>
      )}
      {mapUrl && (
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-jade-deep underline-offset-2 hover:underline"
        >
          <MapPin size={14} />
          View on map {gps && `(${gps})`}
        </a>
      )}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`${title} selfie`}
          loading="lazy"
          className="mt-3 max-h-56 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-mist)] object-contain"
        />
      ) : image?.trim() ? (
        <p className="mt-3 rounded-xl border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-[#9a6b10]">
          Selfie not synced yet — will appear once uploaded from the app.
        </p>
      ) : null}
    </div>
  );
}
