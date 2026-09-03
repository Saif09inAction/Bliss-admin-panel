"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import {
  Calculator,
  CheckCircle2,
  ClipboardList,
  Eraser,
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
  RawMaterialBill,
  RawMaterialDeductionRef,
  RepairItemType,
  RepairLineItem,
  OrderRepair,
} from "@/lib/types";
import { isStandaloneRepair } from "@/lib/types";
import { formatRupee, uuid } from "@/lib/csv";
import {
  orderAddBalance,
  orderKharchaCarryOut,
  totalRemainingAmount,
  weekLabelFromDate,
} from "@/lib/kaariger-hisaab";
import {
  isCreditPayment,
  isOldKharchaPayment,
  isOpeningPayment,
} from "@/lib/kaariger-pay";
import PageToolbar from "@/components/admin/PageToolbar";
import SearchSelect from "@/components/admin/SearchSelect";

type CatalogProduct = { id: string; name: string; price?: number };

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
    RUNNER: { qty: "", price: "1.5" },
    FITTING: { qty: "", price: "2.5" },
    ASTAR: { qty: "", price: "30" },
  };
}

function emptyMaterialLine(): MaterialLineForm {
  return { materialId: "", name: "", qty: "", price: "" };
}

const BILL_DRAFT_KEY = "bliss-kaariger-bill-draft";

type BillDraft = {
  kaarigerId: string;
  productLines: ProductLineForm[];
  deductions: DeductionDraft;
  materialLines: MaterialLineForm[];
  kharcha: string;
  notes: string;
};

function loadBillDraft(): BillDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(BILL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BillDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveBillDraft(draft: BillDraft) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(BILL_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

function clearBillDraft() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(BILL_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function draftHasContent(draft: BillDraft): boolean {
  if (draft.kaarigerId.trim()) return true;
  if (draft.kharcha.trim()) return true;
  if (draft.notes.trim()) return true;
  if (draft.productLines.some((l) => l.productName || l.quantity || l.pricePerPiece || l.productId)) {
    return true;
  }
  if (
    Object.values(draft.deductions).some((d) => (d.qty && d.qty !== "0") || (d.price && d.price !== "0"))
  ) {
    // defaults have prices 1.5/2.5/30 — only count if qty filled
    if (Object.values(draft.deductions).some((d) => d.qty.trim() && Number(d.qty) > 0)) return true;
  }
  if (draft.materialLines.some((m) => m.name || m.qty || m.price || m.materialId)) return true;
  return false;
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
  const [draftReady, setDraftReady] = useState(false);
  /** Outstanding Total Remaining for the selected kaariger (same as Hisaab). */
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [outstandingLoading, setOutstandingLoading] = useState(false);
  /** Signed carry from active week(s) that will fold into next kharcha box only. */
  const [pendingKharchaCarry, setPendingKharchaCarry] = useState(0);
  const [activeStandaloneRepairs, setActiveStandaloneRepairs] = useState<OrderRepair[]>([]);

  // ── Raw Material deductions ──────────────────────────────────────────────
  /** All pending raw-material entries for the selected kaariger. */
  type RmEntry = {
    billId: string;
    billNo: string;
    companyName?: string;
    entryId: string;
    materialName: string;
    totalQuantity: number;
    ratePerPiece: number;
    totalAmount: number;
  };
  const [rmEntries, setRmEntries] = useState<RmEntry[]>([]);
  const [rmLoading, setRmLoading] = useState(false);
  /** Entry IDs the admin has toggled on for deduction in this bill. */
  const [rmSelected, setRmSelected] = useState<Set<string>>(new Set());

  const rmDeductionTotal = useMemo(
    () =>
      rmEntries
        .filter((e) => rmSelected.has(e.entryId))
        .reduce((s, e) => s + e.totalAmount, 0),
    [rmEntries, rmSelected]
  );

  function toggleRmEntry(entryId: string) {
    setRmSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function resetForm() {
    setKaarigerId("");
    setProductLines([emptyProductLine()]);
    setDeductions(emptyDeductions());
    setMaterialLines([emptyMaterialLine()]);
    setKharcha("");
    setNotes("");
    setFormMsg("");
    setOutstanding(null);
    setPendingKharchaCarry(0);
    setRmEntries([]);
    setRmSelected(new Set());
    setActiveStandaloneRepairs([]);
    clearBillDraft();
  }

  function clearForm() {
    if (
      draftHasContent({
        kaarigerId,
        productLines,
        deductions,
        materialLines,
        kharcha,
        notes,
      }) &&
      !confirm("Clear this bill draft? Entered data will be removed.")
    ) {
      return;
    }
    resetForm();
    setSuccessMsg("");
    setFormMsg("");
  }

  // Restore draft once on mount (survives switching sections).
  useEffect(() => {
    const draft = loadBillDraft();
    if (draft) {
      if (draft.kaarigerId) setKaarigerId(draft.kaarigerId);
      if (Array.isArray(draft.productLines) && draft.productLines.length > 0) {
        setProductLines(draft.productLines);
      }
      if (draft.deductions) setDeductions({ ...emptyDeductions(), ...draft.deductions });
      if (Array.isArray(draft.materialLines) && draft.materialLines.length > 0) {
        setMaterialLines(draft.materialLines);
      }
      if (typeof draft.kharcha === "string") setKharcha(draft.kharcha);
      if (typeof draft.notes === "string") setNotes(draft.notes);
    }
    setDraftReady(true);
  }, []);

  // Persist draft while editing (until Send or Clear).
  useEffect(() => {
    if (!draftReady) return;
    const draft: BillDraft = {
      kaarigerId,
      productLines,
      deductions,
      materialLines,
      kharcha,
      notes,
    };
    if (draftHasContent(draft)) saveBillDraft(draft);
    else clearBillDraft();
  }, [draftReady, kaarigerId, productLines, deductions, materialLines, kharcha, notes]);

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
          openingBalance: (d.data().openingBalance as number) || 0,
          oldKharcha: (d.data().oldKharcha as number) || 0,
        }))
    );
    setCatalogProducts(
      catSnap.docs
        .map((d) => {
          const data = d.data();
          const price = Number(data.price);
          return {
            id: (data.id as string) || d.id,
            name: (data.name as string) || "",
            price: Number.isFinite(price) && price > 0 ? price : undefined,
          };
        })
        .filter((p) => p.name.trim())
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setRawMaterials(
      matSnap.docs
        .map((d) => {
          const data = d.data();
          const price = Number(data.price);
          return {
            id: (data.id as string) || d.id,
            name: (data.name as string) || "",
            price: Number.isFinite(price) && price > 0 ? price : undefined,
          };
        })
        .filter((m) => m.name.trim())
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  useEffect(() => {
    loadMeta();
  }, []);

  /** Fetch pending raw-material entries for the selected kaariger. */
  useEffect(() => {
    if (!kaarigerId) {
      setRmEntries([]);
      setRmSelected(new Set());
      return;
    }
    let cancelled = false;
    setRmLoading(true);
    (async () => {
      try {
        const snap = await getDocs(collection(getDb(), "raw_material_bills"));
        const entries: RmEntry[] = [];
        snap.docs.forEach((d) => {
          const bill = d.data() as RawMaterialBill & { id: string };
          if (bill.status !== "active") return;
          (bill.kaarigers || []).forEach((k) => {
            if (k.kaarigerId !== kaarigerId) return;
            if (k.adjustmentStatus === "adjusted") return;
            entries.push({
              billId: d.id,
              billNo: bill.billNo,
              companyName: bill.companyName,
              entryId: k.id,
              materialName: k.materialName,
              totalQuantity: k.totalQuantity,
              ratePerPiece: k.ratePerPiece,
              totalAmount: k.totalAmount,
            });
          });
        });
        if (!cancelled) {
          setRmEntries(entries);
          setRmSelected(new Set());
        }
      } catch {
        if (!cancelled) setRmEntries([]);
      } finally {
        if (!cancelled) setRmLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kaarigerId]);

  /** Always refresh balances when selecting a kaariger (Pay on Hisaab may have changed them). */
  useEffect(() => {
    if (!kaarigerId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(getDb(), "employees", kaarigerId));
        if (cancelled || !snap.exists()) return;
        const data = snap.data();
        setKaarigers((prev) =>
          prev.map((k) =>
            k.phone === kaarigerId
              ? {
                  ...k,
                  openingBalance: (data.openingBalance as number) || 0,
                  oldKharcha: (data.oldKharcha as number) || 0,
                  creditBalance: (data.creditBalance as number) || 0,
                }
              : k
          )
        );
      } catch {
        /* keep cached */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kaarigerId]);

  const selectedKaariger = useMemo(
    () => kaarigers.find((k) => k.phone === kaarigerId),
    [kaarigers, kaarigerId]
  );
  const currentOpening = Math.max(0, selectedKaariger?.openingBalance || 0);
  const currentOldKharcha = Math.max(0, selectedKaariger?.oldKharcha || 0);
  const currentCredit = Math.max(0, selectedKaariger?.creditBalance || 0);

  useEffect(() => {
    if (!kaarigerId || !selectedKaariger) {
      setOutstanding(null);
      setPendingKharchaCarry(0);
      setOutstandingLoading(false);
      return;
    }
    let cancelled = false;
    setOutstandingLoading(true);
    (async () => {
      try {
        const db = getDb();
        const [orderSnap, paySnap, repairSnap] = await Promise.all([
          getDocs(query(collection(db, "kaariger_orders"), where("kaarigerId", "==", kaarigerId))),
          getDocs(query(collection(db, "kaariger_payments"), where("kaarigerId", "==", kaarigerId))),
          getDocs(query(collection(db, "order_repairs"), where("kaarigerId", "==", kaarigerId))),
        ]);

        const paidByOrder = new Map<string, number>();
        paySnap.docs.forEach((d) => {
          const data = d.data();
          const p = {
            orderId: (data.orderId as string) || "",
            remarks: data.remarks as string | undefined,
          };
          if (isCreditPayment(p) || isOpeningPayment(p) || isOldKharchaPayment(p)) return;
          paidByOrder.set(p.orderId, (paidByOrder.get(p.orderId) || 0) + ((data.amount as number) || 0));
        });

        let carryOut = 0;
        orderSnap.docs.forEach((d) => {
          const data = d.data();
          const status = (data.status as string) || "ASSIGNED";
          if (status === "COMPLETED" || status === "CANCELLED" || status === "REJECTED") return;
          const order: KaarigerOrder = {
            id: (data.id as string) || d.id,
            kaarigerId: kaarigerId,
            kaarigerName: "",
            productName: "",
            targetQuantity: 0,
            color: "",
            rawMaterials: [],
            totalDealAmount: 0,
            pricingType: "PER_PIECE",
            status,
            approvedQuantity: 0,
            createdBy: "",
            createdAt: (data.createdAt as number) || 0,
            kharchaGiven: (data.kharchaGiven as number) || 0,
            kharchaCarriedForward: (data.kharchaCarriedForward as number) || 0,
            kharchaCarryIn: (data.kharchaCarryIn as number) || 0,
          };
          carryOut += orderKharchaCarryOut(order, paidByOrder.get(order.id) || 0);
        });

        const approvedStandaloneRepairs = repairSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              orderId: (data.orderId as string) || "",
              kaarigerId: kaarigerId,
              kaarigerName: data.kaarigerName as string,
              productName: data.productName as string,
              faultyQuantity: (data.faultyQuantity as number) || 0,
              faultyPricePerPiece: (data.faultyPricePerPiece as number) || 0,
              faultyTotal: (data.faultyTotal as number) || 0,
              totalRepairCost: (data.totalRepairCost as number) || 0,
              items: data.items || [],
              createdAt: data.createdAt as number,
              createdBy: data.createdBy as string,
              notes: data.notes as string | undefined,
              status: data.status as any,
              originalDealAmount: (data.originalDealAmount as number) || 0,
              dealAfterThisRepair: (data.dealAfterThisRepair as number) || 0,
              deferToNextBill: Boolean(data.deferToNextBill),
            } satisfies OrderRepair;
          })
          .filter(
            (r) =>
              isStandaloneRepair(r.orderId) &&
              (r.status === "APPROVED" || !r.status) &&
              !r.deferToNextBill
          );

        const standaloneRepairTotal = approvedStandaloneRepairs.reduce((s, r) => s + r.totalRepairCost, 0);

        const openingBalance = Math.max(0, selectedKaariger.openingBalance || 0);
        const oldKharcha = Math.max(0, selectedKaariger.oldKharcha || 0);
        const creditBalance = Math.max(0, selectedKaariger.creditBalance || 0);
        const total = totalRemainingAmount({
          openingBalance: openingBalance + oldKharcha,
          creditBalance,
          standaloneRepairTotal,
        });
        if (!cancelled) {
          setPendingKharchaCarry(carryOut);
          setOutstanding(total);
          setActiveStandaloneRepairs(approvedStandaloneRepairs);
        }
      } catch {
        if (!cancelled) {
          setPendingKharchaCarry(0);
          setOutstanding(
            totalRemainingAmount({
              openingBalance: currentOpening + currentOldKharcha,
              creditBalance: currentCredit,
            })
          );
        }
      } finally {
        if (!cancelled) setOutstandingLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kaarigerId, selectedKaariger, currentOpening, currentOldKharcha, currentCredit]);

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

    const standaloneRepairsTotal = activeStandaloneRepairs.reduce((s, r) => s + r.totalRepairCost, 0);
    // Raw-material deductions selected by admin for this bill
    const totalAllDeductions = deductionsTotal + rmDeductionTotal + standaloneRepairsTotal;

    const afterDeductions = Math.max(0, productsTotal - totalAllDeductions);
    const kharchaAmount = Number(kharcha) || 0;
    // ADD = MAAL − all deductions (kharcha budget is stored separately).
    const addBalance = productsTotal - totalAllDeductions;
    // Opening = outstanding Remaining (Pay does not change it; unpaid week does not fold in).
    const grossOpening = currentOpening + currentOldKharcha;
    const netOpening = totalRemainingAmount({
      openingBalance: grossOpening,
      creditBalance: currentCredit,
    });
    const runningAfterAdd = grossOpening + addBalance;
    const closing = Math.max(0, runningAfterAdd - kharchaAmount);
    const totalRemainingPreview = totalRemainingAmount({
      openingBalance: closing,
      creditBalance: currentCredit,
    });
    // Next box start = new budget − signed carry from prior week (overpay shrinks, underpay grows).
    const kharchaBoxStart = kharchaAmount - pendingKharchaCarry;

    return {
      lines,
      productsTotal,
      chargeLines,
      materialItemLines,
      deductionLines,
      deductionsTotal,
      afterDeductions,
      kharchaAmount,
      addBalance,
      grossOpening,
      netOpening,
      runningAfterAdd,
      closing,
      totalRemainingPreview,
      pendingKharchaCarry,
      kharchaBoxStart,
    };
  }, [
    productLines,
    deductions,
    materialLines,
    kharcha,
    currentOpening,
    currentOldKharcha,
    currentCredit,
    pendingKharchaCarry,
    rmDeductionTotal,
    activeStandaloneRepairs,
  ]);

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
      setRawMaterials((prev) =>
        [...prev, { id, name }].sort((a, b) => a.name.localeCompare(b.name))
      );
      setMaterialLines((prev) => {
        const emptyIdx = prev.findIndex((l) => !l.materialId && !l.name);
        if (emptyIdx >= 0) {
          return prev.map((l, i) =>
            i === emptyIdx ? { ...l, materialId: id, name, price: "" } : l
          );
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
    // Products are optional — a week bill can be deductions / kharcha only (like the sheet).
    if (validLines.length === 0 && calc.deductionsTotal <= 0 && calc.kharchaAmount <= 0) {
      setFormMsg("Add a product, a deduction, or this week's kharcha.");
      return;
    }

    setSending(true);
    try {
      const db = getDb();
      // Fresh balances — never trust page cache after a Pay on Hisaab.
      const empSnap = await getDoc(doc(db, "employees", kaariger.phone));
      const empData = empSnap.exists() ? empSnap.data() : null;
      const liveOpening = Math.max(
        0,
        empData ? (empData.openingBalance as number) || 0 : kaariger.openingBalance || 0
      );
      const liveOldKharcha = Math.max(
        0,
        empData ? (empData.oldKharcha as number) || 0 : kaariger.oldKharcha || 0
      );
      const liveCredit = Math.max(
        0,
        empData ? (empData.creditBalance as number) || 0 : kaariger.creditBalance || 0
      );

      const id = uuid();
      const targetQuantity = validLines.reduce((s, l) => s + l.quantity, 0);
      const productName =
        validLines.map((l) => l.productName).join(", ") ||
        (calc.deductionsTotal > 0 ? "Deductions / week bill" : "Week bill");
      const products: OrderProductLine[] = validLines.map((l) => ({
        productName: l.productName,
        quantity: l.quantity,
        pricePerPiece: l.pricePerPiece,
        lineTotal: l.lineTotal,
      }));

      // Close prior active weeks; signed carry folds into next kharcha box only (not Remaining).
      const [orderSnap, paySnap] = await Promise.all([
        getDocs(query(collection(db, "kaariger_orders"), where("kaarigerId", "==", kaariger.phone))),
        getDocs(query(collection(db, "kaariger_payments"), where("kaarigerId", "==", kaariger.phone))),
      ]);

      const paidByOrder = new Map<string, number>();
      paySnap.docs.forEach((d) => {
        const data = d.data();
        const p = {
          orderId: (data.orderId as string) || "",
          remarks: data.remarks as string | undefined,
        };
        if (isCreditPayment(p) || isOpeningPayment(p) || isOldKharchaPayment(p)) return;
        paidByOrder.set(p.orderId, (paidByOrder.get(p.orderId) || 0) + ((data.amount as number) || 0));
      });

      let openingBase = liveOpening;
      // Legacy profile oldKharcha folds into Remaining once (not week unpaid).
      openingBase += liveOldKharcha;

      let carryIn = 0;
      for (const d of orderSnap.docs) {
        const data = d.data();
        const status = (data.status as string) || "ASSIGNED";
        if (status === "COMPLETED" || status === "CANCELLED" || status === "REJECTED") continue;
        const prev: KaarigerOrder = {
          id: (data.id as string) || d.id,
          kaarigerId: kaariger.phone,
          kaarigerName: kaariger.name,
          productName: (data.productName as string) || "",
          targetQuantity: (data.targetQuantity as number) || 0,
          color: "",
          rawMaterials: [],
          totalDealAmount: (data.totalDealAmount as number) || 0,
          pricingType: "PER_PIECE",
          status,
          approvedQuantity: 0,
          createdBy: "",
          createdAt: (data.createdAt as number) || 0,
          kharchaGiven: (data.kharchaGiven as number) || 0,
          kharchaCarriedForward: (data.kharchaCarriedForward as number) || 0,
          kharchaCarryIn: (data.kharchaCarryIn as number) || 0,
        };
        const paid = paidByOrder.get(prev.id) || 0;
        carryIn += orderKharchaCarryOut(prev, paid);
        await updateDoc(doc(db, "kaariger_orders", prev.id), {
          status: "COMPLETED",
        });
      }

      const createdAt = Date.now();
      const weekMeta = weekLabelFromDate(createdAt);

      // Build raw-material deduction refs for selected entries
      const selectedRmEntries = rmEntries.filter((e) => rmSelected.has(e.entryId));
      const rawMaterialDeductions: RawMaterialDeductionRef[] = selectedRmEntries.map((e) => ({
        entryId: e.entryId,
        rawMaterialBillId: e.billId,
        billNo: e.billNo,
        materialName: e.materialName,
        totalQuantity: e.totalQuantity,
        ratePerPiece: e.ratePerPiece,
        totalAmount: e.totalAmount,
      }));
      const rawMaterialDeductionsTotal = rawMaterialDeductions.reduce((s, r) => s + r.totalAmount, 0);

      const standaloneRepairsCost = activeStandaloneRepairs.reduce((s, r) => s + r.totalRepairCost, 0);

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
        status: "ASSIGNED",
        approvedQuantity: 0,
        createdBy: session?.name || "Admin",
        createdAt,
        notes: notes.trim(),
        products,
        productsTotal: calc.productsTotal,
        materialDeductions: calc.deductionLines,
        materialDeductionsTotal: calc.deductionsTotal,
        rawMaterialDeductions,
        rawMaterialDeductionsTotal,
        repairDeductionTotal: standaloneRepairsCost,
        kharchaGiven: calc.kharchaAmount,
        kharchaCarryIn: carryIn,
        kharchaCarriedForward: 0,
        weekLabel: weekMeta.label,
        weekKey: weekMeta.key,
      };

      // Remaining += ADD − week kharcha. Carry only adjusts the Kharcha box start.
      const openingAtCreation = openingBase;
      const addBalance = orderAddBalance(order);
      const closingAtCreation = Math.max(0, openingAtCreation + addBalance - calc.kharchaAmount);
      order.openingAtCreation = openingAtCreation;
      order.addBalance = addBalance;
      order.closingAtCreation = closingAtCreation;

      await setDoc(doc(db, "kaariger_orders", id), order);

      // Link standalone repairs to this finalized order
      if (activeStandaloneRepairs.length > 0) {
        await Promise.all(
          activeStandaloneRepairs.map((r) =>
            updateDoc(doc(db, "order_repairs", r.id), {
              orderId: id,
              deferToNextBill: false,
            })
          )
        );
      }

      // Mark each selected raw-material entry as adjusted
      if (selectedRmEntries.length > 0) {
        // Group by bill to do one read+update per bill
        const byBill = new Map<string, string[]>();
        selectedRmEntries.forEach((e) => {
          if (!byBill.has(e.billId)) byBill.set(e.billId, []);
          byBill.get(e.billId)!.push(e.entryId);
        });
        await Promise.all(
          Array.from(byBill.entries()).map(async ([billId, entryIds]) => {
            const billSnap = await getDocs(
              query(collection(db, "raw_material_bills"), where("__name__", "==", billId))
            );
            if (billSnap.empty) return;
            const billData = billSnap.docs[0].data() as RawMaterialBill;
            const updatedKaarigers = billData.kaarigers.map((k) => {
              if (!entryIds.includes(k.id)) return k;
              return {
                ...k,
                adjustmentStatus: "adjusted" as const,
                adjustedInKaarigerBillId: id,
                adjustedAt: createdAt,
              };
            });
            await updateDoc(doc(db, "raw_material_bills", billId), {
              kaarigers: updatedKaarigers,
            });
          })
        );
      }
      await updateDoc(doc(db, "employees", kaariger.phone), {
        openingBalance: Math.max(0, closingAtCreation),
        oldKharcha: 0,
        kharchaCarry: 0,
      });

      const totalAfterCreate = totalRemainingAmount({
        openingBalance: closingAtCreation,
        creditBalance: liveCredit,
      });
      const boxStart = calc.kharchaAmount - carryIn;
      setSuccessMsg(
        `${weekMeta.label} bill for ${kaariger.name} saved. Total remaining ${money(totalAfterCreate)}` +
          (calc.kharchaAmount > 0
            ? ` · Kharcha box ${money(boxStart)}${
                carryIn !== 0
                  ? ` (budget ${money(calc.kharchaAmount)}${
                      carryIn > 0
                        ? ` − overpay ${money(carryIn)}`
                        : ` + left ${money(-carryIn)}`
                    })`
                  : ""
              }.`
            : ".") +
          (liveCredit > 0 ? `` : "")
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
  const productOptions = catalogProducts.map((p) => ({
    id: p.id,
    label:
      p.price && p.price > 0
        ? `${p.name} · ₹${p.price.toLocaleString("en-IN")}/pc`
        : p.name,
  }));
  const materialOptions = rawMaterials.map((m) => ({
    id: m.id,
    label:
      m.price && m.price > 0
        ? `${m.name} · ₹${m.price.toLocaleString("en-IN")}/pc`
        : m.name,
  }));

  return (
    <div className="stagger space-y-5">
      <PageToolbar
        title="Kaarigar"
        actions={
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearForm}>
            <Eraser className="h-4 w-4" />
            Clear form
          </button>
        }
      >
</PageToolbar>

      <form onSubmit={sendOrder} className="card mx-auto max-w-4xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--jade-soft)]">
              <ClipboardList className="h-4 w-4 text-[var(--jade-deep)]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold">New Kaarigar Bill</h2>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={clearForm}>
            <Eraser className="h-4 w-4" />
            Clear
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
          {kaarigerId && (
            <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Wallet className="h-4 w-4 shrink-0 text-amber-800" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800/80">
                    Outstanding · Total Remaining
                  </p>
                  <p className="truncate text-xs text-amber-900/70">
                    {selectedKaariger?.name || "Kaariger"}
                  </p>
                </div>
              </div>
              <p className="shrink-0 font-display text-lg font-bold text-amber-950">
                {outstandingLoading || outstanding == null ? "…" : money(outstanding)}
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="label mb-0 flex items-center gap-1.5">
              <ShoppingBag className="h-3.5 w-3.5" />
              Products
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addProductLine}>
              <Plus className="h-3.5 w-3.5" />
              Add product
            </button>
          </div>
 
          <div className="space-y-2.5">
            {productLines.map((line, i) => {
              const lineTotal = (Number(line.quantity) || 0) * (Number(line.pricePerPiece) || 0);
              return (
                <div key={i} className="rounded-xl border border-[var(--border)] p-2.5">
                  <div className="space-y-2 sm:grid sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_2.75rem] sm:items-start sm:gap-2 sm:space-y-0">
                    <SearchSelect
                      value={line.productId}
                      onSelect={(id) => {
                        if (!id) {
                          updateProductLine(i, {
                            productId: "",
                            productName: "",
                          });
                          return;
                        }
                        const product = catalogProducts.find((p) => p.id === id);
                        const catalogPrice =
                          product?.price && product.price > 0 ? String(product.price) : "";
                        updateProductLine(i, {
                          productId: id,
                          productName: product?.name || "",
                          pricePerPiece: catalogPrice,
                        });
                      }}
                      options={productOptions}
                      placeholder="Search catalog product (optional)…"
                      emptyText="No products in catalog"
                    />
                    <div className="grid grid-cols-[1fr_1fr_2.75rem] gap-2 sm:contents">
                      <input
                        className="input-qty"
                        type="text"
                        inputMode="decimal"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => updateProductLine(i, { quantity: e.target.value })}
                      />
                      <input
                        className="input-qty"
                        type="text"
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
                No products — optional. You can still send deductions / week kharcha.
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
            Runner / Fitting / Astar
          </p>

          <div className="space-y-2">
            {DEDUCTION_ITEMS.map(({ type, label }) => (
              <div
                key={type}
                className="grid grid-cols-[minmax(0,1fr)_8.5rem_8.5rem] items-end gap-2 rounded-xl border border-[var(--border)] p-2.5"
              >
                <p className="pb-2 text-sm font-semibold">{label}</p>
                <div>
                  <label className="label !text-[10px]">Qty</label>
                  <input
                    className="input-qty"
                    type="text"
                    inputMode="decimal"
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
                    className="input-qty"
                    type="text"
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
              Material
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
                className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] p-2.5 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_auto] sm:items-end"
              >
                <div>
                  <label className="label !text-[10px]">Material</label>
                  <SearchSelect
                    value={m.materialId}
                    onSelect={(id) => {
                      const mat = rawMaterials.find((x) => x.id === id);
                      const catalogPrice =
                        mat?.price && mat.price > 0 ? String(mat.price) : "";
                      updateMaterialLine(index, {
                        materialId: id,
                        name: mat?.name || "",
                        price: catalogPrice,
                      });
                    }}
                    options={materialOptions}
                    placeholder="Search material…"
                    emptyText="No materials — add one above"
                  />
                </div>
                <div>
                  <label className="label !text-[10px]">Qty</label>
                  <input
                    className="input-qty"
                    type="text"
                    inputMode="decimal"
                    value={m.qty}
                    onChange={(e) => updateMaterialLine(index, { qty: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="label !text-[10px]">₹ / pc</label>
                  <input
                    className="input-qty"
                    type="text"
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

        {/* ── Raw Material Deductions ─────────────────────────────────── */}
        {kaarigerId && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Package className="h-3.5 w-3.5 text-[var(--jade-deep)]" />
              <p className="label mb-0">Raw Material Deductions</p>
            </div>
            {rmLoading ? (
              <p className="rounded-xl border border-[var(--border)] px-3 py-3 text-sm text-[var(--text-muted)]">
                Loading…
              </p>
            ) : rmEntries.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-3 text-center text-xs text-[var(--text-muted)]">
                No pending raw-material entries for this kaariger.
              </p>
            ) : (
              <div className="space-y-2">
                {rmEntries.map((e) => {
                  const added = rmSelected.has(e.entryId);
                  return (
                    <div
                      key={e.entryId}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition ${
                        added
                          ? "border-danger/30 bg-red-50"
                          : "border-[var(--border)] bg-[var(--surface-raised)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {e.materialName}
                          <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">
                            RM-{e.billNo}{e.companyName ? ` (${e.companyName})` : ""}
                          </span>
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {e.totalQuantity.toLocaleString("en-IN")} pcs × ₹{e.ratePerPiece}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`font-bold ${added ? "text-danger" : "text-[var(--text)]"}`}>
                          {added ? "−" : ""}₹{e.totalAmount.toLocaleString("en-IN")}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleRmEntry(e.entryId)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            added
                              ? "bg-danger/10 text-danger hover:bg-danger/20"
                              : "bg-[var(--jade-soft)] text-[var(--jade-deep)] hover:bg-[var(--jade-soft)]/80"
                          }`}
                        >
                          {added ? "✕ Remove" : "+ Add"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {rmDeductionTotal > 0 && (
              <div className="mt-2.5 flex items-center justify-between rounded-xl bg-red-50 px-3 py-2.5 text-sm">
                <span className="font-medium text-danger">Raw Material Total</span>
                <span className="font-bold text-danger">−{money(rmDeductionTotal)}</span>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="label">
            <span className="inline-flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Week kharcha budget
            </span>
          </label>
          <input
            className="input"
            type="text"
            inputMode="decimal"
            value={kharcha}
            onChange={(e) => setKharcha(e.target.value)}
            placeholder="e.g. 40000"
          />
 
          {currentOldKharcha > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Old kharcha still pending: {money(currentOldKharcha)}
            </p>
          )}
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
            <p className="text-xs font-bold uppercase tracking-wider">Week total</p>
          </div>
          <div className="space-y-1 text-sm">
            <Row label="Opening (current remaining)" value={money(calc.grossOpening)} />
            {currentCredit > 0 && (
              <Row label="Credit applied" value={`−${money(currentCredit)}`} />
            )}
            {currentCredit > 0 && (
              <Row label="Net opening (Total Remaining now)" value={money(calc.netOpening)} bold />
            )}
            <Row label="MAAL (products)" value={money(calc.productsTotal)} />
            <Row label="Less: Material / Runner / Fitting / Astar" value={`−${money(calc.deductionsTotal)}`} />
            {rmDeductionTotal > 0 && (
              <Row label="Less: Raw Material deductions" value={`−${money(rmDeductionTotal)}`} />
            )}
            {activeStandaloneRepairs.map((r, i) => (
              <Row
                key={`preview-standalone-${r.id}-${i}`}
                label={`Less: Repairing - ${r.productName}`}
                value={`−${money(r.totalRepairCost)}`}
              />
            ))}
            <div className="my-2 border-t border-jade/20" />
            <Row label="ADD BALANCE" value={money(calc.addBalance)} bold />
            <Row label="Running balance after ADD" value={money(calc.runningAfterAdd)} bold />
            <Row label="Kharcha budget (this week)" value={money(calc.kharchaAmount)} accent />
            {calc.pendingKharchaCarry !== 0 && (
              <Row
                label={
                  calc.pendingKharchaCarry > 0
                    ? "Prior overpay (into box)"
                    : "Prior left unpaid (into box)"
                }
                value={
                  calc.pendingKharchaCarry > 0
                    ? `−${money(calc.pendingKharchaCarry)}`
                    : `+${money(-calc.pendingKharchaCarry)}`
                }
              />
            )}
            {calc.kharchaAmount > 0 && (
              <Row label="Kharcha box after send" value={money(calc.kharchaBoxStart)} bold accent />
            )}
            <div className="my-2 border-t border-jade/20" />
            <Row label="Total remaining after send" value={money(calc.totalRemainingPreview)} bold accent />
          </div>
 
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
