import {
  deleteDoc,
  doc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import {
  isCreditPayment,
  isOldKharchaPayment,
  isOpeningPayment,
  paymentKind,
} from "@/lib/kaariger-pay";
import type { KaarigerPayment } from "@/lib/types";

/** Remove a staff salary payment — paid/due totals recalculate from remaining rows. */
export async function deleteSalaryPayment(paymentId: string): Promise<void> {
  const id = paymentId.trim();
  if (!id) throw new Error("Missing payment id.");
  await deleteDoc(doc(getDb(), "payments", id));
}

/**
 * Undo one or more kaariger payments (whole Pay batch or a single row).
 * Reverses opening / old kharcha / credit on the employee doc.
 */
export async function deleteKaarigerPayments(
  kaarigerId: string,
  paymentsToDelete: KaarigerPayment[]
): Promise<void> {
  const list = paymentsToDelete.filter((p) => p?.id);
  if (list.length === 0) throw new Error("Nothing to delete.");

  const db = getDb();
  const empRef = doc(db, "employees", kaarigerId);
  const empSnap = await getDoc(empRef);
  if (!empSnap.exists()) throw new Error("Kaariger not found.");

  const emp = empSnap.data();
  let openingBalance = (emp.openingBalance as number) || 0;
  let creditBalance = (emp.creditBalance as number) || 0;
  let oldKharcha = (emp.oldKharcha as number) || 0;

  let needsEmployeeUpdate = false;

  for (const p of list) {
    const amt = Math.max(0, p.amount || 0);
    const kind = paymentKind(p);

    if (kind === "credit" || isCreditPayment(p)) {
      creditBalance = Math.max(0, creditBalance - amt);
      needsEmployeeUpdate = true;
    } else if (kind === "old_kharcha" || isOldKharchaPayment(p)) {
      oldKharcha += amt;
      needsEmployeeUpdate = true;
    } else if (kind === "opening" || isOpeningPayment(p)) {
      openingBalance += amt;
      needsEmployeeUpdate = true;
    }
    // bill / week kharcha: delete doc only — kharcha box recalculates from payments
  }

  const batch = writeBatch(db);
  for (const p of list) {
    batch.delete(doc(db, "kaariger_payments", p.id));
  }
  if (needsEmployeeUpdate) {
    batch.update(empRef, { openingBalance, creditBalance, oldKharcha });
  }
  await batch.commit();
}
