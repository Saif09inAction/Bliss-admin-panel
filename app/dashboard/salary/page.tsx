"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { Attendance, AttendanceSettings, Employee, PaymentTransaction } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import AdminSearchWithDateFilter from "@/components/admin/AdminSearchWithDateFilter";
import PageToolbar from "@/components/admin/PageToolbar";
import { dateInRange, dateMatchesSearch } from "@/lib/csv";
import {
  parsePayment,
  salaryStatus,
  todayDateStr,
  nowTimeStr,
  type SalaryFilter,
} from "@/lib/salary-utils";
import {
  earnedAsOfDate,
  formatPayPeriodLabel,
  resolvePayPeriod,
  salaryPaidInPeriod,
} from "@/lib/pay-period-utils";
import { defaultSettings, parseAttendance, resolveShiftSettings } from "@/lib/attendance-utils";
import {
  computeEarnedSalary,
  parseCalendarOverride,
  type EarnedSalarySummary,
  type OverrideMap,
} from "@/lib/deduction-utils";

function newPaymentId() {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function StatusBadge({ status }: { status: ReturnType<typeof salaryStatus> }) {
  if (status === "PAID") return <span className="salary-status-paid">Paid</span>;
  if (status === "UNPAID") return <span className="salary-status-unpaid">Unpaid</span>;
  if (status === "PARTIAL") return <span className="salary-status-partial">Partial</span>;
  return null;
}

function WorkerAvatar({ name }: { name: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-jade-soft font-display text-xs font-bold text-jade-deep">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

type PayMode = "EARNED" | "FULL";

type SalaryRow = {
  employee: Employee;
  paid: number;
  earned: EarnedSalarySummary;
  earnedDue: number;
  fullDue: number;
  status: ReturnType<typeof salaryStatus>;
};

export default function SalaryPage() {
  const { session } = useAuth();
  const [periodOffset, setPeriodOffset] = useState(0);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings>(defaultSettings());
  const [overrides, setOverrides] = useState<OverrideMap>(new Map());
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filter, setFilter] = useState<SalaryFilter>("ALL");
  const [payTarget, setPayTarget] = useState<SalaryRow | null>(null);
  const [payMode, setPayMode] = useState<PayMode>("EARNED");
  const [payAmount, setPayAmount] = useState("");
  const [payRemarks, setPayRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getDb();
    let cancelled = false;

    async function loadStatic() {
      setLoading(true);
      try {
        const [empSnap, paySnap, attSnap, settingsSnap] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "payments")),
          getDocs(collection(db, "attendance")),
          getDocs(collection(db, "settings")),
        ]);
        if (cancelled) return;

        setStaff(
          empSnap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: (data.id as string) || d.id,
                name: data.name as string,
                phone: data.phone as string,
                joiningDate: (data.joiningDate as string) || "",
                monthlySalary: (data.monthlySalary as number) || 0,
                attendancePercentage: (data.attendancePercentage as number) || 0,
                role: ((data.role as string) || "STAFF") as Employee["role"],
                dailySignInTime: (data.dailySignInTime as string) || "",
                dailySignOutTime: (data.dailySignOutTime as string) || "",
              };
            })
            .filter((e) => e.role === "STAFF" || e.role === "SUPERVISOR")
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setPayments(paySnap.docs.map((d) => parsePayment(d.id, d.data())));
        setAttendance(attSnap.docs.map((d) => parseAttendance(d.id, d.data())));

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

    loadStatic();
    const unsubCal = onSnapshot(collection(db, "calendar_days"), (snap) => {
      const map: OverrideMap = new Map();
      snap.docs.forEach((d) => {
        const parsed = parseCalendarOverride(d.id, d.data() as Record<string, unknown>);
        if (parsed) map.set(parsed.date, parsed);
      });
      setOverrides(map);
    });

    return () => {
      cancelled = true;
      unsubCal();
    };
  }, []);

  const today = todayDateStr();

  function shiftPeriod(delta: number) {
    setPeriodOffset((prev) => prev + delta);
  }

  const periodNavLabel = useMemo(() => {
    if (periodOffset === 0) return "Current pay period";
    if (periodOffset === -1) return "Previous pay period";
    if (periodOffset === 1) return "Next pay period";
    return periodOffset < 0
      ? `${Math.abs(periodOffset)} periods ago`
      : `${periodOffset} periods ahead`;
  }, [periodOffset]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const statusRank: Record<string, number> = { UNPAID: 0, PARTIAL: 1, NONE: 2, PAID: 3 };
    return staff
      .map((e): SalaryRow => {
        const period = resolvePayPeriod(e.joiningDate, periodOffset, today);
        const asOfDate = earnedAsOfDate(period, today);
        const empPayments = payments.filter((p) => p.employeeId === e.phone);
        const paid = salaryPaidInPeriod(empPayments, period.start, period.end);
        const empAtt = attendance.filter((a) => a.employeeId === e.phone || a.employeeId === e.id);
        const earned = computeEarnedSalary({
          monthlySalary: e.monthlySalary,
          periodStart: period.start,
          periodEnd: period.end,
          asOfDate,
          records: empAtt,
          settings: settings,
          overrides,
          employeePhone: e.phone,
          employeeShift: e,
        });
        const earnedDue = Math.max(0, Math.round((earned.earnedNet - paid) * 100) / 100);
        const fullDue = Math.max(0, Math.round((earned.fullMonthNet - paid) * 100) / 100);
        // Status vs earned-till-now (what they should have received so far)
        const status = salaryStatus(earned.earnedNet, paid);
        return { employee: e, paid, earned, earnedDue, fullDue, status };
      })
      .filter(({ employee, status }) => {
        const period = resolvePayPeriod(employee.joiningDate, periodOffset, today);
        const periodLabel = formatPayPeriodLabel(period.start, period.end).toLowerCase();
        if (dateFrom || dateTo) {
          if (!dateInRange(employee.joiningDate, dateFrom, dateTo)) return false;
        }
        const matchSearch =
          !q ||
          employee.name.toLowerCase().includes(q) ||
          employee.phone.includes(q) ||
          periodLabel.includes(q) ||
          dateMatchesSearch(employee.joiningDate, q) ||
          dateMatchesSearch(period.start, q) ||
          dateMatchesSearch(period.end, q);
        const matchFilter =
          filter === "ALL" ||
          (filter === "PAID" && status === "PAID") ||
          (filter === "UNPAID" && status === "UNPAID") ||
          (filter === "PARTIAL" && status === "PARTIAL");
        return matchSearch && matchFilter;
      })
      .sort((a, b) => {
        const ra = statusRank[a.status] ?? 9;
        const rb = statusRank[b.status] ?? 9;
        if (ra !== rb) return ra - rb;
        return a.employee.name.localeCompare(b.employee.name);
      });
  }, [staff, payments, attendance, periodOffset, search, filter, today, settings, overrides, dateFrom, dateTo]);

  const summary = useMemo(() => {
    let totalDue = 0;
    let totalPaid = 0;
    let unpaidCount = 0;
    for (const e of staff) {
      const period = resolvePayPeriod(e.joiningDate, periodOffset, today);
      const asOfDate = earnedAsOfDate(period, today);
      const paid = salaryPaidInPeriod(
        payments.filter((p) => p.employeeId === e.phone),
        period.start,
        period.end
      );
      const empAtt = attendance.filter((a) => a.employeeId === e.phone || a.employeeId === e.id);
      const earned = computeEarnedSalary({
        monthlySalary: e.monthlySalary,
        periodStart: period.start,
        periodEnd: period.end,
        asOfDate,
        records: empAtt,
        settings,
        overrides,
        employeePhone: e.phone,
        employeeShift: e,
      });
      totalPaid += paid;
      totalDue += Math.max(0, earned.earnedNet - paid);
      if (salaryStatus(earned.earnedNet, paid) !== "PAID" && e.monthlySalary > 0) unpaidCount++;
    }
    return { totalDue, totalPaid, unpaidCount };
  }, [staff, payments, attendance, periodOffset, today, settings, overrides]);

  // Sync computed remaining salary to Firestore so mobile app can read it directly
  useEffect(() => {
    if (periodOffset !== 0) return; // Only sync current period
    rows.forEach((r) => {
      if (r.employee.phone && r.employee.salaryRemaining !== r.earnedDue) {
        updateDoc(doc(getDb(), "employees", r.employee.phone), {
          salaryRemaining: r.earnedDue
        }).catch(() => {});
      }
    });
  }, [rows, periodOffset]);

  function openPay(row: SalaryRow, mode: PayMode = "EARNED") {
    setPayTarget(row);
    setPayMode(mode);
    setPayAmount(String(mode === "EARNED" ? row.earnedDue : row.fullDue));
    setPayRemarks("");
    setMsg("");
  }

  function switchPayMode(mode: PayMode) {
    if (!payTarget) return;
    setPayMode(mode);
    setPayAmount(String(mode === "EARNED" ? payTarget.earnedDue : payTarget.fullDue));
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      setMsg("Enter a valid amount.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const modeLabel = payMode === "EARNED" ? "earned till now" : "full period";
      const period = resolvePayPeriod(payTarget.employee.joiningDate, periodOffset, today);
      const payment: PaymentTransaction = {
        id: newPaymentId(),
        employeeId: payTarget.employee.phone,
        amount,
        type: "SALARY_PAYMENT",
        date: todayDateStr(),
        time: nowTimeStr(),
        remarks:
          payRemarks.trim() ||
          `${formatPayPeriodLabel(period.start, period.end)} · ${modeLabel}`,
        createdBy: session?.name || "Admin",
      };
      await setDoc(doc(getDb(), "payments", payment.id), {
        ...payment,
        remarks: payment.remarks || "",
      });
      setPayTarget(null);
      setMsg(`Salary of ${money(amount)} recorded for ${payTarget.employee.name}.`);
      // Refresh payments
      const paySnap = await getDocs(collection(getDb(), "payments"));
      setPayments(paySnap.docs.map((d) => parsePayment(d.id, d.data())));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageToolbar title="Salary">
        <p className="section-sub">
          Join-date pay periods · late hours deducted · {summary.unpaidCount} pending
        </p>
      </PageToolbar>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-jade-soft">
              <CheckCircle2 size={16} className="text-jade-deep" />
            </div>
            <p className="stat-card-label !mt-0">Paid This Period</p>
          </div>
          <p className="stat-card-value mt-2">{money(summary.totalPaid)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(232,168,56,0.15)]">
              <Clock size={16} className="text-warning" />
            </div>
            <p className="stat-card-label !mt-0">Earned Due</p>
          </div>
          <p className="stat-card-value mt-2">{money(summary.totalDue)}</p>
        </div>
        <div className="stat-card sm:col-span-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(232,93,76,0.1)]">
              <AlertCircle size={16} className="text-danger" />
            </div>
            <p className="stat-card-label !mt-0">Unpaid Staff</p>
          </div>
          <p className="stat-card-value mt-2">{summary.unpaidCount}</p>
        </div>
      </div>

      <div className="surface space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            className="btn-icon"
            onClick={() => shiftPeriod(-1)}
            aria-label="Previous pay period"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-2 text-center">
            <CalendarDays size={18} className="text-jade-deep" />
            <h2 className="font-display text-lg font-bold">{periodNavLabel}</h2>
            <p className="text-xs text-[var(--text-muted)]">From each staff join date</p>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={() => shiftPeriod(1)}
            aria-label="Next pay period"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <AdminSearchWithDateFilter
          search={search}
          onSearchChange={setSearch}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          placeholder="Search staff, pay period, join date (dd/mm/yy)…"
        />

        <div className="mobile-chip-scroll flex flex-wrap gap-2">
          {(["ALL", "UNPAID", "PARTIAL", "PAID"] as SalaryFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`filter-pill ${filter === f ? "active" : ""}`}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
            msg.includes("recorded")
              ? "bg-jade-soft text-jade-deep"
              : "bg-red-50 text-danger"
          }`}
        >
          {msg.includes("recorded") ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {msg}
        </div>
      )}

      {loading ? (
        <div className="surface py-14 text-center text-sm text-[var(--text-muted)]">Loading salary…</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Monthly</th>
                  <th>₹ / hr</th>
                  <th>Worked</th>
                  <th>Late cut</th>
                  <th>Earned</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const { employee, paid, earned, earnedDue, status } = row;
                  return (
                    <tr key={employee.phone}>
                      <td>
                        <div className="flex items-center gap-3">
                          <WorkerAvatar name={employee.name} />
                          <div>
                            <p className="font-semibold capitalize">{employee.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {employee.phone}
                              {employee.joiningDate ? ` · joined ${employee.joiningDate}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="font-medium">{money(employee.monthlySalary)}</td>
                      <td className="text-sm text-[var(--text-muted)]">{money(earned.perHourRate)}</td>
                      <td className="text-sm">
                        {earned.daysWorked}d
                        <span className="text-[var(--text-faint)]"> / {earned.daysInPeriod} days</span>
                      </td>
                      <td className="font-medium text-danger">
                        {earned.totalDeduction > 0 ? `−${money(earned.totalDeduction)}` : "—"}
                      </td>
                      <td className="font-medium text-jade-deep">{money(earned.earnedNet)}</td>
                      <td className="font-medium">{money(paid)}</td>
                      <td className="font-medium text-warning">{money(earnedDue)}</td>
                      <td>
                        <StatusBadge status={status} />
                      </td>
                      <td className="text-right">
                        {employee.monthlySalary > 0 && (earnedDue > 0 || row.fullDue > 0) ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => openPay(row, "EARNED")}
                          >
                            <Banknote size={14} />
                            Pay {money(earnedDue)}
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--text-faint)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="py-12 text-center text-sm text-[var(--text-muted)]">
                No staff match your filters.
              </p>
            )}
          </div>

          {/* Mobile */}
          <div className="space-y-3 lg:hidden">
            <p className="mobile-section-label">Earned till now · late deducted</p>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
              {rows.map((row, idx) => {
                const { employee, paid, earned, earnedDue, status } = row;
                return (
                  <div
                    key={employee.phone}
                    className={`p-3.5 ${idx < rows.length - 1 ? "border-b border-[var(--border)]" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <WorkerAvatar name={employee.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold capitalize">{employee.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {earned.daysWorked}d worked · {money(earned.perDayRate)}/day · {money(earned.perHourRate)}/hr
                              {earned.totalDeduction > 0
                                ? ` · late −${money(earned.totalDeduction)}`
                                : ""}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                              Earned {money(earned.earnedNet)} · Paid {money(paid)} · Due{" "}
                              <span className="font-semibold text-warning">{money(earnedDue)}</span>
                            </p>
                          </div>
                          <StatusBadge status={status} />
                        </div>
                        {employee.monthlySalary > 0 && (earnedDue > 0 || row.fullDue > 0) && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm mt-2.5 w-full"
                            onClick={() => openPay(row, "EARNED")}
                          >
                            <Banknote size={14} />
                            Pay earned {money(earnedDue)}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {rows.length === 0 && (
                <p className="py-12 text-center text-sm text-[var(--text-muted)]">
                  No staff match your filters.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {payTarget && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setPayTarget(null)}
            aria-hidden
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <form
              onSubmit={submitPayment}
              className="surface !overflow-y-auto max-h-[90vh] w-full max-w-md space-y-5 p-5 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-bold">Pay Salary</h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {payTarget.employee.name} ·{" "}
                    {formatPayPeriodLabel(payTarget.earned.periodStart, payTarget.earned.periodEnd)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-icon !h-9 !w-9 shrink-0"
                  onClick={() => setPayTarget(null)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="rounded-xl bg-[var(--surface-mist)] p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Monthly salary</span>
                  <span className="font-semibold">{money(payTarget.employee.monthlySalary)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Per day (period ÷ days)</span>
                  <span className="font-semibold">{money(payTarget.earned.perDayRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Per hour</span>
                  <span className="font-semibold">{money(payTarget.earned.perHourRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Days worked</span>
                  <span className="font-semibold">
                    {payTarget.earned.daysWorked} worked / {payTarget.earned.daysInPeriod} days in period
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Late / early cut</span>
                  <span className="font-semibold text-danger">
                    {payTarget.earned.totalDeduction > 0
                      ? `−${money(payTarget.earned.totalDeduction)}`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[var(--border)] pt-1.5">
                  <span className="text-[var(--text-muted)]">Earned till now</span>
                  <span className="font-bold text-jade-deep">
                    {money(payTarget.earned.earnedNet)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Already paid</span>
                  <span className="font-semibold">{money(payTarget.paid)}</span>
                </div>
              </div>

              <div>
                <p className="label mb-2">Pay option</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => switchPayMode("EARNED")}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      payMode === "EARNED"
                        ? "border-jade bg-jade-soft text-jade-deep"
                        : "border-[var(--border)] bg-white"
                    }`}
                  >
                    <p className="font-bold">Earned till now</p>
                    <p className="mt-0.5 text-xs opacity-80">{money(payTarget.earnedDue)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchPayMode("FULL")}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      payMode === "FULL"
                        ? "border-jade bg-jade-soft text-jade-deep"
                        : "border-[var(--border)] bg-white"
                    }`}
                  >
                    <p className="font-bold">Full month</p>
                    <p className="mt-0.5 text-xs opacity-80">
                      {money(payTarget.fullDue)}
                      <span className="opacity-70"> (after late)</span>
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Amount (₹)</label>
                <input
                  className="input"
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                  min={1}
                  step="1"
                />
              </div>
              <div>
                <label className="label">Remarks (optional)</label>
                <input
                  className="input"
                  value={payRemarks}
                  onChange={(e) => setPayRemarks(e.target.value)}
                  placeholder="Optional note"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => setPayTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
                  {saving ? "Saving..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
