"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { todayStr } from "@/lib/csv";
import Link from "next/link";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    workers: 0,
    kaarigers: 0,
    lowStock: 0,
    pendingOrders: 0,
    attendanceToday: "0%",
  });

  useEffect(() => {
    async function load() {
      const db = getDb();
      const [employees, materials, orders, attendance] = await Promise.all([
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "raw_materials")),
        getDocs(collection(db, "kaariger_orders")),
        getDocs(query(collection(db, "attendance"), where("date", "==", todayStr()))),
      ]);

      const staffList = employees.docs.filter((d) => {
        const role = d.data().role as string;
        return role === "STAFF" || !role;
      });

      const kaarigerCount = employees.docs.filter((d) => d.data().role === "KAARIGER").length;
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

      setStats({
        workers: staffList.length,
        kaarigers: kaarigerCount,
        lowStock,
        pendingOrders: pending,
        attendanceToday: `${rate}%`,
      });
    }
    load();
  }, []);

  const cards = [
    { label: "Staff", value: stats.workers, href: "/dashboard/workers" },
    { label: "Kaarigers", value: stats.kaarigers, href: "/dashboard/workers" },
    { label: "Low Stock Items", value: stats.lowStock, href: "/dashboard/materials" },
    { label: "Active Orders", value: stats.pendingOrders, href: "/dashboard/orders" },
    { label: "Today's Attendance", value: stats.attendanceToday, href: "/dashboard/attendance" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-navy">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card hover:border-navy-light">
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-2 text-3xl font-bold text-navy">{c.value}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
