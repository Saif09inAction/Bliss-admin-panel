"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { FinishedProduct } from "@/lib/types";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";

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

  return (
    <div className="space-y-4">
      <PageToolbar meta={`${totalQty} units · ${filtered.length} product${filtered.length === 1 ? "" : "s"}`} />

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search products by name, color, staff..."
      />

      <p className="text-sm text-slate-500">
        Products appear here after staff approves kaariger deliveries.
      </p>

      <div className="card !p-0">
        <div className="scroll-table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Color</th>
                <th className="py-2 pr-4">Qty</th>
                <th className="py-2 pr-4">Unit Price</th>
                <th className="py-2">Updated By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium">{p.name}</td>
                  <td className="py-3 pr-4">{p.color || "—"}</td>
                  <td className="py-3 pr-4">{p.quantity}</td>
                  <td className="py-3 pr-4">₹{p.unitPrice}</td>
                  <td className="py-3">{p.lastUpdatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            {search ? "No products match your search." : "No products in store yet."}
          </p>
        )}
      </div>
    </div>
  );
}
