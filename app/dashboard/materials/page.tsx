"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { AlertTriangle, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { RawMaterial } from "@/lib/types";
import { uuid } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

export default function MaterialsPage() {
  const { session } = useAuth();
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState({
    name: "",
    quantity: "",
    unit: "kg",
    minimumStock: "",
    supplier: "",
  });
  const [search, setSearch] = useState("");

  async function load() {
    const snap = await getDocs(collection(getDb(), "raw_materials"));
    setMaterials(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: (data.id as string) || d.id,
          name: data.name as string,
          quantity: (data.quantity as number) || 0,
          unit: (data.unit as string) || "",
          minimumStock: (data.minimumStock as number) || 0,
          supplier: (data.supplier as string) || "",
          lastUpdatedBy: (data.lastUpdatedBy as string) || "",
          lastUpdatedTime: (data.lastUpdatedTime as number) || 0,
        };
      }).sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  useEffect(() => {
    load();
  }, []);

  function openEdit(m: RawMaterial) {
    setEditing(m);
    setForm({
      name: m.name,
      quantity: String(m.quantity),
      unit: m.unit,
      minimumStock: String(m.minimumStock),
      supplier: m.supplier,
    });
    setShowForm(true);
  }

  function openAdd() {
    setEditing(null);
    setForm({ name: "", quantity: "", unit: "kg", minimumStock: "", supplier: "" });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm({ name: "", quantity: "", unit: "kg", minimumStock: "", supplier: "" });
  }

  async function saveMaterial(e: React.FormEvent) {
    e.preventDefault();
    const id = editing?.id || uuid();
    const data = {
      id,
      name: form.name.trim(),
      quantity: Number(form.quantity) || 0,
      unit: form.unit,
      minimumStock: Number(form.minimumStock) || 0,
      supplier: form.supplier.trim(),
      lastUpdatedBy: session?.name || "Admin",
      lastUpdatedTime: Date.now(),
      imagePath: "",
    };
    await setDoc(doc(getDb(), "raw_materials", id), data);
    setShowForm(false);
    setEditing(null);
    setForm({ name: "", quantity: "", unit: "kg", minimumStock: "", supplier: "" });
    load();
  }

  async function removeMaterial(id: string) {
    if (!confirm("Delete this material?")) return;
    await deleteDoc(doc(getDb(), "raw_materials", id));
    load();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.unit.toLowerCase().includes(q) ||
        m.supplier.toLowerCase().includes(q)
    );
  }, [materials, search]);

  const lowStockCount = useMemo(
    () => materials.filter((m) => m.quantity <= m.minimumStock).length,
    [materials]
  );

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Raw Materials"
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (showForm ? closeForm() : openAdd())}
          >
            {showForm ? (
              "Cancel"
            ) : (
              <>
                <Plus size={16} />
                Add Material
              </>
            )}
          </button>
        }
      >
        <p className="text-sm text-[var(--text-muted)]">
          {materials.length} material{materials.length === 1 ? "" : "s"}
          {lowStockCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-danger">
              <AlertTriangle size={13} />
              {lowStockCount} low stock
            </span>
          )}
        </p>
      </PageToolbar>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search materials by name, unit, supplier..."
      />

      <div className={`grid gap-5 ${showForm ? "xl:grid-cols-[360px_1fr]" : ""}`}>
        {showForm && (
          <form onSubmit={saveMaterial} className="surface h-fit p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                <Package size={16} />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-ink">
                  {editing ? "Edit Material" : "New Material"}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {editing ? "Update stock details" : "Add to inventory"}
                </p>
              </div>
            </div>
            <div className="grid gap-3">
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Quantity</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input
                    className="input"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">Minimum Stock</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={form.minimumStock}
                  onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Supplier</label>
                <input
                  className="input"
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-primary w-full">
                {editing ? "Update Material" : "Save Material"}
              </button>
            </div>
          </form>
        )}

        <div className="data-table-wrap min-w-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Quantity</th>
                  <th>Min Stock</th>
                  <th>Supplier</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const low = m.quantity <= m.minimumStock;
                  return (
                    <tr key={m.id} className={low ? "low-stock" : undefined}>
                      <td>
                        <div className="flex items-center gap-2">
                          {low && <AlertTriangle size={14} className="shrink-0 text-danger" />}
                          <span className="font-medium">{m.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className={low ? "font-semibold text-danger" : ""}>
                          {m.quantity} {m.unit}
                        </span>
                      </td>
                      <td className="text-[var(--text-muted)]">{m.minimumStock}</td>
                      <td className="text-[var(--text-muted)]">{m.supplier || "—"}</td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => openEdit(m)}
                          >
                            <Pencil size={14} />
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => removeMaterial(m.id)}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12">
              <Package size={24} className="text-[var(--text-faint)]" />
              <p className="text-sm text-[var(--text-muted)]">
                {search ? "No materials match your search." : "No materials yet."}
              </p>
              {!showForm && !search && (
                <button type="button" className="btn btn-primary btn-sm mt-1" onClick={openAdd}>
                  <Plus size={14} />
                  Add first material
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
