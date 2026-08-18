"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import {
  ArrowDownLeft,
  ClipboardList,
  Download,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { getDb } from "@/lib/firebase";
import type {
  DeliveryPartner,
  KaarigerOrder,
  MarketplaceCompany,
  OrderProductLine,
  PickupRecord,
  RepairItemType,
  RepairLineItem,
  ReturnRecord,
} from "@/lib/types";
import {
  dateMatchesSearch,
  downloadCsv,
  formatDisplayDate,
  formatDisplayTime,
  formatRupee,
  nowTimeStr,
  timeSortKey,
  todayStr,
  uuid,
} from "@/lib/csv";
import { exportBillExcel } from "@/lib/bill-export";
import { orderWeekMeta } from "@/lib/kaariger-hisaab";
import PageToolbar from "@/components/admin/PageToolbar";
import AdminSearchBar from "@/components/admin/AdminSearchBar";
import SearchSelect from "@/components/admin/SearchSelect";
import BulkSelectBar, { SelectCheckbox } from "@/components/admin/BulkSelectBar";
import BillWhatsAppModal from "@/components/BillWhatsAppModal";
import { useSelection } from "@/lib/use-selection";
import { useAuth } from "@/lib/auth-context";

type OwnerFilter = "ALL" | "CLARIS" | "BLISS";

/** Named row from Firestore list collections (partners / companies). */
type NamedOption = {
  id: string;
  name: string;
};

function nameEquals(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Normalize a stored date (YYYY-MM-DD, dd/mm/yy, epoch) to YYYY-MM-DD for range comparison. */
function toIsoDate(value?: string | number | null): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return "";
}

function namedOptionsFromDb(fromDb: { id: string; name: string }[]): NamedOption[] {
  return fromDb
    .map((p) => ({ id: p.id, name: p.name.trim() }))
    .filter((p) => p.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function ownerQtys(r: { clarisQuantity?: number; blissQuantity?: number; quantity: number }) {
  const c = Number(r.clarisQuantity) || 0;
  const b = Number(r.blissQuantity) || 0;
  if (c > 0 || b > 0) return { claris: c, bliss: b, total: c + b };
  // Legacy docs only had total quantity — treat as Claris for filtering/totals.
  return { claris: r.quantity || 0, bliss: 0, total: r.quantity || 0 };
}

function qtyBreakdown(claris?: number, bliss?: number, total = 0) {
  const c = claris || 0;
  const b = bliss || 0;
  if (c > 0 || b > 0) {
    return [c > 0 ? `Claris ${c}` : "", b > 0 ? `Bliss ${b}` : ""].filter(Boolean).join(" · ");
  }
  return total > 0 ? `${total} pcs` : "—";
}

function filteredOwnerQty(
  r: { clarisQuantity?: number; blissQuantity?: number; quantity: number },
  owner: OwnerFilter
) {
  const q = ownerQtys(r);
  if (owner === "CLARIS") return q.claris;
  if (owner === "BLISS") return q.bliss;
  return q.total;
}

function companyTotals(
  rows: { partner: string; clarisQuantity?: number; blissQuantity?: number; quantity: number }[],
  owner: OwnerFilter
) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const amount = filteredOwnerQty(row, owner);
    if (amount <= 0) continue;
    const key = row.partner?.trim() || "Other";
    map.set(key, (map.get(key) || 0) + amount);
  }
  const items = Array.from(map.entries())
    .map(([company, qty]) => ({ company, qty }))
    .sort((a, b) => a.company.localeCompare(b.company));
  const grand = items.reduce((s, i) => s + i.qty, 0);
  return { items, grand };
}

function CompanyTotalsBar({
  title,
  totals,
}: {
  title: string;
  totals: { items: { company: string; qty: number }[]; grand: number };
}) {
  if (totals.items.length === 0) {
    return (
      <div className="surface px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">No quantities for this filter.</p>
      </div>
    );
  }
  return (
    <div className="surface space-y-3 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
      <div className="flex flex-wrap gap-2">
        {totals.items.map((item) => (
          <div
            key={item.company}
            className="min-w-[7.5rem] rounded-xl border border-[var(--border)] bg-[var(--surface-mist)] px-3 py-2"
          >
            <p className="text-[11px] font-medium text-[var(--text-muted)]">{item.company}</p>
            <p className="font-display text-lg font-bold tabular-nums">{item.qty}</p>
          </div>
        ))}
        <div className="min-w-[7.5rem] rounded-xl border border-jade/30 bg-jade-soft/40 px-3 py-2">
          <p className="text-[11px] font-medium text-jade-deep">Total</p>
          <p className="font-display text-lg font-bold tabular-nums text-jade-deep">{totals.grand}</p>
        </div>
      </div>
    </div>
  );
}

/** Prefer the products[] lines so multi-product bills show every name, not only productName. */
function orderProductsLabel(o: KaarigerOrder): string {
  const names = (o.products || [])
    .map((p) => (p.productName || "").trim())
    .filter(Boolean);
  if (names.length > 0) return Array.from(new Set(names)).join(", ");
  return (o.productName || "").trim() || "—";
}

function parsePickupDoc(id: string, data: Record<string, unknown>): PickupRecord {
  const claris = Number(data.clarisQuantity) || 0;
  const bliss = Number(data.blissQuantity) || 0;
  const quantity = Number(data.quantity) || claris + bliss || 0;
  return {
    id,
    productName: (data.productName as string) || "",
    color: (data.color as string) || "",
    quantity,
    clarisQuantity: claris > 0 || bliss > 0 ? claris : quantity,
    blissQuantity: bliss,
    partner: (data.partner as string) || "",
    deliveryPartner: (data.deliveryPartner as string) || "",
    staffName: (data.staffName as string) || "",
    date: (data.date as string) || "",
    time: (data.time as string) || "",
  };
}

function parseReturnDoc(id: string, data: Record<string, unknown>): ReturnRecord {
  const claris = Number(data.clarisQuantity) || 0;
  const bliss = Number(data.blissQuantity) || 0;
  const quantity = Number(data.quantity) || claris + bliss || 0;
  return {
    id,
    productName: (data.productName as string) || "",
    color: (data.color as string) || "",
    quantity,
    clarisQuantity: claris > 0 || bliss > 0 ? claris : quantity,
    blissQuantity: bliss,
    partner: (data.partner as string) || "",
    deliveryPartner: (data.deliveryPartner as string) || "",
    returnType: (data.returnType as string) || "",
    staffName: (data.staffName as string) || "",
    date: (data.date as string) || "",
    time: (data.time as string) || "",
    notes: data.notes as string | undefined,
  };
}

const CHARGE_ITEMS: { type: Exclude<RepairItemType, "MATERIAL">; label: string }[] = [
  { type: "RUNNER", label: "Runner" },
  { type: "FITTING", label: "Fitting" },
  { type: "ASTAR", label: "Astar" },
];

type ProductLineForm = { productName: string; quantity: string; pricePerPiece: string };
type ChargeDraft = Record<Exclude<RepairItemType, "MATERIAL">, { qty: string; price: string }>;
type MaterialLineForm = { materialId: string; name: string; qty: string; price: string };

function emptyProductLine(): ProductLineForm {
  return { productName: "", quantity: "", pricePerPiece: "" };
}
function emptyCharges(): ChargeDraft {
  return {
    RUNNER: { qty: "", price: "1.5" },
    FITTING: { qty: "", price: "2.5" },
    ASTAR: { qty: "", price: "30" },
  };
}
function emptyMaterialLine(): MaterialLineForm {
  return { materialId: "", name: "", qty: "", price: "" };
}

type Tab = "kaariger" | "pickups" | "returns";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "kaariger", label: "Kaariger", icon: ClipboardList },
  { id: "pickups", label: "Pickups", icon: Truck },
  { id: "returns", label: "Returns", icon: ArrowDownLeft },
];

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function recordStatusBadge(status: string) {
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

const money = formatRupee;

export default function RecordsPage() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("kaariger");
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [pickups, setPickups] = useState<PickupRecord[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [dbPartners, setDbPartners] = useState<DeliveryPartner[]>([]);
  const [dbCompanies, setDbCompanies] = useState<MarketplaceCompany[]>([]);
  const [listModal, setListModal] = useState<null | "partners" | "companies">(null);
  const [newListName, setNewListName] = useState("");
  const [listSaving, setListSaving] = useState(false);
  const [listMsg, setListMsg] = useState("");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("ALL");
  /** YYYY-MM-DD date range filter for pickups/returns; empty = all dates. */
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  /** null = closed; "add" = create; record = edit */
  const [pickupModal, setPickupModal] = useState<"add" | PickupRecord | null>(null);
  const [returnModal, setReturnModal] = useState<"add" | ReturnRecord | null>(null);
  const [dispatchSaving, setDispatchSaving] = useState(false);
  const [editOrder, setEditOrder] = useState<KaarigerOrder | null>(null);
  const [viewOrder, setViewOrder] = useState<KaarigerOrder | null>(null);
  const [showWhatsAppBill, setShowWhatsAppBill] = useState(false);
  const [pickupForm, setPickupForm] = useState({
    clarisQuantity: "",
    blissQuantity: "",
    partner: "",
    deliveryPartner: "",
    staffName: "",
    date: "",
    time: "",
  });
  const [returnForm, setReturnForm] = useState({
    clarisQuantity: "",
    blissQuantity: "",
    partner: "",
    deliveryPartner: "",
    returnType: "",
    staffName: "",
    date: "",
    time: "",
    notes: "",
  });
  const [billProducts, setBillProducts] = useState<ProductLineForm[]>([emptyProductLine()]);
  const [billCharges, setBillCharges] = useState<ChargeDraft>(emptyCharges());
  const [billMaterials, setBillMaterials] = useState<MaterialLineForm[]>([emptyMaterialLine()]);
  const [billNotes, setBillNotes] = useState("");
  const [billStatus, setBillStatus] = useState("ASSIGNED");
  const [billKaarigerName, setBillKaarigerName] = useState("");
  /** This week's kharcha on the bill — empty string clears / removes. */
  const [billKharcha, setBillKharcha] = useState("");
  const [billSaving, setBillSaving] = useState(false);
  const [billMsg, setBillMsg] = useState("");
  const [rawMaterials, setRawMaterials] = useState<{ id: string; name: string }[]>([]);
  const [showNewMaterial, setShowNewMaterial] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const db = getDb();
      try {
        const [oSnap, pSnap, rSnap, matSnap, partnerSnap] = await Promise.all([
          getDocs(collection(db, "kaariger_orders")),
          getDocs(collection(db, "pickup_records")),
          getDocs(collection(db, "return_records")),
          getDocs(collection(db, "raw_materials")),
          getDocs(collection(db, "delivery_partners")),
        ]);

        setDbPartners(
          partnerSnap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: (data.id as string) || d.id,
                name: ((data.name as string) || "").trim(),
                createdAt: (data.createdAt as number) || 0,
              } satisfies DeliveryPartner;
            })
            .filter((p) => p.name)
            .sort((a, b) => a.name.localeCompare(b.name))
        );

        // Companies are a newer collection — load separately so a missing rule
        // cannot blank orders / pickups / returns.
        try {
          const companySnap = await getDocs(collection(db, "marketplace_companies"));
          setDbCompanies(
            companySnap.docs
              .map((d) => {
                const data = d.data();
                return {
                  id: (data.id as string) || d.id,
                  name: ((data.name as string) || "").trim(),
                  createdAt: (data.createdAt as number) || 0,
                } satisfies MarketplaceCompany;
              })
              .filter((c) => c.name)
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        } catch (companyErr) {
          console.warn("marketplace_companies unavailable:", companyErr);
          setDbCompanies([]);
        }

        setRawMaterials(
          matSnap.docs
            .map((d) => ({ id: (d.data().id as string) || d.id, name: (d.data().name as string) || "" }))
            .filter((m) => m.name.trim())
            .sort((a, b) => a.name.localeCompare(b.name))
        );

        setOrders(
          oSnap.docs
            .map((d) => {
              const data = d.data();
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
                rawMaterials: [],
                totalDealAmount: (data.totalDealAmount as number) || 0,
                pricingType: (data.pricingType as "OVERALL" | "PER_PIECE") || "OVERALL",
                status: (data.status as string) === "APPROVED" ? "COMPLETED" : (data.status as string) || "",
                approvedQuantity: (data.approvedQuantity as number) || 0,
                deliveredQuantity: data.deliveredQuantity as number | undefined,
                verifiedBy: data.verifiedBy as string | undefined,
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
              kharchaCarriedForward: data.kharchaCarriedForward as number | undefined,
              weekLabel: data.weekLabel as string | undefined,
              weekKey: data.weekKey as string | undefined,
              openingAtCreation: data.openingAtCreation as number | undefined,
              addBalance: data.addBalance as number | undefined,
              closingAtCreation: data.closingAtCreation as number | undefined,
            };
          })
          .sort((a, b) => b.createdAt - a.createdAt)
      );

      setPickups(
        pSnap.docs
          .map((d) => parsePickupDoc(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => `${b.date} ${timeSortKey(b.time)}`.localeCompare(`${a.date} ${timeSortKey(a.time)}`))
      );

      setReturns(
        rSnap.docs
          .map((d) => parseReturnDoc(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => `${b.date} ${timeSortKey(b.time)}`.localeCompare(`${a.date} ${timeSortKey(a.time)}`))
      );
      } catch (err) {
        console.error("Failed to load records:", err);
      }
    }
    load();
  }, []);

  function exportCsv() {
    if (tab === "kaariger") {
      downloadCsv(
        "kaariger_orders.csv",
        ["Week", "Product", "Kaariger", "Status", "ADD (Deal)"],
        orders.map((o) => [
          orderWeekMeta(o).label,
          orderProductsLabel(o),
          o.kaarigerName,
          o.status,
          String(o.totalDealAmount),
        ])
      );
    } else if (tab === "pickups") {
      downloadCsv(
        "pickups.csv",
        ["Company", "Delivery Partner", "Claris Qty", "Bliss Qty", "Total", "Staff", "Date", "Time"],
        pickups.map((p) => [
          p.partner,
          p.deliveryPartner,
          String(p.clarisQuantity || 0),
          String(p.blissQuantity || 0),
          String(p.quantity),
          p.staffName,
          formatDisplayDate(p.date),
          formatDisplayTime(p.time),
        ])
      );
    } else {
      downloadCsv(
        "returns.csv",
        ["Type", "Company", "Delivery Partner", "Claris Qty", "Bliss Qty", "Total", "Staff", "Date", "Time", "Notes"],
        returns.map((r) => [
          r.returnType,
          r.partner,
          r.deliveryPartner,
          String(r.clarisQuantity || 0),
          String(r.blissQuantity || 0),
          String(r.quantity),
          r.staffName,
          formatDisplayDate(r.date),
          formatDisplayTime(r.time),
          r.notes || "",
        ])
      );
    }
  }

  const q = search.trim().toLowerCase();
  const filteredOrders = useMemo(() => {
    if (!q) return orders;
    return orders.filter(
      (o) =>
        orderProductsLabel(o).toLowerCase().includes(q) ||
        orderWeekMeta(o).label.toLowerCase().includes(q) ||
        o.productName.toLowerCase().includes(q) ||
        (o.products || []).some((p) => (p.productName || "").toLowerCase().includes(q)) ||
        o.kaarigerName.toLowerCase().includes(q) ||
        o.status.toLowerCase().includes(q) ||
        dateMatchesSearch(o.createdAt, q) ||
        formatDisplayDate(o.createdAt).toLowerCase().includes(q)
    );
  }, [orders, q]);

  const filteredPickups = useMemo(() => {
    return pickups.filter((p) => {
      const oq = ownerQtys(p);
      if (ownerFilter === "CLARIS" && oq.claris <= 0) return false;
      if (ownerFilter === "BLISS" && oq.bliss <= 0) return false;
      if (dateFrom || dateTo) {
        const iso = toIsoDate(p.date);
        if (!iso) return false;
        if (dateFrom && iso < dateFrom) return false;
        if (dateTo && iso > dateTo) return false;
      }
      if (!q) return true;
      return (
        p.partner.toLowerCase().includes(q) ||
        p.deliveryPartner.toLowerCase().includes(q) ||
        p.staffName.toLowerCase().includes(q) ||
        dateMatchesSearch(p.date, q) ||
        formatDisplayDate(p.date).toLowerCase().includes(q)
      );
    });
  }, [pickups, q, ownerFilter, dateFrom, dateTo]);

  const partnerOptions = useMemo(() => namedOptionsFromDb(dbPartners), [dbPartners]);
  const partnerNames = useMemo(
    () => partnerOptions.map((p) => p.name),
    [partnerOptions]
  );
  const companyOptions = useMemo(() => namedOptionsFromDb(dbCompanies), [dbCompanies]);
  const companyNames = useMemo(
    () => companyOptions.map((c) => c.name),
    [companyOptions]
  );

  const filteredReturns = useMemo(() => {
    return returns.filter((r) => {
      const oq = ownerQtys(r);
      if (ownerFilter === "CLARIS" && oq.claris <= 0) return false;
      if (ownerFilter === "BLISS" && oq.bliss <= 0) return false;
      if (dateFrom || dateTo) {
        const iso = toIsoDate(r.date);
        if (!iso) return false;
        if (dateFrom && iso < dateFrom) return false;
        if (dateTo && iso > dateTo) return false;
      }
      if (!q) return true;
      return (
        r.partner.toLowerCase().includes(q) ||
        r.deliveryPartner.toLowerCase().includes(q) ||
        r.staffName.toLowerCase().includes(q) ||
        r.returnType.toLowerCase().includes(q) ||
        dateMatchesSearch(r.date, q) ||
        formatDisplayDate(r.date).toLowerCase().includes(q)
      );
    });
  }, [returns, q, ownerFilter, dateFrom, dateTo]);

  const pickupCompanyTotals = useMemo(
    () => companyTotals(filteredPickups, ownerFilter),
    [filteredPickups, ownerFilter]
  );
  const returnCompanyTotals = useMemo(
    () => companyTotals(filteredReturns, ownerFilter),
    [filteredReturns, ownerFilter]
  );

  const count =
    tab === "kaariger"
      ? filteredOrders.length
      : tab === "pickups"
        ? filteredPickups.length
        : filteredReturns.length;

  const visibleIds = useMemo(() => {
    if (tab === "kaariger") return filteredOrders.map((o) => o.id);
    if (tab === "pickups") return filteredPickups.map((p) => p.id);
    return filteredReturns.map((r) => r.id);
  }, [tab, filteredOrders, filteredPickups, filteredReturns]);

  const selection = useSelection(visibleIds);

  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset selection when switching tabs / filters
  }, [tab, search, ownerFilter, dateFrom, dateTo]);

  function emptyPickupForm() {
    return {
      clarisQuantity: "",
      blissQuantity: "",
      partner: "",
      deliveryPartner: "",
      staffName: session?.name || "Admin",
      date: todayStr(),
      time: nowTimeStr(),
    };
  }

  function emptyReturnForm() {
    return {
      clarisQuantity: "",
      blissQuantity: "",
      partner: "",
      deliveryPartner: "",
      returnType: "RTO",
      staffName: session?.name || "Admin",
      date: todayStr(),
      time: nowTimeStr(),
      notes: "",
    };
  }

  function openPickupAdd() {
    setPickupForm(emptyPickupForm());
    setPickupModal("add");
  }

  function openPickupEdit(p: PickupRecord) {
    setPickupModal(p);
    setPickupForm({
      clarisQuantity: String(p.clarisQuantity ?? p.quantity ?? ""),
      blissQuantity: String(p.blissQuantity ?? ""),
      partner: p.partner,
      deliveryPartner: p.deliveryPartner,
      staffName: p.staffName,
      date: p.date,
      time: p.time,
    });
  }

  async function reloadPickups() {
    const snap = await getDocs(collection(getDb(), "pickup_records"));
    setPickups(
      snap.docs
        .map((d) => parsePickupDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => `${b.date} ${timeSortKey(b.time)}`.localeCompare(`${a.date} ${timeSortKey(a.time)}`))
    );
  }

  async function reloadReturns() {
    const snap = await getDocs(collection(getDb(), "return_records"));
    setReturns(
      snap.docs
        .map((d) => parseReturnDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => `${b.date} ${timeSortKey(b.time)}`.localeCompare(`${a.date} ${timeSortKey(a.time)}`))
    );
  }

  async function savePickup(e: React.FormEvent) {
    e.preventDefault();
    if (!pickupModal) return;
    const claris = Number(pickupForm.clarisQuantity) || 0;
    const bliss = Number(pickupForm.blissQuantity) || 0;
    if (claris + bliss <= 0) {
      alert("Enter Claris and/or Bliss quantity.");
      return;
    }
    if (!pickupForm.partner.trim()) {
      alert("Select a company.");
      return;
    }
    const id = pickupModal === "add" ? uuid() : pickupModal.id;
    const payload = {
      id,
      productName: "",
      color: "",
      clarisQuantity: claris,
      blissQuantity: bliss,
      quantity: claris + bliss,
      partner: pickupForm.partner.trim(),
      deliveryPartner: pickupForm.deliveryPartner.trim(),
      staffName: pickupForm.staffName.trim() || session?.name || "Admin",
      date: pickupForm.date || todayStr(),
      time: pickupForm.time || nowTimeStr(),
    };
    setDispatchSaving(true);
    try {
      await setDoc(doc(getDb(), "pickup_records", id), payload, { merge: true });
      setPickupModal(null);
      await reloadPickups();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save pickup.");
    } finally {
      setDispatchSaving(false);
    }
  }

  function openReturnAdd() {
    setReturnForm(emptyReturnForm());
    setReturnModal("add");
  }

  function openReturnEdit(r: ReturnRecord) {
    setReturnModal(r);
    setReturnForm({
      clarisQuantity: String(r.clarisQuantity ?? r.quantity ?? ""),
      blissQuantity: String(r.blissQuantity ?? ""),
      partner: r.partner,
      deliveryPartner: r.deliveryPartner,
      returnType: r.returnType,
      staffName: r.staffName,
      date: r.date,
      time: r.time,
      notes: r.notes || "",
    });
  }

  async function saveReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!returnModal) return;
    const claris = Number(returnForm.clarisQuantity) || 0;
    const bliss = Number(returnForm.blissQuantity) || 0;
    if (claris + bliss <= 0) {
      alert("Enter Claris and/or Bliss quantity.");
      return;
    }
    if (!returnForm.partner.trim()) {
      alert("Select a company.");
      return;
    }
    const id = returnModal === "add" ? uuid() : returnModal.id;
    const notes = returnForm.notes.trim();
    const payload: Record<string, string | number> = {
      id,
      productName: "",
      color: "",
      clarisQuantity: claris,
      blissQuantity: bliss,
      quantity: claris + bliss,
      partner: returnForm.partner.trim(),
      deliveryPartner: returnForm.deliveryPartner.trim(),
      returnType: returnForm.returnType.trim() || "RTO",
      staffName: returnForm.staffName.trim() || session?.name || "Admin",
      date: returnForm.date || todayStr(),
      time: returnForm.time || nowTimeStr(),
    };
    if (notes) payload.notes = notes;
    setDispatchSaving(true);
    try {
      await setDoc(doc(getDb(), "return_records", id), payload, { merge: true });
      setReturnModal(null);
      await reloadReturns();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save return.");
    } finally {
      setDispatchSaving(false);
    }
  }

  function openOrderEdit(o: KaarigerOrder) {
    setEditOrder(o);
    setBillMsg("");
    setBillKaarigerName(o.kaarigerName);
    setBillNotes(o.notes || "");
    setBillStatus(o.status || "ASSIGNED");
    setBillKharcha(
      o.kharchaGiven != null && o.kharchaGiven > 0 ? String(o.kharchaGiven) : ""
    );

    if (o.products && o.products.length > 0) {
      setBillProducts(
        o.products.map((p) => ({
          productName: p.productName,
          quantity: String(p.quantity || ""),
          pricePerPiece: String(p.pricePerPiece || ""),
        }))
      );
    } else {
      setBillProducts([
        {
          productName: o.productName || "",
          quantity: String(o.targetQuantity || ""),
          pricePerPiece: o.pricePerPiece != null ? String(o.pricePerPiece) : "",
        },
      ]);
    }

    const charges = emptyCharges();
    const materials: MaterialLineForm[] = [];
    (o.materialDeductions || []).forEach((it) => {
      if (it.type === "RUNNER" || it.type === "FITTING" || it.type === "ASTAR") {
        charges[it.type] = {
          qty: String(it.quantity || ""),
          price: String(it.pricePerPiece || ""),
        };
      } else {
        const match = rawMaterials.find((m) => m.name.toLowerCase() === (it.label || "").toLowerCase());
        materials.push({
          materialId: match?.id || "",
          name: it.label || "",
          qty: String(it.quantity || ""),
          price: String(it.pricePerPiece || ""),
        });
      }
    });
    setBillCharges(charges);
    setBillMaterials(materials.length > 0 ? materials : [emptyMaterialLine()]);
  }

  async function saveOrderRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrder) return;
    setBillMsg("");

    const products: OrderProductLine[] = billProducts
      .map((l) => {
        const quantity = Number(l.quantity) || 0;
        const pricePerPiece = Number(l.pricePerPiece) || 0;
        return {
          productName: l.productName.trim(),
          quantity,
          pricePerPiece,
          lineTotal: quantity * pricePerPiece,
        };
      })
      .filter((p) => p.productName && p.quantity > 0 && p.pricePerPiece > 0);

    const chargeLines: RepairLineItem[] = CHARGE_ITEMS.map(({ type, label }) => {
      const qty = Number(billCharges[type].qty) || 0;
      const price = Number(billCharges[type].price) || 0;
      return { type, label, quantity: qty, pricePerPiece: price, lineTotal: qty * price };
    }).filter((it) => it.quantity > 0 && it.pricePerPiece > 0);

    const materialLines: RepairLineItem[] = billMaterials
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

    const materialDeductions = [...chargeLines, ...materialLines];
    const productsTotal = products.reduce((s, p) => s + p.lineTotal, 0);
    const materialDeductionsTotal = materialDeductions.reduce((s, it) => s + it.lineTotal, 0);
    const totalDealAmount = Math.max(0, productsTotal - materialDeductionsTotal);
    const targetQuantity = products.reduce((s, p) => s + p.quantity, 0);
    const kharchaGiven = Math.max(0, Number(billKharcha) || 0);
    const notes = billNotes.trim();

    if (products.length === 0 && materialDeductions.length === 0 && kharchaGiven <= 0) {
      setBillMsg("Add a product, a deduction, or this week's kharcha.");
      return;
    }

    const productName =
      products.map((p) => p.productName).join(", ") ||
      editOrder.productName ||
      (kharchaGiven > 0 ? "Week bill" : "Deductions / week bill");

    setBillSaving(true);
    try {
      const patch = {
        productName,
        targetQuantity,
        kaarigerName: billKaarigerName.trim() || editOrder.kaarigerName,
        status: billStatus,
        notes,
        products,
        productsTotal,
        materialDeductions,
        materialDeductionsTotal,
        totalDealAmount,
        kharchaGiven,
        // Preserve week identity when editing older bills that already have a label.
        weekLabel: editOrder.weekLabel || orderWeekMeta(editOrder).label,
        weekKey: editOrder.weekKey || orderWeekMeta(editOrder).key,
        // Keep originalDealAmount in sync when no repairing has been applied yet.
        ...(editOrder.repairDeductionTotal
          ? {}
          : { originalDealAmount: totalDealAmount }),
        pricingType: "PER_PIECE" as const,
        pricePerPiece: targetQuantity > 0 ? productsTotal / targetQuantity : 0,
      };
      await setDoc(doc(getDb(), "kaariger_orders", editOrder.id), patch, { merge: true });

      const updated: KaarigerOrder = { ...editOrder, ...patch, notes: notes || undefined };
      setOrders((prev) => prev.map((o) => (o.id === editOrder.id ? updated : o)));
      setViewOrder((prev) => (prev?.id === editOrder.id ? updated : prev));
      setEditOrder(null);
    } catch (err) {
      setBillMsg(err instanceof Error ? err.message : "Failed to save bill.");
    } finally {
      setBillSaving(false);
    }
  }


  async function cascadeDeleteOrder(orderId: string) {
    const db = getDb();
    await deleteDoc(doc(db, "kaariger_orders", orderId));
    try {
      const [paySnap, repairSnap, approvalSnap] = await Promise.all([
        getDocs(query(collection(db, "kaariger_payments"), where("orderId", "==", orderId))),
        getDocs(query(collection(db, "order_repairs"), where("orderId", "==", orderId))),
        getDocs(query(collection(db, "order_approval_records"), where("orderId", "==", orderId))),
      ]);
      await Promise.all([
        ...paySnap.docs.map((d) => deleteDoc(d.ref)),
        ...repairSnap.docs.map((d) => deleteDoc(d.ref)),
        ...approvalSnap.docs.map((d) => deleteDoc(d.ref)),
      ]);
    } catch {
      // best-effort related cleanup
    }
  }

  async function deleteOrderRecord(o: KaarigerOrder) {
    if (!confirm(`Delete order "${orderProductsLabel(o)}" for ${o.kaarigerName}? Related payments/repairs will also be removed.`)) return;
    await cascadeDeleteOrder(o.id);
    setOrders((prev) => prev.filter((x) => x.id !== o.id));
    if (editOrder?.id === o.id) setEditOrder(null);
    if (viewOrder?.id === o.id) setViewOrder(null);
  }

  async function deletePickupRecord(rec: PickupRecord) {
    const qty = qtyBreakdown(rec.clarisQuantity, rec.blissQuantity, rec.quantity);
    if (!confirm(`Delete pickup (${qty}) via ${rec.partner || "—"}?`)) return;
    await deleteDoc(doc(getDb(), "pickup_records", rec.id));
    setPickups((prev) => prev.filter((x) => x.id !== rec.id));
    if (typeof pickupModal === "object" && pickupModal?.id === rec.id) setPickupModal(null);
  }

  async function deleteReturnRecord(rec: ReturnRecord) {
    const qty = qtyBreakdown(rec.clarisQuantity, rec.blissQuantity, rec.quantity);
    if (!confirm(`Delete return (${qty}) via ${rec.partner || "—"}?`)) return;
    await deleteDoc(doc(getDb(), "return_records", rec.id));
    setReturns((prev) => prev.filter((x) => x.id !== rec.id));
    if (typeof returnModal === "object" && returnModal?.id === rec.id) setReturnModal(null);
  }

  function openListModal(kind: "partners" | "companies") {
    setListMsg("");
    setNewListName("");
    setListModal(kind);
  }

  async function addListItem(e: React.FormEvent) {
    e.preventDefault();
    if (!listModal) return;
    const name = newListName.trim();
    const isPartners = listModal === "partners";
    const existing = isPartners ? partnerNames : companyNames;
    if (!name) {
      setListMsg(isPartners ? "Enter a partner name." : "Enter a company name.");
      return;
    }
    if (existing.some((n) => nameEquals(n, name))) {
      setListMsg(isPartners ? "That partner is already in the list." : "That company is already in the list.");
      return;
    }
    setListSaving(true);
    setListMsg("");
    try {
      const id = uuid();
      const row = { id, name, createdAt: Date.now() };
      if (isPartners) {
        await setDoc(doc(getDb(), "delivery_partners", id), row);
        setDbPartners((prev) =>
          [...prev, row].sort((a, b) => a.name.localeCompare(b.name))
        );
      } else {
        await setDoc(doc(getDb(), "marketplace_companies", id), row);
        setDbCompanies((prev) =>
          [...prev, row].sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      setNewListName("");
      setListMsg("Added — staff will see this in Pickup & Return.");
    } catch (err) {
      setListMsg(err instanceof Error ? err.message : "Failed to add.");
    } finally {
      setListSaving(false);
    }
  }

  async function deleteListItem(item: NamedOption) {
    if (!listModal) return;
    const isPartners = listModal === "partners";
    const label = isPartners ? "delivery partner" : "company";
    if (!confirm(`Remove ${label} "${item.name}"? Staff will no longer see it.`)) return;
    try {
      if (isPartners) {
        await deleteDoc(doc(getDb(), "delivery_partners", item.id));
        setDbPartners((prev) => prev.filter((p) => p.id !== item.id));
      } else {
        await deleteDoc(doc(getDb(), "marketplace_companies", item.id));
        setDbCompanies((prev) => prev.filter((c) => c.id !== item.id));
      }
      setListMsg(`Removed "${item.name}".`);
    } catch (err) {
      setListMsg(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  async function deleteSelectedRecords() {
    const ids = selection.selectedIds;
    if (ids.length === 0) return;
    const label =
      tab === "kaariger" ? "bill" : tab === "pickups" ? "pickup" : "return";
    if (
      !confirm(
        `Delete ${ids.length} selected ${label}${ids.length === 1 ? "" : "s"}?${
          tab === "kaariger" ? " Related payments/repairs will also be removed." : ""
        }`
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    try {
      if (tab === "kaariger") {
        await Promise.all(ids.map((id) => cascadeDeleteOrder(id)));
        setOrders((prev) => prev.filter((x) => !ids.includes(x.id)));
        if (editOrder && ids.includes(editOrder.id)) setEditOrder(null);
        if (viewOrder && ids.includes(viewOrder.id)) setViewOrder(null);
      } else if (tab === "pickups") {
        await Promise.all(ids.map((id) => deleteDoc(doc(getDb(), "pickup_records", id))));
        setPickups((prev) => prev.filter((x) => !ids.includes(x.id)));
        if (typeof pickupModal === "object" && pickupModal && ids.includes(pickupModal.id)) {
          setPickupModal(null);
        }
      } else {
        await Promise.all(ids.map((id) => deleteDoc(doc(getDb(), "return_records", id))));
        setReturns((prev) => prev.filter((x) => !ids.includes(x.id)));
        if (typeof returnModal === "object" && returnModal && ids.includes(returnModal.id)) {
          setReturnModal(null);
        }
      }
      selection.clear();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete selected records.");
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="stagger space-y-5">
      <PageToolbar
        title="Records"
        actions={
          <div className="flex flex-wrap gap-2">
            {(tab === "pickups" || tab === "returns") && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openListModal("companies")}
                >
                  <ShoppingBag className="h-4 w-4" />
                  Companies
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openListModal("partners")}
                >
                  <Truck className="h-4 w-4" />
                  Delivery partners
                </button>
              </>
            )}
            {tab === "pickups" && (
              <button type="button" className="btn btn-primary" onClick={openPickupAdd}>
                <Plus className="h-4 w-4" />
                Add Pickup
              </button>
            )}
            {tab === "returns" && (
              <button type="button" className="btn btn-primary" onClick={openReturnAdd}>
                <Plus className="h-4 w-4" />
                Add Return
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        }
      >
        <p className="section-sub">{count} record{count !== 1 ? "s" : ""}</p>
      </PageToolbar>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search name, partner, date (dd/mm/yy)…"
      />

      <div className="mobile-chip-scroll flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`filter-pill gap-1.5 ${tab === id ? "active" : ""}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {(tab === "pickups" || tab === "returns") && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="mobile-chip-scroll flex flex-wrap gap-2">
            {(
              [
                { id: "ALL" as const, label: "All" },
                { id: "CLARIS" as const, label: "Claris" },
                { id: "BLISS" as const, label: "Bliss" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setOwnerFilter(f.id)}
                className={`filter-pill ${ownerFilter === f.id ? "active" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label !mb-1 !text-[10px]">From</label>
              <input
                type="date"
                className="input !w-auto !py-2"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="label !mb-1 !text-[10px]">To</label>
              <input
                type="date"
                className="input !w-auto !py-2"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
              >
                All dates
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "pickups" && (
        <CompanyTotalsBar
          title={
            ownerFilter === "CLARIS"
              ? "Pickup totals · Claris"
              : ownerFilter === "BLISS"
                ? "Pickup totals · Bliss"
                : "Pickup totals by company"
          }
          totals={pickupCompanyTotals}
        />
      )}
      {tab === "returns" && (
        <CompanyTotalsBar
          title={
            ownerFilter === "CLARIS"
              ? "Return totals · Claris"
              : ownerFilter === "BLISS"
                ? "Return totals · Bliss"
                : "Return totals by company"
          }
          totals={returnCompanyTotals}
        />
      )}

      <BulkSelectBar
        selectedCount={selection.selectedCount}
        totalVisible={visibleIds.length}
        allVisibleSelected={selection.allVisibleSelected}
        someVisibleSelected={selection.someVisibleSelected}
        onToggleAll={selection.toggleAllVisible}
        onClear={selection.clear}
        onDelete={() => void deleteSelectedRecords()}
        deleting={bulkDeleting}
        noun={tab === "kaariger" ? "bill" : tab === "pickups" ? "pickup" : "return"}
      />

      {/* Kaariger orders — table on desktop, cards on mobile. Click a row to see the full bill breakdown. */}
      {tab === "kaariger" && (
        <>
          <div className="data-table-wrap hidden lg:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <SelectCheckbox
                        checked={selection.allVisibleSelected}
                        onChange={selection.toggleAllVisible}
                        label="Select all bills"
                      />
                    </th>
                    <th>Product</th>
                    <th>Kaariger</th>
                    <th className="text-right">ADD</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr
                      key={o.id}
                      className={`cursor-pointer ${selection.isSelected(o.id) ? "bg-jade-soft/30" : ""}`}
                      onClick={() => setViewOrder(o)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <SelectCheckbox
                          checked={selection.isSelected(o.id)}
                          onChange={() => selection.toggle(o.id)}
                          label={`Select ${orderProductsLabel(o)}`}
                        />
                      </td>
                      <td>
                        <p className="font-semibold">{orderWeekMeta(o).label}</p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{orderProductsLabel(o)}</p>
                        {o.products && o.products.length > 1 && (
                          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                            {o.products.length} products
                          </p>
                        )}
                        {o.color && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{o.color}</p>}
                      </td>
                      <td className="text-[var(--text-muted)]">{o.kaarigerName}</td>
                      <td className="text-right font-semibold">₹{o.totalDealAmount.toLocaleString("en-IN")}</td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openOrderEdit(o)} aria-label="Edit">
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deleteOrderRecord(o)} aria-label="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredOrders.length === 0 && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">No records found.</p>
            )}
          </div>
          <div className="space-y-3 lg:hidden">
            {filteredOrders.map((o) => (
              <div
                key={o.id}
                className={`record-card ${selection.isSelected(o.id) ? "ring-2 ring-jade/40" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-1">
                    <SelectCheckbox
                      checked={selection.isSelected(o.id)}
                      onChange={() => selection.toggle(o.id)}
                      label={`Select ${orderProductsLabel(o)}`}
                    />
                  </div>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setViewOrder(o)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display font-bold">{orderWeekMeta(o).label}</p>
                        <p className="text-sm text-[var(--text-muted)]">{orderProductsLabel(o)}</p>
                        {o.products && o.products.length > 1 && (
                          <p className="text-xs text-[var(--text-muted)]">{o.products.length} products</p>
                        )}
                        <p className="text-sm text-[var(--text-muted)]">{o.kaarigerName}</p>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openOrderEdit(o)} aria-label="Edit">
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deleteOrderRecord(o)} aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Field label="Deal" value={`₹${o.totalDealAmount.toLocaleString("en-IN")}`} />
                      {o.color && <Field label="Color" value={o.color} />}
                    </div>
                  </button>
                </div>
              </div>
            ))}
            {filteredOrders.length === 0 && (
              <div className="card py-10 text-center text-sm text-[var(--text-muted)]">No records found.</div>
            )}
          </div>
        </>
      )}

      {/* Pickups */}
      {tab === "pickups" && (
        <>
          <div className="data-table-wrap hidden lg:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <SelectCheckbox
                        checked={selection.allVisibleSelected}
                        onChange={selection.toggleAllVisible}
                        label="Select all pickups"
                      />
                    </th>
                    <th>Company</th>
                    <th>Delivery Partner</th>
                    <th>Qty</th>
                    <th>Staff</th>
                    <th>Date & Time</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPickups.map((p) => (
                    <tr key={p.id} className={selection.isSelected(p.id) ? "bg-jade-soft/30" : undefined}>
                      <td>
                        <SelectCheckbox
                          checked={selection.isSelected(p.id)}
                          onChange={() => selection.toggle(p.id)}
                          label={`Select pickup ${p.partner}`}
                        />
                      </td>
                      <td className="font-semibold">{p.partner || "—"}</td>
                      <td className="text-[var(--text-muted)]">{p.deliveryPartner || "—"}</td>
                      <td>
                        <p className="font-medium">{filteredOwnerQty(p, ownerFilter)}</p>
                        {ownerFilter === "ALL" && (
                          <p className="text-xs text-[var(--text-muted)]">
                            {qtyBreakdown(p.clarisQuantity, p.blissQuantity, p.quantity)}
                          </p>
                        )}
                      </td>
                      <td>{p.staffName}</td>
                      <td className="text-[var(--text-muted)]">{formatDisplayDate(p.date)} {formatDisplayTime(p.time)}</td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openPickupEdit(p)} aria-label="Edit">
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deletePickupRecord(p)} aria-label="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredPickups.length === 0 && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">No records found.</p>
            )}
          </div>
          <div className="space-y-3 lg:hidden">
            {filteredPickups.map((p) => (
              <div key={p.id} className={`record-card ${selection.isSelected(p.id) ? "ring-2 ring-jade/40" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="pt-1">
                    <SelectCheckbox
                      checked={selection.isSelected(p.id)}
                      onChange={() => selection.toggle(p.id)}
                      label={`Select pickup ${p.partner}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display font-bold">{p.partner || "—"}</p>
                      <div className="flex items-center gap-1">
                        <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openPickupEdit(p)} aria-label="Edit">
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deletePickupRecord(p)} aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Field label="Delivery Partner" value={p.deliveryPartner || "—"} />
                      <Field
                        label="Quantity"
                        value={
                          ownerFilter === "ALL"
                            ? qtyBreakdown(p.clarisQuantity, p.blissQuantity, p.quantity)
                            : String(filteredOwnerQty(p, ownerFilter))
                        }
                      />
                      <Field label="Staff" value={p.staffName} />
                      <Field label="Date" value={`${formatDisplayDate(p.date)} ${formatDisplayTime(p.time)}`} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filteredPickups.length === 0 && (
              <div className="card py-10 text-center text-sm text-[var(--text-muted)]">No records found.</div>
            )}
          </div>
        </>
      )}

      {/* Returns */}
      {tab === "returns" && (
        <>
          <div className="data-table-wrap hidden lg:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <SelectCheckbox
                        checked={selection.allVisibleSelected}
                        onChange={selection.toggleAllVisible}
                        label="Select all returns"
                      />
                    </th>
                    <th>Type</th>
                    <th>Company</th>
                    <th>Delivery Partner</th>
                    <th>Qty</th>
                    <th>Staff</th>
                    <th>Date & Time</th>
                    <th>Notes</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.map((r) => (
                    <tr key={r.id} className={selection.isSelected(r.id) ? "bg-jade-soft/30" : undefined}>
                      <td>
                        <SelectCheckbox
                          checked={selection.isSelected(r.id)}
                          onChange={() => selection.toggle(r.id)}
                          label={`Select return ${r.partner}`}
                        />
                      </td>
                      <td><span className="badge badge-neutral">{r.returnType}</span></td>
                      <td className="font-semibold">{r.partner || "—"}</td>
                      <td className="text-[var(--text-muted)]">{r.deliveryPartner || "—"}</td>
                      <td>
                        <p className="font-medium">{filteredOwnerQty(r, ownerFilter)}</p>
                        {ownerFilter === "ALL" && (
                          <p className="text-xs text-[var(--text-muted)]">
                            {qtyBreakdown(r.clarisQuantity, r.blissQuantity, r.quantity)}
                          </p>
                        )}
                      </td>
                      <td>{r.staffName}</td>
                      <td className="text-[var(--text-muted)]">{formatDisplayDate(r.date)} {formatDisplayTime(r.time)}</td>
                      <td className="max-w-[200px] truncate text-[var(--text-muted)]">{r.notes || "—"}</td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openReturnEdit(r)} aria-label="Edit">
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deleteReturnRecord(r)} aria-label="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredReturns.length === 0 && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">No records found.</p>
            )}
          </div>
          <div className="space-y-3 lg:hidden">
            {filteredReturns.map((r) => (
              <div key={r.id} className={`record-card ${selection.isSelected(r.id) ? "ring-2 ring-jade/40" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="pt-1">
                    <SelectCheckbox
                      checked={selection.isSelected(r.id)}
                      onChange={() => selection.toggle(r.id)}
                      label={`Select return ${r.partner}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display font-bold">{r.partner || "—"}</p>
                      <div className="flex items-center gap-1">
                        <button type="button" className="btn-icon !h-8 !w-8" onClick={() => openReturnEdit(r)} aria-label="Edit">
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="btn-icon !h-8 !w-8 !text-danger" onClick={() => deleteReturnRecord(r)} aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Field label="Type" value={r.returnType} />
                      <Field label="Delivery Partner" value={r.deliveryPartner || "—"} />
                      <Field
                        label="Quantity"
                        value={
                          ownerFilter === "ALL"
                            ? qtyBreakdown(r.clarisQuantity, r.blissQuantity, r.quantity)
                            : String(filteredOwnerQty(r, ownerFilter))
                        }
                      />
                      <Field label="Staff" value={r.staffName} />
                      <Field label="Date" value={`${formatDisplayDate(r.date)} ${formatDisplayTime(r.time)}`} />
                      {r.notes && <Field label="Notes" value={r.notes} />}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filteredReturns.length === 0 && (
              <div className="card py-10 text-center text-sm text-[var(--text-muted)]">No records found.</div>
            )}
          </div>
        </>
      )}

      {viewOrder && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => {
              setViewOrder(null);
              setShowWhatsAppBill(false);
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="surface !overflow-y-auto max-h-[90vh] w-full max-w-2xl space-y-5 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold">{orderWeekMeta(viewOrder).label}</h3>
                    <span className={recordStatusBadge(viewOrder.status)}>{statusLabel(viewOrder.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {viewOrder.kaarigerName}
                    {orderProductsLabel(viewOrder) !== "—" ? ` · ${orderProductsLabel(viewOrder)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-icon shrink-0"
                  onClick={() => {
                    setViewOrder(null);
                    setShowWhatsAppBill(false);
                  }}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="stat-card !p-3">
                  <p className="stat-card-label">ADD (MAAL − deductions)</p>
                  <p className="stat-card-value !text-xl">
                    ₹{(viewOrder.addBalance ?? viewOrder.originalDealAmount ?? viewOrder.totalDealAmount).toLocaleString("en-IN")}
                  </p>
                  {(viewOrder.repairDeductionTotal || 0) > 0 && (
                    <p className="mt-0.5 text-xs text-danger">
                      Repair −₹{(viewOrder.repairDeductionTotal || 0).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
                <div className="stat-card !p-3">
                  <p className="stat-card-label">Created</p>
                  <p className="stat-card-value !text-xl">
                    {formatDisplayDate(viewOrder.createdAt)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">by {viewOrder.createdBy}</p>
                </div>
              </div>

              {viewOrder.products && viewOrder.products.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <ShoppingBag className="h-4 w-4 text-[var(--text-muted)]" />
                    Products
                  </h4>
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
                        {viewOrder.products.map((p, i) => (
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
                    <span className="font-bold text-jade-deep">{money(viewOrder.productsTotal ?? 0)}</span>
                  </div>
                </div>
              )}

              {viewOrder.materialDeductions && viewOrder.materialDeductions.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Wrench className="h-4 w-4 text-[var(--text-muted)]" />
                    Runner / Fitting / Astar / Material
                  </h4>
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
                        {viewOrder.materialDeductions.map((it, i) => (
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
                    <span className="font-bold text-danger">−{money(viewOrder.materialDeductionsTotal ?? 0)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-[var(--text-muted)]">
                    <Package className="h-3.5 w-3.5" />
                    {orderWeekMeta(viewOrder).label} kharcha
                  </span>
                  <span className="font-bold">
                    {(viewOrder.kharchaGiven || 0) > 0
                      ? money(viewOrder.kharchaGiven || 0)
                      : "—"}
                  </span>
                </div>
              {(viewOrder.kharchaCarriedForward || 0) > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
                  <span className="font-medium text-amber-900">
                    Carried into running balance
                  </span>
                  <span className="font-bold text-amber-950">
                    {money(viewOrder.kharchaCarriedForward || 0)}
                  </span>
                </div>
              )}

              {viewOrder.notes && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold">Notes</h4>
                  <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-2.5 text-sm text-[var(--text-muted)]">
                    {viewOrder.notes}
                  </p>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => exportBillExcel(viewOrder)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Excel
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowWhatsAppBill(true)}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Share WhatsApp
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    openOrderEdit(viewOrder);
                    setViewOrder(null);
                    setShowWhatsAppBill(false);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Bill
                </button>
                <button
                  type="button"
                  className="btn !bg-danger/10 !text-danger hover:!bg-danger/20"
                  onClick={() => deleteOrderRecord(viewOrder)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </div>

          {showWhatsAppBill && (
            <BillWhatsAppModal
              order={viewOrder}
              onClose={() => setShowWhatsAppBill(false)}
            />
          )}
        </>
      )}

      {listModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setListModal(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="surface !overflow-y-auto max-h-[90vh] w-full max-w-md space-y-4 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold">
                    {listModal === "partners" ? "Delivery partners" : "Companies"}
                  </h3>
                  <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                    Only what you add here shows for staff in Pickup &amp; Return. Staff cannot add
                    {listModal === "partners" ? " partners" : " companies"}.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 p-2"
                  onClick={() => setListModal(null)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={addListItem} className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder={
                    listModal === "partners" ? "New partner name" : "New company name"
                  }
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  disabled={listSaving}
                />
                <button type="submit" className="btn btn-primary shrink-0" disabled={listSaving}>
                  <Plus className="h-4 w-4" />
                  {listSaving ? "Adding…" : "Add"}
                </button>
              </form>

              {listMsg && (
                <p className="text-sm text-[var(--text-muted)]">{listMsg}</p>
              )}

              <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                {(listModal === "partners" ? partnerOptions : companyOptions).length === 0 ? (
                  <li className="px-3 py-3 text-sm text-[var(--text-muted)]">
                    Nothing yet. Add one above — staff will see it immediately.
                  </li>
                ) : (
                  (listModal === "partners" ? partnerOptions : companyOptions).map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                    >
                      <p className="min-w-0 truncate font-medium">{item.name}</p>
                      <button
                        type="button"
                        className="btn btn-ghost shrink-0 p-2 text-red-600"
                        onClick={() => deleteListItem(item)}
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </>
      )}

      {pickupModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setPickupModal(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form onSubmit={savePickup} className="surface w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-lg font-bold">
                {pickupModal === "add" ? "Add pickup" : "Edit pickup"}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Claris qty</label>
                  <input
                    className="input input-qty"
                    type="text"
                    inputMode="numeric"
                    value={pickupForm.clarisQuantity}
                    onChange={(e) => setPickupForm({ ...pickupForm, clarisQuantity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Bliss qty</label>
                  <input
                    className="input input-qty"
                    type="text"
                    inputMode="numeric"
                    value={pickupForm.blissQuantity}
                    onChange={(e) => setPickupForm({ ...pickupForm, blissQuantity: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">Company</label>
                <select
                  className="input"
                  value={pickupForm.partner}
                  onChange={(e) => setPickupForm({ ...pickupForm, partner: e.target.value })}
                  required
                >
                  <option value="">
                    {companyNames.length === 0 ? "Add companies first" : "Select company"}
                  </option>
                  {companyNames.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  {pickupForm.partner &&
                    !companyNames.some((n) => nameEquals(n, pickupForm.partner)) && (
                      <option value={pickupForm.partner}>{pickupForm.partner}</option>
                    )}
                </select>
              </div>
              <div>
                <label className="label">Delivery partner</label>
                <select
                  className="input"
                  value={pickupForm.deliveryPartner}
                  onChange={(e) => setPickupForm({ ...pickupForm, deliveryPartner: e.target.value })}
                >
                  <option value="">
                    {partnerNames.length === 0 ? "Add partners first" : "Select delivery partner"}
                  </option>
                  {partnerNames.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                  {pickupForm.deliveryPartner &&
                    !partnerNames.some((n) => nameEquals(n, pickupForm.deliveryPartner)) && (
                      <option value={pickupForm.deliveryPartner}>{pickupForm.deliveryPartner}</option>
                    )}
                </select>
              </div>
              {(["staffName", "date", "time"] as const).map((key) => (
                <div key={key}>
                  <label className="label capitalize">{key.replace(/([A-Z])/g, " $1")}</label>
                  <input
                    className="input"
                    type="text"
                    value={pickupForm[key]}
                    onChange={(e) => setPickupForm({ ...pickupForm, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setPickupModal(null)} disabled={dispatchSaving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={dispatchSaving}>
                  {dispatchSaving ? "Saving…" : pickupModal === "add" ? "Add" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {returnModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setReturnModal(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form onSubmit={saveReturn} className="surface !overflow-y-auto max-h-[90vh] w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-lg font-bold">
                {returnModal === "add" ? "Add return" : "Edit return"}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Claris qty</label>
                  <input
                    className="input input-qty"
                    type="text"
                    inputMode="numeric"
                    value={returnForm.clarisQuantity}
                    onChange={(e) => setReturnForm({ ...returnForm, clarisQuantity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Bliss qty</label>
                  <input
                    className="input input-qty"
                    type="text"
                    inputMode="numeric"
                    value={returnForm.blissQuantity}
                    onChange={(e) => setReturnForm({ ...returnForm, blissQuantity: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">Company</label>
                <select
                  className="input"
                  value={returnForm.partner}
                  onChange={(e) => setReturnForm({ ...returnForm, partner: e.target.value })}
                  required
                >
                  <option value="">
                    {companyNames.length === 0 ? "Add companies first" : "Select company"}
                  </option>
                  {companyNames.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  {returnForm.partner &&
                    !companyNames.some((n) => nameEquals(n, returnForm.partner)) && (
                      <option value={returnForm.partner}>{returnForm.partner}</option>
                    )}
                </select>
              </div>
              <div>
                <label className="label">Delivery partner</label>
                <select
                  className="input"
                  value={returnForm.deliveryPartner}
                  onChange={(e) => setReturnForm({ ...returnForm, deliveryPartner: e.target.value })}
                >
                  <option value="">
                    {partnerNames.length === 0 ? "Add partners first" : "Select delivery partner"}
                  </option>
                  {partnerNames.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                  {returnForm.deliveryPartner &&
                    !partnerNames.some((n) => nameEquals(n, returnForm.deliveryPartner)) && (
                      <option value={returnForm.deliveryPartner}>{returnForm.deliveryPartner}</option>
                    )}
                </select>
              </div>
              {(["returnType", "staffName", "date", "time", "notes"] as const).map((key) => (
                <div key={key}>
                  <label className="label capitalize">{key.replace(/([A-Z])/g, " $1")}</label>
                  <input
                    className="input"
                    type="text"
                    value={returnForm[key]}
                    onChange={(e) => setReturnForm({ ...returnForm, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setReturnModal(null)} disabled={dispatchSaving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={dispatchSaving}>
                  {dispatchSaving ? "Saving…" : returnModal === "add" ? "Add" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {editOrder && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditOrder(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={saveOrderRecord}
              className="surface !overflow-y-auto max-h-[90vh] w-full max-w-2xl space-y-4 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold">Edit Bill</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Same fields as the Kaarigar bill form — products, deductions, kharcha & notes.
                  </p>
                </div>
                <button type="button" className="btn-icon" onClick={() => setEditOrder(null)} aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Kaariger name</label>
                  <input
                    className="input"
                    value={billKaarigerName}
                    onChange={(e) => setBillKaarigerName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select
                    className="input"
                    value={billStatus}
                    onChange={(e) => setBillStatus(e.target.value)}
                  >
                    {["ASSIGNED", "COMPLETED", "CANCELLED"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="label mb-0 flex items-center gap-1.5">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    Products
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setBillProducts((prev) => [...prev, emptyProductLine()])}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add product
                  </button>
                </div>
                <div className="space-y-2">
                  {billProducts.map((line, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] p-2.5 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_auto] sm:items-end"
                    >
                      <div>
                        <label className="label !text-[10px]">Product</label>
                        <input
                          className="input !w-full !py-2"
                          value={line.productName}
                          onChange={(e) =>
                            setBillProducts((prev) =>
                              prev.map((p, idx) => (idx === i ? { ...p, productName: e.target.value } : p))
                            )
                          }
                          placeholder="Product name"
                        />
                      </div>
                      <div>
                        <label className="label !text-[10px]">Qty</label>
                        <input
                          className="input-qty"
                          type="text"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(e) =>
                            setBillProducts((prev) =>
                              prev.map((p, idx) => (idx === i ? { ...p, quantity: e.target.value } : p))
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="label !text-[10px]">₹ / pc</label>
                        <input
                          className="input-qty"
                          type="text"
                          inputMode="decimal"
                          value={line.pricePerPiece}
                          onChange={(e) =>
                            setBillProducts((prev) =>
                              prev.map((p, idx) => (idx === i ? { ...p, pricePerPiece: e.target.value } : p))
                            )
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-ghost btn-sm !p-2"
                        onClick={() => setBillProducts((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Remove product"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="label mb-2 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" />
                  Runner / Fitting / Astar
                </p>
                <div className="space-y-2">
                  {CHARGE_ITEMS.map(({ type, label }) => (
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
                          value={billCharges[type].qty}
                          onChange={(e) =>
                            setBillCharges({
                              ...billCharges,
                              [type]: { ...billCharges[type], qty: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="label !text-[10px]">₹ / pc</label>
                        <input
                          className="input-qty"
                          type="text"
                          inputMode="decimal"
                          value={billCharges[type].price}
                          onChange={(e) =>
                            setBillCharges({
                              ...billCharges,
                              [type]: { ...billCharges[type], price: e.target.value },
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
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
                      New
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setBillMaterials((prev) => [...prev, emptyMaterialLine()])}
                    >
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
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm shrink-0"
                      disabled={addingMaterial || !newMaterialName.trim()}
                      onClick={async () => {
                        const name = newMaterialName.trim();
                        if (!name) return;
                        if (rawMaterials.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
                          setBillMsg(`"${name}" is already in Materials.`);
                          return;
                        }
                        setAddingMaterial(true);
                        try {
                          const id = uuid();
                          await setDoc(doc(getDb(), "raw_materials", id), {
                            id,
                            name,
                            quantity: 0,
                            unit: "pcs",
                            minimumStock: 0,
                            supplier: "",
                            lastUpdatedBy: "Admin",
                            lastUpdatedTime: Date.now(),
                            imagePath: "",
                          });
                          setRawMaterials((prev) =>
                            [...prev, { id, name }].sort((a, b) => a.name.localeCompare(b.name))
                          );
                          setBillMaterials((prev) => {
                            const emptyIdx = prev.findIndex((l) => !l.materialId && !l.name);
                            if (emptyIdx >= 0) {
                              return prev.map((l, i) =>
                                i === emptyIdx ? { ...l, materialId: id, name } : l
                              );
                            }
                            return [...prev, { materialId: id, name, qty: "", price: "" }];
                          });
                          setNewMaterialName("");
                          setShowNewMaterial(false);
                        } finally {
                          setAddingMaterial(false);
                        }
                      }}
                    >
                      {addingMaterial ? "…" : "Add"}
                    </button>
                  </div>
                )}
                <div className="space-y-2">
                  {billMaterials.map((m, index) => (
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
                            setBillMaterials((prev) =>
                              prev.map((line, i) =>
                                i === index ? { ...line, materialId: id, name: mat?.name || "" } : line
                              )
                            );
                          }}
                          options={rawMaterials.map((x) => ({ id: x.id, label: x.name }))}
                          placeholder="Search material…"
                          emptyText="No materials"
                        />
                      </div>
                      <div>
                        <label className="label !text-[10px]">Qty</label>
                        <input
                          className="input-qty"
                          type="text"
                          inputMode="decimal"
                          value={m.qty}
                          onChange={(e) =>
                            setBillMaterials((prev) =>
                              prev.map((line, i) => (i === index ? { ...line, qty: e.target.value } : line))
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="label !text-[10px]">₹ / pc</label>
                        <input
                          className="input-qty"
                          type="text"
                          inputMode="decimal"
                          value={m.price}
                          onChange={(e) =>
                            setBillMaterials((prev) =>
                              prev.map((line, i) => (i === index ? { ...line, price: e.target.value } : line))
                            )
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-ghost btn-sm !p-2"
                        onClick={() => setBillMaterials((prev) => prev.filter((_, i) => i !== index))}
                        aria-label="Remove material"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="label mb-0 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" />
                    This week&apos;s kharcha
                  </label>
                  {(Number(billKharcha) || 0) > 0 && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm !text-danger"
                      onClick={() => setBillKharcha("")}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  className="input"
                  type="text"
                  inputMode="decimal"
                  value={billKharcha}
                  onChange={(e) => setBillKharcha(e.target.value)}
                  placeholder="0 — leave empty or Remove to clear"
                />
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Add, change, or remove week kharcha. Empty / Remove sets it to ₹0.
                </p>
              </div>

              <div>
                <label className="label">Notes (optional)</label>
                <input
                  className="input"
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  placeholder="Optional instructions"
                />
              </div>

              {billMsg && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{billMsg}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditOrder(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={billSaving}>
                  {billSaving ? "Saving…" : "Save Bill"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
