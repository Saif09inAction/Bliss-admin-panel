"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { Boxes, Package, Palette, Pencil, Plus, Trash2, X } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { FinishedProduct } from "@/lib/types";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

function formatUpdated(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const emptyForm = { name: "", color: "", quantity: "", unitPrice: "" };

export default function InventoryPage() {
  const { session } = useAuth();
  const [products, setProducts] = useState<FinishedProduct[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedSku, setSelectedSku] = useState<{
    key: string;
    displayName: string;
    totalQty: number;
    totalValue: number;
    colors: { color: string; quantity: number; ids: string[]; unitPrice: number }[];
  } | null>(null);
  const [editProduct, setEditProduct] = useState<FinishedProduct | null>(null);
  const [editForm, setEditForm] = useState({ name: "", color: "", quantity: "", unitPrice: "" });

  useEffect(() => {
    const unsub = onSnapshot(collection(getDb(), "finished_products"), (snap) => {
      setProducts(
        snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              name: data.name as string,
              quantity: (data.quantity as number) || 0,
              color: (data.color as string) || "",
              unitPrice: (data.unitPrice as number) || 0,
              lastUpdatedBy: (data.lastUpdatedBy as string) || "",
              lastUpdatedTime: (data.lastUpdatedTime as number) || 0,
              orderId: data.orderId as string | undefined,
            };
          })
          .sort((a, b) => {
            const byName = a.name.localeCompare(b.name);
            if (byName !== 0) return byName;
            return a.color.localeCompare(b.color);
          })
      );
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q) ||
        p.lastUpdatedBy.toLowerCase().includes(q)
    );
  }, [products, search]);

  type SkuGroup = {
    key: string;
    displayName: string;
    totalQty: number;
    totalValue: number;
    colors: { color: string; quantity: number; ids: string[]; unitPrice: number }[];
  };

  const skuGroups = useMemo((): SkuGroup[] => {
    const map = new Map<string, FinishedProduct[]>();
    for (const p of filtered) {
      const key = p.name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries())
      .map(([, list]) => {
        const colorMap = new Map<string, FinishedProduct[]>();
        for (const p of list) {
          const ck = p.color.trim().toLowerCase();
          if (!colorMap.has(ck)) colorMap.set(ck, []);
          colorMap.get(ck)!.push(p);
        }
        const colors = Array.from(colorMap.entries()).map(([, rows]) => ({
          color: rows[0].color || "No colour",
          quantity: rows.reduce((s, r) => s + r.quantity, 0),
          ids: rows.map((r) => r.id),
          unitPrice: rows[0].unitPrice,
        }));
        return {
          key: list[0].name.trim().toLowerCase(),
          displayName: list[0].name,
          totalQty: colors.reduce((s, c) => s + c.quantity, 0),
          totalValue: list.reduce((s, p) => s + p.quantity * p.unitPrice, 0),
          colors: colors.sort((a, b) => a.color.localeCompare(b.color)),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [filtered]);

  function openEdit(p: FinishedProduct) {
    setEditProduct(p);
    setEditForm({
      name: p.name,
      color: p.color,
      quantity: String(p.quantity),
      unitPrice: String(p.unitPrice || ""),
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editProduct) return;
    const name = editForm.name.trim();
    const color = editForm.color.trim();
    const quantity = Number(editForm.quantity);
    const unitPrice = Number(editForm.unitPrice) || 0;
    if (!name || !Number.isFinite(quantity) || quantity < 0) {
      alert("Valid name and quantity required.");
      return;
    }
    await setDoc(
      doc(getDb(), "finished_products", editProduct.id),
      {
        ...editProduct,
        name,
        color,
        quantity,
        unitPrice,
        lastUpdatedBy: session?.name || "Admin",
        lastUpdatedTime: Date.now(),
      },
      { merge: true }
    );
    setEditProduct(null);
  }

  const totalQty = filtered.reduce((s, p) => s + p.quantity, 0);
  const totalValue = filtered.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
  const uniqueColors = useMemo(
    () => new Set(filtered.filter((p) => p.color).map((p) => p.color)).size,
    [filtered]
  );

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = form.name.trim();
    const color = form.color.trim();
    const quantity = Number(form.quantity);
    const unitPrice = Number(form.unitPrice) || 0;
    if (!name) {
      setError("Product name is required.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }

    setSaving(true);
    try {
      const existing = products.find(
        (p) =>
          p.name.toLowerCase() === name.toLowerCase() &&
          p.color.toLowerCase() === color.toLowerCase()
      );
      const now = Date.now();
      const updatedBy = session?.name || "Admin";

      if (existing) {
        const updated = {
          ...existing,
          quantity: existing.quantity + quantity,
          unitPrice: unitPrice > 0 ? unitPrice : existing.unitPrice,
          lastUpdatedBy: updatedBy,
          lastUpdatedTime: now,
        };
        await setDoc(doc(getDb(), "finished_products", existing.id), updated, { merge: true });
      } else {
        const id = crypto.randomUUID();
        const product: FinishedProduct = {
          id,
          name,
          color,
          quantity,
          unitPrice: Math.max(0, unitPrice),
          lastUpdatedBy: updatedBy,
          lastUpdatedTime: now,
        };
        await setDoc(doc(getDb(), "finished_products", id), product);
      }
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add inventory.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct(product: FinishedProduct) {
    if (
      !confirm(
        `Delete "${product.name}${product.color ? ` (${product.color})` : ""}" from inventory? This cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingId(product.id);
    try {
      await deleteDoc(doc(getDb(), "finished_products", product.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="stagger space-y-5">
      <PageToolbar
        title="Store Inventory"
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Plus size={15} />
            Add inventory
          </button>
        }
      >
        <p className="section-sub">
          {totalQty.toLocaleString("en-IN")} units · {skuGroups.length} SKU
          {skuGroups.length === 1 ? "" : "s"}
        </p>
      </PageToolbar>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search products by name, color, staff..."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--jade-soft)]">
              <Boxes className="h-5 w-5 text-[var(--jade-deep)]" />
            </div>
            <div>
              <p className="stat-card-label">Total Units</p>
              <p className="stat-card-value">{totalQty.toLocaleString("en-IN")}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bronze-soft)]">
              <Package className="h-5 w-5 text-[#8a6a35]" />
            </div>
            <div>
              <p className="stat-card-label">Stock Value</p>
              <p className="stat-card-value">₹{totalValue.toLocaleString("en-IN")}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-mist)]">
              <Palette className="h-5 w-5 text-[var(--text-muted)]" />
            </div>
            <div>
              <p className="stat-card-label">Color Variants</p>
              <p className="stat-card-value">{uniqueColors}</p>
            </div>
          </div>
        </div>
      </div>

      {/* SKU grouped list — click for colour breakdown */}
      <div>
        <p className="mobile-section-label">SKUs · same spelling merges (case ignored)</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {skuGroups.map((g) => (
            <button
              key={g.key}
              type="button"
              className="mobile-card text-left transition hover:border-[var(--jade)]"
              onClick={() => setSelectedSku(g)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display font-bold">{g.displayName}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {g.colors.length} colour{g.colors.length === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="font-display text-xl font-bold">{g.totalQty.toLocaleString("en-IN")}</p>
              </div>
            </button>
          ))}
          {skuGroups.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-[var(--text-muted)]">
              {search ? "No products match." : "No products in store yet."}
            </p>
          )}
        </div>
      </div>

      <div className="data-table-wrap hidden md:block">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product / SKU</th>
                <th>Color</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Stock Value</th>
                <th>Updated By</th>
                <th>Last Updated</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <p className="font-semibold">{p.name}</p>
                  </td>
                  <td>
                    {p.color ? (
                      <span className="badge badge-neutral">{p.color}</span>
                    ) : (
                      <span className="text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td>
                    <span className="font-semibold">{p.quantity.toLocaleString("en-IN")}</span>
                  </td>
                  <td className="text-[var(--text-muted)]">₹{p.unitPrice.toLocaleString("en-IN")}</td>
                  <td className="font-semibold">
                    ₹{(p.quantity * p.unitPrice).toLocaleString("en-IN")}
                  </td>
                  <td className="text-[var(--text-muted)]">{p.lastUpdatedBy || "—"}</td>
                  <td className="text-[var(--text-muted)]">{formatUpdated(p.lastUpdatedTime)}</td>
                  <td className="text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        className="btn-icon !h-8 !w-8"
                        onClick={() => openEdit(p)}
                        aria-label="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon !h-8 !w-8 hover:!border-danger hover:!bg-red-50 hover:!text-danger"
                        disabled={deletingId === p.id}
                        onClick={() => removeProduct(p)}
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
        </div>
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-[var(--text-muted)]">
            {search ? "No products match your search." : "No products in store yet."}
          </p>
        )}
      </div>

      {selectedSku && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setSelectedSku(null)} />
          <div className="fixed inset-x-4 top-1/2 z-50 mx-auto w-full max-w-md -translate-y-1/2 surface p-5 sm:inset-x-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold">{selectedSku.displayName}</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  Total {selectedSku.totalQty.toLocaleString("en-IN")} pcs
                </p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setSelectedSku(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              {selectedSku.colors.map((c) => (
                <div
                  key={c.color}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2.5"
                >
                  <span className="font-medium">{c.color}</span>
                  <span className="font-bold">{c.quantity.toLocaleString("en-IN")} pcs</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--text-faint)]">
              Edit individual colour lines in the table below (desktop) or from add/edit inventory.
            </p>
          </div>
        </>
      )}

      {editProduct && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditProduct(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={saveEdit}
              className="surface w-full max-w-md space-y-4 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <h3 className="font-display text-lg font-bold">Edit inventory</h3>
                <button type="button" className="btn-icon" onClick={() => setEditProduct(null)}>
                  <X size={16} />
                </button>
              </div>
              <div>
                <label className="label">Product / SKU</label>
                <input
                  className="input"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Colour</label>
                <input
                  className="input"
                  value={editForm.color}
                  onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Quantity</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">Unit price ₹</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={editForm.unitPrice}
                    onChange={(e) => setEditForm({ ...editForm, unitPrice: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditProduct(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Save
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {showForm && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={saveProduct}
              className="surface w-full max-w-md space-y-4 p-5 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold">Add inventory</h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Same name + color adds to existing stock
                  </p>
                </div>
                <button type="button" className="btn-icon" onClick={() => setShowForm(false)}>
                  <X size={16} />
                </button>
              </div>
              <div>
                <label className="label">Product name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Color</label>
                <input
                  className="input"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Quantity</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">Unit price (₹)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={form.unitPrice}
                    onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
                  {saving ? "Saving…" : "Add stock"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
