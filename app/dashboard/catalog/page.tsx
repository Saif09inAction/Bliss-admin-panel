"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { BookOpen, Plus, Trash2, X } from "lucide-react";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import PageToolbar from "@/components/admin/PageToolbar";
import { useAuth } from "@/lib/auth-context";
import { uuid } from "@/lib/csv";
import { getDb } from "@/lib/firebase";

type CatalogProduct = {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
};

export default function CatalogPage() {
  const { session } = useAuth();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productName, setProductName] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadProducts() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(getDb(), "product_catalog"));
      setProducts(
        snap.docs
          .map((item) => {
            const data = item.data();
            return {
              id: (data.id as string) || item.id,
              name: (data.name as string) || "",
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

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    const name = productName.trim();
    if (!name) {
      setMessage("Enter a product name.");
      return;
    }
    if (products.some((product) => product.name.toLowerCase() === name.toLowerCase())) {
      setMessage("This product is already in the catalog.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const id = uuid();
      const product: CatalogProduct = {
        id,
        name,
        createdAt: Date.now(),
        createdBy: session?.name || "Admin",
      };
      await setDoc(doc(getDb(), "product_catalog", id), product);
      setProducts((current) =>
        [...current, product].sort((a, b) => a.name.localeCompare(b.name))
      );
      setProductName("");
      setShowForm(false);
      setMessage(`${name} added to catalog.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add product.");
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

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Catalog"
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setProductName("");
              setMessage("");
              setShowForm(true);
            }}
          >
            <Plus size={16} />
            Add Product
          </button>
        }
      >
        <p className="section-sub">
          {products.length} product{products.length === 1 ? "" : "s"}
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => (
            <div key={product.id} className="surface flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                <BookOpen size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold capitalize">{product.name}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Added by {product.createdBy}
                </p>
              </div>
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
              onSubmit={addProduct}
              className="surface w-full max-w-md space-y-5 p-5 sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-bold">Add Product</h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Add a product name to the catalog
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

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                  disabled={saving}
                >
                  {saving ? "Adding…" : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
