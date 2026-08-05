import type { KaarigerOrder, KaarigerPayment, OrderRepair } from "@/lib/types";
import { downloadCsvRows } from "@/lib/csv";

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatDate(ts: number) {
  return ts
    ? new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

function orderNetDeal(order: KaarigerOrder) {
  const deal = order.originalDealAmount ?? order.totalDealAmount;
  return Math.max(0, deal - (order.repairDeductionTotal || 0));
}

export type BillExportExtras = {
  payments?: KaarigerPayment[];
  repairs?: OrderRepair[];
};

/** Build a plain-text bill statement suitable for WhatsApp / clipboard. */
export function buildBillText(order: KaarigerOrder, extras: BillExportExtras = {}): string {
  const lines: string[] = [];
  const net = orderNetDeal(order);
  const payments = (extras.payments || []).filter((p) => p.orderId === order.id);
  const repairs = (extras.repairs || []).filter(
    (r) => r.orderId === order.id && (!r.status || r.status === "APPROVED")
  );
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, net - paid);

  lines.push(`*Bliss Bombay — Kaarigar Bill*`);
  lines.push(`${order.productName}`);
  lines.push(`Kaariger: ${order.kaarigerName}`);
  lines.push(`Date: ${formatDate(order.createdAt)}`);
  lines.push(`Status: ${order.status.replace(/_/g, " ")}`);
  lines.push("");

  if (order.products && order.products.length > 0) {
    lines.push(`*Products*`);
    order.products.forEach((p) => {
      lines.push(`• ${p.productName}: ${p.quantity} × ₹${p.pricePerPiece} = ${money(p.lineTotal)}`);
    });
    lines.push(`Products Total: ${money(order.productsTotal ?? 0)}`);
    lines.push("");
  }

  if (order.materialDeductions && order.materialDeductions.length > 0) {
    lines.push(`*Deductions (Runner/Fitting/Astar/Material)*`);
    order.materialDeductions.forEach((it) => {
      lines.push(`• ${it.label}: ${it.quantity} × ₹${it.pricePerPiece} = −${money(it.lineTotal)}`);
    });
    lines.push(`Deductions Total: −${money(order.materialDeductionsTotal ?? 0)}`);
    lines.push("");
  }

  if (repairs.length > 0) {
    lines.push(`*Repairing Deductions*`);
    repairs.forEach((r) => {
      lines.push(
        `• ${r.faultyQuantity} pcs × ₹${r.faultyPricePerPiece} = −${money(r.totalRepairCost)} (${formatDate(r.createdAt)})`
      );
    });
    lines.push(`Repair Total: −${money(order.repairDeductionTotal || 0)}`);
    lines.push("");
  }

  if ((order.kharchaGiven || 0) > 0) {
    lines.push(`Kharcha given at creation: ${money(order.kharchaGiven || 0)}`);
    lines.push("");
  }

  if (payments.length > 0) {
    lines.push(`*Kharcha Timeline*`);
    payments.forEach((p) => {
      const note = p.remarks ? ` — ${p.remarks}` : "";
      lines.push(`• ${p.date} ${p.time}: ${money(p.amount)}${note}`);
    });
    lines.push(`Kharcha Total: ${money(paid)}`);
    lines.push("");
  }

  lines.push(`*Summary*`);
  lines.push(`Deal: ${money(net)}`);
  lines.push(`Paid: ${money(paid)}`);
  lines.push(balance <= 0 ? `Balance: All Paid` : `Balance: ${money(balance)}`);

  if (order.notes?.trim()) {
    lines.push("");
    lines.push(`Notes: ${order.notes.trim()}`);
  }

  return lines.join("\n");
}

/** Export a single bill as an Excel-friendly CSV. */
export function exportBillExcel(order: KaarigerOrder, extras: BillExportExtras = {}) {
  const rows: string[][] = [];
  const net = orderNetDeal(order);
  const payments = (extras.payments || []).filter((p) => p.orderId === order.id);
  const repairs = (extras.repairs || []).filter(
    (r) => r.orderId === order.id && (!r.status || r.status === "APPROVED")
  );
  const paid = payments.reduce((s, p) => s + p.amount, 0);

  rows.push(["Bliss Bombay — Kaarigar Bill"]);
  rows.push(["Kaariger", order.kaarigerName]);
  rows.push(["Products", order.productName]);
  rows.push(["Date", formatDate(order.createdAt)]);
  rows.push(["Status", order.status.replace(/_/g, " ")]);
  rows.push(["Created by", order.createdBy]);
  rows.push([]);

  if (order.products && order.products.length > 0) {
    rows.push(["PRODUCTS"]);
    rows.push(["Product", "Qty", "₹/pc", "Total"]);
    order.products.forEach((p) => {
      rows.push([p.productName, String(p.quantity), String(p.pricePerPiece), String(Math.round(p.lineTotal))]);
    });
    rows.push(["Products Total", "", "", String(Math.round(order.productsTotal ?? 0))]);
    rows.push([]);
  }

  if (order.materialDeductions && order.materialDeductions.length > 0) {
    rows.push(["DEDUCTIONS (Runner / Fitting / Astar / Material)"]);
    rows.push(["Item", "Qty", "₹/pc", "Total"]);
    order.materialDeductions.forEach((it) => {
      rows.push([it.label, String(it.quantity), String(it.pricePerPiece), String(-Math.round(it.lineTotal))]);
    });
    rows.push(["Deductions Total", "", "", String(-Math.round(order.materialDeductionsTotal ?? 0))]);
    rows.push([]);
  }

  if (repairs.length > 0) {
    rows.push(["REPAIRING DEDUCTIONS"]);
    rows.push(["Date", "Faulty Qty", "₹/pc", "Amount", "By", "Notes"]);
    repairs.forEach((r) => {
      rows.push([
        formatDate(r.createdAt),
        String(r.faultyQuantity),
        String(r.faultyPricePerPiece),
        String(-Math.round(r.totalRepairCost)),
        r.createdBy,
        r.notes || "",
      ]);
    });
    rows.push(["Repair Total", "", "", String(-Math.round(order.repairDeductionTotal || 0)), "", ""]);
    rows.push([]);
  }

  if ((order.kharchaGiven || 0) > 0) {
    rows.push(["Kharcha given at creation", String(Math.round(order.kharchaGiven || 0))]);
    rows.push([]);
  }

  if (payments.length > 0) {
    rows.push(["KHARCHA TIMELINE"]);
    rows.push(["Date", "Time", "Amount", "Remarks", "Created By"]);
    payments.forEach((p) => {
      rows.push([p.date, p.time, String(Math.round(p.amount)), p.remarks || "", p.createdBy]);
    });
    rows.push(["Total", "", String(Math.round(paid)), "", ""]);
    rows.push([]);
  }

  rows.push(["SUMMARY"]);
  rows.push(["Deal", String(Math.round(net))]);
  rows.push(["Paid", String(Math.round(paid))]);
  rows.push(["Balance", String(Math.round(Math.max(0, net - paid)))]);
  if (order.notes?.trim()) {
    rows.push([]);
    rows.push(["Notes", order.notes.trim()]);
  }

  const safe = `${order.kaarigerName}_${order.productName}`.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
  downloadCsvRows(`bill_${safe || order.id}.csv`, rows);
}

/** Open WhatsApp with the bill text pre-filled (user picks the contact). */
export function shareBillWhatsApp(order: KaarigerOrder, extras: BillExportExtras = {}) {
  const text = buildBillText(order, extras);
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
