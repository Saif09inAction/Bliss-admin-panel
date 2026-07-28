"use client";

import { useEffect, useMemo, useState } from "react";
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
import AdminSearchBar from "@/components/admin/AdminSearchBar";

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
  const [search, setSearch] = useState("");
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      const matchFilter = filter === "ALL" || e.role === filter;
      const matchSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.phone.includes(q) ||
        e.role.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [employees, filter, search]);

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
    <div className="space-y-4">
      <div className="page-toolbar">
        <div className="page-toolbar-row">
          <p className="page-toolbar-meta">
            <span className="font-bold text-[var(--bliss-green-dark)]">{staffCount}</span> staff ·{" "}
            <span className="font-bold text-[var(--bliss-green-dark)]">{kaarigerCount}</span> kaarigers
          </p>
          <div className="page-toolbar-actions">
            <button type="button" className="btn-primary" onClick={openStaffForm}>
              + Staff
            </button>
            <button type="button" className="btn-gold" onClick={openKaarigerForm}>
              + Kaariger
            </button>
          </div>
        </div>
        <AdminSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by name or mobile..."
        />
        <div className="flex flex-wrap gap-2">
          {(["ALL", "STAFF", "KAARIGER"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`filter-pill ${filter === f ? "filter-pill-active" : ""}`}
            >
              {f === "ALL" ? "All" : f === "STAFF" ? "Staff" : "Kaarigers"}
            </button>
          ))}
        </div>
      </div>

      {formMode !== "closed" && (
        <form onSubmit={saveEmployee} className="card space-y-4 panel-slide">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--bliss-dark)]">{formTitle}</h2>
            <button type="button" className="text-sm text-slate-500" onClick={closeForm}>
              Cancel
            </button>
          </div>

          {formMode === "kaariger" && (
            <p className="rounded-xl bg-[var(--bliss-green-surface)] px-3 py-2 text-sm text-[var(--bliss-green-dark)]">
              Kaariger logs in via the <strong>Kaariger</strong> tab in the mobile app.
            </p>
          )}
          {formMode === "staff" && (
            <p className="rounded-xl bg-[var(--bliss-green-surface)] px-3 py-2 text-sm text-[var(--bliss-green-dark)]">
              Staff logs in via the <strong>Staff</strong> tab in the mobile app.
            </p>
          )}

          <div className="grid gap-3">
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
                {formMode === "edit" ? "New Password (optional)" : "Password"}
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

          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? "Saving..." : formMode === "edit" ? "Update Worker" : formMode === "kaariger" ? "Create Kaariger" : "Create Staff"}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((e) => (
          <div key={e.phone} className="worker-card">
            <div className="flex items-start gap-3">
              <div className="worker-avatar">{e.name.charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold capitalize text-[var(--bliss-dark)]">{e.name}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{e.phone}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      e.role === "KAARIGER"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-[var(--bliss-green-surface)] text-[var(--bliss-green-dark)]"
                    }`}
                  >
                    {e.role === "KAARIGER" ? "Kaariger" : "Staff"}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">
                    {e.role === "KAARIGER" ? "Production worker" : `Salary: ₹${e.monthlySalary.toLocaleString("en-IN")}`}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="text-xs font-bold text-[var(--bliss-green)]"
                      onClick={() => openEdit(e)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-xs font-bold text-red-600"
                      onClick={() => removeEmployee(e.phone)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="card py-10 text-center">
            <p className="text-sm text-slate-500">
              {search ? "No workers match your search." : "No workers yet. Add staff or kaariger above."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
