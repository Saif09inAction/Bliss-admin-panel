import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";

type DocRef = ReturnType<typeof doc>;

/**
 * Batch-delete many refs (Firestore limit ~500 ops per batch).
 */
async function deleteRefs(refs: DocRef[]): Promise<void> {
  if (refs.length === 0) return;
  const db = getDb();
  let batch = writeBatch(db);
  let ops = 0;
  const batches: ReturnType<typeof writeBatch>[] = [];

  for (const ref of refs) {
    batch.delete(ref);
    ops++;
    if (ops >= 450) {
      batches.push(batch);
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) batches.push(batch);
  for (const b of batches) {
    await b.commit();
  }
}

/**
 * Delete all hisaab / bill data for a kaariger phone (orders, payments, repairs, approvals).
 * Safe to call when re-adding the same number so old history does not come back.
 */
export async function clearKaarigerBusinessData(phone: string): Promise<number> {
  const db = getDb();
  const id = phone.trim();
  if (!id) return 0;

  const [ordersSnap, paymentsSnap, repairsSnap, approvalsSnap] = await Promise.all([
    getDocs(query(collection(db, "kaariger_orders"), where("kaarigerId", "==", id))),
    getDocs(query(collection(db, "kaariger_payments"), where("kaarigerId", "==", id))),
    getDocs(query(collection(db, "order_repairs"), where("kaarigerId", "==", id))),
    getDocs(query(collection(db, "order_approval_records"), where("kaarigerId", "==", id))),
  ]);

  const refs: DocRef[] = [
    ...ordersSnap.docs.map((d) => d.ref),
    ...paymentsSnap.docs.map((d) => d.ref),
    ...repairsSnap.docs.map((d) => d.ref),
    ...approvalsSnap.docs.map((d) => d.ref),
  ];

  await deleteRefs(refs);
  return refs.length;
}

/**
 * Delete a worker and ALL their Firestore data:
 * profile, attendance, salary payments, and (for kaarigers) bills / hisaab / repairs.
 */
export async function deleteWorkerAndPersonalData(phone: string): Promise<void> {
  const db = getDb();
  const id = phone.trim();
  if (!id) throw new Error("Missing phone.");

  const refs: DocRef[] = [doc(db, "employees", id), doc(db, "employee_profiles", id)];

  const [attendanceSnap, salarySnap, ordersSnap, kharchaPaySnap, repairsSnap, approvalsSnap] =
    await Promise.all([
      getDocs(query(collection(db, "attendance"), where("employeeId", "==", id))),
      getDocs(query(collection(db, "payments"), where("employeeId", "==", id))),
      getDocs(query(collection(db, "kaariger_orders"), where("kaarigerId", "==", id))),
      getDocs(query(collection(db, "kaariger_payments"), where("kaarigerId", "==", id))),
      getDocs(query(collection(db, "order_repairs"), where("kaarigerId", "==", id))),
      getDocs(query(collection(db, "order_approval_records"), where("kaarigerId", "==", id))),
    ]);

  attendanceSnap.docs.forEach((d) => refs.push(d.ref));
  salarySnap.docs.forEach((d) => refs.push(d.ref));
  ordersSnap.docs.forEach((d) => refs.push(d.ref));
  kharchaPaySnap.docs.forEach((d) => refs.push(d.ref));
  repairsSnap.docs.forEach((d) => refs.push(d.ref));
  approvalsSnap.docs.forEach((d) => refs.push(d.ref));

  await deleteRefs(refs);

  // Ensure employee doc is gone even if it was only in a failed batch
  try {
    await deleteDoc(doc(db, "employees", id));
  } catch {
    // already deleted
  }
}
