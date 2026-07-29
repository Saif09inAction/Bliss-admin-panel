"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { motion } from "framer-motion";
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
import type { Employee, PaymentTransaction } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import PageToolbar from "@/components/admin/PageToolbar";
import {
  currentMonthParts,
  monthKey,
  monthLabel,
  parsePayment,
  salaryPaidInMonth,
  salaryStatus,
  todayDateStr,
  nowTimeStr,
  type SalaryFilter,
} from "@/lib/salary-utils";

function newPaymentId() {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

export default function SalaryPage() {
  const { session } = useAuth();
  const { year: initYear, month: initMonth } = currentMonthParts();
  const [year, setYear] = useState(initYear);
  const [month, setMonth] = useState(initMonth);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SalaryFilter>("ALL");
  const [payTarget, setPayTarget] = useState<Employee | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payRemarks, setPayRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const db = getDb();
    const [empSnap, paySnap] = await Promise.all([
      getDocs(collection(db, "employees")),
      getDocs(collection(db, "payments")),
    ]);
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
          };
        })
        .filter((e) => e.role === "STAFF")
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setPayments(paySnap.docs.map((d) => parsePayment(d.id, d.data())));
  }

  useEffect(() => {
    load();
  }, []);

  const monthPrefix = monthKey(year, month);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff
      .map((e) => {
        const empPayments = payments.filter((p) => p.employeeId === e.phone);
        const paid = salaryPaidInMonth(empPayments, monthPrefix);
        const status = salaryStatus(e.monthlySalary, paid);
        const remaining = Math.max(0, e.monthlySalary - paid);
        return { employee: e, paid, status, remaining };
      })
      .filter(({ employee, status }) => {
        const matchSearch =
          !q ||
          employee.name.toLowerCase().includes(q) ||
          employee.phone.includes(q);
        const matchFilter =
          filter === "ALL" ||
          (filter === "PAID" && status === "PAID") ||
          (filter === "UNPAID" && status === "UNPAID") ||
          (filter === "PARTIAL" && status === "PARTIAL");
        return matchSearch && matchFilter;
      });
  }, [staff, payments, monthPrefix, search, filter]);

  const summary = useMemo(() => {
    let totalDue = 0;
    let totalPaid = 0;
    let unpaidCount = 0;
    for (const e of staff) {
      const paid = salaryPaidInMonth(
        payments.filter((p) => p.employeeId === e.phone),
        monthPrefix
      );
      totalPaid += paid;
      const remaining = Math.max(0, e.monthlySalary - paid);
      totalDue += remaining;
      if (salaryStatus(e.monthlySalary, paid) !== "PAID" && e.monthlySalary > 0) unpaidCount++;
    }
    return { totalDue, totalPaid, unpaidCount };
  }, [staff, payments, monthPrefix]);

  function openPay(employee: Employee) {
    const paid = salaryPaidInMonth(
      payments.filter((p) => p.employeeId === employee.phone),
      monthPrefix
    );
    const remaining = Math.max(0, employee.monthlySalary - paid);
    setPayTarget(employee);
    setPayAmount(String(remaining));
    setPayRemarks("");
    setMsg("");
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
      const payment: PaymentTransaction = {
        id: newPaymentId(),
        employeeId: payTarget.phone,
        amount,
        type: "SALARY_PAYMENT",
        date: todayDateStr(),
        time: nowTimeStr(),
        remarks: payRemarks.trim() || undefined,
        createdBy: session?.name || "Admin",
      };
      await setDoc(doc(getDb(), "payments", payment.id), payment);
      setPayTarget(null);
      setMsg(`Salary of ₹${amount.toLocaleString("en-IN")} recorded for ${payTarget.name}.`);
      await load();
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
          {staff.length} staff · {summary.unpaidCount} pending this month
        </p>
      </PageToolbar>

      {/* Summary stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-jade-soft">
              <CheckCircle2 size={16} className="text-jade-deep" />
            </div>
            <p className="stat-card-label !mt-0">Paid This Month</p>
          </div>
          <p className="stat-card-value mt-2">₹{summary.totalPaid.toLocaleString("en-IN")}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(232,168,56,0.15)]">
              <Clock size={16} className="text-warning" />
            </div>
            <p className="stat-card-label !mt-0">Pending Dues</p>
          </div>
          <p className="stat-card-value mt-2">₹{summary.totalDue.toLocaleString("en-IN")}</p>
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

      {/* Month navigator + filters */}
      <div className="surface space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            className="btn-icon"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-2 text-center">
            <CalendarDays size={18} className="text-jade-deep" />
            <h2 className="font-display text-lg font-bold">{monthLabel(year, month)}</h2>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <AdminSearchBar value={search} onChange={setSearch} placeholder="Search staff..." />

        <div className="flex flex-wrap gap-2">
          {(["ALL", "PAID", "UNPAID", "PARTIAL"] as SalaryFilter[]).map((f) => (
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

      {/* Desktop table */}
      <div className="hidden lg:block data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Staff Member</th>
              <th>Monthly Salary</th>
              <th>Paid</th>
              <th>Due</th>
              <th>Status</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ employee, paid, status, remaining }) => (
              <tr key={employee.phone}>
                <td>
                  <div className="flex items-center gap-3">
                    <WorkerAvatar name={employee.name} />
                    <div>
                      <p className="font-semibold capitalize">{employee.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{employee.phone}</p>
                    </div>
                  </div>
                </td>
                <td className="font-medium">₹{employee.monthlySalary.toLocaleString("en-IN")}</td>
                <td className="font-medium text-jade-deep">₹{paid.toLocaleString("en-IN")}</td>
                <td className="font-medium text-warning">₹{remaining.toLocaleString("en-IN")}</td>
                <td>
                  <StatusBadge status={status} />
                </td>
                <td className="text-right">
                  {status !== "PAID" && employee.monthlySalary > 0 ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => openPay(employee)}
                    >
                      <Banknote size={14} />
                      Pay ₹{remaining.toLocaleString("en-IN")}
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--text-faint)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-12 text-center text-sm text-[var(--text-muted)]">No staff match your filters.</p>
        )}
      </div>

      {/* Mobile / tablet cards */}
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:hidden">
        {rows.map(({ employee, paid, status, remaining }, i) => (
          <motion.div
            key={employee.phone}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="surface p-4"
          >
            <div className="flex items-start gap-3">
              <WorkerAvatar name={employee.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display font-bold capitalize">{employee.name}</p>
                    <p className="text-sm text-[var(--text-muted)]">{employee.phone}</p>
                  </div>
                  <StatusBadge status={status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-[var(--surface-mist)] py-2">
                    <p className="font-bold">₹{employee.monthlySalary.toLocaleString("en-IN")}</p>
                    <p className="text-[var(--text-faint)]">Salary</p>
                  </div>
                  <div className="rounded-xl bg-jade-soft py-2">
                    <p className="font-bold text-jade-deep">₹{paid.toLocaleString("en-IN")}</p>
                    <p className="text-[var(--text-faint)]">Paid</p>
                  </div>
                  <div className="rounded-xl bg-[rgba(232,168,56,0.12)] py-2">
                    <p className="font-bold text-warning">₹{remaining.toLocaleString("en-IN")}</p>
                    <p className="text-[var(--text-faint)]">Due</p>
                  </div>
                </div>
                {status !== "PAID" && employee.monthlySalary > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary mt-3 w-full"
                    onClick={() => openPay(employee)}
                  >
                    <Banknote size={15} />
                    Pay ₹{remaining.toLocaleString("en-IN")}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        {rows.length === 0 && (
          <div className="surface col-span-full py-12 text-center sm:col-span-2">
            <p className="text-sm text-[var(--text-muted)]">No staff match your filters.</p>
          </div>
        )}
      </div>

      {/* Pay salary modal */}
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
              className="surface w-full max-w-md space-y-5 p-5 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-bold">Pay Salary</h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {payTarget.name} · {monthLabel(year, month)}
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">Amount (₹)</label>
                  <input
                    className="input"
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                    min={1}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Remarks (optional)</label>
                  <input
                    className="input"
                    value={payRemarks}
                    onChange={(e) => setPayRemarks(e.target.value)}
                    placeholder="e.g. July salary"
                  />
                </div>
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
