"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Boxes, Package, Palette, User } from "lucide-react";
import { getDb } from "@/lib/firebase";
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

export default function InventoryPage() {
  const [products, setProducts] = useState<FinishedProduct[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(getDb(), "finished_products"));
      setProducts(
        snap.docs.map((d) => {
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
        }).sort((a, b) => b.lastUpdatedTime - a.lastUpdatedTime)
      );
    }
    load();
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

  const totalQty = filtered.reduce((s, p) => s + p.quantity, 0);
  const totalValue = filtered.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
  const uniqueColors = useMemo(
    () => new Set(filtered.filter((p) => p.color).map((p) => p.color)).size,
    [filtered]
  );

  return (
    <div className="stagger space-y-5">
      <PageToolbar title="Store Inventory">
        <p className="section-sub">
          {totalQty.toLocaleString("en-IN")} units · {filtered.length} product{filtered.length === 1 ? "" : "s"}
        </p>
      </PageToolbar>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search products by name, color, staff..."
      />

      <div className="alert-banner">
        <p className="alert-banner-title">Read-only inventory</p>
        <p className="alert-banner-sub">
          Products appear here after staff approves kaariger deliveries.
        </p>
      </div>

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

      {/* Desktop table */}
      <div className="data-table-wrap hidden md:block">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Color</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Stock Value</th>
                <th>Updated By</th>
                <th>Last Updated</th>
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
                  <td className="font-semibold">₹{(p.quantity * p.unitPrice).toLocaleString("en-IN")}</td>
                  <td className="text-[var(--text-muted)]">{p.lastUpdatedBy || "—"}</td>
                  <td className="text-[var(--text-muted)]">{formatUpdated(p.lastUpdatedTime)}</td>
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

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.map((p) => (
          <div key={p.id} className="record-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display font-bold">{p.name}</p>
                {p.color && (
                  <span className="badge badge-neutral mt-1.5">{p.color}</span>
                )}
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-bold">{p.quantity.toLocaleString("en-IN")}</p>
                <p className="text-xs text-[var(--text-muted)]">units</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3 text-sm">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Unit Price</p>
                <p className="mt-0.5 font-medium">₹{p.unitPrice.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Stock Value</p>
                <p className="mt-0.5 font-medium">₹{(p.quantity * p.unitPrice).toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Updated By</p>
                <p className="mt-0.5 flex items-center gap-1 font-medium">
                  <User className="h-3.5 w-3.5 text-[var(--text-faint)]" />
                  {p.lastUpdatedBy || "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Last Updated</p>
                <p className="mt-0.5 font-medium">{formatUpdated(p.lastUpdatedTime)}</p>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card py-10 text-center text-sm text-[var(--text-muted)]">
            {search ? "No products match your search." : "No products in store yet."}
          </div>
        )}
      </div>
    </div>
  );
}
