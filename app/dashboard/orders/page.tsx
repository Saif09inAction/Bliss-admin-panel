"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Calculator,
  ClipboardList,
  IndianRupee,
  Package,
  Pencil,
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
  KaarigerPayment,
  OrderMaterial,
  OrderProductLine,
  RepairItemType,
  RepairLineItem,
} from "@/lib/types";
import { nowTimeStr, todayStr, uuid } from "@/lib/csv";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
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
  return { name: "", qty: "", price: "" };
}

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function orderStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return "badge badge-success";
    case "PENDING_APPROVAL":
      return "badge badge-warn";
    case "IN_PROGRESS":
    case "DELIVERED":
      return "badge badge-gold";
    case "CANCELLED":
      return "badge badge-danger";
    default:
      return "badge badge-neutral";
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export default function OrdersPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [kaarigers, setKaarigers] = useState<Employee[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [payments, setPayments] = useState<KaarigerPayment[]>([]);
  const [paymentForm, setPaymentForm] = useState({ amount: "", remarks: "" });
  const [paymentMsg, setPaymentMsg] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DONE">("ALL");
  const [editOrder, setEditOrder] = useState<KaarigerOrder | null>(null);
  const [editForm, setEditForm] = useState({
    productName: "",
    targetQuantity: "",
    approvedQuantity: "",
    deliveredQuantity: "",
    totalDealAmount: "",
    status: "",
    notes: "",
    kaarigerId: "",
  });

  const [kaarigerId, setKaarigerId] = useState("");
  const [productLines, setProductLines] = useState<ProductLineForm[]>([emptyProductLine()]);
  const [deductions, setDeductions] = useState<DeductionDraft>(emptyDeductions());
  const [materialLines, setMaterialLines] = useState<MaterialLineForm[]>([emptyMaterialLine()]);
  const [kharcha, setKharcha] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [formMsg, setFormMsg] = useState("");

  function resetForm() {
    setKaarigerId("");
    setProductLines([emptyProductLine()]);
    setDeductions(emptyDeductions());
    setMaterialLines([emptyMaterialLine()]);
    setKharcha("");
    setNotes("");
    setFormMsg("");
  }

  async function loadOrders() {
    const snap = await getDocs(collection(getDb(), "kaariger_orders"));
    setOrders(
      snap.docs.map((d) => {
        const data = d.data();
        const rawMaterials = ((data.rawMaterials as OrderMaterial[]) || []).map((m) => ({
          materialId: m.materialId,
          materialName: m.materialName,
          quantity: Number(m.quantity) || 0,
          unit: m.unit,
          usedQuantity: m.usedQuantity != null ? Number(m.usedQuantity) : undefined,
          remainingQuantity: m.remainingQuantity != null ? Number(m.remainingQuantity) : undefined,
        }));
        const products = ((data.products as OrderProductLine[]) || []).map((p) => ({
          productName: p.productName,
          quantity: Number(p.quantity) || 0,
          pricePerPiece: Number(p.pricePerPiece) || 0,
          lineTotal: Number(p.lineTotal) || 0,
        }));
        const materialDeductions = ((data.materialDeductions as RepairLineItem[]) || []).map((it) => ({
          type: it.type,
          label: it.label,
          quantity: Number(it.quantity) || 0,
          pricePerPiece: Number(it.pricePerPiece) || 0,
          lineTotal: Number(it.lineTotal) || 0,
        }));
        return {
          id: (data.id as string) || d.id,
          kaarigerId: data.kaarigerId as string,
          kaarigerName: data.kaarigerName as string,
          productName: data.productName as string,
          targetQuantity: (data.targetQuantity as number) || 0,
          color: (data.color as string) || "",
          rawMaterials,
          totalDealAmount: (data.totalDealAmount as number) || 0,
          pricePerPiece: data.pricePerPiece as number | undefined,
          pricingType: (data.pricingType as "OVERALL" | "PER_PIECE") || "OVERALL",
          status: (data.status as string) === "APPROVED" ? "COMPLETED" : ((data.status as string) || "ASSIGNED"),
          approvedQuantity: (data.approvedQuantity as number) || 0,
          deliveredQuantity: data.deliveredQuantity as number | undefined,
          deliveryColor: data.deliveryColor as string | undefined,
          verifiedBy: data.verifiedBy as string | undefined,
          verifiedAt: data.verifiedAt as number | undefined,
          materialUsageReported: data.materialUsageReported as boolean | undefined,
          createdBy: (data.createdBy as string) || "",
          createdAt: (data.createdAt as number) || 0,
          notes: data.notes as string | undefined,
          originalDealAmount: data.originalDealAmount as number | undefined,
          repairDeductionTotal: (data.repairDeductionTotal as number) || 0,
          products,
          productsTotal: data.productsTotal as number | undefined,
          materialDeductions,
          materialDeductionsTotal: data.materialDeductionsTotal as number | undefined,
          kharchaGiven: data.kharchaGiven as number | undefined,
        };
      }).sort((a, b) => b.createdAt - a.createdAt)
    );
  }

  async function loadMeta() {
    const [empSnap, catSnap] = await Promise.all([
      getDocs(collection(getDb(), "employees")),
      getDocs(collection(getDb(), "product_catalog")),
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
  }

  async function loadPayments(orderId: string) {
    const snap = await getDocs(
      query(collection(getDb(), "kaariger_payments"), where("orderId", "==", orderId))
    );
    setPayments(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: (data.id as string) || d.id,
          orderId: data.orderId as string,
          kaarigerId: data.kaarigerId as string,
          amount: (data.amount as number) || 0,
          date: data.date as string,
          time: data.time as string,
          remarks: data.remarks as string | undefined,
          createdBy: (data.createdBy as string) || "",
        };
      })
    );
  }

  useEffect(() => {
    loadOrders();
    loadMeta();
  }, []);

  useEffect(() => {
    if (selectedOrder) loadPayments(selectedOrder);
    setPaymentMsg("");
  }, [selectedOrder]);

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

      setShowForm(false);
      resetForm();
      loadOrders();
      loadMeta();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder || !session) return;
    const order = orders.find((o) => o.id === selectedOrder);
    if (!order) return;

    const amount = Number(paymentForm.amount) || 0;
    if (amount <= 0) return;

    setPaymentMsg("");
    const id = uuid();
    const payment: KaarigerPayment = {
      id,
      orderId: order.id,
      kaarigerId: order.kaarigerId,
      amount,
      date: todayStr(),
      time: nowTimeStr(),
      remarks: paymentForm.remarks || undefined,
      createdBy: session.name,
    };
    await setDoc(doc(getDb(), "kaariger_payments", id), payment);

    // Auto-complete the order once fully paid, carrying any overpayment
    // forward as credit that's auto-applied to this kaariger's next bill.
    // If the order was ALREADY completed, every rupee of this new kharcha is
    // pure overpayment — the whole amount becomes credit, not just whatever
    // is past a threshold (that bug was under-crediting kaarigers).
    let excess = 0;
    let justCompleted = false;
    if (order.status !== "COMPLETED") {
      const netDeal = Math.max(
        0,
        (order.originalDealAmount ?? order.totalDealAmount) - (order.repairDeductionTotal || 0)
      );
      const totalPaidBefore = payments.reduce((s, p) => s + p.amount, 0);
      const totalPaidAfter = totalPaidBefore + amount;
      if (totalPaidAfter >= netDeal) {
        excess = totalPaidAfter - netDeal;
        justCompleted = true;
        await updateDoc(doc(getDb(), "kaariger_orders", order.id), { status: "COMPLETED" });
      }
    } else {
      excess = amount;
    }

    if (excess > 0) {
      const currentCredit = kaarigers.find((k) => k.phone === order.kaarigerId)?.creditBalance || 0;
      await updateDoc(doc(getDb(), "employees", order.kaarigerId), {
        creditBalance: currentCredit + excess,
      });
      setPaymentMsg(
        justCompleted
          ? `Order completed. ${money(excess)} extra kharcha carried forward as credit for the next bill.`
          : `${money(excess)} extra kharcha carried forward as credit for the next bill.`
      );
      loadOrders();
      loadMeta();
    } else if (justCompleted) {
      setPaymentMsg("Order fully paid — marked as completed.");
      loadOrders();
      loadMeta();
    }

    setPaymentForm({ amount: "", remarks: "" });
    loadPayments(selectedOrder);
  }

  async function deleteOrder(order: KaarigerOrder) {
    if (!confirm(`Delete order "${order.productName}" for ${order.kaarigerName}? Related payments and repairs will also be removed.`)) {
      return;
    }
    const db = getDb();
    await deleteDoc(doc(db, "kaariger_orders", order.id));
    try {
      const [paySnap, repairSnap, approvalSnap] = await Promise.all([
        getDocs(query(collection(db, "kaariger_payments"), where("orderId", "==", order.id))),
        getDocs(query(collection(db, "order_repairs"), where("orderId", "==", order.id))),
        getDocs(query(collection(db, "order_approval_records"), where("orderId", "==", order.id))),
      ]);
      await Promise.all([
        ...paySnap.docs.map((d) => deleteDoc(d.ref)),
        ...repairSnap.docs.map((d) => deleteDoc(d.ref)),
        ...approvalSnap.docs.map((d) => deleteDoc(d.ref)),
      ]);
    } catch {
      // order already deleted; related cleanup best-effort
    }
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    if (selectedOrder === order.id) setSelectedOrder(null);
    if (editOrder?.id === order.id) setEditOrder(null);
  }

  function openEditOrder(order: KaarigerOrder) {
    setEditOrder(order);
    setEditForm({
      productName: order.productName,
      targetQuantity: String(order.targetQuantity),
      approvedQuantity: String(order.approvedQuantity),
      deliveredQuantity: order.deliveredQuantity != null ? String(order.deliveredQuantity) : "",
      totalDealAmount: String(order.totalDealAmount || ""),
      status: order.status,
      notes: order.notes || "",
      kaarigerId: order.kaarigerId,
    });
  }

  async function saveEditOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrder) return;
    const kaariger = kaarigers.find((k) => k.phone === editForm.kaarigerId);
    const productName = editForm.productName.trim();
    const targetQuantity = Number(editForm.targetQuantity) || 0;
    if (!productName || targetQuantity <= 0) {
      alert("Product name and quantity are required.");
      return;
    }
    const deliveredRaw = editForm.deliveredQuantity.trim();
    await setDoc(
      doc(getDb(), "kaariger_orders", editOrder.id),
      {
        productName,
        targetQuantity,
        approvedQuantity: Number(editForm.approvedQuantity) || 0,
        deliveredQuantity: deliveredRaw === "" ? null : Number(deliveredRaw) || 0,
        totalDealAmount: Number(editForm.totalDealAmount) || 0,
        status: editForm.status,
        notes: editForm.notes.trim() || "",
        kaarigerId: editForm.kaarigerId,
        kaarigerName: kaariger?.name || editOrder.kaarigerName,
        color: "",
      },
      { merge: true }
    );
    setEditOrder(null);
    loadOrders();
  }

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rank = (status: string) => {
      switch (status) {
        case "PENDING_APPROVAL":
          return 0;
        case "ASSIGNED":
          return 1;
        case "IN_PROGRESS":
          return 2;
        case "DELIVERED":
          return 3;
        case "COMPLETED":
          return 4;
        case "CANCELLED":
          return 5;
        default:
          return 6;
      }
    };
    const isActive = (s: string) =>
      s === "PENDING_APPROVAL" || s === "ASSIGNED" || s === "IN_PROGRESS" || s === "DELIVERED";

    return orders
      .filter((o) => {
        const matchSearch =
          !q ||
          o.productName.toLowerCase().includes(q) ||
          o.kaarigerName.toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q) ||
          o.color.toLowerCase().includes(q);
        const matchStatus =
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE" && isActive(o.status)) ||
          (statusFilter === "DONE" && (o.status === "COMPLETED" || o.status === "CANCELLED"));
        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        const ra = rank(a.status);
        const rb = rank(b.status);
        if (ra !== rb) return ra - rb;
        return b.createdAt - a.createdAt;
      });
  }, [orders, search, statusFilter]);

  const selected = selectedOrder ? orders.find((x) => x.id === selectedOrder) : null;
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);

  const kaarigerOptions = kaarigers.map((k) => ({ id: k.phone, label: k.name, sublabel: k.phone }));
  const productOptions = catalogProducts.map((p) => ({ id: p.id, label: p.name }));

  const formPanel = (
    <form onSubmit={sendOrder} className="card space-y-5 lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--jade-soft)]">
            <ClipboardList className="h-4 w-4 text-[var(--jade-deep)]" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold">New Kaarigar Bill</h2>
            <p className="text-xs text-[var(--text-muted)]">Assign work & settle amounts</p>
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm lg:hidden"
          onClick={() => setShowForm(false)}
          aria-label="Close form"
        >
          <X className="h-4 w-4" />
        </button>
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
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
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
                <div className="mt-2 grid grid-cols-2 gap-2">
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
                    step="0.01"
                    placeholder="₹ / pc"
                    value={line.pricePerPiece}
                    onChange={(e) => updateProductLine(i, { pricePerPiece: e.target.value })}
                  />
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
                  step="0.01"
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
          <button type="button" className="btn-ghost btn-sm" onClick={addMaterialLine}>
            <Plus className="h-3.5 w-3.5" />
            Add material
          </button>
        </div>
        <p className="mb-2 mt-1 text-[11px] text-[var(--text-muted)]">
          Add each raw material by name — e.g. Vinit, Badal, Board — with its own qty and rate.
        </p>
        <div className="space-y-2">
          {materialLines.map((m, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_auto] items-end gap-2 rounded-xl border border-[var(--border)] p-2.5"
            >
              <div>
                <label className="label !text-[10px]">Material name</label>
                <input
                  className="input !w-full !py-2"
                  value={m.name}
                  onChange={(e) => updateMaterialLine(index, { name: e.target.value })}
                  placeholder="e.g. Vinit"
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
                  step="0.01"
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

      <button type="submit" className="btn btn-primary w-full" disabled={sending}>
        {sending ? "Sending…" : "Send"}
      </button>
    </form>
  );

  return (
    <div className="stagger space-y-5">
      <PageToolbar
        title="Kaarigar"
        actions={
          <button
            className="btn btn-primary lg:hidden"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                New Bill
              </>
            )}
          </button>
        }
      >
        <p className="section-sub">{orders.length} order{orders.length === 1 ? "" : "s"}</p>
      </PageToolbar>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search orders by product, kaariger, status..."
      />

      <div className="mobile-chip-scroll flex flex-wrap gap-2">
        {(
          [
            { id: "ALL" as const, label: "All" },
            { id: "ACTIVE" as const, label: "Needs action" },
            { id: "DONE" as const, label: "Completed" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={`filter-pill ${statusFilter === f.id ? "active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className={`${showForm ? "block" : "hidden"} lg:block`}>
          {formPanel}
        </div>

        <div className="min-w-0 space-y-5">
          <div className="data-table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Kaariger</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th className="text-right">Deal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr
                      key={o.id}
                      className={`cursor-pointer ${selectedOrder === o.id ? "!bg-[var(--jade-soft)]" : ""}`}
                      onClick={() => setSelectedOrder(o.id)}
                    >
                      <td>
                        <p className="font-semibold">{o.productName}</p>
                        {o.color && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{o.color}</p>}
                      </td>
                      <td className="text-[var(--text-muted)]">{o.kaarigerName}</td>
                      <td>
                        <span className={orderStatusBadge(o.status)}>{statusLabel(o.status)}</span>
                      </td>
                      <td className="text-[var(--text-muted)]">
                        {o.approvedQuantity}/{o.targetQuantity} pcs
                      </td>
                      <td className="text-right font-semibold">₹{o.totalDealAmount.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredOrders.length === 0 && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">
                {search ? "No orders match your search." : "No orders yet."}
              </p>
            )}
          </div>

          <div className="md:hidden">
            <p className="mobile-section-label">
              {statusFilter === "ACTIVE"
                ? "Needs action first"
                : statusFilter === "DONE"
                  ? "Finished orders"
                  : "Active first · newest"}
            </p>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
              {filteredOrders.map((o, idx) => (
                <button
                  key={o.id}
                  type="button"
                  className={`mobile-row w-full text-left ${idx < filteredOrders.length - 1 ? "" : "!border-b-0"}`}
                  onClick={() => setSelectedOrder(o.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{o.productName}</p>
                      <span className={`${orderStatusBadge(o.status)} shrink-0`}>{statusLabel(o.status)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {o.kaarigerName} · {o.approvedQuantity}/{o.targetQuantity} pcs · ₹
                      {o.totalDealAmount.toLocaleString("en-IN")}
                    </p>
                  </div>
                </button>
              ))}
              {filteredOrders.length === 0 && (
                <p className="py-10 text-center text-sm text-[var(--text-muted)]">
                  {search ? "No orders match your search." : "No orders yet."}
                </p>
              )}
            </div>
          </div>

          {selected && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/45 md:hidden"
                aria-label="Close order detail"
                onClick={() => setSelectedOrder(null)}
              />
              <div className="card space-y-5 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:max-h-[88vh] max-md:overflow-y-auto max-md:rounded-b-none max-md:rounded-t-3xl max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-md:shadow-[0_-12px_40px_rgba(6,17,13,0.18)]">
                <div className="mx-auto mb-1 hidden h-1 w-10 rounded-full bg-[var(--border-strong)] max-md:block" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-bold">{selected.productName}</h2>
                    <span className={orderStatusBadge(selected.status)}>{statusLabel(selected.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {selected.kaarigerName} · {selected.approvedQuantity}/{selected.targetQuantity} pcs approved
                    {selected.status === "PENDING_APPROVAL" && selected.deliveredQuantity
                      ? ` · ${selected.deliveredQuantity} awaiting approval`
                      : ""}
                  </p>
                  {selected.verifiedBy && (
                    <p className="mt-1 text-xs text-[var(--jade-deep)]">Last verified by {selected.verifiedBy}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEditOrder(selected)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm !bg-danger/10 !text-danger hover:!bg-danger/20"
                    onClick={() => deleteOrder(selected)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm shrink-0"
                    onClick={() => setSelectedOrder(null)}
                    aria-label="Close order detail"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="stat-card !p-3">
                  <p className="stat-card-label">Deal Amount</p>
                  <p className="stat-card-value !text-xl">
                    ₹{(selected.originalDealAmount ?? selected.totalDealAmount).toLocaleString("en-IN")}
                  </p>
                  {selected.pricingType === "PER_PIECE" && selected.pricePerPiece ? (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">₹{selected.pricePerPiece.toFixed(2)}/pc avg</p>
                  ) : null}
                </div>
                <div className="stat-card !p-3">
                  <p className="stat-card-label">Kharcha paid</p>
                  <p className="stat-card-value !text-xl text-[var(--jade-deep)]">
                    ₹{paidTotal.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="stat-card !p-3">
                  <p className="stat-card-label">Balance</p>
                  <p className="stat-card-value !text-xl">
                    ₹{Math.max(
                      0,
                      (selected.originalDealAmount ?? selected.totalDealAmount) -
                        (selected.repairDeductionTotal || 0) -
                        paidTotal
                    ).toLocaleString("en-IN")}
                  </p>
                  {(selected.repairDeductionTotal || 0) > 0 && (
                    <p className="mt-0.5 text-xs text-danger">
                      Repair −₹{(selected.repairDeductionTotal || 0).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
              </div>

              {selected.products && selected.products.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <ShoppingBag className="h-4 w-4 text-[var(--text-muted)]" />
                    Products
                  </h3>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>₹/pc</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.products.map((p, i) => (
                          <tr key={i}>
                            <td className="font-medium">{p.productName}</td>
                            <td>{p.quantity}</td>
                            <td>₹{p.pricePerPiece}</td>
                            <td className="text-right font-semibold">{money(p.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-jade-soft/50 px-3 py-2 text-sm">
                    <span className="font-semibold text-jade-deep">Products Total</span>
                    <span className="font-bold text-jade-deep">
                      {money(selected.productsTotal ?? 0)}
                    </span>
                  </div>
                </div>
              )}

              {selected.materialDeductions && selected.materialDeductions.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Wrench className="h-4 w-4 text-[var(--text-muted)]" />
                    Runner / Fitting / Astar / Material
                  </h3>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>₹/pc</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.materialDeductions.map((it, i) => (
                          <tr key={i}>
                            <td className="font-medium">{it.label}</td>
                            <td>{it.quantity}</td>
                            <td>₹{it.pricePerPiece}</td>
                            <td className="text-right font-semibold text-danger">−{money(it.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-[var(--surface-mist)] px-3 py-2 text-sm">
                    <span className="font-medium text-[var(--text-muted)]">Deductions Total</span>
                    <span className="font-bold text-danger">
                      −{money(selected.materialDeductionsTotal ?? 0)}
                    </span>
                  </div>
                </div>
              )}

              {selected.rawMaterials.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Package className="h-4 w-4 text-[var(--text-muted)]" />
                    Raw Materials
                  </h3>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Assigned</th>
                          <th>Used</th>
                          <th>Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.rawMaterials.map((m) => (
                          <tr key={m.materialId}>
                            <td className="font-medium">{m.materialName}</td>
                            <td>{m.quantity} {m.unit}</td>
                            <td>{m.usedQuantity != null ? `${m.usedQuantity} ${m.unit}` : "—"}</td>
                            <td>{m.remainingQuantity != null ? `${m.remainingQuantity} ${m.unit}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                  <IndianRupee className="h-4 w-4 text-[var(--text-muted)]" />
                  Kharcha
                </h3>
                {payments.length > 0 ? (
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                      >
                        <div>
                          <p className="font-semibold">₹{p.amount.toLocaleString("en-IN")}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {p.date} · {p.createdBy}
                            {p.remarks ? ` · ${p.remarks}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-4 text-center text-sm text-[var(--text-muted)]">
                    No kharcha recorded yet
                  </p>
                )}

                <form onSubmit={addPayment} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    className="input"
                    type="number"
                    placeholder="Amount (₹)"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    required
                  />
                  <input
                    className="input"
                    placeholder="Remarks (optional)"
                    value={paymentForm.remarks}
                    onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                  />
                  <button type="submit" className="btn btn-primary whitespace-nowrap">
                    <Plus className="h-4 w-4" />
                    Add Kharcha
                  </button>
                </form>
                {paymentMsg && (
                  <p className="mt-2 rounded-xl bg-jade-soft px-3 py-2 text-sm text-jade-deep">{paymentMsg}</p>
                )}
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      {editOrder && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditOrder(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={saveEditOrder}
              className="surface max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <h3 className="font-display text-lg font-bold">Edit order</h3>
                <button type="button" className="btn-icon" onClick={() => setEditOrder(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="label">Product / SKU *</label>
                <input
                  className="input"
                  value={editForm.productName}
                  onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Kaariger</label>
                <select
                  className="input"
                  value={editForm.kaarigerId}
                  onChange={(e) => setEditForm({ ...editForm, kaarigerId: e.target.value })}
                >
                  <option value="">—</option>
                  {kaarigers.map((k) => (
                    <option key={k.phone} value={k.phone}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Target qty *</label>
                  <input
                    className="input"
                    type="number"
                    value={editForm.targetQuantity}
                    onChange={(e) => setEditForm({ ...editForm, targetQuantity: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">Approved qty</label>
                  <input
                    className="input"
                    type="number"
                    value={editForm.approvedQuantity}
                    onChange={(e) => setEditForm({ ...editForm, approvedQuantity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Delivered (pending)</label>
                  <input
                    className="input"
                    type="number"
                    value={editForm.deliveredQuantity}
                    onChange={(e) => setEditForm({ ...editForm, deliveredQuantity: e.target.value })}
                    placeholder="Empty if none"
                  />
                </div>
                <div>
                  <label className="label">Deal ₹</label>
                  <input
                    className="input"
                    type="number"
                    value={editForm.totalDealAmount}
                    onChange={(e) => setEditForm({ ...editForm, totalDealAmount: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                >
                  {["ASSIGNED", "PENDING_APPROVAL", "COMPLETED", "CANCELLED"].map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Notes</label>
                <input
                  className="input"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditOrder(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </>
      )}
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
