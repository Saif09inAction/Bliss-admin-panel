"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
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
import {
  dayStatus,
  defaultSettings,
  formatLateDuration,
  formatWorkingHours,
  normalizeTime,
  parseAttendance,
  statusLabel,
} from "@/lib/attendance-utils";
import EmployeeAttendancePanel from "@/components/EmployeeAttendancePanel";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

function badgeClass(status: string): string {
  switch (status) {
    case "PRESENT":
    case "ON_TIME":
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

  useEffect(() => {
    async function loadStaff() {
      const snap = await getDocs(collection(getDb(), "employees"));
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
    }
    loadStaff();
  }, []);

  useEffect(() => {
    async function loadSettings() {
      const snap = await getDoc(doc(getDb(), "settings", "attendance"));
      if (snap.exists()) {
        const data = snap.data();
        const s = {
          dailySignInTime: normalizeTime(data.dailySignInTime as string),
          dailySignOutTime: normalizeTime(data.dailySignOutTime as string),
        };
        setSettings(s);
        setSettingsForm(s);
      }
    }
    loadSettings();
  }, []);

  useEffect(() => {
    async function loadDay() {
      setLoading(true);
      setLoadError("");
      try {
        const snap = await getDocs(query(collection(getDb(), "attendance"), where("date", "==", date)));
        setRecords(snap.docs.map((d) => parseAttendance(d.id, d.data())));
      } catch (err) {
        console.error(err);
        setLoadError("Could not load attendance. Check Firebase connection.");
        setRecords([]);
      } finally {
        setLoading(false);
      }
    }
    loadDay();
  }, [date]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg("");
    try {
      await setDoc(doc(getDb(), "settings", "attendance"), settingsForm, { merge: true });
      setSettings(settingsForm);
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
    if (!q) return staff;
    return staff.filter((e) => e.name.toLowerCase().includes(q) || e.phone.includes(q));
  }, [staff, search]);

  const stats = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    for (const e of staff) {
      const r = byEmployee.get(e.phone);
      const st = dayStatus(r, date);
      if (st === "ABSENT") absent++;
      else if (st === "LATE") late++;
      else present++;
    }
    const rate = staff.length ? Math.round((present / staff.length) * 100) : 0;
    return { present, late, absent, rate };
  }, [staff, byEmployee, date]);

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
    <div className="space-y-6">
      <div className="page-toolbar">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">Attendance</h2>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {staff.length} staff · {formattedDate}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px]">
        {/* Left — staff roster */}
        <div className="surface overflow-hidden">
          <div className="border-b border-[var(--border)] p-4 sm:p-5">
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
                const st = dayStatus(r, date);
                return (
                  <button
                    key={e.phone}
                    type="button"
                    onClick={() => setSelectedEmployee(e)}
                    className="group flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-jade-soft/40 sm:px-5"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink font-display text-sm font-bold text-jade">
                      {e.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--text)]">{e.name}</p>
                      <p className="text-sm text-[var(--text-muted)]">{e.phone}</p>
                      {r?.signInTime && (
                        <p className="mt-0.5 text-xs text-[var(--text-faint)]">
                          In {r.signInTime}
                          {r.signOutTime ? ` · Out ${r.signOutTime}` : ""}
                          {r.lateMinutes > 0 ? ` · ${formatLateDuration(r.lateMinutes)}` : ""}
                          {r.workingHours ? ` · ${formatWorkingHours(r.workingHours)} worked` : ""}
                        </p>
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

          <p className="border-t border-[var(--border)] px-4 py-3 text-center text-xs text-[var(--text-faint)] sm:px-5">
            Click any staff member to open their monthly calendar with photos &amp; GPS locations
          </p>
        </div>

        {/* Right — settings & stats */}
        <div className="stagger flex flex-col gap-4">
          <form onSubmit={saveSettings} className="surface p-4 sm:p-5">
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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="surface-ink p-4 sm:p-5">
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
              {stats.present} of {staff.length} staff checked in
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
