"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { ArrowUpRight, Activity } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { todayStr } from "@/lib/csv";
import { useAuth } from "@/lib/auth-context";
import { ADMIN_MODULES, greeting } from "@/lib/navigation";
import { useIsMobile } from "@/lib/use-is-mobile";
import { ModuleRow, SectionHeader, StatCard } from "@/components/admin/DashboardCards";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

const spark = [
  { d: "Mon", v: 62 },
  { d: "Tue", v: 74 },
  { d: "Wed", v: 68 },
  { d: "Thu", v: 81 },
  { d: "Fri", v: 77 },
  { d: "Sat", v: 58 },
  { d: "Sun", v: 71 },
];

export default function DashboardPage() {
  const { session } = useAuth();
  const isMobile = useIsMobile();
  const [stats, setStats] = useState({
    workers: 0,
    attendanceRate: "0%",
    lowStock: 0,
    pendingDues: "₹0",
    pendingOrders: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const db = getDb();
      const [employees, materials, orders, attendance, payments] = await Promise.all([
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "raw_materials")),
        getDocs(collection(db, "kaariger_orders")),
        getDocs(query(collection(db, "attendance"), where("date", "==", todayStr()))),
        getDocs(collection(db, "payments")),
      ]);

      const staffList = employees.docs.filter((d) => {
        const role = d.data().role as string;
        return role === "STAFF" || !role;
      });

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

      const paid = payments.docs.reduce((s, d) => s + ((d.data().amount as number) || 0), 0);
      const totalSalary = staffList.reduce((s, d) => s + ((d.data().monthlySalary as number) || 0), 0);
      const dues = Math.max(0, totalSalary - paid);
      const duesLabel = dues >= 100000 ? `₹${(dues / 100000).toFixed(1)}L` : `₹${Math.round(dues)}`;

      setStats({
        workers: employees.docs.length,
        attendanceRate: `${rate}%`,
        lowStock,
        pendingDues: duesLabel,
        pendingOrders: pending,
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

  const hero = (
    <div className="admin-hero">
      <div className="relative z-10 flex flex-col gap-4 sm:gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {!isMobile && (
            <div className="inline-flex items-center gap-2 rounded-full border border-jade/30 bg-jade/10 px-3 py-1 text-[11px] font-semibold text-jade-glow">
              <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-jade" />
              Live operations
            </div>
          )}
          <p className={`${isMobile ? "mt-0" : "mt-4"} text-xs font-semibold uppercase tracking-[0.22em] text-bronze`}>
            {greeting()}
          </p>
          <h2 className={`mt-1.5 font-display font-extrabold tracking-tight ${isMobile ? "text-2xl" : "text-3xl sm:text-4xl"}`}>
            {session?.name || "Administrator"}
          </h2>
          <p className={`mt-1.5 max-w-md text-sm text-white/55 ${isMobile ? "line-clamp-2" : ""}`}>
            {isMobile
              ? "People, stock, orders & payouts — tap below."
              : "Your manufacturing control center — people, stock, orders, and payouts in one studio."}
          </p>
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
        <StatCard title="Workers" value={loaded ? stats.workers : "—"} icon="groups" hint={isMobile ? undefined : "Staff + kaarigers"} />
        <StatCard title="Attendance" value={loaded ? stats.attendanceRate : "—"} icon="calendar" hint={isMobile ? undefined : "Today present"} />
        <StatCard
          title="Low stock"
          value={loaded ? stats.lowStock : "—"}
          icon="inventory"
          accent={stats.lowStock > 0 ? "danger" : "jade"}
          hint={isMobile ? undefined : "Below minimum"}
        />
        <StatCard title="Pending dues" value={loaded ? stats.pendingDues : "—"} icon="salary" accent="bronze" hint={isMobile ? undefined : "Salary gap"} />
      </div>

      {stats.pendingOrders > 0 && (
        <Link href="/dashboard/orders" className="alert-banner block transition hover:brightness-95">
          <p className="alert-banner-title">
            {stats.pendingOrders} active kaariger order{stats.pendingOrders > 1 ? "s" : ""}
          </p>
          <p className="alert-banner-sub">Awaiting delivery or staff approval — tap to manage</p>
        </Link>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <SectionHeader
          title={isMobile ? "All sections" : "Command center"}
          subtitle={isMobile ? "Menu · Attendance & more" : "Jump into any workspace"}
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
