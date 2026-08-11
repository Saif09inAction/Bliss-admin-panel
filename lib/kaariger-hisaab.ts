import type { KaarigerOrder } from "@/lib/types";

/**
 * Weekly Hisaab (aligned with client flow):
 *
 *   Running balance (opening/closing) += MAAL − material/astar/runner/repair
 *   (week kharcha is NOT subtracted from running balance)
 *
 *   Kharcha box     = this week's unpaid kharcha only
 *   Total Remaining = running balance + unpaid week kharcha (− credit − repairs)
 *
 * Paying kharcha reduces both Kharcha and Total Remaining.
 * Next Saturday: unpaid week kharcha folds into running balance; new week
 * kharcha appears in the Kharcha box.
 */

export function orderMaal(order: KaarigerOrder): number {
  if (order.productsTotal != null && order.productsTotal > 0) return order.productsTotal;
  return Math.max(0, order.originalDealAmount ?? order.totalDealAmount ?? 0);
}

export function orderMaterialDeductions(order: KaarigerOrder): number {
  if (order.materialDeductionsTotal != null) return Math.max(0, order.materialDeductionsTotal);
  return (order.materialDeductions || []).reduce((s, it) => s + (it.lineTotal || 0), 0);
}

export function orderRepairDeductions(order: KaarigerOrder): number {
  return Math.max(0, order.repairDeductionTotal || 0);
}

/** Full week's kharcha set on the bill (budget). */
export function orderWeekKharcha(order: KaarigerOrder): number {
  return Math.max(0, order.kharchaGiven || 0);
}

/** Week kharcha still owed on this bill (budget − rolled into running balance). */
export function orderKharchaDue(order: KaarigerOrder): number {
  return Math.max(0, orderWeekKharcha(order) - Math.max(0, order.kharchaCarriedForward || 0));
}

export function orderKharchaUnpaid(order: KaarigerOrder, paidOnOrder: number): number {
  return Math.max(0, orderKharchaDue(order) - Math.max(0, paidOnOrder));
}

/**
 * ADD to running balance (closing − opening for the week).
 * Week kharcha is tracked separately — not part of ADD.
 */
export function orderAddBalance(order: KaarigerOrder): number {
  return orderMaal(order) - orderMaterialDeductions(order) - orderRepairDeductions(order);
}

export function orderClosing(openingBalance: number, order: KaarigerOrder): number {
  return Math.max(0, openingBalance) + orderAddBalance(order);
}

/** Total remaining = running balance + unpaid week kharcha. */
export function totalRemainingAmount(opts: {
  openingBalance: number;
  weekKharchaUnpaid: number;
  creditBalance?: number;
  standaloneRepairTotal?: number;
}): number {
  const gross =
    Math.max(0, opts.openingBalance) + Math.max(0, opts.weekKharchaUnpaid);
  return Math.max(
    0,
    gross - Math.max(0, opts.creditBalance || 0) - Math.max(0, opts.standaloneRepairTotal || 0)
  );
}
