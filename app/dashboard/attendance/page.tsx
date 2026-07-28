"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Attendance, Employee } from "@/lib/types";
import { todayStr } from "@/lib/csv";

export default function AttendancePage() {
  const [date, setDate] = useState(todayStr());
  const [staff, setStaff] = useState<Employee[]>([]);
  const [records, setRecords] = useState<Attendance[]>([]);

  useEffect(() => {
    getDocs(collection(getDb(), "employees")).then((snap) => {
      setStaff(
        snap.docs
          .filter((d) => (d.data().role as string) === "STAFF" || !d.data().role)
          .map((d) => ({
            id: d.id,
            name: d.data().name as string,
            phone: d.data().phone as string,
            joiningDate: "",
            monthlySalary: 0,
            attendancePercentage: 0,
            role: "STAFF" as const,
          }))
      );
    });
  }, []);

  useEffect(() => {
    async function load() {
      const snap = await getDocs(
        query(collection(getDb(), "attendance"), where("date", "==", date), orderBy("signInTime"))
      );
      setRecords(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: (data.id as string) || d.id,
            employeeId: data.employeeId as string,
            date: data.date as string,
            signInTime: data.signInTime as string | undefined,
            signOutTime: data.signOutTime as string | undefined,
            status: (data.status as string) || "ABSENT",
            lateMinutes: (data.lateMinutes as number) || 0,
            workingHours: (data.workingHours as number) || 0,
          };
        })
      );
    }
    load();
  }, [date]);

  const presentCount = records.filter((r) => r.status !== "ABSENT").length;
  const rate = staff.length ? Math.round((presentCount / staff.length) * 100) : 0;

  const byEmployee = new Map(records.map((r) => [r.employeeId, r]));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Staff Attendance</h1>
        <input className="input w-auto" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-slate-500">Staff</p><p className="text-2xl font-bold">{staff.length}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Present</p><p className="text-2xl font-bold">{presentCount}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Rate</p><p className="text-2xl font-bold">{rate}%</p></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2 pr-4">Employee</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Sign In</th>
              <th className="py-2 pr-4">Sign Out</th>
              <th className="py-2">Hours</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((e) => {
              const r = byEmployee.get(e.phone);
              return (
                <tr key={e.phone} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium">{e.name}</td>
                  <td className="py-3 pr-4">{r?.status || "ABSENT"}</td>
                  <td className="py-3 pr-4">{r?.signInTime || "—"}</td>
                  <td className="py-3 pr-4">{r?.signOutTime || "—"}</td>
                  <td className="py-3">{r?.workingHours?.toFixed(1) || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
