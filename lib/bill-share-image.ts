import { toPng } from "html-to-image";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { KaarigerOrder, KaarigerPayment, OrderRepair } from "@/lib/types";
import type { BillExportExtras } from "@/lib/bill-export";

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

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sectionTitle(label: string) {
  return `<div style="margin:18px 0 8px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0d8f63;">${esc(label)}</div>`;
}

function row(left: string, right: string, opts?: { muted?: boolean; danger?: boolean; bold?: boolean }) {
  const color = opts?.danger ? "#c23b2e" : opts?.muted ? "#5a6b62" : "#0e1612";
  const weight = opts?.bold ? "700" : "500";
  return `<div style="display:flex;justify-content:space-between;gap:16px;padding:6px 0;border-bottom:1px solid #e8eee9;font-size:13px;color:${color};font-weight:${weight};">
    <span style="flex:1;line-height:1.35;">${left}</span>
    <span style="white-space:nowrap;font-variant-numeric:tabular-nums;">${right}</span>
  </div>`;
}

/** Ensure payments/repairs are available (Records share may omit them). */
export async function resolveBillExtras(
  order: KaarigerOrder,
  extras: BillExportExtras = {}
): Promise<{ payments: KaarigerPayment[]; repairs: OrderRepair[] }> {
  let payments = (extras.payments || []).filter((p) => p.orderId === order.id);
  let repairs = (extras.repairs || []).filter(
    (r) => r.orderId === order.id && (!r.status || r.status === "APPROVED")
  );

  if (extras.payments !== undefined && extras.repairs !== undefined) {
    return { payments, repairs };
  }

  const db = getDb();
  const [paySnap, repairSnap] = await Promise.all([
    extras.payments === undefined
      ? getDocs(query(collection(db, "kaariger_payments"), where("orderId", "==", order.id)))
      : Promise.resolve(null),
    extras.repairs === undefined
      ? getDocs(query(collection(db, "order_repairs"), where("orderId", "==", order.id)))
      : Promise.resolve(null),
  ]);

  if (paySnap) {
    payments = paySnap.docs.map((d) => {
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
    });
  }

  if (repairSnap) {
    repairs = repairSnap.docs
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
          items: [],
          totalRepairCost: (data.totalRepairCost as number) || 0,
          originalDealAmount: (data.originalDealAmount as number) || 0,
          dealAfterThisRepair: (data.dealAfterThisRepair as number) || 0,
          notes: data.notes as string | undefined,
          createdBy: (data.createdBy as string) || "",
          createdAt: (data.createdAt as number) || 0,
          status: data.status as OrderRepair["status"],
        } satisfies OrderRepair;
      })
      .filter((r) => !r.status || r.status === "APPROVED");
  }

  return { payments, repairs };
}

function buildBillHtml(
  order: KaarigerOrder,
  payments: KaarigerPayment[],
  repairs: OrderRepair[]
): string {
  const net = orderNetDeal(order);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, net - paid);
  const balanceLabel = balance <= 0 ? "All Paid" : money(balance);

  let body = "";

  if (order.products && order.products.length > 0) {
    body += sectionTitle("Products");
    order.products.forEach((p) => {
      body += row(
        `${esc(p.productName)} · ${p.quantity} × ₹${p.pricePerPiece}`,
        money(p.lineTotal)
      );
    });
    body += row("Products total", money(order.productsTotal ?? 0), { bold: true });
  }

  if (order.materialDeductions && order.materialDeductions.length > 0) {
    body += sectionTitle("Deductions");
    order.materialDeductions.forEach((it) => {
      body += row(
        `${esc(it.label)} · ${it.quantity} × ₹${it.pricePerPiece}`,
        `−${money(it.lineTotal)}`,
        { danger: true }
      );
    });
    body += row("Deductions total", `−${money(order.materialDeductionsTotal ?? 0)}`, {
      danger: true,
      bold: true,
    });
  }

  if (repairs.length > 0) {
    body += sectionTitle("Repairing");
    repairs.forEach((r) => {
      body += row(
        `${r.faultyQuantity} pcs × ₹${r.faultyPricePerPiece} · ${formatDate(r.createdAt)}`,
        `−${money(r.totalRepairCost)}`,
        { danger: true }
      );
    });
    body += row("Repair total", `−${money(order.repairDeductionTotal || 0)}`, {
      danger: true,
      bold: true,
    });
  }

  if ((order.kharchaGiven || 0) > 0) {
    body += sectionTitle("Advance at creation");
    body += row("Kharcha given", money(order.kharchaGiven || 0));
  }

  if (payments.length > 0) {
    body += sectionTitle("Kharcha received");
    payments
      .slice()
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .forEach((p) => {
        const note = p.remarks ? ` · ${esc(p.remarks)}` : "";
        body += row(
          `${esc(p.date)}${p.time ? ` · ${esc(p.time)}` : ""}${note}`,
          money(p.amount)
        );
      });
    body += row("Kharcha total", money(paid), { bold: true });
  }

  if (order.notes?.trim()) {
    body += sectionTitle("Notes");
    body += `<div style="font-size:13px;color:#5a6b62;line-height:1.4;padding:4px 0;">${esc(order.notes.trim())}</div>`;
  }

  return `
<div id="bill-share-card" style="width:720px;box-sizing:border-box;background:#ffffff;color:#0e1612;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;border-radius:20px;overflow:hidden;border:1px solid #d8e4dc;">
  <div style="background:linear-gradient(145deg,#0c1a14 0%,#06110d 100%);padding:28px 32px 24px;color:#fff;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#1ecb8f;">Bliss Bombay</div>
    <div style="margin-top:6px;font-size:26px;font-weight:700;letter-spacing:-0.02em;">Kaarigar Bill</div>
    <div style="margin-top:14px;font-size:18px;font-weight:600;">${esc(order.productName || "Order")}</div>
    <div style="margin-top:8px;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.5;">
      ${esc(order.kaarigerName)} · ${formatDate(order.createdAt)} · ${esc(order.status.replace(/_/g, " "))}
    </div>
  </div>
  <div style="padding:8px 32px 28px;">
    ${body || `<div style="padding:24px 0;font-size:13px;color:#5a6b62;">No line items on this bill.</div>`}
    <div style="margin-top:22px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
      <div style="background:#f3f7f4;border-radius:14px;padding:14px 12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#5a6b62;">Deal</div>
        <div style="margin-top:6px;font-size:18px;font-weight:700;">${money(net)}</div>
      </div>
      <div style="background:#d8f8eb;border-radius:14px;padding:14px 12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#0d8f63;">Paid</div>
        <div style="margin-top:6px;font-size:18px;font-weight:700;color:#0d8f63;">${money(paid)}</div>
      </div>
      <div style="background:${balance <= 0 ? "#d8f8eb" : "#fff4e0"};border-radius:14px;padding:14px 12px;text-align:center;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${balance <= 0 ? "#0d8f63" : "#b45309"};">Balance</div>
        <div style="margin-top:6px;font-size:18px;font-weight:700;color:${balance <= 0 ? "#0d8f63" : "#b45309"};">${balanceLabel}</div>
      </div>
    </div>
  </div>
  <div style="padding:12px 32px 18px;border-top:1px solid #e8eee9;font-size:11px;color:#8a9a92;text-align:center;">
    Generated ${new Date().toLocaleString("en-IN")} · Bliss Bombay
  </div>
</div>`;
}

export type BillShareResult = {
  mode: "shared" | "downloaded";
  message: string;
  balance: number;
  caption: string;
};

function safeFileName(order: KaarigerOrder) {
  const safe = `${order.kaarigerName}_${order.productName}`.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
  return `bill_${safe || order.id}.png`;
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Render bill to a PNG File via an off-screen DOM card. */
export async function renderBillPngFile(
  order: KaarigerOrder,
  extras: BillExportExtras = {}
): Promise<{ file: File; balance: number; caption: string }> {
  const { payments, repairs } = await resolveBillExtras(order, extras);
  const net = orderNetDeal(order);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, net - paid);
  const caption =
    balance <= 0
      ? `Bliss Bombay bill · ${order.kaarigerName} · ${order.productName} · All Paid`
      : `Bliss Bombay bill · ${order.kaarigerName} · ${order.productName} · Balance ${money(balance)}`;

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:720px;pointer-events:none;z-index:-1;";
  host.innerHTML = buildBillHtml(order, payments, repairs);
  document.body.appendChild(host);

  const card = host.querySelector("#bill-share-card") as HTMLElement | null;
  if (!card) {
    host.remove();
    throw new Error("Failed to build bill card.");
  }

  try {
    // Warm layout before capture
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    const dataUrl = await toPng(card, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#ffffff",
    });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], safeFileName(order), { type: "image/png" });
    return { file, balance, caption };
  } finally {
    host.remove();
  }
}

/**
 * Share bill as PNG via Web Share API when possible; otherwise download the image
 * for the admin to attach in WhatsApp.
 */
export async function shareBillAsImage(
  order: KaarigerOrder,
  extras: BillExportExtras = {}
): Promise<BillShareResult> {
  const { file, balance, caption } = await renderBillPngFile(order, extras);

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  try {
    if (typeof nav.canShare === "function" && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({
        files: [file],
        title: `Bill — ${order.kaarigerName}`,
        text: caption,
      });
      return {
        mode: "shared",
        message: "Share sheet opened — pick WhatsApp to send the bill image.",
        balance,
        caption,
      };
    }
  } catch (err) {
    // User cancelled share — don't fall through to download.
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        mode: "shared",
        message: "Share cancelled.",
        balance,
        caption,
      };
    }
  }

  downloadFile(file);
  return {
    mode: "downloaded",
    message: "Bill image downloaded — attach it in WhatsApp.",
    balance,
    caption,
  };
}
