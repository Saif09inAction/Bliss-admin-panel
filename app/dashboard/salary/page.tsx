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
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { Attendance, AttendanceSettings, Employee, PaymentTransaction } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import AdminSearchWithDateFilter from "@/components/admin/AdminSearchWithDateFilter";
import PageToolbar from "@/components/admin/PageToolbar";
import { dateInRange, dateMatchesSearch, formatDisplayDate, formatDisplayTime } from "@/lib/csv";
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
  formatPayPeriodMonthLabel,
  resolvePayPeriod,
  salaryPaidInPeriod,
} from "@/lib/pay-period-utils";
import { deleteSalaryPayment, updateSalaryPaymentAmount } from "@/lib/payment-delete";
import {
  setManualSalaryRemaining,
  syncEmployeeSalaryRemaining,
} from "@/lib/salary-sync";
import { defaultSettings, parseAttendance } from "@/lib/attendance-utils";
import { parseAttendanceSettingsDoc, parseShiftHistory } from "@/lib/shift-schedule";
import {
  computeEarnedSalary,
  parseCalendarOverride,
  type EarnedSalarySummary,
  type OverrideMap,
} from "@/lib/deduction-utils";
import { buildSalaryStaffDetail, computeCarryForwardUnpaid } from "@/lib/salary-detail";
import SalaryStaffDetailPanel from "@/components/SalaryStaffDetailPanel";

function newPaymentId() {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function money(n: number) {
  const rounded = Math.round(n);
  const abs = Math.abs(rounded).toLocaleString("en-IN");
  if (rounded < 0) return `−₹${abs}`;
  return `₹${abs}`;
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
  carryForward: number;
  periodDue: number;
  calculatedDue: number;
  earnedDue: number;
  fullDue: number;
  isManualDue: boolean;
  status: ReturnType<typeof salaryStatus>;
};

function resolveDisplayDue(
  employee: Employee,
  calculatedDue: number,
  periodOffset: number
): number {
  if (
    periodOffset === 0 &&
    employee.salaryDueManual &&
    employee.salaryRemaining != null &&
    Number.isFinite(employee.salaryRemaining)
  ) {
    return Math.max(0, Math.round(employee.salaryRemaining * 100) / 100);
  }
  return calculatedDue;
}

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
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editDueTarget, setEditDueTarget] = useState<SalaryRow | null>(null);
  const [editDueAmount, setEditDueAmount] = useState("");
  const [editPaymentTarget, setEditPaymentTarget] = useState<PaymentTransaction | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [detailTarget, setDetailTarget] = useState<SalaryRow | null>(null);

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
                shiftHistory: parseShiftHistory(data.shiftHistory),
                salaryRemaining: (data.salaryRemaining as number) ?? undefined,
                salaryDueManual: Boolean(data.salaryDueManual),
              };
            })
            .filter((e) => e.role === "STAFF" || e.role === "SUPERVISOR")
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setPayments(paySnap.docs.map((d) => parsePayment(d.id, d.data())));
        setAttendance(attSnap.docs.map((d) => parseAttendance(d.id, d.data())));

        const attSettings = settingsSnap.docs.find((d) => d.id === "attendance");
        if (attSettings) {
          setSettings(parseAttendanceSettingsDoc(attSettings.data() as Record<string, unknown>));
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
    const ref = staff[0];
    if (!ref) {
      return periodOffset === 0 ? "Current pay period" : `Pay period ${periodOffset}`;
    }
    const period = resolvePayPeriod(ref.joiningDate, periodOffset, today);
    const monthLabel = formatPayPeriodMonthLabel(period.start, period.end);
    if (periodOffset === 0) return `${monthLabel} · current`;
    return monthLabel;
  }, [staff, periodOffset, today]);

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
        const calculatedDue = Math.round((earned.earnedNet - paid) * 100) / 100;
        const { total: carryForward } = computeCarryForwardUnpaid({
          employee: e,
          payments,
          attendance,
          settings,
          overrides,
          periodOffset,
          today,
        });
        const periodDue = calculatedDue;
        const totalCalculatedDue = Math.round((carryForward + periodDue) * 100) / 100;
        const earnedDue = resolveDisplayDue(e, totalCalculatedDue, periodOffset);
        const fullDue = Math.round((earned.fullMonthNet - paid + carryForward) * 100) / 100;
        const effectivePaid = Math.max(0, earned.earnedNet + carryForward - earnedDue);
        const status = salaryStatus(earned.earnedNet + carryForward, effectivePaid);
        const isManualDue = periodOffset === 0 && Boolean(e.salaryDueManual);
        return {
          employee: e,
          paid,
          earned,
          carryForward,
          periodDue,
          calculatedDue: totalCalculatedDue,
          earnedDue,
          fullDue,
          isManualDue,
          status,
        };
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
      const calculatedDue = Math.round((earned.earnedNet - paid) * 100) / 100;
      const { total: carryForward } = computeCarryForwardUnpaid({
        employee: e,
        payments,
        attendance,
        settings,
        overrides,
        periodOffset,
        today,
      });
      const earnedDue = resolveDisplayDue(e, carryForward + calculatedDue, periodOffset);
      totalPaid += paid;
      totalDue += earnedDue;
      if (earnedDue > 0 && e.monthlySalary > 0) unpaidCount++;
    }
    return { totalDue, totalPaid, unpaidCount };
  }, [staff, payments, attendance, periodOffset, today, settings, overrides]);

  const staffByPhone = useMemo(
    () => new Map(staff.map((s) => [s.phone, s])),
    [staff]
  );

  const staffDetail = useMemo(() => {
    if (!detailTarget) return null;
    return buildSalaryStaffDetail({
      employee: detailTarget.employee,
      payments,
      attendance,
      settings,
      overrides,
      periodOffset,
      today,
    });
  }, [detailTarget, payments, attendance, settings, overrides, periodOffset, today]);

  // Sync computed remaining salary to Firestore so mobile app can read it directly
  useEffect(() => {
    if (periodOffset !== 0) return;
    rows.forEach((r) => {
      if (!r.employee.phone || r.employee.salaryDueManual) return;
      const rounded = Math.round(r.calculatedDue * 100) / 100;
      const stored = r.employee.salaryRemaining;
      if (stored === rounded) return;
      updateDoc(doc(getDb(), "employees", r.employee.phone), {
        salaryRemaining: rounded,
      })
        .then(() => {
          setStaff((prev) =>
            prev.map((e) =>
              e.phone === r.employee.phone
                ? { ...e, salaryRemaining: rounded, salaryDueManual: false }
                : e
            )
          );
        })
        .catch(() => {});
    });
  }, [rows, periodOffset]);

  // Keep pay modal in sync when payments change (e.g. after delete)
  useEffect(() => {
    if (!payTarget) return;
    const updated = rows.find((r) => r.employee.phone === payTarget.employee.phone);
    if (
      updated &&
      (updated.paid !== payTarget.paid ||
        updated.earnedDue !== payTarget.earnedDue ||
        updated.isManualDue !== payTarget.isManualDue)
    ) {
      setPayTarget(updated);
    }
  }, [rows, payTarget]);

  // Keep breakdown panel in sync when payments change
  useEffect(() => {
    if (!detailTarget) return;
    const updated = rows.find((r) => r.employee.phone === detailTarget.employee.phone);
    if (updated) setDetailTarget(updated);
  }, [rows, detailTarget?.employee.phone]);

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

  async function refreshPayments(): Promise<PaymentTransaction[]> {
    const paySnap = await getDocs(collection(getDb(), "payments"));
    const list = paySnap.docs.map((d) => parsePayment(d.id, d.data()));
    setPayments(list);
    return list;
  }

  async function handleDeleteSalaryPayment(
    payment: PaymentTransaction,
    employeeName: string
  ) {
    if (
      !confirm(
        `Delete salary payment of ${money(payment.amount)} for ${employeeName}? Due amount will be restored.`
      )
    ) {
      return;
    }
    const employee = staffByPhone.get(payment.employeeId);
    if (!employee) {
      setMsg("Staff member not found.");
      return;
    }
    setDeletingPaymentId(payment.id);
    setMsg("");
    try {
      await deleteSalaryPayment(payment.id);
      const freshPayments = await refreshPayments();
      const earnedDue = await syncEmployeeSalaryRemaining({
        employee,
        payments: freshPayments,
        attendance,
        settings,
        overrides,
        periodOffset,
        today,
      });
      setStaff((prev) =>
        prev.map((e) =>
          e.phone === employee.phone
            ? { ...e, salaryRemaining: earnedDue, salaryDueManual: false }
            : e
        )
      );
      setMsg(
        `Deleted payment of ${money(payment.amount)} for ${employeeName}. Due is now ${money(earnedDue)}.`
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingPaymentId(null);
    }
  }

  function openEditDue(row: SalaryRow) {
    setEditDueTarget(row);
    setEditDueAmount(String(row.earnedDue));
    setMsg("");
  }

  async function submitEditDue(e: React.FormEvent) {
    e.preventDefault();
    if (!editDueTarget) return;
    const amount = Number(editDueAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setMsg("Enter a valid amount.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      await setManualSalaryRemaining(editDueTarget.employee.phone, amount);
      setStaff((prev) =>
        prev.map((emp) =>
          emp.phone === editDueTarget.employee.phone
            ? { ...emp, salaryRemaining: amount, salaryDueManual: true }
            : emp
        )
      );
      setEditDueTarget(null);
      setMsg(`Remaining due set to ${money(amount)} for ${editDueTarget.employee.name}.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function resetDueToCalculated(row: SalaryRow) {
    setSaving(true);
    setMsg("");
    try {
      const earnedDue = await syncEmployeeSalaryRemaining({
        employee: row.employee,
        payments,
        attendance,
        settings,
        overrides,
        periodOffset,
        today,
      });
      setStaff((prev) =>
        prev.map((e) =>
          e.phone === row.employee.phone
            ? { ...e, salaryRemaining: earnedDue, salaryDueManual: false }
            : e
        )
      );
      setEditDueTarget(null);
      setMsg(`Due reset to calculated ${money(earnedDue)} for ${row.employee.name}.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setSaving(false);
    }
  }

  function openEditPayment(payment: PaymentTransaction) {
    setEditPaymentTarget(payment);
    setEditPaymentAmount(String(payment.amount));
    setMsg("");
  }

  async function submitEditPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!editPaymentTarget) return;
    const amount = Number(editPaymentAmount);
    if (!amount || amount <= 0) {
      setMsg("Enter a valid amount.");
      return;
    }
    const employee = staffByPhone.get(editPaymentTarget.employeeId);
    if (!employee) {
      setMsg("Staff member not found.");
      return;
    }
    setEditingPaymentId(editPaymentTarget.id);
    setMsg("");
    try {
      await updateSalaryPaymentAmount(editPaymentTarget.id, amount);
      const freshPayments = await refreshPayments();
      const earnedDue = await syncEmployeeSalaryRemaining({
        employee,
        payments: freshPayments,
        attendance,
        settings,
        overrides,
        periodOffset,
        today,
      });
      setStaff((prev) =>
        prev.map((e) =>
          e.phone === employee.phone
            ? { ...e, salaryRemaining: earnedDue, salaryDueManual: false }
            : e
        )
      );
      setEditPaymentTarget(null);
      setMsg(`Payment updated to ${money(amount)}. Due is now ${money(earnedDue)}.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setEditingPaymentId(null);
    }
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
      const baseRemarks = payRemarks.trim();
      const createdBy = session?.name || "Admin";
      const payDate = todayDateStr();
      const payTime = nowTimeStr();

      const paymentWrites: Array<{
        periodStart: string;
        periodEnd: string;
        amount: number;
        remarks: string;
      }> = [];

      if (periodOffset === 0) {
        let remaining = amount;
        const { lines: carryLines } = computeCarryForwardUnpaid({
          employee: payTarget.employee,
          payments,
          attendance,
          settings,
          overrides,
          periodOffset,
          today,
        });
        for (const line of carryLines) {
          if (remaining <= 0) break;
          if (line.balance <= 0) continue;
          const apply = Math.min(remaining, line.balance);
          if (apply <= 0) continue;
          paymentWrites.push({
            periodStart: line.periodStart,
            periodEnd: line.periodEnd,
            amount: apply,
            remarks:
              baseRemarks ||
              `${line.label} · carry forward · ${modeLabel}`,
          });
          remaining = Math.round((remaining - apply) * 100) / 100;
        }
        if (remaining > 0) {
          paymentWrites.push({
            periodStart: period.start,
            periodEnd: period.end,
            amount: remaining,
            remarks:
              baseRemarks ||
              `${formatPayPeriodMonthLabel(period.start, period.end)} · ${modeLabel}`,
          });
        }
      } else {
        paymentWrites.push({
          periodStart: period.start,
          periodEnd: period.end,
          amount,
          remarks:
            baseRemarks ||
            `${formatPayPeriodMonthLabel(period.start, period.end)} · ${modeLabel}`,
        });
      }

      for (const write of paymentWrites) {
        const payment: PaymentTransaction = {
          id: newPaymentId(),
          employeeId: payTarget.employee.phone,
          amount: write.amount,
          type: "SALARY_PAYMENT",
          date: payDate,
          time: payTime,
          periodStart: write.periodStart,
          periodEnd: write.periodEnd,
          remarks: write.remarks,
          createdBy,
        };
        await setDoc(doc(getDb(), "payments", payment.id), {
          ...payment,
          remarks: payment.remarks || "",
          periodStart: write.periodStart,
          periodEnd: write.periodEnd,
        });
      }

      const freshPayments = await refreshPayments();
      const earnedDue = await syncEmployeeSalaryRemaining({
        employee: payTarget.employee,
        payments: freshPayments,
        attendance,
        settings,
        overrides,
        periodOffset: 0,
        today,
      });
      setStaff((prev) =>
        prev.map((e) =>
          e.phone === payTarget.employee.phone
            ? { ...e, salaryRemaining: earnedDue, salaryDueManual: false }
            : e
        )
      );
      setPayTarget(null);
      const splitNote =
        paymentWrites.length > 1 ? ` (${paymentWrites.length} period allocations)` : "";
      setMsg(`Salary of ${money(amount)} recorded for ${payTarget.employee.name}${splitNote}.`);
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
          Join-date pay periods · carry forward unpaid · click staff for breakdown · {summary.unpaidCount} pending
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
            msg.includes("recorded") ||
            msg.includes("Deleted") ||
            msg.includes("Due is now") ||
            msg.includes("Remaining due") ||
            msg.includes("Due reset") ||
            msg.includes("Payment updated")
              ? "bg-jade-soft text-jade-deep"
              : "bg-red-50 text-danger"
          }`}
        >
          {msg.includes("recorded") ||
          msg.includes("Deleted") ||
          msg.includes("Due is now") ||
          msg.includes("Remaining due") ||
          msg.includes("Due reset") ||
          msg.includes("Payment updated") ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
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
                  const { employee, paid, earned, earnedDue, carryForward, status } = row;
                  return (
                    <tr
                      key={employee.phone}
                      className="cursor-pointer hover:bg-[var(--surface-mist)]"
                      onClick={() => setDetailTarget(row)}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <WorkerAvatar name={employee.name} />
                          <div>
                            <p className="font-semibold capitalize">{employee.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {employee.phone}
                              {employee.joiningDate ? ` · joined ${employee.joiningDate}` : ""}
                            </p>
                            <p className="text-[10px] text-jade-deep">Tap for salary breakdown</p>
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
                      <td className="font-medium text-warning">
                        <div className="flex items-center gap-1.5">
                          <span>
                            {money(earnedDue)}
                            {row.isManualDue ? (
                              <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
                                (manual)
                              </span>
                            ) : null}
                            {carryForward !== 0 ? (
                              <span className="mt-0.5 block text-[10px] font-normal text-amber-700">
                                incl. {money(carryForward)} from prior months
                              </span>
                            ) : null}
                          </span>
                          {periodOffset === 0 && employee.monthlySalary > 0 ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm p-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDue(row);
                              }}
                              aria-label="Edit remaining due"
                            >
                              <Pencil size={13} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={status} />
                      </td>
                      <td className="text-right" onClick={(e) => e.stopPropagation()}>
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
                const { employee, paid, earned, earnedDue, carryForward, status } = row;
                return (
                  <div
                    key={employee.phone}
                    className={`cursor-pointer p-3.5 hover:bg-[var(--surface-mist)] ${idx < rows.length - 1 ? "border-b border-[var(--border)]" : ""}`}
                    onClick={() => setDetailTarget(row)}
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
                              {carryForward !== 0 ? ` (${money(carryForward)} prior)` : ""}
                            </p>
                            <p className="text-[10px] text-jade-deep">Tap for full breakdown</p>
                          </div>
                          <StatusBadge status={status} />
                        </div>
                        {employee.monthlySalary > 0 && periodOffset === 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm mt-2 w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDue(row);
                            }}
                          >
                            <Pencil size={14} />
                            Edit due {money(earnedDue)}
                          </button>
                        )}
                        {employee.monthlySalary > 0 && (earnedDue > 0 || row.fullDue > 0) && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm mt-2 w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPay(row, "EARNED");
                            }}
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
                    {formatPayPeriodMonthLabel(payTarget.earned.periodStart, payTarget.earned.periodEnd)}
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

      {detailTarget && staffDetail && (
        <SalaryStaffDetailPanel
          staffName={detailTarget.employee.name}
          detail={staffDetail}
          onClose={() => setDetailTarget(null)}
          onPay={() => {
            const row = detailTarget;
            setDetailTarget(null);
            openPay(row, "EARNED");
          }}
          onDeletePayment={(payment) =>
            handleDeleteSalaryPayment(payment, detailTarget.employee.name)
          }
          onEditPayment={openEditPayment}
          deletingPaymentId={deletingPaymentId}
          editingPaymentId={editingPaymentId}
        />
      )}

      {editDueTarget && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setEditDueTarget(null)}
            aria-hidden
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={submitEditDue}
              className="surface w-full max-w-sm space-y-4 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold">Edit remaining due</h3>
                  <p className="text-sm text-[var(--text-muted)]">{editDueTarget.employee.name}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost p-2"
                  onClick={() => setEditDueTarget(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Calculated due: {money(editDueTarget.calculatedDue)}
              </p>
              <div>
                <label className="label">Remaining to pay (₹)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="1"
                  value={editDueAmount}
                  onChange={(e) => setEditDueAmount(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                  {saving ? "Saving…" : "Save remaining"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  disabled={saving}
                  onClick={() => resetDueToCalculated(editDueTarget)}
                >
                  Reset to calculated
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {editPaymentTarget && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setEditPaymentTarget(null)}
            aria-hidden
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={submitEditPayment}
              className="surface w-full max-w-sm space-y-4 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold">Edit payment amount</h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    {formatDisplayDate(editPaymentTarget.date)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost p-2"
                  onClick={() => setEditPaymentTarget(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <div>
                <label className="label">Amount (₹)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  step="1"
                  value={editPaymentAmount}
                  onChange={(e) => setEditPaymentAmount(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={!!editingPaymentId}>
                {editingPaymentId ? "Saving…" : "Save payment"}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
