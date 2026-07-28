"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Employee, Role } from "@/lib/types";
import { todayStr } from "@/lib/csv";

type FormMode = "closed" | "staff" | "kaariger" | "edit";

const emptyForm = {
  name: "",
  phone: "",
  password: "",
  monthlySalary: "",
  joiningDate: todayStr(),
};

export default function WorkersPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filter, setFilter] = useState<"ALL" | Role>("ALL");
  const [formMode, setFormMode] = useState<FormMode>("closed");
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const snap = await getDocs(collection(getDb(), "employees"));
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: (data.id as string) || d.id,
        name: data.name as string,
        phone: data.phone as string,
        joiningDate: data.joiningDate as string,
        monthlySalary: (data.monthlySalary as number) || 0,
        attendancePercentage: (data.attendancePercentage as number) || 0,
        role: ((data.role as Role) || "STAFF") as Role,
      };
    });
    setEmployees(list.sort((a, b) => a.name.localeCompare(b.name)));
  }

  useEffect(() => {
    load();
  }, []);

  function openStaffForm() {
    setFormMode("staff");
    setEditingPhone(null);
    setForm(emptyForm);
    setError("");
  }

  function openKaarigerForm() {
    setFormMode("kaariger");
    setEditingPhone(null);
    setForm(emptyForm);
    setError("");
  }

  function openEdit(employee: Employee) {
    setFormMode("edit");
    setEditingPhone(employee.phone);
    setForm({
      name: employee.name,
      phone: employee.phone,
      password: "",
      monthlySalary: String(employee.monthlySalary || ""),
      joiningDate: employee.joiningDate || todayStr(),
    });
    setError("");
  }

  function closeForm() {
    setFormMode("closed");
    setEditingPhone(null);
    setForm(emptyForm);
    setError("");
  }

  async function saveEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const phone = form.phone.trim();
    const name = form.name.trim();
    const password = form.password.trim();

    if (!name || !phone) {
      setError("Name and mobile number are required.");
      return;
    }

    const isNew = formMode === "staff" || formMode === "kaariger";
    if (isNew && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (formMode === "edit" && password && password.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    const existing = employees.find((e) => e.phone === phone);
    if (isNew && existing) {
      setError("This mobile number is already registered.");
      return;
    }

    setSaving(true);
    try {
      const role: Role = formMode === "kaariger" ? "KAARIGER" : existing?.role || "STAFF";
      const existingDoc = existing || employees.find((e) => e.phone === editingPhone);

      const data: Record<string, unknown> = {
        id: phone,
        name,
        phone,
        joiningDate: form.joiningDate,
        monthlySalary: formMode === "kaariger" ? 0 : Number(form.monthlySalary) || 0,
        profilePhotoUrl: "",
        attendancePercentage: existingDoc?.attendancePercentage ?? 0,
        role: formMode === "edit" ? existingDoc?.role || "STAFF" : role,
      };

      if (isNew || password) {
        data.password = password;
      }

      await setDoc(doc(getDb(), "employees", phone), data, { merge: formMode === "edit" });

      if (formMode === "edit" && editingPhone && editingPhone !== phone) {
        await deleteDoc(doc(getDb(), "employees", editingPhone));
      }

      closeForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save worker.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEmployee(phone: string) {
    if (!confirm("Delete this worker? They will no longer be able to login.")) return;
    await deleteDoc(doc(getDb(), "employees", phone));
    load();
  }

  const filtered = employees.filter((e) => filter === "ALL" || e.role === filter);
  const staffCount = employees.filter((e) => e.role === "STAFF").length;
  const kaarigerCount = employees.filter((e) => e.role === "KAARIGER").length;

  const formTitle =
    formMode === "staff"
      ? "Add Staff"
      : formMode === "kaariger"
        ? "Add Kaariger"
        : formMode === "edit"
          ? "Edit Worker"
          : "";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {staffCount} staff · {kaarigerCount} kaarigers
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={openStaffForm}>
            + Add Staff
          </button>
          <button
            className="rounded-lg bg-navy-light px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            onClick={openKaarigerForm}
          >
            + Add Kaariger
          </button>
        </div>
      </div>

      {formMode !== "closed" && (
        <form onSubmit={saveEmployee} className="card mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">{formTitle}</h2>
            <button type="button" className="text-sm text-slate-500 hover:text-slate-700" onClick={closeForm}>
              Cancel
            </button>
          </div>

          {formMode === "kaariger" && (
            <p className="rounded-lg bg-ice/40 px-3 py-2 text-sm text-navy">
              Kaariger will login in the app using <strong>Kaariger</strong> tab with this mobile number and password.
            </p>
          )}
          {formMode === "staff" && (
            <p className="rounded-lg bg-ice/40 px-3 py-2 text-sm text-navy">
              Staff will login in the app using <strong>Staff</strong> tab with this mobile number and password.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Full Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Worker name"
                required
              />
            </div>
            <div>
              <label className="label">Mobile Number (Login ID)</label>
              <input
                className="input"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="10-digit mobile"
                required
                readOnly={formMode === "edit"}
              />
            </div>
            <div>
              <label className="label">
                {formMode === "edit" ? "New Password (leave blank to keep current)" : "Password"}
              </label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min 6 characters"
                required={formMode !== "edit"}
                minLength={formMode === "edit" ? undefined : 6}
              />
            </div>
            {formMode === "staff" && (
              <div>
                <label className="label">Monthly Salary (₹)</label>
                <input
                  className="input"
                  type="number"
                  value={form.monthlySalary}
                  onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            )}
            <div>
              <label className="label">Joining Date</label>
              <input
                className="input"
                type="date"
                value={form.joiningDate}
                onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving..." : formMode === "edit" ? "Update Worker" : formMode === "kaariger" ? "Create Kaariger" : "Create Staff"}
          </button>
        </form>
      )}

      <div className="mb-4 flex gap-2">
        {(["ALL", "STAFF", "KAARIGER"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? "bg-navy text-white" : "bg-slate-200 text-slate-700"}`}
          >
            {f === "ALL" ? "All" : f === "STAFF" ? "Staff" : "Kaarigers"}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Mobile (Login)</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Salary</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.phone} className="border-b border-slate-100">
                <td className="py-3 pr-4 font-medium">{e.name}</td>
                <td className="py-3 pr-4">{e.phone}</td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      e.role === "KAARIGER" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {e.role === "KAARIGER" ? "Kaariger" : "Staff"}
                  </span>
                </td>
                <td className="py-3 pr-4">{e.role === "KAARIGER" ? "—" : `₹${e.monthlySalary}`}</td>
                <td className="py-3 space-x-3">
                  <button className="text-navy-light text-xs font-semibold" onClick={() => openEdit(e)}>
                    Edit / Reset Password
                  </button>
                  <button className="text-red-600 text-xs font-semibold" onClick={() => removeEmployee(e.phone)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-6 text-center text-slate-500">
            No workers yet. Use &quot;Add Staff&quot; or &quot;Add Kaariger&quot; above.
          </p>
        )}
      </div>
    </div>
  );
}
