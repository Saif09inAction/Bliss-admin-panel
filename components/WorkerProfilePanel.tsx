"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Employee, PaymentTransaction } from "@/lib/types";
import {
  computeMonthAttendanceStats,
  monthDateRange,
  monthLabel,
  parseAttendance,
} from "@/lib/attendance-utils";
import {
  currentMonthParts,
  monthKey,
  parsePayment,
  salaryPaidInMonth,
  salaryStatus,
} from "@/lib/salary-utils";
import EmployeeAttendancePanel from "@/components/EmployeeAttendancePanel";
import { defaultSettings } from "@/lib/attendance-utils";
import type { AttendanceSettings } from "@/lib/types";

interface Props {
  employee: Employee;
  settings?: AttendanceSettings;
  onClose: () => void;
  onPaySalary?: (employee: Employee) => void;
}

export default function WorkerProfilePanel({
  employee,
  settings = defaultSettings(),
  onClose,
  onPaySalary,
}: Props) {
  const { year, month } = currentMonthParts();
  const [attendanceRecords, setAttendanceRecords] = useState<
    { date: string; status?: string; signInTime?: string }[]
  >([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);

  const monthPrefix = monthKey(year, month);
  const { start, end } = monthDateRange(year, month);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
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
    load();
    return () => {
      cancelled = true;
    };
  }, [employee.phone, start, end]);

  const monthStats = useMemo(
    () => computeMonthAttendanceStats(attendanceRecords, year, month),
    [attendanceRecords, year, month]
  );

  const paidThisMonth = useMemo(
    () => salaryPaidInMonth(payments, monthPrefix),
    [payments, monthPrefix]
  );
  const payStatus = salaryStatus(employee.monthlySalary, paidThisMonth);
  const salaryRemaining = Math.max(0, employee.monthlySalary - paidThisMonth);

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
      <div className="fixed inset-0 z-50 flex flex-col bg-black/50" onClick={onClose}>
        <div
          className="panel-slide mt-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:mx-auto sm:my-auto sm:max-h-[88dvh] sm:max-w-lg sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="hero-gradient shrink-0 px-5 py-5 text-white">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-black">
                {employee.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-bold capitalize">{employee.name}</h2>
                    <p className="text-sm text-white/80">{employee.phone}</p>
                    <span className="mt-1 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase">
                      {employee.role === "KAARIGER" ? "Kaariger" : "Staff"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="attendance-panel-body p-5">
            {loading ? (
              <p className="py-10 text-center text-slate-500">Loading profile...</p>
            ) : (
              <div className="space-y-5">
                <section>
                  <h3 className="section-title">Basic Info</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    <InfoRow label="Joining Date" value={employee.joiningDate || "—"} />
                    {employee.role === "STAFF" && (
                      <InfoRow
                        label="Monthly Salary"
                        value={`₹${employee.monthlySalary.toLocaleString("en-IN")}`}
                      />
                    )}
                  </div>
                </section>

                {employee.role === "STAFF" && (
                  <section>
                    <h3 className="section-title">Salary — {monthLabel(year, month)}</h3>
                    <div className="profile-stat-grid mt-3">
                      <div className="profile-stat">
                        <p className="profile-stat-value">₹{employee.monthlySalary.toLocaleString("en-IN")}</p>
                        <p className="profile-stat-label">Monthly</p>
                      </div>
                      <div className="profile-stat">
                        <p className="profile-stat-value">₹{paidThisMonth.toLocaleString("en-IN")}</p>
                        <p className="profile-stat-label">Paid</p>
                      </div>
                      <div className="profile-stat">
                        <p className="profile-stat-value">₹{salaryRemaining.toLocaleString("en-IN")}</p>
                        <p className="profile-stat-label">Remaining</p>
                      </div>
                      <div className="profile-stat">
                        <p className="profile-stat-value">
                          {payStatus === "PAID" ? (
                            <span className="salary-status-paid">Paid</span>
                          ) : payStatus === "UNPAID" ? (
                            <span className="salary-status-unpaid">Unpaid</span>
                          ) : payStatus === "PARTIAL" ? (
                            <span className="salary-status-partial">Partial</span>
                          ) : (
                            "—"
                          )}
                        </p>
                        <p className="profile-stat-label">Status</p>
                      </div>
                    </div>
                    {onPaySalary && payStatus !== "PAID" && employee.monthlySalary > 0 && (
                      <button
                        type="button"
                        className="btn-primary mt-3 w-full"
                        onClick={() => onPaySalary(employee)}
                      >
                        Pay Salary (₹{salaryRemaining.toLocaleString("en-IN")})
                      </button>
                    )}
                    {recentPayments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          This month&apos;s payments
                        </p>
                        {recentPayments.map((p) => (
                          <div key={p.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                            <span className="font-semibold">₹{p.amount.toLocaleString("en-IN")}</span>
                            <span className="text-slate-500">
                              {p.date} · {p.type.replace(/_/g, " ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                <section>
                  <div className="flex items-center justify-between">
                    <h3 className="section-title">Attendance — {monthLabel(year, month)}</h3>
                    <button
                      type="button"
                      className="text-xs font-bold text-[var(--bliss-green)]"
                      onClick={() => setShowCalendar(true)}
                    >
                      Open Calendar →
                    </button>
                  </div>
                  <div className="profile-stat-grid mt-3">
                    <div className="profile-stat">
                      <p className="profile-stat-value">{monthStats.present}</p>
                      <p className="profile-stat-label">Present</p>
                    </div>
                    <div className="profile-stat">
                      <p className="profile-stat-value">{monthStats.late}</p>
                      <p className="profile-stat-label">Late</p>
                    </div>
                    <div className="profile-stat">
                      <p className="profile-stat-value">{monthStats.absent}</p>
                      <p className="profile-stat-label">Absent</p>
                    </div>
                    <div className="profile-stat">
                      <p className="profile-stat-value">{monthStats.rate}%</p>
                      <p className="profile-stat-label">Rate</p>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCalendar && (
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
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-brand">{value}</span>
    </div>
  );
}
