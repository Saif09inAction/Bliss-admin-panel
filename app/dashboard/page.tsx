"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { ArrowUpRight, Activity, IndianRupee, Users, Wallet } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { todayStr } from "@/lib/csv";
import { useAuth, isSupervisorSession } from "@/lib/auth-context";
import { ADMIN_MODULES, greeting } from "@/lib/navigation";
import { supervisorDefaultPath } from "@/lib/supervisor-access";
import { useIsMobile } from "@/lib/use-is-mobile";
import { ModuleRow, SectionHeader, StatCard } from "@/components/admin/DashboardCards";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import { isStandaloneRepair } from "@/lib/types";
import { currentMonthParts, monthKey, salaryPaidInMonth, parsePayment } from "@/lib/salary-utils";
import { totalRemainingAmount } from "@/lib/kaariger-hisaab";

const spark = [
  { d: "Mon", v: 62 },
  { d: "Tue", v: 74 },
  { d: "Wed", v: 68 },
  { d: "Thu", v: 81 },
  { d: "Fri", v: 77 },
  { d: "Sat", v: 58 },
  { d: "Sun", v: 71 },
];

function moneyCompact(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default function DashboardPage() {
  const { session } = useAuth();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [stats, setStats] = useState({
    workers: 0,
    staffCount: 0,
    kaarigerCount: 0,
    attendanceRate: "0%",
    lowStock: 0,
    pendingDues: "₹0",
    pendingOrders: 0,
    staffSalaryDue: 0,
    staffSalaryTotal: 0,
    kaarigerRemainingDue: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!session || !isSupervisorSession(session)) return;
    if (!session.access.overview) {
      router.replace(supervisorDefaultPath(session.access));
    }
  }, [session, router]);

  useEffect(() => {
    async function load() {
      const db = getDb();
      const [employees, materials, orders, attendance, payments, repairs] = await Promise.all([
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "raw_materials")),
        getDocs(collection(db, "kaariger_orders")),
        getDocs(query(collection(db, "attendance"), where("date", "==", todayStr()))),
        getDocs(collection(db, "payments")),
        getDocs(collection(db, "order_repairs")),
      ]);

      const staffList = employees.docs.filter((d) => {
        const role = d.data().role as string;
        return role === "STAFF" || role === "SUPERVISOR" || !role;
      });
      const kaarigerList = employees.docs.filter((d) => d.data().role === "KAARIGER");

      const lowStock = materials.docs.filter((d) => {
        const m = d.data();
        return (m.quantity as number) <= (m.minimumStock as number);
      }).length;

      const pending = orders.docs.filter((d) => {
        const s = d.data().status as string;
        return s === "PENDING_APPROVAL" || s === "ASSIGNED";
      }).length;

      const present = attendance.docs.length;
      const rate = staffList.length ? Math.round((present / staffList.length) * 100) : 0;

      const { year, month } = currentMonthParts();
      const monthPrefix = monthKey(year, month);
      const paymentTx = payments.docs.map((d) =>
        parsePayment(d.id, d.data() as Record<string, unknown>)
      );

      let staffSalaryTotal = 0;
      let staffSalaryDue = 0;
      staffList.forEach((d) => {
        const data = d.data();
        const empId = (data.id as string) || d.id;
        const phone = (data.phone as string) || "";
        const monthly = Math.max(0, (data.monthlySalary as number) || 0);
        staffSalaryTotal += monthly;
        const paid = salaryPaidInMonth(
          paymentTx.filter((p) => p.employeeId === empId || (phone && p.employeeId === phone)),
          monthPrefix
        );
        staffSalaryDue += Math.max(0, monthly - paid);
      });

      const repairByKaariger = new Map<string, number>();
      repairs.docs.forEach((d) => {
        const data = d.data();
        const orderId = (data.orderId as string) || "";
        const status = (data.status as string) || "APPROVED";
        if (!isStandaloneRepair(orderId)) return;
        if (status && status !== "APPROVED") return;
        if (data.deferToNextBill) return;
        const kid = (data.kaarigerId as string) || "";
        if (!kid) return;
        repairByKaariger.set(
          kid,
          (repairByKaariger.get(kid) || 0) + ((data.totalRepairCost as number) || 0)
        );
      });

      let kaarigerRemainingDue = 0;
      kaarigerList.forEach((d) => {
        const data = d.data();
        const phone = (data.phone as string) || d.id;
        const opening =
          ((data.openingBalance as number) || 0) +
          Math.max(0, (data.oldKharcha as number) || 0);
        kaarigerRemainingDue += totalRemainingAmount({
          openingBalance: opening,
          creditBalance: Math.max(0, (data.creditBalance as number) || 0),
          standaloneRepairTotal: repairByKaariger.get(phone) || 0,
        });
      });

      setStats({
        workers: employees.docs.length,
        staffCount: staffList.length,
        kaarigerCount: kaarigerList.length,
        attendanceRate: `${rate}%`,
        lowStock,
        pendingDues: moneyCompact(staffSalaryDue),
        pendingOrders: pending,
        staffSalaryDue,
        staffSalaryTotal,
        kaarigerRemainingDue,
      });
      setLoaded(true);
    }
    load();
  }, []);

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ADMIN_MODULES;
    return ADMIN_MODULES.filter(
      (m) => m.title.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
    );
  }, [search]);

  if (session && isSupervisorSession(session) && !session.access.overview) {
    return null;
  }

  const hero = (
    <div className="admin-hero">
      <div className="relative z-10 flex flex-col gap-4 sm:gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          
          <p className={`${isMobile ? "mt-0" : "mt-4"} text-xs font-semibold uppercase tracking-[0.22em] text-bronze`}>
            {greeting()}
          </p>
          <h2 className={`mt-1.5 font-display font-extrabold tracking-tight ${isMobile ? "text-2xl" : "text-3xl sm:text-4xl"}`}>
            {session?.name || "Administrator"}
          </h2>

        </div>
        <Link
          href="/dashboard/orders"
          className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15"
        >
          Open orders
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </div>
  );

  const pulse = (
    <div className="surface flex flex-col p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between sm:mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Attendance today
          </p>
          <p className="font-display text-2xl font-bold">{stats.attendanceRate}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
          <Activity size={16} />
        </div>
      </div>
      {!isMobile && (
        <>
          <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark}>
                <defs>
                  <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1ECB8F" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#1ECB8F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" hide />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(14,22,18,0.08)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#0D8F63"
                  strokeWidth={2}
                  fill="url(#attFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-[var(--text-faint)]">Illustrative weekly rhythm</p>
        </>
      )}
      {isMobile && (
        <Link href="/dashboard/attendance" className="mt-1 text-xs font-semibold text-jade-deep">
          View attendance →
        </Link>
      )}
    </div>
  );

  return (
    <div className="space-y-5 lg:space-y-7">
      <div className="grid gap-4 lg:gap-5 xl:grid-cols-[1.4fr_1fr]">
        {isMobile ? (
          hero
        ) : (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            {hero}
          </motion.div>
        )}
        {isMobile ? (
          pulse
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            {pulse}
          </motion.div>
        )}
      </div>

      <div className="stagger grid grid-cols-2 gap-2.5 lg:gap-3 lg:grid-cols-4">
        <StatCard
          title="Brothers"
          value={loaded ? stats.workers : "—"}
          icon="groups"
          hint={
            isMobile
              ? undefined
              : loaded
                ? `${stats.staffCount} staff · ${stats.kaarigerCount} kaariger`
                : "Staff + kaarigers"
          }
        />
        <StatCard
          title="Attendance"
          value={loaded ? stats.attendanceRate : "—"}
          icon="calendar"
          hint={isMobile ? undefined : "Today present"}
        />
        <StatCard
          title="Low stock"
          value={loaded ? stats.lowStock : "—"}
          icon="inventory"
          accent={stats.lowStock > 0 ? "danger" : "jade"}
          hint={isMobile ? undefined : "Below minimum"}
        />
        <StatCard
          title="Pending dues"
          value={loaded ? stats.pendingDues : "—"}
          icon="salary"
          accent="bronze"
          hint={isMobile ? undefined : "Staff salary this month"}
        />
      </div>

      <div className="space-y-3">
        <SectionHeader
          title="Brothers · money due"
          subtitle={
            isMobile
              ? "Kaariger remaining + staff salary"
              : "Totals across all brothers — kaariger Remaining and staff salary still to pay"
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/dashboard/hisaab"
            className="surface group flex items-start gap-3 p-4 transition hover:brightness-[0.98]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
              <Wallet size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                Due to kaarigers
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-amber-900">
                {loaded ? moneyCompact(stats.kaarigerRemainingDue) : "—"}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {loaded
                  ? `Total Remaining across ${stats.kaarigerCount} kaariger${stats.kaarigerCount === 1 ? "" : "s"}`
                  : "All Remaining money"}
                <span className="ml-1 text-amber-800/80 group-hover:underline">Open Hisaab →</span>
              </p>
            </div>
          </Link>

          <Link
            href="/dashboard/salary"
            className="surface group flex items-start gap-3 p-4 transition hover:brightness-[0.98]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
              <Users size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-jade-deep">
                Due to staff
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-jade-deep">
                {loaded ? moneyCompact(stats.staffSalaryDue) : "—"}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {loaded
                  ? `Unpaid this month · payroll ${moneyCompact(stats.staffSalaryTotal)} (${stats.staffCount} staff)`
                  : "Salary still unpaid"}
                <span className="ml-1 text-jade-deep/80 group-hover:underline">Open Salary →</span>
              </p>
            </div>
            <IndianRupee className="mt-1 h-4 w-4 shrink-0 text-jade-deep/40" />
          </Link>
        </div>
      </div>

      {stats.pendingOrders > 0 && (
        <Link href="/dashboard/orders" className="alert-banner block transition hover:brightness-95">
          <p className="alert-banner-title">
            {stats.pendingOrders} active kaariger order{stats.pendingOrders > 1 ? "s" : ""}
          </p>
          <p className="alert-banner-sub">Awaiting approval</p>
        </Link>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <SectionHeader
          title={isMobile ? "All sections" : "Sections"}
          subtitle={undefined}
        />
        {!isMobile && (
          <div className="w-full sm:max-w-xs">
            <AdminSearchBar value={search} onChange={setSearch} placeholder="Filter modules…" />
          </div>
        )}
      </div>

      <div className="module-list stagger">
        {filteredModules.map((m) => (
          <ModuleRow key={m.href} title={m.title} description={m.description} href={m.href} icon={m.icon} />
        ))}
        {filteredModules.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-[var(--text-muted)]">
            No modules match your search.
          </p>
        )}
      </div>
    </div>
  );
}
