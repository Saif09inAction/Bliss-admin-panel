"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
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
  statusBadgeClass,
  statusLabel,
} from "@/lib/attendance-utils";
import EmployeeAttendancePanel from "@/components/EmployeeAttendancePanel";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

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

  return (
    <div className="space-y-5">
      <form onSubmit={saveSettings} className="card">
        <h2 className="mb-1 text-lg font-bold text-brand">Shift Timings</h2>
        <p className="mb-4 text-sm text-slate-500">Used to calculate late arrivals and early departures in the app</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Expected Login Time</label>
            <input
              className="input"
              type="time"
              value={settingsForm.dailySignInTime}
              onChange={(e) => setSettingsForm({ ...settingsForm, dailySignInTime: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Expected Logout Time</label>
            <input
              className="input"
              type="time"
              value={settingsForm.dailySignOutTime}
              onChange={(e) => setSettingsForm({ ...settingsForm, dailySignOutTime: e.target.value })}
              required
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary" disabled={savingSettings}>
              {savingSettings ? "Saving..." : "Save Timings"}
            </button>
          </div>
        </div>
        {settingsMsg && <p className="mt-2 text-sm text-emerald-600">{settingsMsg}</p>}
      </form>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Present / On Time" value={stats.present} tone="green" />
        <StatCard label="Late" value={stats.late} tone="yellow" />
        <StatCard label="Absent" value={stats.absent} tone="red" />
        <StatCard label="Attendance Rate" value={`${stats.rate}%`} tone="navy" />
      </div>

      <div className="card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <label className="label">Search Staff</label>
            <AdminSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by name or mobile..."
            />
          </div>
          <div className="sm:w-48">
            <label className="label">Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {loadError && <p className="mb-4 text-sm text-red-600">{loadError}</p>}

        {loading ? (
          <p className="py-10 text-center text-slate-500">Loading attendance...</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredStaff.map((e) => {
              const r = byEmployee.get(e.phone);
              const st = dayStatus(r, date);
              return (
                <button
                  key={e.phone}
                  type="button"
                  onClick={() => setSelectedEmployee(e)}
                  className="flex w-full items-center gap-4 py-4 text-left transition hover:bg-slate-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-muted text-sm font-bold text-brand">
                    {e.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-brand">{e.name}</p>
                    <p className="text-sm text-slate-500">{e.phone}</p>
                    {r?.signInTime && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        In {r.signInTime}
                        {r.signOutTime ? ` · Out ${r.signOutTime}` : ""}
                        {r.lateMinutes > 0 ? ` · ${formatLateDuration(r.lateMinutes)}` : ""}
                        {r.workingHours ? ` · ${formatWorkingHours(r.workingHours)} worked` : ""}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(st)}`}>
                    {statusLabel(String(st))}
                  </span>
                  <span className="hidden shrink-0 text-slate-400 sm:inline">→</span>
                </button>
              );
            })}
            {filteredStaff.length === 0 && (
              <p className="py-8 text-center text-slate-500">No staff found.</p>
            )}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-400">Tap any staff member to open their monthly calendar with photos & GPS locations</p>

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

function StatCard({ label, value, tone }: { label: string; value: string | number; tone: "green" | "yellow" | "red" | "navy" }) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    yellow: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    navy: "border-[var(--bliss-green)]/20 bg-[var(--bliss-green-surface)] text-brand",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
