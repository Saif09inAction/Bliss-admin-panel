"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Package, Receipt, ShoppingBag, Wallet, Wrench } from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { Employee, KaarigerOrder, KaarigerPayment, OrderMaterial, OrderProductLine, OrderRepair, RepairLineItem } from "@/lib/types";
import PageToolbar from "@/components/admin/PageToolbar";
import SearchSelect from "@/components/admin/SearchSelect";

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function orderNetDeal(order: KaarigerOrder) {
  const deal = order.originalDealAmount ?? order.totalDealAmount;
  return Math.max(0, deal - (order.repairDeductionTotal || 0));
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

export default function HisaabPage() {
  const [kaarigers, setKaarigers] = useState<Employee[]>([]);
  const [kaarigerId, setKaarigerId] = useState("");
  const [orders, setOrders] = useState<KaarigerOrder[]>([]);
  const [payments, setPayments] = useState<KaarigerPayment[]>([]);
  const [repairs, setRepairs] = useState<OrderRepair[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
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
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    })();
  }, []);

  useEffect(() => {
    if (!kaarigerId) {
      setOrders([]);
      setPayments([]);
      setRepairs([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const db = getDb();
        const [orderSnap, paySnap, repairSnap] = await Promise.all([
          getDocs(query(collection(db, "kaariger_orders"), where("kaarigerId", "==", kaarigerId))),
          getDocs(query(collection(db, "kaariger_payments"), where("kaarigerId", "==", kaarigerId))),
          getDocs(query(collection(db, "order_repairs"), where("kaarigerId", "==", kaarigerId))),
        ]);
        setOrders(
          orderSnap.docs
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
              } satisfies KaarigerOrder;
            })
            .sort((a, b) => b.createdAt - a.createdAt)
        );
        setPayments(
          paySnap.docs
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
              } satisfies KaarigerPayment;
            })
            .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        );
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
              } satisfies OrderRepair;
            })
            .sort((a, b) => b.createdAt - a.createdAt)
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [kaarigerId]);

  const kaarigerOptions = kaarigers.map((k) => ({ id: k.phone, label: k.name, sublabel: k.phone }));
  const selectedKaariger = kaarigers.find((k) => k.phone === kaarigerId);

  const orderPaidMap = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((p) => map.set(p.orderId, (map.get(p.orderId) || 0) + p.amount));
    return map;
  }, [payments]);

  const totals = useMemo(() => {
    const deal = orders.reduce((s, o) => s + orderNetDeal(o), 0);
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    const repaired = repairs.reduce((s, r) => s + r.totalRepairCost, 0);
    const balance = Math.max(0, deal - paid);
    return { deal, paid, repaired, balance };
  }, [orders, payments, repairs]);

  // Runner / Fitting / Astar / Material — grouped the same way the old paper
  // "Kaarigar Statement" sheets were, so it reads as one sorted ledger.
  const materialCategories = useMemo(() => {
    const allLines = orders.flatMap((o) =>
      (o.materialDeductions || []).map((it) => ({ ...it, orderId: o.id, productName: o.productName, createdAt: o.createdAt }))
    );

    function groupByLabel(type: string) {
      const items = allLines.filter((l) => l.type === type);
      const byLabel = new Map<string, { label: string; quantity: number; lineTotal: number }>();
      items.forEach((it) => {
        const existing = byLabel.get(it.label);
        if (existing) {
          existing.quantity += it.quantity;
          existing.lineTotal += it.lineTotal;
        } else {
          byLabel.set(it.label, { label: it.label, quantity: it.quantity, lineTotal: it.lineTotal });
        }
      });
      return {
        rows: Array.from(byLabel.values()).sort((a, b) => b.lineTotal - a.lineTotal),
        total: items.reduce((s, it) => s + it.lineTotal, 0),
      };
    }

    const material = groupByLabel("MATERIAL");
    const astar = groupByLabel("ASTAR");
    const runner = groupByLabel("RUNNER");
    const fitting = groupByLabel("FITTING");
    const grandTotal = material.total + astar.total + runner.total + fitting.total;
    return { material, astar, runner, fitting, grandTotal };
  }, [orders]);

  const hasMaterialCategories =
    materialCategories.material.rows.length > 0 ||
    materialCategories.astar.rows.length > 0 ||
    materialCategories.runner.rows.length > 0 ||
    materialCategories.fitting.rows.length > 0;

  return (
    <div className="space-y-5">
      <PageToolbar title="Hisaab">
        <p className="section-sub">Full payment & kharcha history per kaariger</p>
      </PageToolbar>

      <div className="surface max-w-md p-4">
        <label className="label">Select kaariger</label>
        <SearchSelect
          value={kaarigerId}
          onSelect={setKaarigerId}
          options={kaarigerOptions}
          placeholder="Search or select a kaariger…"
          emptyText="No kaarigers found"
        />
      </div>

      {!kaarigerId ? (
        <div className="surface flex flex-col items-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-jade-soft text-jade-deep">
            <Receipt size={22} />
          </div>
          <p className="mt-3 font-semibold">Select a kaariger to view their hisaab</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            You&apos;ll see every order, all kharcha payments with dates, and the grand total.
          </p>
        </div>
      ) : loading ? (
        <div className="surface py-14 text-center text-sm text-[var(--text-muted)]">Loading hisaab…</div>
      ) : (
        <div className="space-y-5">
          <div className="surface flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-jade-soft text-jade-deep">
              <Wallet size={20} />
            </div>
            <div className="flex-1">
              <p className="font-display text-lg font-bold">{selectedKaariger?.name}</p>
              <p className="text-sm text-[var(--text-muted)]">{selectedKaariger?.phone} · {orders.length} order{orders.length === 1 ? "" : "s"}</p>
            </div>
            {(selectedKaariger?.creditBalance || 0) > 0 && (
              <div className="rounded-xl bg-jade-soft px-3 py-2 text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-jade-deep">Credit available</p>
                <p className="font-display text-base font-bold text-jade-deep">
                  {money(selectedKaariger?.creditBalance || 0)}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="stat-card">
              <p className="stat-card-label">Total Deal</p>
              <p className="stat-card-value">{money(totals.deal)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card-label">Total Kharcha Paid</p>
              <p className="stat-card-value text-jade-deep">{money(totals.paid)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card-label">Repairing Deductions</p>
              <p className="stat-card-value text-danger">{money(totals.repaired)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card-label">Total Balance</p>
              <p className="stat-card-value">{money(totals.balance)}</p>
            </div>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <ShoppingBag className="h-4 w-4 text-[var(--text-muted)]" />
              Orders
            </h3>
            {orders.length === 0 ? (
              <div className="surface py-10 text-center text-sm text-[var(--text-muted)]">
                No orders for this kaariger yet.
              </div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th className="text-right">Deal</th>
                      <th className="text-right">Paid</th>
                      <th className="text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const net = orderNetDeal(o);
                      const paid = orderPaidMap.get(o.id) || 0;
                      const balance = Math.max(0, net - paid);
                      return (
                        <tr key={o.id}>
                          <td className="font-medium">{o.productName}</td>
                          <td className="text-[var(--text-muted)]">
                            {o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-IN") : "—"}
                          </td>
                          <td>
                            <span className={orderStatusBadge(o.status)}>{o.status.replace(/_/g, " ")}</span>
                          </td>
                          <td className="text-right">{money(net)}</td>
                          <td className="text-right text-jade-deep">{money(paid)}</td>
                          <td className="text-right font-semibold">{money(balance)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Package className="h-4 w-4 text-[var(--text-muted)]" />
              Material, Runner, Fitting &amp; Astar
            </h3>
            {!hasMaterialCategories ? (
              <div className="surface py-10 text-center text-sm text-[var(--text-muted)]">
                No material, runner, fitting or astar charges recorded yet.
              </div>
            ) : (
              <div className="surface space-y-4 p-4">
                {materialCategories.material.rows.length > 0 && (
                  <CategoryBlock
                    title="Material"
                    rows={materialCategories.material.rows}
                    total={materialCategories.material.total}
                  />
                )}
                {materialCategories.astar.rows.length > 0 && (
                  <CategoryBlock
                    title="Astar"
                    rows={materialCategories.astar.rows}
                    total={materialCategories.astar.total}
                  />
                )}
                {(materialCategories.runner.rows.length > 0 || materialCategories.fitting.rows.length > 0) && (
                  <CategoryBlock
                    title="Runner / Fitting"
                    rows={[...materialCategories.runner.rows, ...materialCategories.fitting.rows]}
                    total={materialCategories.runner.total + materialCategories.fitting.total}
                  />
                )}
                <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
                  <span className="font-display font-bold text-amber-700">Grand Total</span>
                  <span className="font-display text-lg font-bold text-amber-700">
                    {money(materialCategories.grandTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Wrench className="h-4 w-4 text-[var(--text-muted)]" />
              Repairing Deductions
            </h3>
            {repairs.length === 0 ? (
              <div className="surface py-10 text-center text-sm text-[var(--text-muted)]">
                No repairing deductions for this kaariger yet.
              </div>
            ) : (
              <div className="surface space-y-0 divide-y divide-[var(--border)] overflow-hidden !p-0">
                {repairs.map((r, i) => {
                  return (
                    <div key={r.id} className="flex items-center gap-3 p-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-danger">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {r.productName}
                          {r.faultyQuantity > 0
                            ? ` · ${r.faultyQuantity} pcs × ${money(r.faultyPricePerPiece)}`
                            : ""}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {new Date(r.createdAt).toLocaleDateString("en-IN")}{" "}
                          {new Date(r.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · by{" "}
                          {r.createdBy}
                          {r.notes ? ` · ${r.notes}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-danger">−{money(r.totalRepairCost)}</p>
                        <p className="text-xs text-[var(--text-faint)]">left {money(r.dealAfterThisRepair)}</p>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between bg-red-50 p-4">
                  <span className="font-display font-bold text-danger">Grand Total Deducted</span>
                  <span className="font-display text-lg font-bold text-danger">{money(totals.repaired)}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Package className="h-4 w-4 text-[var(--text-muted)]" />
              Kharcha Timeline
            </h3>
            {payments.length === 0 ? (
              <div className="surface py-10 text-center text-sm text-[var(--text-muted)]">
                No kharcha paid to this kaariger yet.
              </div>
            ) : (
              <div className="surface space-y-0 divide-y divide-[var(--border)] overflow-hidden !p-0">
                {payments.map((p, i) => {
                  const order = orders.find((o) => o.id === p.orderId);
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-jade-soft text-xs font-bold text-jade-deep">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {money(p.amount)} paid {order ? `· ${order.productName}` : ""}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {p.date} {p.time} · {p.createdBy}
                          {p.remarks ? ` · ${p.remarks}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between bg-jade-soft/50 p-4">
                  <span className="font-display font-bold text-jade-deep">Grand Total Kharcha</span>
                  <span className="font-display text-lg font-bold text-jade-deep">{money(totals.paid)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryBlock({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; quantity: number; lineTotal: number }[];
  total: number;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{title}</p>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 === 1 ? "bg-[var(--surface-mist)]" : undefined}>
                <td className="px-3 py-2 font-medium">{r.label}</td>
                <td className="px-3 py-2 text-[var(--text-muted)]">{r.quantity} pcs</td>
                <td className="px-3 py-2 text-right font-semibold text-danger">−{money(r.lineTotal)}</td>
              </tr>
            ))}
            <tr className="bg-amber-50/70">
              <td colSpan={2} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-700">
                {title} Total
              </td>
              <td className="px-3 py-2 text-right font-bold text-amber-700">−{money(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
