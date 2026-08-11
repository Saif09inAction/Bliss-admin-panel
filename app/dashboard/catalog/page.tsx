"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { BookOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import BulkSelectBar, { SelectCheckbox } from "@/components/admin/BulkSelectBar";
import PageToolbar from "@/components/admin/PageToolbar";
import { useAuth } from "@/lib/auth-context";
import { formatRupee, uuid } from "@/lib/csv";
import { getDb } from "@/lib/firebase";
import type { CatalogProduct } from "@/lib/types";
import { useSelection } from "@/lib/use-selection";

type FormMode = "closed" | "add" | "edit";

export default function CatalogPage() {
  const { session } = useAuth();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("closed");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function loadProducts() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(getDb(), "product_catalog"));
      setProducts(
        snap.docs
          .map((item) => {
            const data = item.data();
            const price = Number(data.price);
            return {
              id: (data.id as string) || item.id,
              name: (data.name as string) || "",
              price: Number.isFinite(price) && price > 0 ? price : undefined,
              createdAt: (data.createdAt as number) || 0,
              createdBy: (data.createdBy as string) || "Admin",
            };
          })
          .filter((product) => product.name.trim())
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      product.name.toLowerCase().includes(query)
    );
  }, [products, search]);

  const visibleIds = useMemo(() => filteredProducts.map((p) => p.id), [filteredProducts]);
  const selection = useSelection(visibleIds);

  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openAdd() {
    setFormMode("add");
    setEditingId(null);
    setProductName("");
    setProductPrice("");
    setMessage("");
  }

  function openEdit(product: CatalogProduct) {
    setFormMode("edit");
    setEditingId(product.id);
    setProductName(product.name);
    setProductPrice(product.price && product.price > 0 ? String(product.price) : "");
    setMessage("");
  }

  function closeForm() {
    setFormMode("closed");
    setEditingId(null);
    setProductName("");
    setProductPrice("");
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    const name = productName.trim();
    if (!name) {
      setMessage("Enter a product name.");
      return;
    }
    const priceNum = Number(productPrice);
    const price =
      productPrice.trim() && Number.isFinite(priceNum) && priceNum > 0
        ? Math.round(priceNum * 100) / 100
        : undefined;

    const duplicate = products.some(
      (product) =>
        product.name.toLowerCase() === name.toLowerCase() &&
        product.id !== editingId
    );
    if (duplicate) {
      setMessage("This product is already in the catalog.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      if (formMode === "edit" && editingId) {
        const existing = products.find((p) => p.id === editingId);
        const product: CatalogProduct = {
          id: editingId,
          name,
          price,
          createdAt: existing?.createdAt || Date.now(),
          createdBy: existing?.createdBy || session?.name || "Admin",
        };
        await setDoc(doc(getDb(), "product_catalog", editingId), product);
        setProducts((current) =>
          current
            .map((item) => (item.id === editingId ? product : item))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setMessage(`${name} updated.`);
      } else {
        const id = uuid();
        const product: CatalogProduct = {
          id,
          name,
          price,
          createdAt: Date.now(),
          createdBy: session?.name || "Admin",
        };
        await setDoc(doc(getDb(), "product_catalog", id), product);
        setProducts((current) =>
          [...current, product].sort((a, b) => a.name.localeCompare(b.name))
        );
        setMessage(`${name} added to catalog.`);
      }
      closeForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct(product: CatalogProduct) {
    if (!confirm(`Delete "${product.name}" from the catalog?`)) return;
    try {
      await deleteDoc(doc(getDb(), "product_catalog", product.id));
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setMessage(`${product.name} removed from catalog.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete product.");
    }
  }

  async function deleteSelected() {
    const ids = selection.selectedIds;
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected catalog product${ids.length === 1 ? "" : "s"}?`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map((id) => deleteDoc(doc(getDb(), "product_catalog", id))));
      setProducts((current) => current.filter((item) => !ids.includes(item.id)));
      selection.clear();
      setMessage(`Deleted ${ids.length} product${ids.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected.");
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Catalog"
        actions={
          <button type="button" className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} />
            Add Product
          </button>
        }
      >
        <p className="section-sub">
          {products.length} product{products.length === 1 ? "" : "s"} · optional price fills on bill
        </p>
      </PageToolbar>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search catalog products…"
      />

      {message && (
        <p className="rounded-xl bg-jade-soft px-4 py-3 text-sm text-jade-deep">
          {message}
        </p>
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
        noun="product"
      />

      {loading ? (
        <div className="surface py-14 text-center text-sm text-[var(--text-muted)]">
          Loading catalog…
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="surface flex flex-col items-center py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-jade-soft text-jade-deep">
            <BookOpen size={22} />
          </div>
          <p className="mt-3 font-semibold">
            {search ? "No products match your search" : "No catalog products yet"}
          </p>
          {!search && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Use Add Product to create your first product.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="data-table-wrap hidden lg:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10" />
                    <th>Product</th>
                    <th className="text-right">Price / pc</th>
                    <th>Added by</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr
                      key={product.id}
                      className={selection.isSelected(product.id) ? "bg-jade-soft/30" : undefined}
                    >
                      <td>
                        <SelectCheckbox
                          checked={selection.isSelected(product.id)}
                          onChange={() => selection.toggle(product.id)}
                          label={`Select ${product.name}`}
                        />
                      </td>
                      <td className="font-semibold capitalize">{product.name}</td>
                      <td className="text-right tabular-nums">
                        {product.price && product.price > 0 ? (
                          <span className="font-semibold text-jade-deep">
                            {formatRupee(product.price)}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="text-[var(--text-muted)]">{product.createdBy || "—"}</td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className="btn-icon !h-8 !w-8"
                            onClick={() => openEdit(product)}
                            aria-label={`Edit ${product.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon !h-8 !w-8 !text-danger"
                            onClick={() => removeProduct(product)}
                            aria-label={`Delete ${product.name}`}
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className={`surface flex items-center gap-3 p-4 ${
                  selection.isSelected(product.id) ? "ring-2 ring-jade/40" : ""
                }`}
              >
                <SelectCheckbox
                  checked={selection.isSelected(product.id)}
                  onChange={() => selection.toggle(product.id)}
                  label={`Select ${product.name}`}
                />
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                  <BookOpen size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold capitalize">{product.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {product.price && product.price > 0
                      ? `${formatRupee(product.price)} / pc`
                      : "No price set"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-icon !h-8 !w-8"
                  onClick={() => openEdit(product)}
                  aria-label={`Edit ${product.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="btn-icon !h-8 !w-8 !text-danger"
                  onClick={() => removeProduct(product)}
                  aria-label={`Delete ${product.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {formMode !== "closed" && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={closeForm}
            aria-hidden
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={saveProduct}
              className="surface w-full max-w-md space-y-5 p-5 sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-bold">
                    {formMode === "edit" ? "Edit Product" : "Add Product"}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Price is optional — if set, it auto-fills on the bill page
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-icon !h-9 !w-9"
                  onClick={closeForm}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div>
                <label className="label">Product name *</label>
                <input
                  className="input"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  placeholder="e.g. Bliss Tote Bag"
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
                  value={productPrice}
                  onChange={(event) => setProductPrice(event.target.value)}
                  placeholder="Leave blank to enter price on bill"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={closeForm}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                  disabled={saving}
                >
                  {saving ? "Saving…" : formMode === "edit" ? "Save" : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
