"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  Banknote,
  Calendar,
  ChevronRight,
  Clock,
  Loader2,
  Phone,
  User,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { Attendance, AttendanceSettings, Employee, PaymentTransaction } from "@/lib/types";
import {
  computeMonthAttendanceStats,
  defaultSettings,
  monthDateRange,
  monthLabel,
  normalizeTime,
  parseAttendance,
} from "@/lib/attendance-utils";
import {
  computeEarnedSalary,
  formatDurationMinutes,
  parseCalendarOverride,
  type OverrideMap,
} from "@/lib/deduction-utils";
import {
  currentMonthParts,
  monthKey,
  parsePayment,
  salaryPaidInMonth,
  salaryStatus,
  todayDateStr,
} from "@/lib/salary-utils";
import EmployeeAttendancePanel from "@/components/EmployeeAttendancePanel";

interface Props {
  employee: Employee;
  settings?: AttendanceSettings;
  onClose: () => void;
  onPaySalary?: (employee: Employee) => void;
}

export default function WorkerProfilePanel({
  employee,
  settings: settingsProp,
  onClose,
  onPaySalary,
}: Props) {
  const { year, month } = currentMonthParts();
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [overrides, setOverrides] = useState<OverrideMap>(new Map());
  const [settings, setSettings] = useState<AttendanceSettings>(
    settingsProp || defaultSettings()
  );
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);

  const monthPrefix = monthKey(year, month);
  const { start, end } = monthDateRange(year, month);

  useEffect(() => {
    if (settingsProp) setSettings(settingsProp);
  }, [settingsProp]);

  useEffect(() => {
    if (employee.role === "KAARIGER") {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function loadSettings() {
      if (settingsProp) return;
      const snap = await getDoc(doc(getDb(), "settings", "attendance"));
      if (!cancelled && snap.exists()) {
        const data = snap.data();
        setSettings({
          dailySignInTime: normalizeTime(data.dailySignInTime as string),
          dailySignOutTime: normalizeTime(data.dailySignOutTime as string),
        });
      }
    }

    loadSettings();

    const unsubCal = onSnapshot(collection(getDb(), "calendar_days"), (snap) => {
      const map: OverrideMap = new Map();
      snap.docs.forEach((d) => {
        const parsed = parseCalendarOverride(d.id, d.data() as Record<string, unknown>);
        if (parsed) map.set(parsed.date, parsed);
      });
      if (!cancelled) setOverrides(map);
    });

    async function loadAttPay() {
      try {
        const [attSnap, paySnap] = await Promise.all([
          getDocs(
            query(
              collection(getDb(), "attendance"),
              where("employeeId", "==", employee.phone),
              where("date", ">=", start),
              where("date", "<=", end)
            )
          ).catch(() =>
            getDocs(
              query(collection(getDb(), "attendance"), where("employeeId", "==", employee.phone))
            )
          ),
          getDocs(
            query(collection(getDb(), "payments"), where("employeeId", "==", employee.phone))
          ),
        ]);
        if (cancelled) return;
        const attAll = attSnap.docs.map((d) => parseAttendance(d.id, d.data()));
        setAttendanceRecords(attAll.filter((r) => r.date >= start && r.date <= end));
        setPayments(paySnap.docs.map((d) => parsePayment(d.id, d.data())));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAttPay();

    return () => {
      cancelled = true;
      unsubCal();
    };
  }, [employee.phone, employee.role, start, end, settingsProp]);

  const monthStats = useMemo(
    () => computeMonthAttendanceStats(attendanceRecords, year, month),
    [attendanceRecords, year, month]
  );

  const earned = useMemo(() => {
    const monthEnd = monthDateRange(year, month).end;
    const today = todayDateStr();
    const asOf = today < `${monthPrefix}-01` ? `${monthPrefix}-00` : today < monthEnd ? today : monthEnd;
    return computeEarnedSalary({
      monthlySalary: employee.monthlySalary,
      year,
      month,
      joiningDate: employee.joiningDate,
      asOfDate: asOf,
      records: attendanceRecords,
      settings,
      overrides,
      employeePhone: employee.phone,
    });
  }, [
    employee.monthlySalary,
    employee.joiningDate,
    employee.phone,
    year,
    month,
    monthPrefix,
    attendanceRecords,
    settings,
    overrides,
  ]);

  const paidThisMonth = useMemo(
    () => salaryPaidInMonth(payments, monthPrefix),
    [payments, monthPrefix]
  );
  const netSalary = earned.earnedNet;
  const payStatus = salaryStatus(netSalary, paidThisMonth);
  const salaryRemaining = Math.max(0, netSalary - paidThisMonth);

  const recentPayments = useMemo(
    () =>
      [...payments]
        .filter((p) => p.date.startsWith(monthPrefix))
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
        .slice(0, 5),
    [payments, monthPrefix]
  );

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="panel-slide overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-[var(--border)] bg-gradient-to-br from-ink-elevated to-ink px-5 py-5 text-white">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-jade/20 font-display text-xl font-bold text-jade-glow">
              {employee.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-bold capitalize">{employee.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/60">
                    <Phone size={13} />
                    {employee.phone}
                  </p>
                  <span
                    className={`mt-2 inline-block badge ${
                      employee.role === "KAARIGER" ? "badge-gold" : "badge-success"
                    }`}
                  >
                    {employee.role === "KAARIGER" ? "Kaariger" : "Staff"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-icon !border-white/20 !bg-white/10 !text-white hover:!border-jade hover:!bg-jade/20"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--text-muted)]">
              <Loader2 size={24} className="animate-spin text-jade" />
              <p className="text-sm">Loading profile...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <section>
                <h3 className="section-title flex items-center gap-2 text-base">
                  <User size={16} className="text-jade-deep" />
                  Basic Info
                </h3>
                <div className="mt-3 space-y-0 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface-mist)]/40">
                  {employee.role === "STAFF" && (
                    <>
                      <InfoRow label="Joining Date" value={employee.joiningDate || "—"} />
                      <InfoRow
                        label="Monthly Salary"
                        value={`₹${employee.monthlySalary.toLocaleString("en-IN")}`}
                      />
                    </>
                  )}
                  {employee.role === "KAARIGER" && (
                    <InfoRow label="Role" value="Kaariger (piece-work)" />
                  )}
                </div>
              </section>

              {employee.role === "STAFF" && (
                <section>
                  <h3 className="section-title flex items-center gap-2 text-base">
                    <Banknote size={16} className="text-jade-deep" />
                    Salary — {monthLabel(year, month)}
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <StatTile
                      label="Monthly"
                      value={`₹${employee.monthlySalary.toLocaleString("en-IN")}`}
                    />
                    <StatTile
                      label="Late cut"
                      value={`₹${Math.round(earned.totalDeduction).toLocaleString("en-IN")}`}
                      accent="danger"
                    />
                    <StatTile
                      label="Earned till now"
                      value={`₹${Math.round(netSalary).toLocaleString("en-IN")}`}
                      accent="jade"
                    />
                    <StatTile
                      label="Paid"
                      value={`₹${paidThisMonth.toLocaleString("en-IN")}`}
                    />
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {earned.daysWorked} days worked · {earned.calendarDaysInMonth} days/mo · ₹
                    {Math.round(earned.perHourRate).toLocaleString("en-IN")}/hr · from join date
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <StatTile
                      label="Remaining"
                      value={`₹${Math.round(salaryRemaining).toLocaleString("en-IN")}`}
                      accent="warn"
                    />
                    <StatTile
                      label="Status"
                      value={
                        payStatus === "PAID" ? (
                          <span className="salary-status-paid">Paid</span>
                        ) : payStatus === "UNPAID" ? (
                          <span className="salary-status-unpaid">Unpaid</span>
                        ) : payStatus === "PARTIAL" ? (
                          <span className="salary-status-partial">Partial</span>
                        ) : (
                          "—"
                        )
                      }
                    />
                  </div>
                  {onPaySalary && payStatus !== "PAID" && netSalary > 0 && (
                    <button
                      type="button"
                      className="btn btn-primary mt-3 w-full"
                      onClick={() => onPaySalary(employee)}
                    >
                      <Banknote size={15} />
                      Pay Salary (₹{Math.round(salaryRemaining).toLocaleString("en-IN")})
                    </button>
                  )}
                  {recentPayments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        This month&apos;s payments
                      </p>
                      {recentPayments.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm"
                        >
                          <span className="font-semibold text-jade-deep">
                            ₹{p.amount.toLocaleString("en-IN")}
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">
                            {p.date} · {p.type.replace(/_/g, " ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {employee.role === "STAFF" && (
                <section>
                  <h3 className="section-title flex items-center gap-2 text-base">
                    <Clock size={16} className="text-jade-deep" />
                    Time away &amp; deductions
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Late / early leave cut from days worked · holidays &amp; Sundays excluded ·{" "}
                    {earned.calendarDaysInMonth} days in month · rates use admin shift hours
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatTile
                      label="Late"
                      value={formatDurationMinutes(earned.totalLateMinutes)}
                      accent="warn"
                    />
                    <StatTile
                      label="Left early"
                      value={formatDurationMinutes(earned.totalEarlyMinutes)}
                      accent="warn"
                    />
                    <StatTile
                      label="Not in shop"
                      value={formatDurationMinutes(earned.totalLostMinutes)}
                      accent="danger"
                    />
                    <StatTile
                      label="Money cut"
                      value={`₹${Math.round(earned.totalDeduction).toLocaleString("en-IN")}`}
                      accent="danger"
                    />
                  </div>

                  {earned.days.some((d) => d.deduction > 0) ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Day-wise cuts
                      </p>
                      {earned.days
                        .filter((d) => d.deduction > 0)
                        .slice(0, 8)
                        .map((d) => (
                          <div
                            key={d.date}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold">{d.date}</p>
                              <p className="truncate text-xs text-[var(--text-muted)]">
                                {d.lateMinutes > 0
                                  ? `${formatDurationMinutes(d.lateMinutes)} late`
                                  : ""}
                                {d.lateMinutes > 0 && d.earlyMinutes > 0 ? " · " : ""}
                                {d.earlyMinutes > 0
                                  ? `${formatDurationMinutes(d.earlyMinutes)} early`
                                  : ""}
                              </p>
                            </div>
                            <span className="shrink-0 font-bold text-danger">
                              −₹{Math.round(d.deduction).toLocaleString("en-IN")}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl border border-jade/20 bg-jade-soft/50 px-3 py-2 text-sm text-jade-deep">
                      No late / early deductions this month.
                    </p>
                  )}
                </section>
              )}

              {employee.role === "STAFF" && (
                <section>
                  <div className="flex items-center justify-between">
                    <h3 className="section-title flex items-center gap-2 text-base">
                      <Calendar size={16} className="text-jade-deep" />
                      Attendance — {monthLabel(year, month)}
                    </h3>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm !px-2"
                      onClick={() => setShowCalendar(true)}
                    >
                      Calendar
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <StatTile label="Present" value={String(monthStats.present)} accent="jade" />
                    <StatTile label="Late" value={String(monthStats.late)} accent="warn" />
                    <StatTile label="Absent" value={String(monthStats.absent)} accent="danger" />
                    <StatTile label="Rate" value={`${monthStats.rate}%`} />
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {showCalendar && employee.role === "STAFF" && (
        <EmployeeAttendancePanel
          employee={employee}
          settings={settings}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: "jade" | "warn" | "danger";
}) {
  const bg =
    accent === "jade"
      ? "bg-jade-soft"
      : accent === "warn"
        ? "bg-[rgba(232,168,56,0.12)]"
        : accent === "danger"
          ? "bg-[rgba(232,93,76,0.1)]"
          : "bg-[var(--surface-mist)]";

  return (
    <div className={`rounded-xl ${bg} px-3 py-3 text-center`}>
      <p className="font-display text-lg font-bold">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
    </div>
  );
}
