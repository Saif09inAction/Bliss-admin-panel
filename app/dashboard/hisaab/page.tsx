"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import {
  Download,
  History,
  IndianRupee,
  MessageCircle,
  Package,
  Plus,
  Receipt,
  ShoppingBag,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import {
  downloadCsvRows,
  formatClockTime,
  formatDisplayDate,
  formatDisplayTime,
  formatRupee,
  timeSortKey,
} from "@/lib/csv";
import { exportBillExcel } from "@/lib/bill-export";
import {
  isCreditPayment,
  isOldKharchaPayment,
  isOpeningPayment,
  orderNetDeal,
  payKaarigerKharcha,
  paymentKind,
  paymentLabel,
} from "@/lib/kaariger-pay";
import { buildHisaabLedger, orderKharchaUnpaid, orderWeekMeta } from "@/lib/kaariger-hisaab";
import { isStandaloneRepair } from "@/lib/types";
import type {
  Employee,
  KaarigerOrder,
  KaarigerPayment,
  OrderMaterial,
  OrderProductLine,
  OrderRepair,
  RepairLineItem,
  RepairStatus,
} from "@/lib/types";
import PageToolbar from "@/components/admin/PageToolbar";
import SearchSelect from "@/components/admin/SearchSelect";
import BillWhatsAppModal from "@/components/BillWhatsAppModal";

const money = formatRupee;

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

function formatDate(ts: number) {
  return ts ? new Date(ts).toLocaleDateString("en-IN") : "—";
}

function formatTime(ts: number) {
  return formatClockTime(ts);
}

/** Older repair docs without status were already deducted. */
function isApprovedRepair(r: OrderRepair) {
  return !r.status || r.status === "APPROVED";
}

export default function HisaabPage() {
  const { session } = useAuth();
  const [kaarigers, setKaarigers] = useState<Employee[]>([]);
  const [kaarigerId, setKaarigerId] = useState("");
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [payments, setPayments] = useState<KaarigerPayment[]>([]);
  const [repairs, setRepairs] = useState<OrderRepair[]>([]);
  const [loading, setLoading] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);
  /** Unified Pay (opening → bills → credit). When true, ignore payOrderId for allocation. */
  const [showUnifiedPay, setShowUnifiedPay] = useState(false);
  /** Hidden by default — Transactions button reveals the full payment history. */
  const [showTransactions, setShowTransactions] = useState(false);
  /** Click Total Remaining → opening / rolled kharcha / week kharcha breakdown. */
  const [showRemainingBreakdown, setShowRemainingBreakdown] = useState(false);
  /** Click Kharcha → payment lines with date & amount. */
  const [showKharchaBreakdown, setShowKharchaBreakdown] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", remarks: "" });
  const [paySaving, setPaySaving] = useState(false);
  const [payMsg, setPayMsg] = useState("");
  const [historyOrderId, setHistoryOrderId] = useState("");

  async function loadKaarigers() {
    const snap = await getDocs(collection(getDb(), "employees"));
    setKaarigers(
      snap.docs
        .filter((d) => d.data().role === "KAARIGER")
        .map((d) => ({
          id: d.id,
          name: (d.data().name as string) || "",
          phone: (d.data().phone as string) || "",
          joiningDate: "",
          monthlySalary: 0,
          attendancePercentage: 0,
          role: "KAARIGER" as const,
          creditBalance: (d.data().creditBalance as number) || 0,
          openingBalance: (d.data().openingBalance as number) || 0,
          oldKharcha: (d.data().oldKharcha as number) || 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  useEffect(() => {
    loadKaarigers();
  }, []);

  async function loadKaarigerData(id: string) {
    if (!id) {
      setOrders([]);
      setPayments([]);
      setRepairs([]);
      return;
    }
    setLoading(true);
    try {
      const db = getDb();
      const [orderSnap, paySnap, repairSnap] = await Promise.all([
        getDocs(query(collection(db, "kaariger_orders"), where("kaarigerId", "==", id))),
        getDocs(query(collection(db, "kaariger_payments"), where("kaarigerId", "==", id))),
        getDocs(query(collection(db, "order_repairs"), where("kaarigerId", "==", id))),
      ]);

      const loadedOrders = orderSnap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: (data.id as string) || d.id,
            kaarigerId: data.kaarigerId as string,
            kaarigerName: data.kaarigerName as string,
            productName: (data.productName as string) || "",
            targetQuantity: (data.targetQuantity as number) || 0,
            color: (data.color as string) || "",
            rawMaterials: (data.rawMaterials as OrderMaterial[]) || [],
            totalDealAmount: (data.totalDealAmount as number) || 0,
            pricePerPiece: data.pricePerPiece as number | undefined,
            pricingType: (data.pricingType as "OVERALL" | "PER_PIECE") || "OVERALL",
            status: (data.status as string) === "APPROVED" ? "COMPLETED" : ((data.status as string) || "ASSIGNED"),
            approvedQuantity: (data.approvedQuantity as number) || 0,
            createdBy: (data.createdBy as string) || "",
            createdAt: (data.createdAt as number) || 0,
            notes: data.notes as string | undefined,
            originalDealAmount: data.originalDealAmount as number | undefined,
            repairDeductionTotal: (data.repairDeductionTotal as number) || 0,
            products: (data.products as OrderProductLine[]) || [],
            productsTotal: data.productsTotal as number | undefined,
            materialDeductions: (data.materialDeductions as RepairLineItem[]) || [],
            materialDeductionsTotal: data.materialDeductionsTotal as number | undefined,
            kharchaGiven: data.kharchaGiven as number | undefined,
            kharchaCarriedForward: data.kharchaCarriedForward as number | undefined,
            weekLabel: data.weekLabel as string | undefined,
            weekKey: data.weekKey as string | undefined,
            openingAtCreation: data.openingAtCreation as number | undefined,
            addBalance: data.addBalance as number | undefined,
            closingAtCreation: data.closingAtCreation as number | undefined,
          } satisfies KaarigerOrder;
        })
        .sort((a, b) => b.createdAt - a.createdAt);
      setOrders(loadedOrders);

      const loadedPayments = paySnap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: (data.id as string) || d.id,
            orderId: data.orderId as string,
            kaarigerId: data.kaarigerId as string,
            amount: (data.amount as number) || 0,
            date: (data.date as string) || "",
            time: (data.time as string) || "",
            remarks: data.remarks as string | undefined,
            createdBy: (data.createdBy as string) || "",
            createdAt: (data.createdAt as number) || 0,
          } satisfies KaarigerPayment;
        })
        // Newest first (createdAt when present, else date+time).
        .sort((a, b) => {
          const ac = a.createdAt || 0;
          const bc = b.createdAt || 0;
          if (ac !== bc) return bc - ac;
          return `${b.date} ${timeSortKey(b.time)}`.localeCompare(`${a.date} ${timeSortKey(a.time)}`);
        });
      setPayments(loadedPayments);

      // Self-heal stored credit from order overpayments only.
      // Opening / old-remaining payments and advance ledger rows are excluded —
      // they must not inflate or wipe creditBalance.
      const totalDealAll = loadedOrders.reduce((s, o) => s + orderNetDeal(o), 0);
      const totalFreshCashPaid = loadedPayments
        .filter(
          (p) =>
            !isOpeningPayment(p) &&
            p.remarks !== "Credit carried from previous overpaid bill" &&
            p.remarks !== "Extra kharcha — carried as credit"
        )
        .reduce((s, p) => s + p.amount, 0);
      const correctCredit = Math.max(0, totalFreshCashPaid - totalDealAll);
      const storedCredit = kaarigers.find((k) => k.phone === id)?.creditBalance || 0;
      // Only heal upward (legacy under-credit bug). Never wipe opening/advance credit.
      if (correctCredit > storedCredit + 0.5) {
        await updateDoc(doc(db, "employees", id), { creditBalance: correctCredit });
        setKaarigers((prev) =>
          prev.map((k) => (k.phone === id ? { ...k, creditBalance: correctCredit } : k))
        );
      }

      setRepairs(
        repairSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: (data.id as string) || d.id,
              orderId: (data.orderId as string) || "",
              kaarigerId: (data.kaarigerId as string) || "",
              kaarigerName: (data.kaarigerName as string) || "",
              productName: (data.productName as string) || "",
              faultyQuantity: (data.faultyQuantity as number) || 0,
              faultyPricePerPiece: (data.faultyPricePerPiece as number) || 0,
              faultyTotal: (data.faultyTotal as number) || 0,
              items: ((data.items as RepairLineItem[]) || []).map((it) => ({
                type: it.type,
                label: it.label,
                quantity: Number(it.quantity) || 0,
                pricePerPiece: Number(it.pricePerPiece) || 0,
                lineTotal: Number(it.lineTotal) || 0,
              })),
              totalRepairCost: (data.totalRepairCost as number) || 0,
              originalDealAmount: (data.originalDealAmount as number) || 0,
              dealAfterThisRepair: (data.dealAfterThisRepair as number) || 0,
              notes: data.notes as string | undefined,
              createdBy: (data.createdBy as string) || "",
              createdAt: (data.createdAt as number) || 0,
              status: (["PENDING", "APPROVED", "REJECTED"].includes(data.status as string)
                ? (data.status as RepairStatus)
                : undefined),
              reviewedBy: data.reviewedBy as string | undefined,
              reviewedAt: data.reviewedAt as number | undefined,
            } satisfies OrderRepair;
          })
          .sort((a, b) => b.createdAt - a.createdAt)
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadKaarigerData(kaarigerId);
    setHistoryOrderId("");
    setShowTransactions(false);
  }, [kaarigerId]);

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !kaarigerId) return;
    const amount = Number(payForm.amount) || 0;
    if (amount <= 0) return;

    setPaySaving(true);
    setPayMsg("");
    try {
      const k = kaarigers.find((x) => x.phone === kaarigerId);
      if (!k) throw new Error("Kaariger not found.");

      // Always allocate: old kharcha → week kharcha → opening → credit.
      const standaloneRepairs = repairs
        .filter((r) => isStandaloneRepair(r.orderId) && (!r.status || r.status === "APPROVED"))
        .reduce((s, r) => s + (r.totalRepairCost || 0), 0);
      const result = await payKaarigerKharcha({
        kaarigerId,
        amount,
        remarks: payForm.remarks.trim() || undefined,
        createdBy: session.name,
        openingBalance: k.openingBalance || 0,
        creditBalance: k.creditBalance || 0,
        oldKharcha: k.oldKharcha || 0,
        orders,
        payments,
        standaloneRepairTotal: standaloneRepairs,
      });
      setPayMsg(result.message);
      setPayForm({ amount: "", remarks: "" });
      setShowUnifiedPay(false);
      setPayOrderId(null);
      await Promise.all([loadKaarigerData(kaarigerId), loadKaarigers()]);
    } catch (err) {
      setPayMsg(err instanceof Error ? err.message : "Failed to record kharcha.");
    } finally {
      setPaySaving(false);
    }
  }

  const kaarigerOptions = kaarigers.map((k) => ({ id: k.phone, label: k.name, sublabel: k.phone }));
  const selectedKaariger = kaarigers.find((k) => k.phone === kaarigerId);

  const orderPaidMap = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((p) => {
      if (isCreditPayment(p) || isOpeningPayment(p) || isOldKharchaPayment(p)) return;
      map.set(p.orderId, (map.get(p.orderId) || 0) + p.amount);
    });
    return map;
  }, [payments]);

  // Once an order is fully paid it moves entirely out of the active view —
  // its products, deductions, repairs and kharcha are only reachable via
  // "See previous hisaab". The active view never merges multiple orders
  // together; each one gets its own separate card.
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== "COMPLETED"), [orders]);
  const completedOrders = useMemo(() => orders.filter((o) => o.status === "COMPLETED"), [orders]);

  const activeTotals = useMemo(() => {
    const weekKharcha = activeOrders.reduce((s, o) => s + Math.max(0, o.kharchaGiven || 0), 0);
    const paid = activeOrders.reduce((s, o) => s + (orderPaidMap.get(o.id) || 0), 0);
    const balance = activeOrders.reduce(
      (s, o) => s + orderKharchaUnpaid(o, orderPaidMap.get(o.id) || 0),
      0
    );
    return { deal: weekKharcha, paid, balance };
  }, [activeOrders, orderPaidMap]);

  // Running balance (opening) + this week's unpaid kharcha = Total Remaining.
  // Kharcha box shows only this week's unpaid (old carry is folded into opening on next Saturday).
  const openingBal = Math.max(0, selectedKaariger?.openingBalance || 0);
  const oldKharchaBal = Math.max(0, selectedKaariger?.oldKharcha || 0);
  const creditBal = Math.max(0, selectedKaariger?.creditBalance || 0);
  const standaloneRepairTotal = useMemo(
    () =>
      repairs
        .filter(
          (r) =>
            isStandaloneRepair(r.orderId) &&
            (!r.status || r.status === "APPROVED")
        )
        .reduce((s, r) => s + (r.totalRepairCost || 0), 0),
    [repairs]
  );
  /** Legacy oldKharcha still on profile until next Saturday bill folds it in. */
  const runningBalance = openingBal + oldKharchaBal;
  const weekKharchaUnpaid = activeTotals.balance;
  const kharchaRemaining = weekKharchaUnpaid;
  const weekKharchaBudget = activeTotals.deal;
  const weekKharchaPaid = activeTotals.paid;
  /** This week's transfer payments (line-wise for Kharcha breakdown). Oldest first like the sheet. */
  const weekKharchaPayments = useMemo(() => {
    const activeIds = new Set(activeOrders.map((o) => o.id));
    return payments
      .filter((p) => {
        if (isCreditPayment(p) || isOpeningPayment(p) || isOldKharchaPayment(p)) return false;
        return activeIds.has(p.orderId);
      })
      .sort((a, b) =>
        `${a.date} ${timeSortKey(a.time)}`.localeCompare(`${b.date} ${timeSortKey(b.time)}`)
      );
  }, [payments, activeOrders]);
  const oldKharchaPayments = useMemo(
    () =>
      payments
        .filter(isOldKharchaPayment)
        .sort((a, b) =>
          `${a.date} ${timeSortKey(a.time)}`.localeCompare(`${b.date} ${timeSortKey(b.time)}`)
        ),
    [payments]
  );
  // openingBalance already nets week kharcha given at bill create — do not add unpaid again.
  const grossOwed = runningBalance;
  const totalRemaining = Math.max(0, grossOwed - creditBal - standaloneRepairTotal);
  const surplusCredit = Math.max(0, creditBal - Math.max(0, grossOwed - standaloneRepairTotal));
  const creditAppliedToRemaining = Math.min(creditBal, Math.max(0, grossOwed - standaloneRepairTotal));
  const openingPayments = useMemo(
    () =>
      payments
        .filter(isOpeningPayment)
        .sort((a, b) => `${b.date} ${timeSortKey(b.time)}`.localeCompare(`${a.date} ${timeSortKey(a.time)}`)),
    [payments]
  );
  const openingPaidTotal = openingPayments.reduce((s, p) => s + p.amount, 0);
  /** Original opening before payments (stored remaining + what was already paid). */
  const originalOpening = openingBal + openingPaidTotal;

  const orderNameById = useMemo(
    () => new Map(orders.map((o) => [o.id, o.productName || "Bill"])),
    [orders]
  );

  /** Every kharcha row for this kaariger — opening, bills, credit — newest first. */
  const allTransactions = useMemo(
    () =>
      [...payments]
        .sort((a, b) => {
          const ac = a.createdAt || 0;
          const bc = b.createdAt || 0;
          if (ac !== bc) return bc - ac;
          return `${b.date} ${timeSortKey(b.time)}`.localeCompare(`${a.date} ${timeSortKey(a.time)}`);
        })
        .map((p) => ({
          payment: p,
          kind: paymentKind(p),
          label: paymentLabel(p, orderNameById),
        })),
    [payments, orderNameById]
  );
  const transactionsTotal = allTransactions.reduce((s, t) => s + t.payment.amount, 0);
  const billPaidTotal = allTransactions
    .filter((t) => t.kind === "bill")
    .reduce((s, t) => s + t.payment.amount, 0);
  const creditPaidTotal = allTransactions
    .filter((t) => t.kind === "credit")
    .reduce((s, t) => s + t.payment.amount, 0);

  const previousHisaabOptions = completedOrders.map((o) => {
    const week = orderWeekMeta(o);
    return {
      id: o.id,
      label: `${week.label}${o.productName ? ` · ${o.productName}` : ""}`,
      sublabel: `${formatDate(o.createdAt)} · ADD ${money(orderNetDeal(o))}`,
    };
  });

  const historyOrder = completedOrders.find((o) => o.id === historyOrderId) || null;

  const ledgerLines = useMemo(
    () =>
      buildHisaabLedger({
        orders,
        payments,
        openingBalance: openingBal,
        oldKharcha: oldKharchaBal,
        creditBalance: creditBal,
        standaloneRepairTotal,
      }),
    [orders, payments, openingBal, oldKharchaBal, creditBal, standaloneRepairTotal]
  );

  function exportStatement() {
    if (!selectedKaariger) return;
    const rows: string[][] = [];
    rows.push([`Hisaab Statement — ${selectedKaariger.name}`]);
    rows.push([`Phone: ${selectedKaariger.phone}`]);
    rows.push([`Generated: ${new Date().toLocaleString("en-IN")}`]);
    if (grossOwed > 0 || creditBal > 0) {
      rows.push([
        `Remaining balance (opening + bills − credit): ${money(totalRemaining)}`,
      ]);
      if (originalOpening > 0) {
        rows.push(
          openingPaidTotal > 0
            ? [
                `  Opening balance: ${money(originalOpening)} − ${money(openingPaidTotal)} = ${money(openingBal)}`,
              ]
            : [`  Opening balance: ${money(openingBal)}`]
        );
      }
      if (activeTotals.balance > 0) rows.push([`  Unpaid bills: ${money(activeTotals.balance)}`]);
      if (creditBal > 0) rows.push([`  Credit applied to remaining: ${money(Math.min(creditBal, grossOwed))}`]);
      if (surplusCredit > 0) {
        rows.push([`Credit left for next bill: ${money(surplusCredit)}`]);
      }
    }
    rows.push([]);

    rows.push(["ORDERS"]);
    rows.push(["Product", "Status", "Date", "Deal", "Paid", "Balance"]);
    let allDeal = 0;
    let allPaid = 0;
    orders.forEach((o) => {
      const weekKharcha = Math.max(0, o.kharchaGiven || 0);
      const paid = orderPaidMap.get(o.id) || 0;
      const balance = orderKharchaUnpaid(o, paid);
      allDeal += weekKharcha;
      allPaid += paid;
      rows.push([
        o.productName,
        o.status.replace(/_/g, " "),
        formatDate(o.createdAt),
        String(Math.round(weekKharcha)),
        String(Math.round(paid)),
        String(Math.round(balance)),
      ]);
    });
    rows.push(["", "", "TOTAL", String(Math.round(allDeal)), String(Math.round(allPaid)), String(Math.round(Math.max(0, allDeal - allPaid)))]);
    rows.push([]);

    if (payments.length > 0) {
      rows.push(["TRANSACTIONS"]);
      rows.push(["Date", "Time", "Type", "Amount", "Remarks", "Created By"]);
      const names = new Map(orders.map((o) => [o.id, o.productName]));
      [...payments]
        .sort((a, b) => `${b.date} ${timeSortKey(b.time)}`.localeCompare(`${a.date} ${timeSortKey(a.time)}`))
        .forEach((p) => {
          rows.push([
            p.date,
            formatDisplayTime(p.time),
            paymentLabel(p, names),
            String(Math.round(p.amount)),
            p.remarks || "",
            p.createdBy,
          ]);
        });
      rows.push(["", "", "TOTAL", String(Math.round(payments.reduce((s, p) => s + p.amount, 0))), "", ""]);
      rows.push([]);
    }

    if (repairs.length > 0) {
      rows.push(["REPAIRING DEDUCTIONS"]);
      rows.push(["Date", "Time", "Order", "Faulty Qty", "Price/pc", "Amount", "Created By", "Notes"]);
      const orderNameById = new Map(orders.map((o) => [o.id, o.productName]));
      const approvedRepairs = repairs.filter(isApprovedRepair);
      [...approvedRepairs]
        .sort((a, b) => a.createdAt - b.createdAt)
        .forEach((r) => {
          rows.push([
            formatDate(r.createdAt),
            formatTime(r.createdAt),
            orderNameById.get(r.orderId) || "—",
            String(r.faultyQuantity),
            String(r.faultyPricePerPiece),
            String(Math.round(r.totalRepairCost)),
            r.createdBy,
            r.notes || "",
          ]);
        });
      rows.push(["", "", "", "", "TOTAL", String(Math.round(approvedRepairs.reduce((s, r) => s + r.totalRepairCost, 0))), "", ""]);
      rows.push([]);
    }

    const materialMap = new Map<string, { label: string; qty: number; amount: number }>();
    orders.forEach((o) => {
      (o.materialDeductions || []).forEach((it) => {
        const key = it.label.trim().toLowerCase();
        const existing = materialMap.get(key) || { label: it.label, qty: 0, amount: 0 };
        existing.qty += it.quantity;
        existing.amount += it.lineTotal;
        materialMap.set(key, existing);
      });
    });
    if (materialMap.size > 0) {
      rows.push(["MATERIAL / RUNNER / FITTING / ASTAR BREAKDOWN"]);
      rows.push(["Item", "Total Qty", "Total Amount"]);
      const items = Array.from(materialMap.values()).sort((a, b) => b.amount - a.amount);
      items.forEach((it) => rows.push([it.label, String(it.qty), String(Math.round(it.amount))]));
      rows.push(["TOTAL", "", String(Math.round(items.reduce((s, it) => s + it.amount, 0)))]);
    }

    const safeName = selectedKaariger.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    downloadCsvRows(`hisaab_${safeName || "kaariger"}.csv`, rows);
  }

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Hisaab"
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportStatement}
            disabled={!kaarigerId}
            title={!kaarigerId ? "Select a kaariger first" : "Export this kaariger's full statement"}
          >
            <Download className="h-4 w-4" />
            Export Excel
          </button>
        }
      >
        <p className="section-sub">Full payment & kharcha history per kaariger</p>
      </PageToolbar>

      <div className="card grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label">Select kaariger</label>
          <SearchSelect
            value={kaarigerId}
            onSelect={setKaarigerId}
            options={kaarigerOptions}
            placeholder="Search or select a kaariger…"
            emptyText="No kaarigers found"
          />
        </div>
        <div>
          <label className="label">
            <span className="inline-flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              See previous hisaab
            </span>
          </label>
          <SearchSelect
            value={historyOrderId}
            onSelect={setHistoryOrderId}
            options={previousHisaabOptions}
            placeholder={!kaarigerId ? "Select a kaariger first…" : "Search a completed order…"}
            emptyText="No completed orders yet"
            disabled={!kaarigerId || previousHisaabOptions.length === 0}
          />
        </div>
      </div>

      {!kaarigerId ? (
        <div className="surface flex flex-col items-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-jade-soft text-jade-deep">
            <Receipt size={22} />
          </div>
          <p className="mt-3 font-semibold">Select a kaariger to view their hisaab</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            You&apos;ll see their active orders in full detail, and can pull up any completed
            order&apos;s history separately above.
          </p>
        </div>
      ) : loading ? (
        <div className="surface py-14 text-center text-sm text-[var(--text-muted)]">Loading hisaab…</div>
      ) : (
        <div className="space-y-5">
          <div className="surface flex flex-wrap items-center gap-3 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
              <Wallet size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">{selectedKaariger?.name}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {selectedKaariger?.phone} · {activeOrders.length} active
                {completedOrders.length > 0 ? ` · ${completedOrders.length} completed` : ""}
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <button
                type="button"
                onClick={() => setShowRemainingBreakdown(true)}
                className="rounded-xl bg-[rgba(232,168,56,0.15)] px-3 py-2 text-left transition hover:bg-[rgba(232,168,56,0.25)] sm:text-right"
                title="See how total remaining is calculated"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Total remaining
                </p>
                <p className="font-display text-base font-bold text-amber-900">
                  {money(totalRemaining)}
                </p>
                <p className="text-[10px] text-amber-800/80">Tap for full ledger</p>
              </button>
              <button
                type="button"
                onClick={() => setShowKharchaBreakdown(true)}
                className="rounded-xl bg-jade-soft px-3 py-2 text-left transition hover:bg-jade-soft/80 sm:text-right"
                title="See kharcha payments line by line"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-jade-deep">
                  Kharcha
                </p>
                <p className="font-display text-base font-bold text-jade-deep">
                  {money(kharchaRemaining)}
                </p>
                <p className="text-[10px] text-jade-deep/80">Tap for payment breakup</p>
              </button>
              {totalRemaining <= 0 && surplusCredit > 0 && (
                <div className="rounded-xl bg-jade-soft px-3 py-2 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-jade-deep">
                    Credit (next bill)
                  </p>
                  <p className="font-display text-base font-bold text-jade-deep">
                    {money(surplusCredit)}
                  </p>
                </div>
              )}
              <button
                type="button"
                className={`btn whitespace-nowrap ${showTransactions ? "btn-primary" : "btn-secondary"}`}
                onClick={() => {
                  setShowTransactions((v) => {
                    const next = !v;
                    if (next) {
                      requestAnimationFrame(() => {
                        document.getElementById("hisaab-transactions")?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      });
                    }
                    return next;
                  });
                }}
              >
                <Receipt className="h-4 w-4" />
                {showTransactions ? "Hide transactions" : "Transactions"}
                {!showTransactions && allTransactions.length > 0
                  ? ` (${allTransactions.length})`
                  : ""}
              </button>
              <button
                type="button"
                className="btn btn-primary whitespace-nowrap"
                onClick={() => {
                  setShowUnifiedPay(true);
                  setPayOrderId(null);
                  setPayForm({ amount: "", remarks: "" });
                  setPayMsg("");
                }}
              >
                <IndianRupee className="h-4 w-4" />
                Pay
              </button>
            </div>
          </div>

          {/* Shown only when admin clicks Transactions */}
          {showTransactions && (
            <div
              id="hisaab-transactions"
              className="surface space-y-3 border-2 border-jade/25 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-jade-deep">
                    <Receipt className="h-4 w-4" />
                    All transactions
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Every payment for this kaariger — opening, bills, and credit. Newest first.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowTransactions(false)}
                >
                  Close
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-mist)] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Total paid
                  </p>
                  <p className="font-display text-lg font-bold text-jade-deep">
                    {money(transactionsTotal)}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-mist)] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Opening
                  </p>
                  <p className="font-display text-lg font-bold">{money(openingPaidTotal)}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-mist)] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Bills
                  </p>
                  <p className="font-display text-lg font-bold">{money(billPaidTotal)}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-mist)] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Credit / advance
                  </p>
                  <p className="font-display text-lg font-bold">{money(creditPaidTotal)}</p>
                </div>
              </div>

              {allTransactions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                  No transactions yet. Use Pay — opening and bill payments will appear here.
                </p>
              ) : (
                <div className="space-y-0 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
                  {allTransactions.map(({ payment: p, kind, label }) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{label}</p>
                          <span
                            className={
                              kind === "opening"
                                ? "badge badge-warn"
                                : kind === "old_kharcha"
                                  ? "badge badge-warn"
                                  : kind === "credit"
                                    ? "badge badge-success"
                                    : "badge badge-neutral"
                            }
                          >
                            {kind === "opening"
                              ? "Opening"
                              : kind === "old_kharcha"
                                ? "Old kharcha"
                                : kind === "credit"
                                  ? "Credit"
                                  : "Week"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {formatDisplayDate(p.date)} · {formatDisplayTime(p.time)}
                          {p.createdBy ? ` · by ${p.createdBy}` : ""}
                        </p>
                        {p.remarks && (
                          <p className="text-xs text-[var(--text-muted)]">{p.remarks}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-lg font-bold text-jade-deep">
                          {money(p.amount)}
                        </p>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-jade-deep/80">
                          Paid
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-jade-soft/50 px-3 py-2.5 text-sm">
                    <span className="font-bold text-jade-deep">
                      All transactions ({allTransactions.length})
                    </span>
                    <span className="font-display font-bold text-jade-deep">
                      {money(transactionsTotal)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {(openingBal > 0 ||
            oldKharchaBal > 0 ||
            activeTotals.balance > 0 ||
            creditBal > 0 ||
            openingPaidTotal > 0 ||
            standaloneRepairTotal > 0) && (
            <div className="surface space-y-2 p-4">
              <p className="text-sm text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text)]">Total remaining</span>{" "}
                {money(totalRemaining)}
                {creditBal > 0 ? ` (credit ${money(creditBal)} already applied)` : ""}. Opening
                payments show line by line. Kharcha given on the bill is already in Total Remaining;
                Pay against kharcha is breakup only. Tap Total remaining for the full ledger.
              </p>
            </div>
          )}

          {showRemainingBreakdown && (
            <>
              <div
                className="fixed inset-0 z-50 bg-black/40"
                onClick={() => setShowRemainingBreakdown(false)}
              />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="surface !overflow-y-auto max-h-[90vh] w-full max-w-lg space-y-4 p-5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-bold">Hisaab ledger</h3>
                      <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                        Line by line — oldest first. Running Total Remaining after each row.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0 p-2"
                      onClick={() => setShowRemainingBreakdown(false)}
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm">
                    <div className="rounded-xl bg-amber-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                        Total remaining
                      </p>
                      <p className="font-display text-lg font-bold text-amber-900">
                        {money(totalRemaining)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-jade-soft px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-jade-deep">
                        Kharcha (this week)
                      </p>
                      <p className="font-display text-lg font-bold text-jade-deep">
                        {money(kharchaRemaining)}
                      </p>
                    </div>
                  </div>

                  {ledgerLines.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                      No ledger lines yet.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                      {ledgerLines.map((line, idx) => {
                        const delta = line.deltaRemaining;
                        const deltaLabel =
                          delta === 0
                            ? "—"
                            : delta > 0
                              ? `+${money(delta)}`
                              : `−${money(Math.abs(delta))}`;
                        return (
                          <div
                            key={line.id}
                            className={`border-b border-[var(--border)] px-3 py-2.5 last:border-b-0 ${
                              idx % 2 === 0 ? "bg-white" : "bg-[var(--surface-mist)]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">{line.title}</p>
                                {line.subtitle && (
                                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                                    {line.subtitle}
                                  </p>
                                )}
                                {line.deltaKharcha !== 0 && (
                                  <p className="mt-0.5 text-[11px] text-jade-deep">
                                    Kharcha {line.deltaKharcha > 0 ? "+" : "−"}
                                    {money(Math.abs(line.deltaKharcha))} → box{" "}
                                    {money(line.kharchaAfter)}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <p
                                  className={`text-sm font-bold ${
                                    delta < 0
                                      ? "text-danger"
                                      : delta > 0
                                        ? "text-jade-deep"
                                        : "text-[var(--text-muted)]"
                                  }`}
                                >
                                  {deltaLabel}
                                </p>
                                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                                  Remaining {money(line.remainingAfter)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between gap-3 bg-amber-50 px-3 py-3 text-sm">
                        <p className="font-bold text-amber-900">Live Total remaining</p>
                        <p className="font-display text-lg font-bold text-amber-900">
                          {money(totalRemaining)}
                        </p>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-[var(--text-muted)]">
                    Opening starts at the full amount, then each Pay with date &amp; time. Kharcha
                    given on a bill is deducted once; week Pay is breakup only. Unused kharcha on
                    next Saturday adds back to remaining.
                  </p>
                </div>
              </div>
            </>
          )}

          {showKharchaBreakdown && (
            <>
              <div
                className="fixed inset-0 z-50 bg-black/40"
                onClick={() => setShowKharchaBreakdown(false)}
              />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="surface !overflow-y-auto max-h-[90vh] w-full max-w-md space-y-4 p-5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-bold">Kharcha breakup</h3>
                      <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                        This week&apos;s kharcha and every payment with date
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0 p-2"
                      onClick={() => setShowKharchaBreakdown(false)}
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                    <CalcRow
                      label="This week's kharcha"
                      hint="Saturday budget"
                      value={money(weekKharchaBudget)}
                      emphasize
                    />
                    {activeOrders.map((o) => {
                      const budget = Math.max(0, o.kharchaGiven || 0);
                      if (budget <= 0) return null;
                      const week = orderWeekMeta(o);
                      return (
                        <CalcRow
                          key={o.id}
                          label={`${week.label} kharcha`}
                          hint={`${formatDisplayDate(o.createdAt)}${o.productName ? ` · ${o.productName}` : ""}`}
                          value={money(budget)}
                          muted
                        />
                      );
                    })}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-jade-deep">
                      Payments (line by line)
                    </p>
                    {weekKharchaPayments.length === 0 && oldKharchaPayments.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-sm text-[var(--text-muted)]">
                        No payments yet. When you Pay 20k, then 20k — each line shows here with date.
                      </p>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                        {oldKharchaPayments.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2.5 text-sm last:border-b-0"
                          >
                            <div className="min-w-0">
                              <p className="font-medium">
                                {formatDisplayDate(p.date)}
                                {p.time ? ` · ${formatDisplayTime(p.time)}` : ""}
                              </p>
                              <p className="text-[11px] text-[var(--text-muted)]">
                                {p.remarks || "Old kharcha payment"}
                              </p>
                            </div>
                            <span className="shrink-0 font-bold text-jade-deep">
                              −{money(p.amount)}
                            </span>
                          </div>
                        ))}
                        {weekKharchaPayments.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2.5 text-sm last:border-b-0"
                          >
                            <div className="min-w-0">
                              <p className="font-medium">
                                {formatDisplayDate(p.date)}
                                {p.time ? ` · ${formatDisplayTime(p.time)}` : ""}
                              </p>
                              <p className="text-[11px] text-[var(--text-muted)]">
                                {p.remarks ||
                                  orderNameById.get(p.orderId) ||
                                  "Week kharcha payment"}
                                {p.createdBy ? ` · by ${p.createdBy}` : ""}
                              </p>
                            </div>
                            <span className="shrink-0 font-bold text-jade-deep">
                              −{money(p.amount)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between bg-jade-soft/50 px-3 py-2.5 text-sm">
                          <span className="font-bold text-jade-deep">Total paid</span>
                          <span className="font-bold text-jade-deep">{money(weekKharchaPaid)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-3 text-sm">
                    <div>
                      <p className="font-bold text-amber-900">Kharcha remaining</p>
                      <p className="text-[11px] text-amber-800/80">
                        {money(weekKharchaBudget)} − {money(weekKharchaPaid)} paid
                      </p>
                    </div>
                    <p className="font-display text-lg font-bold text-amber-900">
                      {money(kharchaRemaining)}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {openingPaidTotal > 0 && (
            <div className="surface space-y-2 p-4">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Opening payments (with date &amp; time)
              </p>
              <p className="mb-2 text-xs text-[var(--text-muted)]">
                {money(originalOpening)} was the opening · {money(openingPaidTotal)} paid ·{" "}
                {money(openingBal)} still pending
              </p>
              <div className="space-y-0 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
                {openingPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {formatDisplayDate(p.date)} · {formatDisplayTime(p.time)}
                        {p.createdBy ? ` · by ${p.createdBy}` : ""}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {p.remarks || "Opening balance payment"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-jade-deep">−{money(p.amount)}</p>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-jade-deep/80">
                        Paid
                      </p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-jade-soft/50 px-3 py-2 text-sm">
                  <span className="font-bold text-jade-deep">
                    {money(originalOpening)} − {money(openingPaidTotal)} = {money(openingBal)}
                  </span>
                  <span className="font-bold text-jade-deep">Pending {money(openingBal)}</span>
                </div>
              </div>
            </div>
          )}

          {totalRemaining <= 0 && surplusCredit > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-jade/30 bg-jade-soft/50 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
                <Wallet size={16} />
              </div>
              <p className="text-sm text-jade-deep">
                Nothing pending to pay. <strong>{money(surplusCredit)}</strong> credit will adjust on the next
                bill automatically.
              </p>
            </div>
          )}

          {activeOrders.length === 0 ? (
            <div className="surface py-10 text-center text-sm text-[var(--text-muted)]">
              {completedOrders.length > 0
                ? "No active orders — bill hisaab is settled. Use \u201cSee previous hisaab\u201d above for past orders."
                : totalRemaining > 0
                  ? "No active bills — remaining above is from opening balance on the profile."
                  : surplusCredit > 0
                    ? "Nothing pending. Credit will apply on the next bill."
                    : "No orders yet. Set opening balance on the kaariger profile if they had old pending, or Pay to add credit."}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="stat-card">
                  <p className="stat-card-label">Active Deal</p>
                  <p className="stat-card-value">{money(activeTotals.deal)}</p>
                </div>
                <div className="stat-card">
                  <p className="stat-card-label">Kharcha on bills</p>
                  <p className="stat-card-value text-jade-deep">{money(activeTotals.paid)}</p>
                </div>
                <div className="stat-card">
                  <p className="stat-card-label">Bill balance</p>
                  <p className="stat-card-value">{money(activeTotals.balance)}</p>
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    Total remaining {money(totalRemaining)} includes opening
                    {openingBal > 0 ? ` ${money(openingBal)}` : ""}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {activeOrders.map((o) => (
                  <OrderDetailCard
                    key={o.id}
                    order={o}
                    payments={payments}
                    repairs={repairs}
                    openingBalance={openingBal}
                    oldKharcha={oldKharchaBal}
                    onPay={() => {
                      setShowUnifiedPay(true);
                      setPayOrderId(o.id);
                      setPayForm({ amount: "", remarks: "" });
                      setPayMsg("");
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {historyOrder && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setHistoryOrderId("")} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div
              className="max-h-[88vh] w-full max-w-2xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  className="btn-icon !bg-white"
                  onClick={() => setHistoryOrderId("")}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <OrderDetailCard
                order={historyOrder}
                payments={payments}
                repairs={repairs}
              />
            </div>
          </div>
        </>
      )}

      {(showUnifiedPay || payOrderId) && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => {
              setShowUnifiedPay(false);
              setPayOrderId(null);
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={submitPayment}
              className="surface w-full max-w-sm space-y-4 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold">Add Kharcha</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Clears opening balance first, then unpaid bills. Leftover becomes credit for the next
                    bill.
                    {totalRemaining > 0 ? ` Remaining now: ${money(totalRemaining)}.` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => {
                    setShowUnifiedPay(false);
                    setPayOrderId(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="label">Amount (₹) *</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  autoFocus
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  placeholder="e.g. 500 or 125.5"
                  required
                />
              </div>
              <div>
                <label className="label">Remarks (optional)</label>
                <input
                  className="input"
                  value={payForm.remarks}
                  onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                  placeholder="Optional note"
                />
              </div>
              {payMsg && (
                <p className="rounded-xl bg-jade-soft px-3 py-2 text-sm text-jade-deep">{payMsg}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => {
                    setShowUnifiedPay(false);
                    setPayOrderId(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={paySaving}>
                  <Plus className="h-4 w-4" />
                  {paySaving ? "Saving…" : "Add Kharcha"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function CalcRow({
  label,
  hint,
  value,
  emphasize,
  muted,
}: {
  label: string;
  hint?: string;
  value: string;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2.5 text-sm last:border-b-0">
      <div className="min-w-0">
        <p className={`font-medium ${emphasize ? "text-amber-900" : ""}`}>{label}</p>
        {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
      </div>
      <p
        className={`shrink-0 font-semibold ${
          muted ? "text-[var(--text-muted)]" : emphasize ? "text-amber-900" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** Full, self-contained breakdown for a single order — products, deductions,
 * repairs and kharcha timeline all scoped to just this one order. Orders are
 * never merged together; each gets rendered as its own card. */
function OrderDetailCard({
  order,
  payments,
  repairs,
  openingBalance = 0,
  oldKharcha = 0,
  onPay,
}: {
  order: KaarigerOrder;
  payments: KaarigerPayment[];
  repairs: OrderRepair[];
  /** Running closing / opening from Saturday bills. */
  openingBalance?: number;
  /** Unpaid weekly kharcha carried from previous weeks. */
  oldKharcha?: number;
  onPay?: () => void;
}) {
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const orderPayments = payments
    .filter((p) => p.orderId === order.id)
    .sort((a, b) => `${a.date} ${timeSortKey(a.time)}`.localeCompare(`${b.date} ${timeSortKey(b.time)}`));
  const orderRepairs = repairs.filter((r) => r.orderId === order.id && isApprovedRepair(r));

  const net = orderNetDeal(order);
  const paid = orderPayments.reduce((s, p) => s + p.amount, 0);
  const weekKharchaUnpaid = orderKharchaUnpaid(order, paid);
  const balance = weekKharchaUnpaid;
  const week = orderWeekMeta(order);
  const isCompleted = order.status === "COMPLETED" || weekKharchaUnpaid <= 0;

  return (
    <div className="surface space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-bold">{week.label}</p>
            <span className={orderStatusBadge(order.status)}>{order.status.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {formatDate(order.createdAt)}
            {order.productName ? ` · ${order.productName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm whitespace-nowrap"
            onClick={() => exportBillExcel(order, { payments: orderPayments, repairs: orderRepairs })}
            title="Export this bill to Excel"
          >
            <Download className="h-3.5 w-3.5" />
            Excel
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm whitespace-nowrap"
            onClick={() => setShowWhatsApp(true)}
            title="Share bill image on WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </button>
          {onPay && (
            <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={onPay}>
              <IndianRupee className="h-3.5 w-3.5" />
              Pay
            </button>
          )}
        </div>
      </div>

      {showWhatsApp && (
        <BillWhatsAppModal
          order={order}
          extras={{ payments: orderPayments, repairs: orderRepairs }}
          onClose={() => setShowWhatsApp(false)}
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--surface-mist)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Deal</p>
          <p className="font-display text-sm font-bold">{money(net)}</p>
        </div>
        <div className="rounded-xl bg-jade-soft/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-jade-deep">Paid</p>
          <p className="font-display text-sm font-bold text-jade-deep">{money(paid)}</p>
        </div>
        <div className={`rounded-xl px-3 py-2 ${isCompleted ? "bg-jade-soft/60" : "bg-amber-50"}`}>
          <p
            className={`text-[10px] font-bold uppercase tracking-wider ${
              isCompleted ? "text-jade-deep" : "text-amber-700"
            }`}
          >
            Balance
          </p>
          <p className={`font-display text-sm font-bold ${isCompleted ? "text-jade-deep" : "text-amber-700"}`}>
            {isCompleted ? "All Paid" : money(balance)}
          </p>
        </div>
      </div>

      {order.products && order.products.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <ShoppingBag className="h-3.5 w-3.5" />
            Products
          </p>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <tbody>
                {order.products.map((p, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-[var(--surface-mist)]" : undefined}>
                    <td className="px-3 py-2 font-medium">{p.productName}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {p.quantity} × ₹{p.pricePerPiece}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{money(p.lineTotal)}</td>
                  </tr>
                ))}
                <tr className="bg-jade-soft/40">
                  <td colSpan={2} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-jade-deep">
                    Products Total
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-jade-deep">
                    {money(order.productsTotal ?? 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {order.materialDeductions && order.materialDeductions.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Package className="h-3.5 w-3.5" />
            Runner / Fitting / Astar / Material
          </p>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <tbody>
                {order.materialDeductions.map((it, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-[var(--surface-mist)]" : undefined}>
                    <td className="px-3 py-2 font-medium">{it.label}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {it.quantity} × ₹{it.pricePerPiece}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-danger">−{money(it.lineTotal)}</td>
                  </tr>
                ))}
                <tr className="bg-red-50">
                  <td colSpan={2} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-danger">
                    Deductions Total
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-danger">
                    −{money(order.materialDeductionsTotal ?? 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {orderRepairs.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Wrench className="h-3.5 w-3.5" />
            Repairing Deductions
          </p>
          <div className="space-y-0 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
            {orderRepairs.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.faultyQuantity > 0 ? `${r.faultyQuantity} pcs × ${money(r.faultyPricePerPiece)}` : "—"}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatDate(r.createdAt)} {formatTime(r.createdAt)} · by {r.createdBy}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-bold text-danger">−{money(r.totalRepairCost)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-red-50 px-3 py-2 text-sm">
              <span className="font-bold text-danger">Repair Total</span>
              <span className="font-bold text-danger">
                −{money(order.repairDeductionTotal || orderRepairs.reduce((s, r) => s + r.totalRepairCost, 0))}
              </span>
            </div>
          </div>
        </div>
      )}

      {orderPayments.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <IndianRupee className="h-3.5 w-3.5" />
            Transfers (detail)
          </p>
          <p className="mb-1.5 text-[11px] text-[var(--text-muted)]">
            Each payment is listed separately — same as the sheet transfer column.
          </p>
          <div className="space-y-0 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
            {orderPayments
              .slice()
              .sort((a, b) =>
                `${a.date} ${timeSortKey(a.time)}`.localeCompare(`${b.date} ${timeSortKey(b.time)}`)
              )
              .map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {formatDisplayDate(p.date)} · {formatDisplayTime(p.time)}
                    {p.createdBy ? ` · by ${p.createdBy}` : ""}
                  </p>
                  {p.remarks && <p className="text-xs text-[var(--text-muted)]">{p.remarks}</p>}
                </div>
                <span className="shrink-0 font-bold text-jade-deep">{money(p.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-jade-soft/50 px-3 py-2 text-sm">
              <span className="font-bold text-jade-deep">G.TOTAL paid</span>
              <span className="font-bold text-jade-deep">{money(paid)}</span>
            </div>
            {weekKharchaUnpaid > 0 && (
              <div className="flex items-center justify-between bg-amber-50 px-3 py-2 text-sm">
                <span className="font-bold text-amber-900">Still remaining</span>
                <span className="font-bold text-amber-900">{money(weekKharchaUnpaid)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <GrandTotalBox
        order={order}
        payments={orderPayments}
        openingBalance={openingBalance}
        oldKharcha={oldKharcha}
      />
    </div>
  );
}

/**
 * Sheet-style Grand Total:
 * Opening → MAAL → deductions → week kharcha → ADD BALANCE → Closing
 * then transfer-style kharcha lines (20k, 20k…) not only a combined total.
 */
function GrandTotalBox({
  order,
  payments,
  openingBalance = 0,
  oldKharcha = 0,
}: {
  order: KaarigerOrder;
  payments: KaarigerPayment[];
  openingBalance?: number;
  oldKharcha?: number;
}) {
  const productsTotal = order.productsTotal ?? 0;
  const deductionLines = order.materialDeductions || [];
  const deductionsTotal =
    order.materialDeductionsTotal ??
    deductionLines.reduce((s, it) => s + (it.lineTotal || 0), 0);
  const repairTotal = order.repairDeductionTotal || 0;
  const weekKharcha = Math.max(0, order.kharchaGiven || 0);
  const addBalance =
    order.addBalance != null
      ? order.addBalance
      : productsTotal - deductionsTotal - repairTotal;
  const opening =
    order.openingAtCreation != null
      ? Math.max(0, order.openingAtCreation)
      : Math.max(0, (openingBalance || 0) - addBalance + weekKharcha);
  const closing =
    order.closingAtCreation != null
      ? order.closingAtCreation
      : Math.max(0, opening + addBalance - weekKharcha);
  const old = Math.max(0, oldKharcha || 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const weekUnpaid = orderKharchaUnpaid(order, paid);
  /** Closing already nets kharcha given; unused unpaid returns on next Saturday. */
  const totalRemainingHere = Math.max(0, closing + old);
  const transferLines = [...payments].sort((a, b) =>
    `${a.date} ${timeSortKey(a.time)}`.localeCompare(`${b.date} ${timeSortKey(b.time)}`)
  );

  return (
    <div className="rounded-2xl border border-jade/20 bg-jade-soft/30 p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-jade-deep">Grand Total</p>
      <div className="space-y-1 text-sm">
        <Row label="Opening / running balance" value={money(opening)} accent="amber" />
        <Row label="MAAL (product cost)" value={money(productsTotal)} />
        {deductionLines.length > 0
          ? deductionLines.map((it, i) => (
              <Row
                key={`${it.type}-${it.label}-${i}`}
                label={`Less: ${it.label || it.type}`}
                value={`−${money(it.lineTotal)}`}
              />
            ))
          : deductionsTotal > 0 && (
              <Row
                label="Less: Runner / Fitting / Astar / Material"
                value={`−${money(deductionsTotal)}`}
              />
            )}
        {repairTotal > 0 && (
          <Row label="Less: Repairing" value={`−${money(repairTotal)}`} />
        )}
        <div className="my-1.5 border-t border-jade/20" />
        <Row label="ADD BALANCE" value={money(addBalance)} bold />
        <Row label="After ADD" value={money(opening + addBalance)} bold />
        {weekKharcha > 0 && (
          <Row label="Kharcha given (cash)" value={`−${money(weekKharcha)}`} accent="green" />
        )}
        <Row label="Total remaining (this bill)" value={money(closing)} bold accent="amber" />
        <p className="pt-0.5 text-[11px] text-[var(--text-muted)]">
          {money(opening)} + {money(addBalance)} add − {money(weekKharcha)} kharcha = {money(closing)}
        </p>

        <div className="my-1.5 border-t border-jade/20" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-jade-deep">
          Kharcha breakup (does not change Total Remaining again)
        </p>
        {old > 0 && (
          <Row label="Old kharcha (folds next Saturday)" value={money(old)} accent="amber" />
        )}
        <Row label="Week kharcha given" value={money(weekKharcha)} bold />
        {transferLines.length > 0 ? (
          <div className="mt-1 overflow-hidden rounded-xl border border-jade/15 bg-white/60">
            {transferLines.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 border-b border-jade/10 px-3 py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--text)]">
                    {formatDisplayDate(p.date)}
                    {p.time ? ` · ${formatDisplayTime(p.time)}` : ""}
                  </p>
                  {p.remarks && (
                    <p className="truncate text-[11px] text-[var(--text-muted)]">{p.remarks}</p>
                  )}
                </div>
                <span className="shrink-0 font-bold text-jade-deep">−{money(p.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-jade-soft/50 px-3 py-2 text-sm">
              <span className="font-bold text-jade-deep">Paid so far (breakup)</span>
              <span className="font-bold text-jade-deep">{money(paid)}</span>
            </div>
          </div>
        ) : (
          <p className="pt-1 text-[11px] text-[var(--text-muted)]">
            No kharcha pays yet — Pay only records breakup (Total Remaining already reduced on bill).
          </p>
        )}
        <Row
          label="Kharcha still open"
          value={weekUnpaid > 0 ? money(weekUnpaid) : "₹0 — cleared"}
          bold
          accent={weekUnpaid > 0 ? "amber" : "green"}
        />
        <div className="my-1.5 border-t border-jade/20" />
        <Row
          label="Total remaining"
          value={money(totalRemainingHere)}
          bold
          accent={totalRemainingHere > 0 ? "amber" : "green"}
        />
        <p className="pt-0.5 text-[11px] text-[var(--text-muted)]">
          Closing {money(closing)}
          {old > 0 ? ` + ${money(old)} old` : ""} = {money(totalRemainingHere)}. Unused open kharcha
          adds back on next Saturday.
        </p>
        {weekKharcha > 0 && weekUnpaid > 0 && (
          <p className="pt-0.5 text-[11px] text-[var(--text-muted)]">
            Next Saturday unused {money(weekUnpaid)} returns to Total Remaining.
          </p>
        )}
      </div>
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
  accent?: "green" | "amber";
}) {
  const accentClass = accent === "green" ? "text-jade-deep" : accent === "amber" ? "text-amber-700" : "";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={`${bold ? "font-bold" : "font-medium"} ${accentClass}`}>{value}</span>
    </div>
  );
}
