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

/**
 * Delete a worker and their personal Firestore data (attendance, payments, profile).
 * Business records like kaariger orders are kept for history.
 */
export async function deleteWorkerAndPersonalData(phone: string): Promise<void> {
  const db = getDb();
  const batches: ReturnType<typeof writeBatch>[] = [];
  let batch = writeBatch(db);
  let ops = 0;

  const enqueue = (ref: ReturnType<typeof doc>) => {
    batch.delete(ref);
    ops++;
    if (ops >= 450) {
      batches.push(batch);
      batch = writeBatch(db);
      ops = 0;
    }
  };

  enqueue(doc(db, "employees", phone));
  enqueue(doc(db, "employee_profiles", phone));

  const [attendanceSnap, paymentsSnap] = await Promise.all([
    getDocs(query(collection(db, "attendance"), where("employeeId", "==", phone))),
    getDocs(query(collection(db, "payments"), where("employeeId", "==", phone))),
  ]);

  attendanceSnap.docs.forEach((d) => enqueue(d.ref));
  paymentsSnap.docs.forEach((d) => enqueue(d.ref));

  if (ops > 0) batches.push(batch);
  for (const b of batches) {
    await b.commit();
  }

  // Ensure employee doc is gone even if batching was empty somehow
  try {
    await deleteDoc(doc(db, "employees", phone));
  } catch {
    // already deleted
  }
}
