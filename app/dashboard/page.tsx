"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { todayStr } from "@/lib/csv";
import { useAuth } from "@/lib/auth-context";
import { ADMIN_MODULES, greeting } from "@/lib/navigation";
import { ModuleCard, SectionHeader, StatCard } from "@/components/admin/DashboardCards";

export default function DashboardPage() {
  const { session } = useAuth();
  const [stats, setStats] = useState({
    workers: 0,
    attendanceRate: "0%",
    lowStock: 0,
    pendingDues: "₹0",
    pendingOrders: 0,
  });

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

      // Rough pending salary estimate from payments
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

  return (
    <div className="space-y-4">
      {/* Hero — matches Android admin dashboard */}
      <div className="admin-hero">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#C1E8FF]/80">
          {greeting()}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-white">
          {session?.name || "Administrator"}
        </h2>
        <p className="mt-1 text-sm text-[#C1E8FF]/90">Admin Control Center</p>
        <div className="mt-4 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs text-white/90">
          Laiza Bags Operations
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Total Workers" value={stats.workers} icon="groups" />
        <StatCard title="Today's Attendance" value={stats.attendanceRate} icon="calendar" />
        <StatCard title="Low Stock Alerts" value={stats.lowStock} icon="inventory" />
        <StatCard title="Pending Dues" value={stats.pendingDues} icon="orders" />
      </div>

      {/* Quick modules grid */}
      <SectionHeader
        title="Management Modules"
        subtitle="Tap a module to manage operations"
      />
      <div className="grid grid-cols-2 gap-3">
        {ADMIN_MODULES.map((m) => (
          <ModuleCard key={m.href} {...m} />
        ))}
      </div>

      {/* Active orders banner */}
      {stats.pendingOrders > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            {stats.pendingOrders} active kaariger order{stats.pendingOrders > 1 ? "s" : ""}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Orders awaiting delivery or staff approval
          </p>
        </div>
      )}
    </div>
  );
}
