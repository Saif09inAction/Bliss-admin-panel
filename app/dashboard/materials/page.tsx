"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { RawMaterial } from "@/lib/types";
import { uuid } from "@/lib/csv";

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Raw Materials</h1>
        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setShowForm(!showForm);
          }}
        >
          {showForm ? "Cancel" : "Add Material"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={saveMaterial} className="card mb-6 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="label">Quantity</label>
            <input className="input" type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </div>
          <div>
            <label className="label">Unit</label>
            <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <div>
            <label className="label">Minimum Stock</label>
            <input className="input" type="number" step="0.01" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Supplier</label>
            <input className="input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary sm:col-span-2">{editing ? "Update" : "Save"} Material</button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Qty</th>
              <th className="py-2 pr-4">Min Stock</th>
              <th className="py-2 pr-4">Supplier</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const low = m.quantity <= m.minimumStock;
              return (
                <tr key={m.id} className={`border-b border-slate-100 ${low ? "bg-red-50" : ""}`}>
                  <td className="py-3 pr-4 font-medium">{m.name}</td>
                  <td className="py-3 pr-4">{m.quantity} {m.unit}</td>
                  <td className="py-3 pr-4">{m.minimumStock}</td>
                  <td className="py-3 pr-4">{m.supplier}</td>
                  <td className="py-3 space-x-2">
                    <button className="text-navy-light text-xs font-semibold" onClick={() => openEdit(m)}>Edit</button>
                    <button className="text-red-600 text-xs font-semibold" onClick={() => removeMaterial(m.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
