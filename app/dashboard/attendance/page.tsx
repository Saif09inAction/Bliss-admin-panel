"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, setDoc, query, where } from "firebase/firestore";
import {
  CalendarDays,
  ChevronRight,
  Clock,
  Search,
  UserCheck,
  UserX,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { Attendance, AttendanceSettings, Employee } from "@/lib/types";
import { todayStr } from "@/lib/csv";
import { computeEarlyLeaveMinutes,
  computeLateMinutes,
  defaultSettings,
  effectiveDayStatus,
  formatEarlyLeaveDuration,
  formatLateDuration,
  normalizeTime,
  parseAttendance,
  statusLabel,
  formatDisplayTime,
} from "@/lib/attendance-utils";
import EmployeeAttendancePanel from "@/components/EmployeeAttendancePanel";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

function badgeClass(status: string): string {
  switch (status) {
    case "PRESENT":
    case "ON_TIME":
    case "HALF_DAY":
      return "badge badge-success";
    case "LATE":
    case "LEFT_EARLY":
      return "badge badge-warn";
    case "ABSENT":
      return "badge badge-danger";
    default:
      return "badge badge-neutral";
  }
}

export default function AttendancePage() {
  const [date, setDate] = useState(todayStr());
  const [search, setSearch] = useState("");
  const [staff, setStaff] = useState<Employee[]>([]);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings>(defaultSettings());
  const [settingsForm, setSettingsForm] = useState(defaultSettings());
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(getDb(), "employees"),
      (snap) => {
        setStaff(
          snap.docs
            .filter((d) => (d.data().role as string) === "STAFF" || !d.data().role)
            .map((d) => ({
              id: (d.data().id as string) || d.id,
              name: d.data().name as string,
              phone: d.data().phone as string,
              joiningDate: (d.data().joiningDate as string) || "",
              monthlySalary: (d.data().monthlySalary as number) || 0,
              attendancePercentage: (d.data().attendancePercentage as number) || 0,
              role: "STAFF" as const,
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      },
      () => setLoadError("Could not load staff list.")
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(getDb(), "settings", "attendance"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const s = {
          dailySignInTime: normalizeTime(data.dailySignInTime as string),
          dailySignOutTime: normalizeTime(data.dailySignOutTime as string),
        };
        setSettings(s);
        setSettingsForm(s);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    const unsub = onSnapshot(
      query(collection(getDb(), "attendance"), where("date", "==", date)),
      (snap) => {
        setRecords(snap.docs.map((d) => parseAttendance(d.id, d.data())));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoadError("Could not load attendance. Check Firebase connection.");
        setRecords([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [date]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg("");
    try {
      const payload = {
        dailySignInTime: normalizeTime(settingsForm.dailySignInTime),
        dailySignOutTime: normalizeTime(settingsForm.dailySignOutTime),
      };
      await setDoc(doc(getDb(), "settings", "attendance"), payload, { merge: true });
      setSettings(payload);
      setSettingsForm(payload);
      setSettingsMsg("Shift timings saved.");
    } catch {
      setSettingsMsg("Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  const byEmployee = useMemo(() => new Map(records.map((r) => [r.employeeId, r])), [records]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q
      ? staff
      : staff.filter((e) => e.name.toLowerCase().includes(q) || e.phone.includes(q));

    // Needs attention first: Absent → Late → Left early → Present → A–Z
    const rank = (st: string) => {
      if (st === "ABSENT") return 0;
      if (st === "LATE") return 1;
      if (st === "LEFT_EARLY") return 2;
      if (st === "PRESENT" || st === "ON_TIME" || st === "HALF_DAY") return 3;
      return 4;
    };
    return [...list].sort((a, b) => {
      const sa = effectiveDayStatus(byEmployee.get(a.phone), date, settings);
      const sb = effectiveDayStatus(byEmployee.get(b.phone), date, settings);
      const ra = rank(String(sa));
      const rb = rank(String(sb));
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [staff, search, byEmployee, date, settings]);

  const stats = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    for (const e of staff) {
      const r = byEmployee.get(e.phone);
      const st = effectiveDayStatus(r, date, settings);
      if (st === "ABSENT") absent++;
      else if (st === "LATE") late++;
      else present++;
    }
    const rate = staff.length ? Math.round(((present + late) / staff.length) * 100) : 0;
    return { present, late, absent, rate };
  }, [staff, byEmployee, date, settings]);

  const formattedDate = useMemo(
    () =>
      new Date(date + "T12:00:00").toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [date]
  );

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="page-toolbar">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">Attendance</h2>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {staff.length} staff · {formattedDate}
          </p>
        </div>
      </div>

      {/* Mobile: stats first so client sees the day at a glance */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        <StatTile label="Present" value={stats.present} icon={<UserCheck size={16} />} accent="jade" />
        <StatTile label="Late" value={stats.late} icon={<AlertTriangle size={16} />} accent="warn" />
        <StatTile label="Absent" value={stats.absent} icon={<UserX size={16} />} accent="danger" />
        <StatTile label="Rate" value={`${stats.rate}%`} icon={<TrendingUp size={16} />} accent="bronze" />
      </div>

      <div className="grid gap-5 lg:gap-6 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px]">
        {/* Left — staff roster */}
        <div className="surface overflow-hidden order-2 lg:order-1">
          <div className="border-b border-[var(--border)] p-3.5 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="label">Search Staff</label>
                <AdminSearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search by name or mobile..."
                />
              </div>
              <div className="sm:w-44">
                <label className="label">Date</label>
                <input
                  className="input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)] lg:hidden">
              Sorted: Absent → Late → Present
            </p>
          </div>

          {loadError && (
            <div className="mx-4 mt-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger sm:mx-5">
              {loadError}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="skeleton h-10 w-10 rounded-full" />
              <p className="text-sm text-[var(--text-muted)]">Loading attendance...</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {filteredStaff.map((e) => {
                const r = byEmployee.get(e.phone);
                const st = effectiveDayStatus(r, date, settings);
                const lateMins = computeLateMinutes(r?.signInTime, settings.dailySignInTime);
                const earlyMins = computeEarlyLeaveMinutes(r?.signOutTime, settings.dailySignOutTime);
                return (
                  <button
                    key={e.phone}
                    type="button"
                    onClick={() => setSelectedEmployee(e)}
                    className="group flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition active:bg-jade-soft/50 hover:bg-jade-soft/40 sm:gap-4 sm:px-5 sm:py-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink font-display text-sm font-bold text-jade sm:h-11 sm:w-11">
                      {e.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--text)]">{e.name}</p>
                      {r?.signInTime ? (
                        <p className="mt-0.5 text-xs text-[var(--text-faint)]">
                          In {formatDisplayTime(r.signInTime)}
                          {r.signOutTime ? ` · Out ${formatDisplayTime(r.signOutTime)}` : ""}
                          {r.dayCredit === "FULL"
                            ? " · Full day (forgiven)"
                            : r.dayCredit === "HALF"
                              ? " · Half day"
                              : ""}
                          {!r.dayCredit && lateMins > 0 ? ` · ${formatLateDuration(lateMins)}` : ""}
                          {!r.dayCredit && earlyMins > 0
                            ? ` · Left ${formatEarlyLeaveDuration(earlyMins)}`
                            : ""}
                        </p>
                      ) : r?.dayCredit ? (
                        <p className="mt-0.5 text-xs text-jade-deep">
                          {r.dayCredit === "HALF" ? "Half day (admin)" : "Full day present (admin)"}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{e.phone}</p>
                      )}
                    </div>
                    <span className={`shrink-0 ${badgeClass(String(st))}`}>
                      {statusLabel(String(st))}
                    </span>
                    <ChevronRight
                      size={16}
                      className="hidden shrink-0 text-[var(--text-faint)] transition group-hover:translate-x-0.5 group-hover:text-jade-deep sm:block"
                    />
                  </button>
                );
              })}
              {filteredStaff.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12">
                  <Search size={20} className="text-[var(--text-faint)]" />
                  <p className="text-sm text-[var(--text-muted)]">No staff found.</p>
                </div>
              )}
            </div>
          )}

          <p className="hidden border-t border-[var(--border)] px-4 py-3 text-center text-xs text-[var(--text-faint)] sm:px-5 lg:block">
            Click any staff member to open their monthly calendar with photos &amp; GPS locations
          </p>
        </div>

        {/* Right — settings & stats */}
        <div className="order-1 flex flex-col gap-3 lg:order-2 lg:gap-4">
          {/* Collapsible shift settings on mobile */}
          <div className="surface overflow-hidden lg:hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                  <Clock size={16} />
                </div>
                <div>
                  <p className="font-semibold text-sm">Shift timings</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatDisplayTime(settings.dailySignInTime)} – {formatDisplayTime(settings.dailySignOutTime)}
                  </p>
                </div>
              </div>
              <ChevronRight
                size={16}
                className={`text-[var(--text-faint)] transition ${settingsOpen ? "rotate-90" : ""}`}
              />
            </button>
            {settingsOpen && (
              <form onSubmit={saveSettings} className="border-t border-[var(--border)] p-3.5 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Login</label>
                    <input
                      className="input"
                      type="time"
                      value={settingsForm.dailySignInTime}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, dailySignInTime: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Logout</label>
                    <input
                      className="input"
                      type="time"
                      value={settingsForm.dailySignOutTime}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, dailySignOutTime: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary mt-3 w-full" disabled={savingSettings}>
                  {savingSettings ? "Saving..." : "Save timings"}
                </button>
                {settingsMsg && (
                  <p className={`mt-2 text-sm ${settingsMsg.includes("Failed") ? "text-danger" : "text-jade-deep"}`}>
                    {settingsMsg}
                  </p>
                )}
              </form>
            )}
          </div>

          <form onSubmit={saveSettings} className="surface hidden p-4 sm:p-5 lg:block">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                <Clock size={16} />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-ink">Shift Timings</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Used for late arrivals &amp; early departures
                </p>
              </div>
            </div>
            <div className="grid gap-3">
              <div>
                <label className="label">Expected Login</label>
                <input
                  className="input"
                  type="time"
                  value={settingsForm.dailySignInTime}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, dailySignInTime: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="label">Expected Logout</label>
                <input
                  className="input"
                  type="time"
                  value={settingsForm.dailySignOutTime}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, dailySignOutTime: e.target.value })
                  }
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={savingSettings}>
                {savingSettings ? "Saving..." : "Save Timings"}
              </button>
            </div>
            {settingsMsg && (
              <p
                className={`mt-3 text-sm ${settingsMsg.includes("Failed") ? "text-danger" : "text-jade-deep"}`}
              >
                {settingsMsg}
              </p>
            )}
          </form>

          <div className="hidden grid-cols-2 gap-3 lg:grid">
            <StatTile
              label="Present"
              value={stats.present}
              icon={<UserCheck size={16} />}
              accent="jade"
            />
            <StatTile
              label="Late"
              value={stats.late}
              icon={<AlertTriangle size={16} />}
              accent="warn"
            />
            <StatTile
              label="Absent"
              value={stats.absent}
              icon={<UserX size={16} />}
              accent="danger"
            />
            <StatTile
              label="Rate"
              value={`${stats.rate}%`}
              icon={<TrendingUp size={16} />}
              accent="bronze"
            />
          </div>

          <div className="surface-ink hidden p-4 sm:p-5 lg:block">
            <div className="flex items-center gap-3">
              <CalendarDays size={18} className="text-jade-glow" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Today&apos;s snapshot
                </p>
                <p className="font-display text-2xl font-bold">
                  {stats.rate}%
                  <span className="ml-1 text-sm font-normal text-white/50">attendance</span>
                </p>
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-jade to-jade-glow transition-all duration-500"
                style={{ width: `${stats.rate}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-white/40">
              {stats.present + stats.late} of {staff.length} staff checked in
            </p>
          </div>
        </div>
      </div>

      {selectedEmployee && (
        <EmployeeAttendancePanel
          employee={selectedEmployee}
          settings={settings}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent: "jade" | "warn" | "danger" | "bronze";
}) {
  const iconBg =
    accent === "warn"
      ? "bg-warning/15 text-warning"
      : accent === "danger"
        ? "bg-danger/10 text-danger"
        : accent === "bronze"
          ? "bg-bronze-soft text-[#8a6a35]"
          : "bg-jade-soft text-jade-deep";

  return (
    <div className="stat-card !p-3.5 sm:!p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="stat-card-label !text-[10px]">{label}</p>
          <p className="stat-card-value !text-xl sm:!text-2xl">{value}</p>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>{icon}</div>
      </div>
    </div>
  );
}
