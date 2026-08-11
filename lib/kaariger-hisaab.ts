import type { KaarigerOrder } from "@/lib/types";

/**
 * Sheet-style weekly Hisaab (Bliss karigar statement):
 *
 *   ADD BALANCE = MAAL − (material/astar/runner/repair) − this week's kharcha
 *   Closing     = Opening + ADD BALANCE
 *
 * Kharcha is a weekly cash budget paid down through the week; unpaid amount
 * carries as oldKharcha into the next Saturday bill.
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

/** Full week's kharcha set on the bill (budget), before any carry-forward carve-out. */
export function orderWeekKharcha(order: KaarigerOrder): number {
  return Math.max(0, order.kharchaGiven || 0);
}

/** Week kharcha still owed on this bill (budget − already rolled into oldKharcha). */
export function orderKharchaDue(order: KaarigerOrder): number {
  return Math.max(0, orderWeekKharcha(order) - Math.max(0, order.kharchaCarriedForward || 0));
}

export function orderKharchaUnpaid(order: KaarigerOrder, paidOnOrder: number): number {
  return Math.max(0, orderKharchaDue(order) - Math.max(0, paidOnOrder));
}

/** Same as sheet: MAAL − deductions − week's kharcha. Can be negative. */
export function orderAddBalance(order: KaarigerOrder): number {
  return (
    orderMaal(order) -
    orderMaterialDeductions(order) -
    orderRepairDeductions(order) -
    orderWeekKharcha(order)
  );
}

export function orderClosing(openingBalance: number, order: KaarigerOrder): number {
  return Math.max(0, openingBalance) + orderAddBalance(order);
}
