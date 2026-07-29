"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { motion } from "framer-motion";
import {
  HardHat,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { Employee, Role } from "@/lib/types";
import { todayStr } from "@/lib/csv";
import { deleteWorkerAndPersonalData } from "@/lib/delete-worker";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import PageToolbar from "@/components/admin/PageToolbar";
import WorkerProfilePanel from "@/components/WorkerProfilePanel";
import { useRouter } from "next/navigation";

type FormMode = "closed" | "staff" | "kaariger" | "edit";

const emptyForm = {
  name: "",
  phone: "",
  password: "",
  monthlySalary: "",
  joiningDate: todayStr(),
};

function WorkerAvatar({ name }: { name: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jade-soft font-display text-sm font-bold text-jade-deep">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={role === "KAARIGER" ? "badge badge-gold" : "badge badge-success"}>
      {role === "KAARIGER" ? "Kaariger" : "Staff"}
    </span>
  );
}

export default function WorkersPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filter, setFilter] = useState<"ALL" | Role>("ALL");
  const [search, setSearch] = useState("");
  const [formMode, setFormMode] = useState<FormMode>("closed");
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [profileEmployee, setProfileEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(getDb(), "employees"), (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: (data.id as string) || d.id,
          name: data.name as string,
          phone: data.phone as string,
          joiningDate: (data.joiningDate as string) || "",
          monthlySalary: (data.monthlySalary as number) || 0,
          attendancePercentage: (data.attendancePercentage as number) || 0,
          role: ((data.role as Role) || "STAFF") as Role,
        };
      });
      setEmployees(list.sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => unsub();
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
        joiningDate: formMode === "kaariger" ? "" : form.joiningDate,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save worker.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEmployee(phone: string) {
    if (
      !confirm(
        "Delete this worker? Their attendance, payments, and profile will also be removed. They will be logged out of the app."
      )
    ) {
      return;
    }
    try {
      await deleteWorkerAndPersonalData(phone);
      if (profileEmployee?.phone === phone) setProfileEmployee(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete worker.");
    }
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
    <div className="space-y-5">
      <PageToolbar
        title="Workers"
        actions={
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={openStaffForm}>
              <UserPlus size={15} />
              Staff
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={openKaarigerForm}>
              <HardHat size={15} />
              Kaariger
            </button>
          </>
        }
      >
        <p className="section-sub flex items-center gap-1.5">
          <Users size={14} className="text-[var(--text-muted)]" />
          <span>
            <span className="font-semibold text-jade-deep">{staffCount}</span> staff ·{" "}
            <span className="font-semibold text-jade-deep">{kaarigerCount}</span> kaarigers
          </span>
        </p>
      </PageToolbar>

      <div className="surface space-y-4 p-4 sm:p-5">
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
              className={`filter-pill ${filter === f ? "active" : ""}`}
            >
              {f === "ALL" ? "All" : f === "STAFF" ? "Staff" : "Kaarigers"}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Mobile</th>
              <th>Role</th>
              <th>Salary</th>
              <th>Joined</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr
                key={e.phone}
                className="cursor-pointer"
                onClick={() => setProfileEmployee(e)}
              >
                <td>
                  <div className="flex items-center gap-3">
                    <WorkerAvatar name={e.name} />
                    <span className="font-semibold capitalize">{e.name}</span>
                  </div>
                </td>
                <td className="text-[var(--text-muted)]">{e.phone}</td>
                <td>
                  <RoleBadge role={e.role} />
                </td>
                <td>
                  {e.role === "KAARIGER" ? (
                    <span className="text-[var(--text-faint)]">—</span>
                  ) : (
                    <span className="font-medium">₹{e.monthlySalary.toLocaleString("en-IN")}</span>
                  )}
                </td>
                <td className="text-[var(--text-muted)]">{e.joiningDate || "—"}</td>
                <td className="text-right">
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="btn-icon !h-8 !w-8"
                      onClick={() => openEdit(e)}
                      aria-label="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn-icon !h-8 !w-8 hover:!border-danger hover:!bg-red-50 hover:!text-danger"
                      onClick={() => removeEmployee(e.phone)}
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-[var(--text-muted)]">
            {search ? "No workers match your search." : "No workers yet. Add staff or kaariger above."}
          </p>
        )}
      </div>

      {/* Card grid — mobile & tablet */}
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:hidden">
        {filtered.map((e, i) => (
          <motion.div
            key={e.phone}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="worker-card flex-col !items-stretch !gap-3"
            onClick={() => setProfileEmployee(e)}
            role="button"
            tabIndex={0}
            onKeyDown={(ev) => ev.key === "Enter" && setProfileEmployee(e)}
          >
            <div className="flex items-start gap-3">
              <WorkerAvatar name={e.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display font-bold capitalize">{e.name}</p>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">{e.phone}</p>
                  </div>
                  <RoleBadge role={e.role} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
              <p className="text-xs text-[var(--text-muted)]">
                {e.role === "KAARIGER"
                  ? "Production worker"
                  : `₹${e.monthlySalary.toLocaleString("en-IN")}/mo`}
              </p>
              <div className="flex gap-2" onClick={(ev) => ev.stopPropagation()}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm !px-2"
                  onClick={() => openEdit(e)}
                >
                  <Pencil size={13} />
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm !px-2"
                  onClick={() => removeEmployee(e.phone)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        {filtered.length === 0 && (
          <div className="surface col-span-full py-12 text-center sm:col-span-2">
            <p className="text-sm text-[var(--text-muted)]">
              {search ? "No workers match your search." : "No workers yet. Add staff or kaariger above."}
            </p>
          </div>
        )}
      </div>

      {/* Add / edit form modal */}
      {formMode !== "closed" && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={closeForm}
            aria-hidden
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <form
              onSubmit={saveEmployee}
              className="surface w-full max-w-lg space-y-5 p-5 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold">{formTitle}</h2>
                  {formMode === "kaariger" && (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Logs in via the <strong className="text-[var(--text)]">Kaariger</strong> tab in the mobile app.
                    </p>
                  )}
                  {formMode === "staff" && (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Logs in via the <strong className="text-[var(--text)]">Staff</strong> tab in the mobile app.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-icon !h-9 !w-9 shrink-0"
                  onClick={closeForm}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
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
                {(formMode === "staff" || (formMode === "edit" && editingPhone && employees.find((e) => e.phone === editingPhone)?.role === "STAFF")) && (
                  <div>
                    <label className="label">Joining Date</label>
                    <input
                      className="input"
                      type="date"
                      value={form.joiningDate}
                      onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" className="btn btn-secondary flex-1" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : formMode === "edit"
                      ? "Update Worker"
                      : formMode === "kaariger"
                        ? "Create Kaariger"
                        : "Create Staff"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {profileEmployee && (
        <WorkerProfilePanel
          employee={profileEmployee}
          onClose={() => setProfileEmployee(null)}
          onPaySalary={() => {
            setProfileEmployee(null);
            router.push("/dashboard/salary");
          }}
        />
      )}
    </div>
  );
}
