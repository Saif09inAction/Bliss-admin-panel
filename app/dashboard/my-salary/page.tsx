"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Attendance, AttendanceSettings, PaymentTransaction } from "@/lib/types";
import { useAuth, isSupervisorSession } from "@/lib/auth-context";
import PageToolbar from "@/components/admin/PageToolbar";
import { parsePayment, salaryStatus, todayDateStr } from "@/lib/salary-utils";
import { defaultSettings, parseAttendance, resolveShiftSettings } from "@/lib/attendance-utils";
import {
  computeEarnedSalary,
  parseCalendarOverride,
  type OverrideMap,
} from "@/lib/deduction-utils";
import {
  earnedAsOfDate,
  formatPayPeriodLabel,
  paymentsInPeriod,
  resolvePayPeriod,
  salaryPaidInPeriod,
} from "@/lib/pay-period-utils";

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export default function MySalaryPage() {
  const { session } = useAuth();
  const [periodOffset, setPeriodOffset] = useState(0);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings>(defaultSettings());
  const [overrides, setOverrides] = useState<OverrideMap>(new Map());
  const [loading, setLoading] = useState(true);

  const phone = session?.phone ?? "";
  const today = todayDateStr();
  const joinDate =
    session && isSupervisorSession(session) ? session.joiningDate : "";
  const period = useMemo(
    () => resolvePayPeriod(joinDate, periodOffset, today),
    [joinDate, periodOffset, today]
  );
  const asOfDate = useMemo(() => earnedAsOfDate(period, today), [period, today]);

  useEffect(() => {
    if (!phone) return;
    const db = getDb();
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [paySnap, attSnap, settingsSnap] = await Promise.all([
          getDocs(collection(db, "payments")),
          getDocs(collection(db, "attendance")),
          getDocs(collection(db, "settings")),
        ]);
        if (cancelled) return;
        setPayments(
          paySnap.docs
            .map((d) => parsePayment(d.id, d.data()))
            .filter((p) => p.employeeId === phone)
        );
        setAttendance(
          attSnap.docs
            .map((d) => parseAttendance(d.id, d.data()))
            .filter((a) => a.employeeId === phone)
        );
        const attSettings = settingsSnap.docs.find((d) => d.id === "attendance");
        if (attSettings) {
          const data = attSettings.data();
          setSettings({
            dailySignInTime: (data.dailySignInTime as string) || "09:00",
            dailySignOutTime: (data.dailySignOutTime as string) || "18:00",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const unsubCal = onSnapshot(collection(db, "calendar_days"), (snap) => {
      const map: OverrideMap = new Map();
      snap.docs.forEach((d) => {
        const parsed = parseCalendarOverride(d.id, d.data() as Record<string, unknown>);
        if (parsed) map.set(d.id, parsed);
      });
      setOverrides(map);
    });
    return () => {
      cancelled = true;
      unsubCal();
    };
  }, [phone]);

  const earned = useMemo(() => {
    if (!session || !isSupervisorSession(session)) return null;
    return computeEarnedSalary({
      monthlySalary: session.monthlySalary,
      periodStart: period.start,
      periodEnd: period.end,
      asOfDate,
      records: attendance,
      settings,
      overrides,
      employeePhone: phone,
      employeeShift: {
        dailySignInTime: session.dailySignInTime,
        dailySignOutTime: session.dailySignOutTime,
      },
    });
  }, [session, phone, period, attendance, settings, overrides, asOfDate]);

  const paid = salaryPaidInPeriod(payments, period.start, period.end);
  const monthlySalary =
    session && isSupervisorSession(session) ? session.monthlySalary : 0;
  const status = salaryStatus(earned?.earnedNet ?? monthlySalary, paid);
  const periodPayments = paymentsInPeriod(payments, period.start, period.end);

  if (!session || !isSupervisorSession(session)) {
    return <p className="text-sm text-[var(--text-muted)]">Supervisor login required.</p>;
  }

  return (
    <div className="space-y-5">
      <PageToolbar title="My salary" />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setPeriodOffset((p) => p - 1)}
          disabled={periodOffset <= -100}
        >
          Previous
        </button>
        <div className="text-center">
          <p className="font-display text-lg font-bold">
            {formatPayPeriodLabel(period.start, period.end)}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {periodOffset === 0 ? "Current pay period" : "Past pay period"} · {period.daysInPeriod} days
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPeriodOffset((p) => p + 1)}>
          Next
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface p-4">
              <p className="text-xs text-[var(--text-muted)]">Monthly salary</p>
              <p className="mt-1 text-xl font-bold">{money(session.monthlySalary)}</p>
            </div>
            <div className="surface p-4">
              <p className="text-xs text-[var(--text-muted)]">Earned (after deductions)</p>
              <p className="mt-1 text-xl font-bold">{money(earned?.earnedNet ?? 0)}</p>
            </div>
            <div className="surface p-4">
              <p className="text-xs text-[var(--text-muted)]">Paid this period</p>
              <p className="mt-1 text-xl font-bold">{money(paid)}</p>
            </div>
            <div className="surface p-4">
              <p className="text-xs text-[var(--text-muted)]">Status</p>
              <p className="mt-1 text-xl font-bold capitalize">{status}</p>
            </div>
          </div>

          {earned && (
            <div className="surface space-y-2 p-4 text-sm">
              <p>
                Late / early deduction: <strong>{money(earned.totalDeduction)}</strong>
              </p>
              <p>
                Days worked: <strong>{earned.daysWorked}</strong> / {earned.daysInPeriod} in period
              </p>
              <p className="text-[var(--text-muted)]">
                Due till today: {money(Math.max(0, earned.earnedNet - paid))} · Full period net:{" "}
                {money(earned.fullMonthNet)}
              </p>
            </div>
          )}

          <div className="surface overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {periodPayments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-[var(--text-muted)]">
                      No payments this period.
                    </td>
                  </tr>
                ) : (
                  periodPayments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.date}</td>
                      <td>{p.type.replace(/_/g, " ")}</td>
                      <td>{money(p.amount)}</td>
                      <td className="text-[var(--text-muted)]">{p.remarks || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
