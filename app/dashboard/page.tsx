"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { todayStr } from "@/lib/csv";
import { useAuth } from "@/lib/auth-context";
import { ADMIN_MODULES, greeting } from "@/lib/navigation";
import { ModuleRow, SectionHeader, StatCard } from "@/components/admin/DashboardCards";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

export default function DashboardPage() {
  const { session } = useAuth();
  const [stats, setStats] = useState({
    workers: 0,
    attendanceRate: "0%",
    lowStock: 0,
    pendingDues: "₹0",
    pendingOrders: 0,
  });
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

  return (
    <div className="space-y-5">
      <div className="admin-hero">
        <p className="relative z-10 text-xs font-bold uppercase tracking-[0.2em] text-[var(--bliss-gold-light)]">
          {greeting()}
        </p>
        <h2 className="relative z-10 mt-2 text-2xl font-black text-white">
          {session?.name || "Administrator"}
        </h2>
        <p className="relative z-10 mt-1 text-sm text-white/75">Bliss Bombay Control Center</p>
        <div className="relative z-10 mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--bliss-gold)]/40 bg-black/20 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--bliss-green-light)]" />
          <span className="text-xs font-semibold text-[var(--bliss-gold-light)]">Live Operations</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Workers" value={stats.workers} icon="groups" />
        <StatCard title="Attendance" value={stats.attendanceRate} icon="calendar" />
        <StatCard title="Low Stock" value={stats.lowStock} icon="inventory" />
        <StatCard title="Pending Dues" value={stats.pendingDues} icon="orders" />
      </div>

      {stats.pendingOrders > 0 && (
        <div className="alert-banner">
          <p className="alert-banner-title">
            {stats.pendingOrders} active kaariger order{stats.pendingOrders > 1 ? "s" : ""}
          </p>
          <p className="alert-banner-sub">Awaiting delivery or staff approval</p>
        </div>
      )}

      <SectionHeader title="Quick Access" subtitle="All management modules in one place" />
      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search modules..."
      />
      <div className="module-list">
        {filteredModules.map((m) => (
          <ModuleRow key={m.href} title={m.title} description={m.description} href={m.href} icon={m.icon} />
        ))}
        {filteredModules.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">No modules match your search.</p>
        )}
      </div>
    </div>
  );
}
