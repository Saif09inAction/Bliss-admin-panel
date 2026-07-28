"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { FinishedProduct } from "@/lib/types";

export default function InventoryPage() {
  const [products, setProducts] = useState<FinishedProduct[]>([]);

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

  const totalQty = products.reduce((s, p) => s + p.quantity, 0);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-navy">Store Inventory</h1>
      <p className="mb-6 text-sm text-slate-500">
        Products added when staff verifies kaariger deliveries. Total units: {totalQty}
      </p>

      <div className="card overflow-x-auto">
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
            {products.map((p) => (
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
        {products.length === 0 && (
          <p className="py-6 text-center text-slate-500">No products in store yet.</p>
        )}
      </div>
    </div>
  );
}
