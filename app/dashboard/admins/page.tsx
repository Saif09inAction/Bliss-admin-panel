"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { Pencil, Plus, Shield, Trash2, X } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

type AdminAccount = {
  phone: string;
  name: string;
  /** Never show raw password in list after save; only used when creating/editing */
  hasPassword: boolean;
};

const emptyForm = { phone: "", name: "", password: "" };

export default function AdminsPage() {
  const { session } = useAuth();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPhone, setEditPhone] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(getDb(), "admins"));
      setAdmins(
        snap.docs
          .map((d) => {
            const data = d.data();
            return {
              phone: d.id,
              name: (data.name as string) || `Admin ${d.id}`,
              hasPassword: Boolean(data.password),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter(
      (a) => a.name.toLowerCase().includes(q) || a.phone.includes(q)
    );
  }, [admins, search]);

  function openCreate() {
    setEditPhone(null);
    setForm(emptyForm);
    setError("");
    setMsg("");
    setShowForm(true);
  }

  function openEdit(admin: AdminAccount) {
    setEditPhone(admin.phone);
    setForm({ phone: admin.phone, name: admin.name, password: "" });
    setError("");
    setMsg("");
    setShowForm(true);
  }

  async function saveAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const phone = form.phone.trim();
    const name = form.name.trim();
    const password = form.password.trim();

    if (!phone || !name) {
      setError("Name and mobile are required.");
      return;
    }
    if (!/^\d{10}$/.test(phone) && !editPhone) {
      setError("Enter a 10-digit mobile number.");
      return;
    }
    if (!editPhone && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (editPhone && password && password.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    try {
      const id = editPhone || phone;
      const payload: Record<string, string> = { name, phone: id };
      if (password) payload.password = password;
      else if (!editPhone) payload.password = password;

      // Creating: require password (already validated). Editing: only set if provided.
      if (!editPhone) {
        await setDoc(doc(getDb(), "admins", id), {
          name,
          phone: id,
          password,
          createdAt: Date.now(),
          createdBy: session?.phone || "admin",
        });
      } else {
        const data: Record<string, unknown> = {
          name,
          phone: id,
          updatedAt: Date.now(),
        };
        if (password) data.password = password;
        await setDoc(doc(getDb(), "admins", id), data, { merge: true });
      }

      setShowForm(false);
      setMsg(editPhone ? "Admin updated." : "Admin created. They can log in with this mobile & password.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save admin.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAdmin(admin: AdminAccount) {
    if (admin.phone === session?.phone) {
      setError("You cannot delete the account you are signed in with.");
      return;
    }
    if (admins.length <= 1) {
      setError("Keep at least one admin account.");
      return;
    }
    if (!confirm(`Delete admin "${admin.name}" (${admin.phone})? They will no longer be able to sign in.`)) {
      return;
    }
    try {
      await deleteDoc(doc(getDb(), "admins", admin.phone));
      setMsg(`Removed ${admin.name}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete admin.");
    }
  }

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Admins"
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            New admin
          </button>
        }
      >
        <p className="section-sub">Create logins for the operations studio</p>
      </PageToolbar>

      <AdminSearchBar value={search} onChange={setSearch} placeholder="Search by name or mobile…" />

      {(msg || error) && (
        <p
          className={`rounded-xl px-4 py-3 text-sm ${
            error ? "bg-red-50 text-danger" : "bg-jade-soft text-jade-deep"
          }`}
        >
          {error || msg}
        </p>
      )}

      {loading ? (
        <div className="surface py-14 text-center text-sm text-[var(--text-muted)]">Loading…</div>
      ) : (
        <>
          <div className="hidden lg:block data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Mobile</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.phone}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-jade-soft text-jade-deep">
                          <Shield size={16} />
                        </div>
                        <div>
                          <p className="font-semibold capitalize">{a.name}</p>
                          {a.phone === session?.phone && (
                            <p className="text-xs text-jade-deep">You</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-[var(--text-muted)]">{a.phone}</td>
                    <td>
                      <span className="badge badge-success">Active</span>
                    </td>
                    <td className="text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          className="btn-icon !h-8 !w-8"
                          onClick={() => openEdit(a)}
                          aria-label="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon !h-8 !w-8 !text-danger"
                          onClick={() => removeAdmin(a)}
                          aria-label="Delete"
                          disabled={a.phone === session?.phone}
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
              <p className="py-12 text-center text-sm text-[var(--text-muted)]">No admins found.</p>
            )}
          </div>

          <div className="space-y-3 lg:hidden">
            {filtered.map((a) => (
              <div key={a.phone} className="surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-jade-soft text-jade-deep">
                      <Shield size={18} />
                    </div>
                    <div>
                      <p className="font-semibold capitalize">{a.name}</p>
                      <p className="text-sm text-[var(--text-muted)]">{a.phone}</p>
                      {a.phone === session?.phone && (
                        <p className="text-xs text-jade-deep">Signed in as you</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openEdit(a)}>
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn-icon !h-8 !w-8 !text-danger"
                      onClick={() => removeAdmin(a)}
                      disabled={a.phone === session?.phone}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="py-12 text-center text-sm text-[var(--text-muted)]">No admins found.</p>
            )}
          </div>
        </>
      )}

      {showForm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
            aria-hidden
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={saveAdmin}
              className="surface w-full max-w-md space-y-4 p-5 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-bold">
                    {editPhone ? "Edit admin" : "New admin"}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    They sign in at the admin login with mobile + password
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-icon !h-9 !w-9"
                  onClick={() => setShowForm(false)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div>
                <label className="label">Name *</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Admin name"
                  required
                />
              </div>
              <div>
                <label className="label">Mobile *</label>
                <input
                  className="input"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="10-digit mobile"
                  required
                  disabled={!!editPhone}
                />
              </div>
              <div>
                <label className="label">
                  {editPhone ? "New password (optional)" : "Password *"}
                </label>
                <input
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editPhone ? "Leave blank to keep current" : "Min 6 characters"}
                  minLength={editPhone ? undefined : 6}
                  required={!editPhone}
                  autoComplete="new-password"
                />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
                  {saving ? "Saving…" : editPhone ? "Save changes" : "Create admin"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
