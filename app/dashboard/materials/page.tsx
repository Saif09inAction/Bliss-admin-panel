"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, deleteField, doc, getDocs, setDoc } from "firebase/firestore";
import { Package, Plus, Trash2, X } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { RawMaterial } from "@/lib/types";
import { formatRupee, uuid } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import BulkSelectBar, { SelectCheckbox } from "@/components/admin/BulkSelectBar";
import { useSelection } from "@/lib/use-selection";

export default function MaterialsPage() {
  const { session } = useAuth();
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function load() {
    const snap = await getDocs(collection(getDb(), "raw_materials"));
    setMaterials(
      snap.docs
        .map((d) => {
          const data = d.data();
          const priceNum = Number(data.price);
          return {
            id: (data.id as string) || d.id,
            name: (data.name as string) || "",
            quantity: (data.quantity as number) || 0,
            unit: (data.unit as string) || "pcs",
            minimumStock: (data.minimumStock as number) || 0,
            supplier: (data.supplier as string) || "",
            lastUpdatedBy: (data.lastUpdatedBy as string) || "",
            lastUpdatedTime: (data.lastUpdatedTime as number) || 0,
            price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
          };
        })
        .filter((m) => m.name.trim())
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  useEffect(() => {
    load();
  }, []);

  function openEdit(m: RawMaterial) {
    setEditing(m);
    setName(m.name);
    setPrice(m.price && m.price > 0 ? String(m.price) : "");
    setShowForm(true);
    setMessage("");
  }

  function openAdd() {
    setEditing(null);
    setName("");
    setPrice("");
    setShowForm(true);
    setMessage("");
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setName("");
    setPrice("");
  }

  async function saveMaterial(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage("Enter a material name.");
      return;
    }
    const duplicate = materials.some(
      (m) => m.name.toLowerCase() === trimmed.toLowerCase() && m.id !== editing?.id
    );
    if (duplicate) {
      setMessage("This material is already in the list.");
      return;
    }

    const priceNum = Number(price);
    const parsedPrice =
      price.trim() && Number.isFinite(priceNum) && priceNum > 0
        ? Math.round(priceNum * 100) / 100
        : undefined;

    setSaving(true);
    setMessage("");
    try {
      const id = editing?.id || uuid();
      const data: Record<string, unknown> = {
        id,
        name: trimmed,
        // Keep inventory fields for older records / overview — not edited here anymore.
        quantity: editing?.quantity ?? 0,
        unit: editing?.unit || "pcs",
        minimumStock: editing?.minimumStock ?? 0,
        supplier: editing?.supplier || "",
        lastUpdatedBy: session?.name || "Admin",
        lastUpdatedTime: Date.now(),
        imagePath: "",
        price: parsedPrice !== undefined ? parsedPrice : deleteField(),
      };
      await setDoc(doc(getDb(), "raw_materials", id), data, { merge: true });
      await load();
      closeForm();
      setMessage(editing ? `"${trimmed}" updated.` : `"${trimmed}" added.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save material.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMaterial(m: RawMaterial) {
    if (!confirm(`Delete "${m.name}" from materials?`)) return;
    await deleteDoc(doc(getDb(), "raw_materials", m.id));
    setMaterials((prev) => prev.filter((x) => x.id !== m.id));
    setMessage(`"${m.name}" removed.`);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => m.name.toLowerCase().includes(q));
  }, [materials, search]);

  const visibleIds = useMemo(() => filtered.map((m) => m.id), [filtered]);
  const selection = useSelection(visibleIds);

  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function deleteSelected() {
    const ids = selection.selectedIds;
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected material${ids.length === 1 ? "" : "s"}?`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map((id) => deleteDoc(doc(getDb(), "raw_materials", id))));
      setMaterials((prev) => prev.filter((x) => !ids.includes(x.id)));
      if (editing && ids.includes(editing.id)) closeForm();
      selection.clear();
      setMessage(`Deleted ${ids.length} material${ids.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to delete selected.");
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Materials"
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (showForm ? closeForm() : openAdd())}
          >
            {showForm ? (
              <>
                <X size={16} />
                Cancel
              </>
            ) : (
              <>
                <Plus size={16} />
                Add Material
              </>
            )}
          </button>
        }
      >
        <p className="section-sub">
          {materials.length} material{materials.length === 1 ? "" : "s"} · optional price fills on bill
        </p>
      </PageToolbar>

      <AdminSearchBar value={search} onChange={setSearch} placeholder="Search materials…" />

      {message && (
        <p className="rounded-xl bg-jade-soft px-3 py-2 text-sm text-jade-deep">{message}</p>
      )}

      <BulkSelectBar
        selectedCount={selection.selectedCount}
        totalVisible={visibleIds.length}
        allVisibleSelected={selection.allVisibleSelected}
        someVisibleSelected={selection.someVisibleSelected}
        onToggleAll={selection.toggleAllVisible}
        onClear={selection.clear}
        onDelete={() => void deleteSelected()}
        deleting={bulkDeleting}
        noun="material"
      />

      <div className={`grid gap-5 ${showForm ? "xl:grid-cols-[320px_1fr]" : ""}`}>
        {showForm && (
          <form onSubmit={saveMaterial} className="surface h-fit space-y-4 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                <Package size={16} />
              </div>
              <div>
                <h3 className="font-display text-base font-bold">
                  {editing ? "Edit Material" : "New Material"}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Price is optional — auto-fills on the bill when set
                </p>
              </div>
            </div>
            <div>
              <label className="label">Material name *</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Vinit, Badal, Board"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="label">Price / pc (₹) — optional</label>
              <input
                className="input"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Leave blank to enter price on bill"
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={saving}>
              {saving ? "Saving…" : editing ? "Update" : "Add Material"}
            </button>
          </form>
        )}

        <div className="data-table-wrap hidden min-w-0 lg:block">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10">
                    <SelectCheckbox
                      checked={selection.allVisibleSelected}
                      onChange={selection.toggleAllVisible}
                      label="Select all materials"
                    />
                  </th>
                  <th>Name</th>
                  <th className="text-right">Price / pc</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className={selection.isSelected(m.id) ? "bg-jade-soft/30" : undefined}>
                    <td>
                      <SelectCheckbox
                        checked={selection.isSelected(m.id)}
                        onChange={() => selection.toggle(m.id)}
                        label={`Select ${m.name}`}
                      />
                    </td>
                    <td className="font-medium">{m.name}</td>
                    <td className="text-right tabular-nums">
                      {m.price && m.price > 0 ? (
                        <span className="font-semibold text-jade-deep">{formatRupee(m.price)}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(m)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeMaterial(m)}>
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12">
              <Package size={24} className="text-[var(--text-faint)]" />
              <p className="text-sm text-[var(--text-muted)]">
                {search ? "No materials match." : "No materials yet."}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3 lg:hidden">
          {filtered.map((m) => (
            <div
              key={m.id}
              className={`record-card flex items-center gap-3 ${selection.isSelected(m.id) ? "ring-2 ring-jade/40" : ""}`}
            >
              <SelectCheckbox
                checked={selection.isSelected(m.id)}
                onChange={() => selection.toggle(m.id)}
                label={`Select ${m.name}`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {m.price && m.price > 0 ? `${formatRupee(m.price)} / pc` : "No price set"}
                </p>
              </div>
              <div className="flex gap-1">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(m)}>
                  Edit
                </button>
                <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => removeMaterial(m)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="card flex flex-col items-center gap-2 py-12">
              <Package size={24} className="text-[var(--text-faint)]" />
              <p className="text-sm text-[var(--text-muted)]">
                {search ? "No materials match." : "No materials yet."}
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
