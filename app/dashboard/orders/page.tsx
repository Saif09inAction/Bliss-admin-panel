"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import {
  Calculator,
  CheckCircle2,
  ClipboardList,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type {
  Employee,
  KaarigerOrder,
  OrderProductLine,
  RepairItemType,
  RepairLineItem,
} from "@/lib/types";
import { formatRupee, nowTimeStr, todayStr, uuid } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";
import SearchSelect from "@/components/admin/SearchSelect";

type CatalogProduct = { id: string; name: string };

const DEDUCTION_ITEMS: { type: Exclude<RepairItemType, "MATERIAL">; label: string }[] = [
  { type: "RUNNER", label: "Runner" },
  { type: "FITTING", label: "Fitting" },
  { type: "ASTAR", label: "Astar" },
];

type ProductLineForm = {
  productId: string;
  productName: string;
  quantity: string;
  pricePerPiece: string;
};

type DeductionDraft = Record<Exclude<RepairItemType, "MATERIAL">, { qty: string; price: string }>;

type MaterialLineForm = {
  materialId: string;
  name: string;
  qty: string;
  price: string;
};

function emptyProductLine(): ProductLineForm {
  return { productId: "", productName: "", quantity: "", pricePerPiece: "" };
}

function emptyDeductions(): DeductionDraft {
  return {
    RUNNER: { qty: "", price: "" },
    FITTING: { qty: "", price: "" },
    ASTAR: { qty: "", price: "" },
  };
}

function emptyMaterialLine(): MaterialLineForm {
  return { materialId: "", name: "", qty: "", price: "" };
}

const money = formatRupee;

export default function OrdersPage() {
  const { session } = useAuth();
  const [kaarigers, setKaarigers] = useState<Employee[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [rawMaterials, setRawMaterials] = useState<CatalogProduct[]>([]);
  const [showNewMaterial, setShowNewMaterial] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [addingMaterial, setAddingMaterial] = useState(false);

  const [kaarigerId, setKaarigerId] = useState("");
  const [productLines, setProductLines] = useState<ProductLineForm[]>([emptyProductLine()]);
  const [deductions, setDeductions] = useState<DeductionDraft>(emptyDeductions());
  const [materialLines, setMaterialLines] = useState<MaterialLineForm[]>([emptyMaterialLine()]);
  const [kharcha, setKharcha] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  function resetForm() {
    setKaarigerId("");
    setProductLines([emptyProductLine()]);
    setDeductions(emptyDeductions());
    setMaterialLines([emptyMaterialLine()]);
    setKharcha("");
    setNotes("");
    setFormMsg("");
  }

  async function loadMeta() {
    const [empSnap, catSnap, matSnap] = await Promise.all([
      getDocs(collection(getDb(), "employees")),
      getDocs(collection(getDb(), "product_catalog")),
      getDocs(collection(getDb(), "raw_materials")),
    ]);
    setKaarigers(
      empSnap.docs
        .filter((d) => d.data().role === "KAARIGER")
        .map((d) => ({
          id: d.id,
          name: d.data().name as string,
          phone: d.data().phone as string,
          joiningDate: "",
          monthlySalary: 0,
          attendancePercentage: 0,
          role: "KAARIGER" as const,
          creditBalance: (d.data().creditBalance as number) || 0,
        }))
    );
    setCatalogProducts(
      catSnap.docs
        .map((d) => ({ id: (d.data().id as string) || d.id, name: (d.data().name as string) || "" }))
        .filter((p) => p.name.trim())
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setRawMaterials(
      matSnap.docs
        .map((d) => ({ id: (d.data().id as string) || d.id, name: (d.data().name as string) || "" }))
        .filter((m) => m.name.trim())
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  useEffect(() => {
    loadMeta();
  }, []);

  const availableCredit = useMemo(
    () => kaarigers.find((k) => k.phone === kaarigerId)?.creditBalance || 0,
    [kaarigers, kaarigerId]
  );

  const calc = useMemo(() => {
    const lines = productLines.map((l) => {
      const quantity = Number(l.quantity) || 0;
      const pricePerPiece = Number(l.pricePerPiece) || 0;
      return { ...l, quantity, pricePerPiece, lineTotal: quantity * pricePerPiece };
    });
    const productsTotal = lines.reduce((s, l) => s + l.lineTotal, 0);

    const chargeLines: RepairLineItem[] = DEDUCTION_ITEMS.map(({ type, label }) => {
      const qty = Number(deductions[type].qty) || 0;
      const price = Number(deductions[type].price) || 0;
      return { type, label, quantity: qty, pricePerPiece: price, lineTotal: qty * price };
    }).filter((it) => it.quantity > 0 && it.pricePerPiece > 0);

    const materialItemLines: RepairLineItem[] = materialLines
      .map((m) => {
        const qty = Number(m.qty) || 0;
        const price = Number(m.price) || 0;
        return {
          type: "MATERIAL" as RepairItemType,
          label: m.name.trim() || "Material",
          quantity: qty,
          pricePerPiece: price,
          lineTotal: qty * price,
        };
      })
      .filter((it) => it.label.trim() && it.quantity > 0 && it.pricePerPiece > 0);

    const deductionLines: RepairLineItem[] = [...chargeLines, ...materialItemLines];
    const deductionsTotal = deductionLines.reduce((s, it) => s + it.lineTotal, 0);

    const afterDeductions = Math.max(0, productsTotal - deductionsTotal);
    const kharchaAmount = Number(kharcha) || 0;
    // Any earlier overpaid kharcha (credit) is auto-applied here, on top of kharcha given now.
    const remainingAfterKharcha = Math.max(0, afterDeductions - kharchaAmount);
    const creditApplied = Math.min(availableCredit, remainingAfterKharcha);
    const finalTotal = Math.max(0, remainingAfterKharcha - creditApplied);

    return {
      lines,
      productsTotal,
      chargeLines,
      materialItemLines,
      deductionLines,
      deductionsTotal,
      afterDeductions,
      kharchaAmount,
      remainingAfterKharcha,
      creditApplied,
      finalTotal,
    };
  }, [productLines, deductions, materialLines, kharcha, availableCredit]);

  function addMaterialLine() {
    setMaterialLines((prev) => [...prev, emptyMaterialLine()]);
  }

  function removeMaterialLine(index: number) {
    setMaterialLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateMaterialLine(index: number, patch: Partial<MaterialLineForm>) {
    setMaterialLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function addNewMaterialToList() {
    const name = newMaterialName.trim();
    if (!name) return;
    if (rawMaterials.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      setFormMsg(`"${name}" is already in Materials.`);
      return;
    }
    setAddingMaterial(true);
    setFormMsg("");
    try {
      const id = uuid();
      await setDoc(doc(getDb(), "raw_materials", id), {
        id,
        name,
        quantity: 0,
        unit: "pcs",
        minimumStock: 0,
        supplier: "",
        lastUpdatedBy: session?.name || "Admin",
        lastUpdatedTime: Date.now(),
        imagePath: "",
      });
      setRawMaterials((prev) => [...prev, { id, name }].sort((a, b) => a.name.localeCompare(b.name)));
      setMaterialLines((prev) => {
        const emptyIdx = prev.findIndex((l) => !l.materialId && !l.name);
        if (emptyIdx >= 0) {
          return prev.map((l, i) => (i === emptyIdx ? { ...l, materialId: id, name } : l));
        }
        return [...prev, { materialId: id, name, qty: "", price: "" }];
      });
      setNewMaterialName("");
      setShowNewMaterial(false);
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not add material.");
    } finally {
      setAddingMaterial(false);
    }
  }

  function addProductLine() {
    setProductLines((prev) => [...prev, emptyProductLine()]);
  }

  function removeProductLine(index: number) {
    setProductLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateProductLine(index: number, patch: Partial<ProductLineForm>) {
    setProductLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function sendOrder(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg("");
    setSuccessMsg("");
    const kaariger = kaarigers.find((k) => k.phone === kaarigerId);
    if (!kaariger) {
      setFormMsg("Select a kaariger.");
      return;
    }
    const validLines = calc.lines.filter(
      (l) => l.productName.trim() && l.quantity > 0 && l.pricePerPiece > 0
    );
    if (validLines.length === 0) {
      setFormMsg("Add at least one product with quantity and price per piece.");
      return;
    }

    setSending(true);
    try {
      const id = uuid();
      const targetQuantity = validLines.reduce((s, l) => s + l.quantity, 0);
      const productName = validLines.map((l) => l.productName).join(", ");
      const products: OrderProductLine[] = validLines.map((l) => ({
        productName: l.productName,
        quantity: l.quantity,
        pricePerPiece: l.pricePerPiece,
        lineTotal: l.lineTotal,
      }));

      // Overpaid kharcha from an earlier bill is carried forward and auto-applied here.
      const { creditApplied, finalTotal } = calc;
      const isFullyPaidAtCreation = finalTotal <= 0;
      // If kharcha given now exceeds this bill's own total, the extra becomes fresh credit too.
      const overpayAtCreation = Math.max(0, calc.kharchaAmount - calc.afterDeductions);
      const newCreditBalance = Math.max(0, availableCredit - creditApplied) + overpayAtCreation;

      const order: KaarigerOrder = {
        id,
        kaarigerId: kaariger.phone,
        kaarigerName: kaariger.name,
        productName,
        targetQuantity,
        color: "",
        rawMaterials: [],
        totalDealAmount: calc.afterDeductions,
        pricePerPiece: targetQuantity > 0 ? calc.productsTotal / targetQuantity : 0,
        pricingType: "PER_PIECE",
        status: isFullyPaidAtCreation ? "COMPLETED" : "ASSIGNED",
        approvedQuantity: 0,
        createdBy: session?.name || "Admin",
        createdAt: Date.now(),
        notes: notes.trim(),
        products,
        productsTotal: calc.productsTotal,
        materialDeductions: calc.deductionLines,
        materialDeductionsTotal: calc.deductionsTotal,
        kharchaGiven: calc.kharchaAmount,
      };

      await setDoc(doc(getDb(), "kaariger_orders", id), order);

      if (calc.kharchaAmount > 0) {
        const paymentId = uuid();
        await setDoc(doc(getDb(), "kaariger_payments", paymentId), {
          id: paymentId,
          orderId: id,
          kaarigerId: kaariger.phone,
          amount: calc.kharchaAmount,
          date: todayStr(),
          time: nowTimeStr(),
          remarks: "Kharcha given at order creation",
          createdBy: session?.name || "Admin",
        });
      }

      if (creditApplied > 0) {
        const creditPaymentId = uuid();
        await setDoc(doc(getDb(), "kaariger_payments", creditPaymentId), {
          id: creditPaymentId,
          orderId: id,
          kaarigerId: kaariger.phone,
          amount: creditApplied,
          date: todayStr(),
          time: nowTimeStr(),
          remarks: "Credit carried from previous overpaid bill",
          createdBy: session?.name || "Admin",
        });
      }

      if (newCreditBalance !== availableCredit) {
        await updateDoc(doc(getDb(), "employees", kaariger.phone), {
          creditBalance: newCreditBalance,
        });
      }

      setSuccessMsg(
        `Bill sent to ${kaariger.name}! Find it in Records or the Hisaab section.`
      );
      resetForm();
      loadMeta();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  const kaarigerOptions = kaarigers.map((k) => ({ id: k.phone, label: k.name, sublabel: k.phone }));
  const productOptions = catalogProducts.map((p) => ({ id: p.id, label: p.name }));
  const materialOptions = rawMaterials.map((m) => ({ id: m.id, label: m.name }));

  return (
    <div className="stagger space-y-5">
      <PageToolbar title="Kaarigar">
        <p className="section-sub">Create a new bill for a kaariger</p>
      </PageToolbar>

      <form onSubmit={sendOrder} className="card mx-auto max-w-4xl space-y-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--jade-soft)]">
            <ClipboardList className="h-4 w-4 text-[var(--jade-deep)]" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold">New Kaarigar Bill</h2>
            <p className="text-xs text-[var(--text-muted)]">Assign work & settle amounts</p>
          </div>
        </div>

        <div>
          <label className="label">Kaariger *</label>
          <SearchSelect
            value={kaarigerId}
            onSelect={setKaarigerId}
            options={kaarigerOptions}
            placeholder="Search or select a kaariger…"
            emptyText="No kaarigers found"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="label mb-0 flex items-center gap-1.5">
              <ShoppingBag className="h-3.5 w-3.5" />
              Products *
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addProductLine}>
              <Plus className="h-3.5 w-3.5" />
              Add product
            </button>
          </div>
          <p className="mb-2 text-[11px] text-[var(--text-muted)]">
            Price is always per piece — quantity × price is calculated automatically.
          </p>
          <div className="space-y-2.5">
            {productLines.map((line, i) => {
              const lineTotal = (Number(line.quantity) || 0) * (Number(line.pricePerPiece) || 0);
              return (
                <div key={i} className="rounded-xl border border-[var(--border)] p-2.5">
                  <div className="space-y-2 sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_7rem_2.75rem] sm:items-start sm:gap-2 sm:space-y-0">
                    <SearchSelect
                      value={line.productId}
                      onSelect={(id) => {
                        const product = catalogProducts.find((p) => p.id === id);
                        updateProductLine(i, { productId: id, productName: product?.name || "" });
                      }}
                      options={productOptions}
                      placeholder="Search catalog product…"
                      emptyText="No products in catalog"
                    />
                    <div className="grid grid-cols-[1fr_1fr_2.75rem] gap-2 sm:contents">
                      <input
                        className="input !w-full"
                        type="number"
                        min={0}
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => updateProductLine(i, { quantity: e.target.value })}
                      />
                      <input
                        className="input !w-full"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        placeholder="₹ / pc"
                        value={line.pricePerPiece}
                        onChange={(e) => updateProductLine(i, { pricePerPiece: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn-icon !h-10 !w-10 shrink-0 hover:!border-danger hover:!bg-red-50 hover:!text-danger"
                        onClick={() => removeProductLine(i)}
                        aria-label="Remove product"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {lineTotal > 0 && (
                    <p className="mt-1.5 text-right text-xs text-[var(--text-muted)]">
                      {line.quantity} × ₹{line.pricePerPiece} ={" "}
                      <span className="font-semibold text-[var(--text)]">{money(lineTotal)}</span>
                    </p>
                  )}
                </div>
              );
            })}
            {productLines.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-4 text-center text-xs text-[var(--text-muted)]">
                No products added. Tap &ldquo;Add product&rdquo; above.
              </div>
            )}
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-jade-soft/50 px-3 py-2.5">
            <span className="text-sm font-semibold text-jade-deep">Products Total</span>
            <span className="font-display text-lg font-bold text-jade-deep">{money(calc.productsTotal)}</span>
          </div>
        </div>

        <div>
          <p className="label mb-1 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Runner / Fitting / Astar (optional)
          </p>
          <p className="mb-2 text-[11px] text-[var(--text-muted)]">
            These costs are deducted from the products total. Fill only what applies.
          </p>
          <div className="space-y-2">
            {DEDUCTION_ITEMS.map(({ type, label }) => (
              <div
                key={type}
                className="grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] items-end gap-2 rounded-xl border border-[var(--border)] p-2.5"
              >
                <p className="pb-2 text-sm font-semibold">{label}</p>
                <div>
                  <label className="label !text-[10px]">Qty</label>
                  <input
                    className="input !w-full !py-2"
                    type="number"
                    min={0}
                    value={deductions[type].qty}
                    onChange={(e) =>
                      setDeductions({ ...deductions, [type]: { ...deductions[type], qty: e.target.value } })
                    }
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="label !text-[10px]">₹ / pc</label>
                  <input
                    className="input !w-full !py-2"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={deductions[type].price}
                    onChange={(e) =>
                      setDeductions({ ...deductions, [type]: { ...deductions[type], price: e.target.value } })
                    }
                    placeholder="0"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="label !mb-0 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Material (optional)
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setShowNewMaterial((v) => !v);
                  setNewMaterialName("");
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                New material
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={addMaterialLine}>
                <Plus className="h-3.5 w-3.5" />
                Add line
              </button>
            </div>
          </div>
          <p className="mb-2 mt-1 text-[11px] text-[var(--text-muted)]">
            Pick from Materials list, then enter qty and ₹/pc. Missing one? Tap &ldquo;New material&rdquo;.
          </p>
          {showNewMaterial && (
            <div className="mb-2 flex gap-2 rounded-xl border border-dashed border-[var(--border-strong)] p-2.5">
              <input
                className="input !w-full !py-2"
                value={newMaterialName}
                onChange={(e) => setNewMaterialName(e.target.value)}
                placeholder="New material name…"
                autoFocus
              />
              <button
                type="button"
                className="btn btn-primary btn-sm shrink-0"
                disabled={addingMaterial || !newMaterialName.trim()}
                onClick={addNewMaterialToList}
              >
                {addingMaterial ? "…" : "Add"}
              </button>
            </div>
          )}
          <div className="space-y-2">
            {materialLines.map((m, index) => (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_auto] items-end gap-2 rounded-xl border border-[var(--border)] p-2.5"
              >
                <div>
                  <label className="label !text-[10px]">Material</label>
                  <SearchSelect
                    value={m.materialId}
                    onSelect={(id) => {
                      const mat = rawMaterials.find((x) => x.id === id);
                      updateMaterialLine(index, { materialId: id, name: mat?.name || "" });
                    }}
                    options={materialOptions}
                    placeholder="Search material…"
                    emptyText="No materials — add one above"
                  />
                </div>
                <div>
                  <label className="label !text-[10px]">Qty</label>
                  <input
                    className="input !w-full !py-2"
                    type="number"
                    min={0}
                    value={m.qty}
                    onChange={(e) => updateMaterialLine(index, { qty: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="label !text-[10px]">₹ / pc</label>
                  <input
                    className="input !w-full !py-2"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={m.price}
                    onChange={(e) => updateMaterialLine(index, { price: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-sm !p-2"
                  onClick={() => removeMaterialLine(index)}
                  aria-label="Remove material"
                  disabled={materialLines.length === 1 && !m.name && !m.qty && !m.price}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[var(--surface-mist)] px-3 py-2.5 text-sm">
            <span className="font-medium text-[var(--text-muted)]">Deductions Total</span>
            <span className="font-bold text-danger">−{money(calc.deductionsTotal)}</span>
          </div>
        </div>

        <div>
          <label className="label">
            <span className="inline-flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Kharcha given now (optional)
            </span>
          </label>
          <input
            className="input"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={kharcha}
            onChange={(e) => setKharcha(e.target.value)}
            placeholder="0"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Advance cash given to the kaariger — also subtracted from the total.
          </p>
        </div>

        <div>
          <label className="label">Instructions / notes (optional)</label>
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional instructions"
          />
        </div>

        <div className="rounded-2xl border border-jade/20 bg-jade-soft/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-jade-deep">
            <Calculator size={16} />
            <p className="text-xs font-bold uppercase tracking-wider">Detailed Total</p>
          </div>
          <div className="space-y-1 text-sm">
            <Row label="Products total" value={money(calc.productsTotal)} />
            <Row label="Less: Runner/Fitting/Astar/Material" value={`−${money(calc.deductionsTotal)}`} />
            <div className="my-2 border-t border-jade/20" />
            <Row label="Subtotal" value={money(calc.afterDeductions)} bold />
            <Row label="Less: Kharcha" value={`−${money(calc.kharchaAmount)}`} />
            {availableCredit > 0 && (
              <Row
                label={`Less: Credit carried (${money(availableCredit)} available)`}
                value={`−${money(calc.creditApplied)}`}
              />
            )}
            <div className="my-2 border-t border-jade/20" />
            <Row label="Final balance to pay" value={money(calc.finalTotal)} bold accent />
          </div>
          {availableCredit > 0 && (
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              This kaariger has {money(availableCredit)} credit from an earlier overpaid bill — it&apos;s auto-applied above.
            </p>
          )}
        </div>

        {formMsg && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{formMsg}</p>
        )}
        {successMsg && (
          <p className="flex items-center gap-2 rounded-xl bg-jade-soft px-3 py-2 text-sm text-jade-deep">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {successMsg}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={sending}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={`${bold ? "font-bold" : "font-medium"} ${accent ? "text-jade-deep" : ""}`}>
        {value}
      </span>
    </div>
  );
}
