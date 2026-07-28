"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Employee, PaymentTransaction } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="stat-card">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Paid This Month</p>
          <p className="stat-card-value">₹{summary.totalPaid.toLocaleString("en-IN")}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pending Dues</p>
          <p className="stat-card-value">₹{summary.totalDue.toLocaleString("en-IN")}</p>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" className="btn-secondary !px-3 !py-1" onClick={() => shiftMonth(-1)}>
            ←
          </button>
          <h2 className="font-bold text-brand">{monthLabel(year, month)}</h2>
          <button type="button" className="btn-secondary !px-3 !py-1" onClick={() => shiftMonth(1)}>
            →
          </button>
        </div>

        <AdminSearchBar value={search} onChange={setSearch} placeholder="Search staff..." />

        <div className="mt-3 flex flex-wrap gap-2">
          {(["ALL", "PAID", "UNPAID", "PARTIAL"] as SalaryFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`filter-pill ${filter === f ? "filter-pill-active" : ""}`}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <p className={`text-sm ${msg.includes("recorded") ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>
      )}

      <div className="space-y-3">
        {rows.map(({ employee, paid, status, remaining }) => (
          <div key={employee.phone} className="worker-card">
            <div className="flex items-start gap-3">
              <div className="worker-avatar">{employee.name.charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold capitalize text-brand">{employee.name}</p>
                    <p className="text-sm text-slate-500">{employee.phone}</p>
                  </div>
                  {status === "PAID" ? (
                    <span className="salary-status-paid">Paid</span>
                  ) : status === "UNPAID" ? (
                    <span className="salary-status-unpaid">Unpaid</span>
                  ) : status === "PARTIAL" ? (
                    <span className="salary-status-partial">Partial</span>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-slate-50 py-2">
                    <p className="font-bold text-brand">₹{employee.monthlySalary.toLocaleString("en-IN")}</p>
                    <p className="text-slate-400">Salary</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2">
                    <p className="font-bold text-emerald-700">₹{paid.toLocaleString("en-IN")}</p>
                    <p className="text-slate-400">Paid</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2">
                    <p className="font-bold text-amber-700">₹{remaining.toLocaleString("en-IN")}</p>
                    <p className="text-slate-400">Due</p>
                  </div>
                </div>
                {status !== "PAID" && employee.monthlySalary > 0 && (
                  <button
                    type="button"
                    className="btn-primary mt-3 w-full"
                    onClick={() => openPay(employee)}
                  >
                    Pay ₹{remaining.toLocaleString("en-IN")}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="card py-10 text-center text-sm text-slate-500">
            No staff match your filters.
          </div>
        )}
      </div>

      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <form
            onSubmit={submitPayment}
            className="panel-slide w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-brand">Pay Salary</h3>
            <p className="mt-1 text-sm text-slate-500">
              {payTarget.name} · {monthLabel(year, month)}
            </p>
            <div className="mt-4 space-y-3">
              <div>
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
              <div>
                <label className="label">Remarks (optional)</label>
                <input
                  className="input"
                  value={payRemarks}
                  onChange={(e) => setPayRemarks(e.target.value)}
                  placeholder="e.g. July salary"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setPayTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={saving}>
                {saving ? "Saving..." : "Confirm Payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
