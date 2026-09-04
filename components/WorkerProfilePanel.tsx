"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Banknote,
  Calendar,
  ChevronRight,
  Clock,
  IndianRupee,
  Loader2,
  Phone,
  Plus,
  User,
  Wallet,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import { formatDisplayTime, formatDisplayDate, timeSortKey } from "@/lib/csv";
import { useAuth } from "@/lib/auth-context";
import { payKaarigerKharcha } from "@/lib/kaariger-pay";
import { clearKaarigerBusinessData } from "@/lib/delete-worker";
import { isStandaloneRepair } from "@/lib/types";
import type {
  Attendance,
  AttendanceSettings,
  Employee,
  KaarigerOrder,
  KaarigerPayment,
  PaymentTransaction,
} from "@/lib/types";
import {
  grossOpeningBeforePays,
  storedOpeningFromGross,
  totalRemainingAmount,
} from "@/lib/kaariger-hisaab";
import {
  defaultSettings,
  formatDisplayTime as formatShiftHint,
  hasCustomShift,
  normalizeTime,
  parseAttendance,
  resolveShiftSettings,
  dayStatus,
} from "@/lib/attendance-utils";
import {
  computeEarnedSalary,
  formatDurationMinutes,
  parseCalendarOverride,
  type OverrideMap,
} from "@/lib/deduction-utils";
import { parsePayment, salaryStatus, todayDateStr } from "@/lib/salary-utils";
import {
  addDaysIso,
  clampPayPeriodOffset,
  earnedAsOfDate,
  formatPayPeriodLabel,
  resolvePayPeriod,
  salaryPaidInPeriod,
} from "@/lib/pay-period-utils";
import EmployeeAttendancePanel from "@/components/EmployeeAttendancePanel";
import {
  buildEmployeeShiftScheduleSave,
  parseAttendanceSettingsDoc,
} from "@/lib/shift-schedule";
import {
  SUPERVISOR_PERMISSION_LABELS,
  isPayrollRole,
  normalizeSupervisorAccess,
  type SupervisorAccess,
  type SupervisorPermissionKey,
} from "@/lib/supervisor-access";

interface Props {
  employee: Employee;
  settings?: AttendanceSettings;
  onClose: () => void;
  onPaySalary?: (employee: Employee) => void;
  onUpdated?: (employee: Employee) => void;
}

export default function WorkerProfilePanel({
  employee,
  settings: settingsProp,
  onClose,
  onPaySalary,
  onUpdated,
}: Props) {
  const { session } = useAuth();
  const [periodOffset, setPeriodOffset] = useState(0);
  const today = todayDateStr();
  const payPeriod = useMemo(
    () => resolvePayPeriod(employee.joiningDate, periodOffset, today),
    [employee.joiningDate, periodOffset, today]
  );
  const { start, end } = payPeriod;
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [overrides, setOverrides] = useState<OverrideMap>(new Map());
  const [settings, setSettings] = useState<AttendanceSettings>(
    settingsProp || defaultSettings()
  );
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [localEmployee, setLocalEmployee] = useState(employee);
  const [openingDraft, setOpeningDraft] = useState(String(employee.openingBalance || ""));
  const [openingSaving, setOpeningSaving] = useState(false);
  const [openingMsg, setOpeningMsg] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", remarks: "" });
  const [paySaving, setPaySaving] = useState(false);
  const [payMsg, setPayMsg] = useState("");
  const [shiftDraft, setShiftDraft] = useState({
    dailySignInTime: employee.dailySignInTime
      ? normalizeTime(employee.dailySignInTime)
      : "",
    dailySignOutTime: employee.dailySignOutTime
      ? normalizeTime(employee.dailySignOutTime)
      : "",
  });
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftMsg, setShiftMsg] = useState("");
  const [supervisorAccessDraft, setSupervisorAccessDraft] = useState<SupervisorAccess>(
    normalizeSupervisorAccess(employee.supervisorAccess)
  );
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessMsg, setAccessMsg] = useState("");
  const [clearingHisaab, setClearingHisaab] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [kaarigerOrders, setKaarigerOrders] = useState<KaarigerOrder[]>([]);
  const [kaarigerPayments, setKaarigerPayments] = useState<KaarigerPayment[]>([]);
  const [hisaabLoading, setHisaabLoading] = useState(false);

  const grossOpening = useMemo(() => {
    if (localEmployee.role !== "KAARIGER") return Math.max(0, localEmployee.openingBalance || 0);
    return grossOpeningBeforePays({
      orders: kaarigerOrders,
      payments: kaarigerPayments,
      openingBalance: localEmployee.openingBalance || 0,
    });
  }, [localEmployee, kaarigerOrders, kaarigerPayments]);

  const totalRemaining = useMemo(() => {
    if (localEmployee.role !== "KAARIGER") return 0;
    return totalRemainingAmount({
      openingBalance:
        (localEmployee.openingBalance || 0) + Math.max(0, localEmployee.oldKharcha || 0),
      creditBalance: localEmployee.creditBalance || 0,
    });
  }, [localEmployee]);

  useEffect(() => {
    setLocalEmployee(employee);
    setShiftDraft({
      dailySignInTime: employee.dailySignInTime
        ? normalizeTime(employee.dailySignInTime)
        : "",
      dailySignOutTime: employee.dailySignOutTime
        ? normalizeTime(employee.dailySignOutTime)
        : "",
    });
    setSupervisorAccessDraft(normalizeSupervisorAccess(employee.supervisorAccess));
    setPeriodOffset(0);
  }, [employee]);

  useEffect(() => {
    if (localEmployee.role !== "KAARIGER") return;
    setOpeningDraft(String(Math.round(grossOpening * 100) / 100));
  }, [localEmployee.role, grossOpening]);

  useEffect(() => {
    if (employee.role !== "KAARIGER") {
      setKaarigerOrders([]);
      setKaarigerPayments([]);
      return;
    }
    let cancelled = false;
    setHisaabLoading(true);
    const phone = employee.phone;
    Promise.all([
      getDocs(query(collection(getDb(), "kaariger_orders"), where("kaarigerId", "==", phone))),
      getDocs(query(collection(getDb(), "kaariger_payments"), where("kaarigerId", "==", phone))),
    ])
      .then(([orderSnap, paySnap]) => {
        if (cancelled) return;
        setKaarigerOrders(
          orderSnap.docs.map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              kaarigerId: data.kaarigerId as string,
              kaarigerName: (data.kaarigerName as string) || "",
              productName: (data.productName as string) || "",
              targetQuantity: (data.targetQuantity as number) || 0,
              color: "",
              rawMaterials: [],
              totalDealAmount: (data.totalDealAmount as number) || 0,
              pricingType: "PER_PIECE",
              status: (data.status as string) || "ASSIGNED",
              approvedQuantity: 0,
              createdBy: "",
              createdAt: (data.createdAt as number) || 0,
              kharchaGiven: data.kharchaGiven as number | undefined,
              kharchaCarriedForward: data.kharchaCarriedForward as number | undefined,
              kharchaCarryIn: data.kharchaCarryIn as number | undefined,
              addBalance: data.addBalance as number | undefined,
              openingAtCreation: data.openingAtCreation as number | undefined,
              closingAtCreation: data.closingAtCreation as number | undefined,
              productsTotal: data.productsTotal as number | undefined,
              materialDeductionsTotal: data.materialDeductionsTotal as number | undefined,
              repairDeductionTotal: (data.repairDeductionTotal as number) || 0,
            } satisfies KaarigerOrder;
          })
        );
        setKaarigerPayments(
          paySnap.docs.map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              orderId: (data.orderId as string) || "",
              kaarigerId: (data.kaarigerId as string) || phone,
              amount: (data.amount as number) || 0,
              date: (data.date as string) || "",
              time: (data.time as string) || "",
              remarks: data.remarks as string | undefined,
              createdBy: (data.createdBy as string) || "",
              createdAt: data.createdAt as number | undefined,
            } satisfies KaarigerPayment;
          })
        );
      })
      .finally(() => {
        if (!cancelled) setHisaabLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employee.phone, employee.role]);

  const effectiveShift = useMemo(
    () => resolveShiftSettings(localEmployee, settings),
    [localEmployee, settings]
  );

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
        setSettings(parseAttendanceSettingsDoc(snap.data() as Record<string, unknown>));
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

  const monthStats = useMemo(() => {
    const byDate = new Map(attendanceRecords.map((r) => [r.date, r]));
    let present = 0;
    let late = 0;
    let absent = 0;
    let workingDays = 0;
    let cursor = start;
    while (cursor <= end && cursor <= today) {
      workingDays++;
      const rec = byDate.get(cursor);
      const st = dayStatus(rec, cursor);
      if (st === "ABSENT") absent++;
      else if (st === "LATE") late++;
      else if (
        st === "PRESENT" ||
        st === "ON_TIME" ||
        st === "LEFT_EARLY" ||
        st === "HALF_DAY"
      ) {
        present++;
      }
      cursor = addDaysIso(cursor, 1);
    }
    const rate = workingDays ? Math.round((present / workingDays) * 100) : 0;
    return { present, late, absent, workingDays, rate };
  }, [attendanceRecords, start, end, today]);

  const earned = useMemo(() => {
    const asOf = earnedAsOfDate(payPeriod, today);
    return computeEarnedSalary({
      monthlySalary: employee.monthlySalary,
      periodStart: payPeriod.start,
      periodEnd: payPeriod.end,
      asOfDate: asOf,
      records: attendanceRecords,
      settings,
      overrides,
      employeePhone: employee.phone,
      employeeShift: localEmployee,
    });
  }, [
    employee.monthlySalary,
    employee.phone,
    payPeriod,
    today,
    attendanceRecords,
    settings,
    localEmployee,
    overrides,
  ]);

  const paidThisMonth = useMemo(
    () => salaryPaidInPeriod(payments, payPeriod.start, payPeriod.end),
    [payments, payPeriod.start, payPeriod.end]
  );
  const netSalary = earned.earnedNet;
  const payStatus = salaryStatus(netSalary, paidThisMonth);
  const salaryRemaining = Math.max(0, netSalary - paidThisMonth);

  useEffect(() => {
    const roundedRemaining = Math.round(salaryRemaining * 100) / 100;
    if (employee?.phone && Number.isFinite(roundedRemaining) && employee.salaryRemaining !== roundedRemaining) {
      updateDoc(doc(getDb(), "employees", employee.phone), {
        salaryRemaining: roundedRemaining
      }).catch(() => {});
    }
  }, [employee?.phone, employee?.salaryRemaining, salaryRemaining]);

  const recentPayments = useMemo(
    () =>
      [...payments]
        .filter((p) => p.date >= payPeriod.start && p.date <= payPeriod.end)
        .sort((a, b) => `${b.date} ${timeSortKey(b.time)}`.localeCompare(`${a.date} ${timeSortKey(a.time)}`))
        .slice(0, 5),
    [payments, payPeriod.start, payPeriod.end]
  );

  async function saveOpeningBalance(e: React.FormEvent) {
    e.preventDefault();
    const gross = Math.max(0, Number(openingDraft) || 0);
    const stored =
      localEmployee.role === "KAARIGER" && kaarigerOrders.length > 0
        ? storedOpeningFromGross({
            orders: kaarigerOrders,
            payments: kaarigerPayments,
            grossOpening: gross,
          })
        : gross;
    setOpeningSaving(true);
    setOpeningMsg("");
    try {
      await updateDoc(doc(getDb(), "employees", localEmployee.phone), {
        openingBalance: stored,
      });
      const next = { ...localEmployee, openingBalance: stored };
      setLocalEmployee(next);
      onUpdated?.(next);
      setOpeningMsg("Opening balance saved.");
    } catch (err) {
      setOpeningMsg(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setOpeningSaving(false);
    }
  }

  async function clearAllHisaabData() {
    if (
      !confirm(
        `Clear ALL bills, payments, repairs and hisaab for ${localEmployee.name}? Opening/credit will reset to 0. This cannot be undone.`
      )
    ) {
      return;
    }
    setClearingHisaab(true);
    setOpeningMsg("");
    try {
      const n = await clearKaarigerBusinessData(localEmployee.phone);
      await updateDoc(doc(getDb(), "employees", localEmployee.phone), {
        openingBalance: 0,
        creditBalance: 0,
        oldKharcha: 0,
      });
      const next = {
        ...localEmployee,
        openingBalance: 0,
        creditBalance: 0,
        oldKharcha: 0,
      };
      setLocalEmployee(next);
      setOpeningDraft("0");
      onUpdated?.(next);
      setOpeningMsg(`Cleared ${n} record(s). Hisaab is empty now.`);
    } catch (err) {
      setOpeningMsg(err instanceof Error ? err.message : "Failed to clear hisaab.");
    } finally {
      setClearingHisaab(false);
    }
  }

  async function saveSupervisorAccess(next: SupervisorAccess) {
    setAccessSaving(true);
    setAccessMsg("");
    try {
      await updateDoc(doc(getDb(), "employees", localEmployee.phone), {
        supervisorAccess: next,
      });
      const updated: Employee = { ...localEmployee, supervisorAccess: next };
      setLocalEmployee(updated);
      setSupervisorAccessDraft(next);
      onUpdated?.(updated);
      setAccessMsg("Permissions saved.");
    } catch (err) {
      setAccessMsg(err instanceof Error ? err.message : "Failed to save permissions.");
    } finally {
      setAccessSaving(false);
    }
  }

  async function toggleSupervisorPermission(key: SupervisorPermissionKey, enabled: boolean) {
    const next = { ...supervisorAccessDraft, [key]: enabled };
    setSupervisorAccessDraft(next);
    await saveSupervisorAccess(next);
  }

  async function saveStaffShift(e: React.FormEvent) {
    e.preventDefault();
    const inTime = shiftDraft.dailySignInTime.trim();
    const outTime = shiftDraft.dailySignOutTime.trim();
    setShiftSaving(true);
    setShiftMsg("");
    try {
      const { payload, effectiveFrom, changed } = buildEmployeeShiftScheduleSave(
        localEmployee.dailySignInTime,
        localEmployee.dailySignOutTime,
        localEmployee.shiftHistory,
        inTime,
        outTime
      );
      if (!changed) {
        setShiftMsg("No change to save.");
        return;
      }
      await updateDoc(doc(getDb(), "employees", localEmployee.phone), payload);
      const next: Employee = {
        ...localEmployee,
        dailySignInTime: inTime ? normalizeTime(inTime) : undefined,
        dailySignOutTime: outTime ? normalizeTime(outTime) : undefined,
        shiftHistory: payload.shiftHistory as Employee["shiftHistory"],
      };
      setLocalEmployee(next);
      onUpdated?.(next);
      setShiftMsg(
        inTime || outTime
          ? `Custom shift applies from ${formatDisplayDate(effectiveFrom)}. Earlier days keep the previous timings.`
          : `Using company default shift from ${formatDisplayDate(effectiveFrom)}.`
      );
    } catch (err) {
      setShiftMsg(err instanceof Error ? err.message : "Failed to save shift.");
    } finally {
      setShiftSaving(false);
    }
  }

  async function submitKaarigerPay(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    const amount = Number(payForm.amount) || 0;
    if (amount <= 0) return;
    setPaySaving(true);
    setPayMsg("");
    try {
      const repairSnap = await getDocs(
        query(collection(getDb(), "order_repairs"), where("kaarigerId", "==", localEmployee.phone))
      );
      const standaloneRepairTotal = repairSnap.docs
        .filter((d) => {
          const data = d.data();
          const status = data.status as string | undefined;
          return (
            isStandaloneRepair(data.orderId as string) &&
            (!status || status === "APPROVED") &&
            !data.deferToNextBill
          );
        })
        .reduce((s, d) => s + ((d.data().totalRepairCost as number) || 0), 0);
      const result = await payKaarigerKharcha({
        kaarigerId: localEmployee.phone,
        amount,
        remarks: payForm.remarks.trim() || undefined,
        createdBy: session.name,
        openingBalance: localEmployee.openingBalance || 0,
        creditBalance: localEmployee.creditBalance || 0,
        standaloneRepairTotal,
      });
      const snap = await getDoc(doc(getDb(), "employees", localEmployee.phone));
      const data = snap.data() || {};
      const next: Employee = {
        ...localEmployee,
        openingBalance: (data.openingBalance as number) || 0,
        creditBalance: (data.creditBalance as number) || 0,
      };
      const paySnap = await getDocs(
        query(collection(getDb(), "kaariger_payments"), where("kaarigerId", "==", localEmployee.phone))
      );
      const freshPayments = paySnap.docs.map((d) => {
        const p = d.data();
        return {
          id: (p.id as string) || d.id,
          orderId: (p.orderId as string) || "",
          kaarigerId: (p.kaarigerId as string) || localEmployee.phone,
          amount: (p.amount as number) || 0,
          date: (p.date as string) || "",
          time: (p.time as string) || "",
          remarks: p.remarks as string | undefined,
          createdBy: (p.createdBy as string) || "",
          createdAt: p.createdAt as number | undefined,
        } satisfies KaarigerPayment;
      });
      setKaarigerPayments(freshPayments);
      setLocalEmployee(next);
      setOpeningDraft(
        String(
          grossOpeningBeforePays({
            orders: kaarigerOrders,
            payments: freshPayments,
            openingBalance: next.openingBalance || 0,
          })
        )
      );
      onUpdated?.(next);
      setPayMsg(result.message);
      setPayForm({ amount: "", remarks: "" });
    } catch (err) {
      setPayMsg(err instanceof Error ? err.message : "Failed to record kharcha.");
    } finally {
      setPaySaving(false);
    }
  }

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
                      employee.role === "KAARIGER"
                        ? "badge-gold"
                        : employee.role === "SUPERVISOR"
                          ? "badge-warn"
                          : "badge-success"
                    }`}
                  >
                    {employee.role === "KAARIGER"
                      ? "Kaariger"
                      : employee.role === "SUPERVISOR"
                        ? "Supervisor"
                        : "Staff"}
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
                  <InfoRow label="Mobile" value={employee.phone} />
                  <InfoRow label="Password" value={localEmployee.password || "—"} />
                  {isPayrollRole(employee.role) && (
                    <>
                      <InfoRow label="Joining Date" value={employee.joiningDate || "—"} />
                      <InfoRow
                        label="Monthly Salary"
                        value={`₹${employee.monthlySalary.toLocaleString("en-IN")}`}
                      />
                      <InfoRow
                        label="Shift"
                        value={`${formatShiftHint(effectiveShift.dailySignInTime)} – ${formatShiftHint(effectiveShift.dailySignOutTime)}${
                          hasCustomShift(localEmployee) ? " (custom)" : " (default)"
                        }`}
                      />
                      {employee.role === "SUPERVISOR" && (
                        <InfoRow label="Login" value="Web panel" />
                      )}
                    </>
                  )}
                  {localEmployee.role === "KAARIGER" && (
                    <InfoRow label="Role" value="Kaariger (piece-work)" />
                  )}
                </div>
              </section>

              {localEmployee.role === "SUPERVISOR" && (
                <section>
                  <h3 className="section-title flex items-center gap-2 text-base">
                    Web access
                  </h3>
                  <div className="mt-3 grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-mist)]/40 p-3 sm:grid-cols-2">
                    {(Object.keys(SUPERVISOR_PERMISSION_LABELS) as SupervisorPermissionKey[]).map(
                      (key) => (
                        <label
                          key={key}
                          className={`flex items-center gap-2 text-sm ${accessSaving ? "opacity-60" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={supervisorAccessDraft[key]}
                            disabled={accessSaving}
                            onChange={(e) => toggleSupervisorPermission(key, e.target.checked)}
                          />
                          {SUPERVISOR_PERMISSION_LABELS[key]}
                        </label>
                      )
                    )}
                  </div>
                  {accessMsg && <p className="mt-2 text-xs text-jade-deep">{accessMsg}</p>}
                </section>
              )}

              {isPayrollRole(localEmployee.role) && (
                <section>
                  <h3 className="section-title flex items-center gap-2 text-base">
                    <Clock size={16} className="text-jade-deep" />
                    Shift time
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Optional. Leave blank to follow the company default from Attendance (
                    {formatShiftHint(settings.dailySignInTime)} –{" "}
                    {formatShiftHint(settings.dailySignOutTime)}). Changes apply from the next day.
                  </p>
                  <form onSubmit={saveStaffShift} className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label">Login</label>
                        <input
                          className="input"
                          type="time"
                          value={shiftDraft.dailySignInTime}
                          onChange={(e) =>
                            setShiftDraft({ ...shiftDraft, dailySignInTime: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="label">Logout</label>
                        <input
                          className="input"
                          type="time"
                          value={shiftDraft.dailySignOutTime}
                          onChange={(e) =>
                            setShiftDraft({ ...shiftDraft, dailySignOutTime: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="btn btn-secondary flex-1" disabled={shiftSaving}>
                        {shiftSaving ? "…" : "Save shift"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost shrink-0"
                        disabled={shiftSaving}
                        onClick={() => {
                          setShiftDraft({ dailySignInTime: "", dailySignOutTime: "" });
                          setShiftMsg("");
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    {shiftMsg && <p className="text-xs text-jade-deep">{shiftMsg}</p>}
                  </form>
                </section>
              )}

              {localEmployee.role === "KAARIGER" && (
                <section>
                  <h3 className="section-title flex items-center gap-2 text-base">
                    <Wallet size={16} className="text-jade-deep" />
                    Opening balance
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Starting amount before any bills (stays fixed). Total remaining on Hisaab includes
                    bills and credit — it updates when you create bills.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatTile
                      label="Opening balance"
                      value={
                        hisaabLoading
                          ? "…"
                          : `₹${Math.round(grossOpening).toLocaleString("en-IN")}`
                      }
                      accent="warn"
                    />
                    <StatTile
                      label="Total remaining"
                      value={`₹${Math.round(totalRemaining).toLocaleString("en-IN")}`}
                      accent="jade"
                    />
                  </div>
                  <div className="mt-2">
                    <StatTile
                      label="Credit"
                      value={`₹${Math.round(localEmployee.creditBalance || 0).toLocaleString("en-IN")}`}
                      accent="jade"
                    />
                  </div>
                  <form onSubmit={saveOpeningBalance} className="mt-3 space-y-2">
                    <label className="label">Edit opening balance (₹)</label>
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={openingDraft}
                        onChange={(e) => setOpeningDraft(e.target.value)}
                        placeholder="e.g. 1000 or 125.5"
                      />
                      <button type="submit" className="btn btn-secondary shrink-0" disabled={openingSaving}>
                        {openingSaving ? "…" : "Save"}
                      </button>
                    </div>
                    {openingMsg && (
                      <p className="text-xs text-jade-deep">{openingMsg}</p>
                    )}
                  </form>
                  <button
                    type="button"
                    className="btn btn-primary mt-3 w-full"
                    onClick={() => {
                      setShowPay(true);
                      setPayForm({ amount: "", remarks: "" });
                      setPayMsg("");
                    }}
                  >
                    <IndianRupee size={15} />
                    Pay
                  </button>
                  <button
                    type="button"
                    className="btn mt-2 w-full !bg-danger/10 !text-danger hover:!bg-danger/20"
                    disabled={clearingHisaab}
                    onClick={clearAllHisaabData}
                  >
                    {clearingHisaab ? "Clearing…" : "Clear all bills & hisaab"}
                  </button>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Use this if you deleted and re-added the same number — old bills stay linked by phone.
                  </p>
                </section>
              )}

              {isPayrollRole(employee.role) && (
                <section>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="section-title flex items-center gap-2 text-base">
                      <Banknote size={16} className="text-jade-deep" />
                      Salary — {formatPayPeriodLabel(payPeriod.start, payPeriod.end)}
                    </h3>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm !px-2"
                        onClick={() => setPeriodOffset((p) => p - 1)}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm !px-2"
                        onClick={() => setPeriodOffset((p) => clampPayPeriodOffset(p + 1))}
                        disabled={periodOffset >= 0}
                      >
                        Next
                      </button>
                    </div>
                  </div>
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
                    {earned.daysWorked} days worked · {earned.daysInPeriod} days in period · ₹
                    {Math.round(earned.perHourRate).toLocaleString("en-IN")}/hr · join-date month
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
                            {p.date} ·{" "}
                            {p.type === "ADVANCE"
                              ? "Kharcha"
                              : p.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {isPayrollRole(employee.role) && (
                <section>
                  <h3 className="section-title flex items-center gap-2 text-base">
                    <Clock size={16} className="text-jade-deep" />
                    Time away &amp; deductions
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Late / early leave cut from days worked · holidays &amp; Sundays excluded ·{" "}
                    {earned.daysInPeriod} days in period · rates use admin shift hours
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

              {isPayrollRole(employee.role) && (
                <section>
                  <div className="flex items-center justify-between">
                    <h3 className="section-title flex items-center gap-2 text-base">
                      <Calendar size={16} className="text-jade-deep" />
                      Attendance — {formatPayPeriodLabel(payPeriod.start, payPeriod.end)}
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

      {showCalendar && isPayrollRole(employee.role) && (
        <EmployeeAttendancePanel
          employee={localEmployee}
          settings={settings}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {showPay && localEmployee.role === "KAARIGER" && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowPay(false)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <form
              onSubmit={submitKaarigerPay}
              className="surface w-full max-w-sm space-y-4 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold">Pay kharcha</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {localEmployee.name} · pays remaining balance first; extra becomes credit
                  </p>
                </div>
                <button type="button" className="btn-icon" onClick={() => setShowPay(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="label">Amount (₹) *</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  autoFocus
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  placeholder="e.g. 500 or 125.5"
                  required
                />
              </div>
              <div>
                <label className="label">Remarks (optional)</label>
                <input
                  className="input"
                  value={payForm.remarks}
                  onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                  placeholder="Optional note"
                />
              </div>
              {payMsg && (
                <p className="rounded-xl bg-jade-soft px-3 py-2 text-sm text-jade-deep">{payMsg}</p>
              )}
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowPay(false)}>
                  Close
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={paySaving}>
                  <Plus className="h-4 w-4" />
                  {paySaving ? "Saving…" : "Pay"}
                </button>
              </div>
            </form>
          </div>
        </>
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
