import type { SupervisorAccess } from "./supervisor-access";

export interface ShiftScheduleEntry {
  effectiveFrom: string;
  dailySignInTime: string;
  dailySignOutTime: string;
  sundaySignInTime?: string;
  sundaySignOutTime?: string;
}

export type Role = "STAFF" | "KAARIGER" | "SUPERVISOR";

export interface AdminSession {
  kind: "admin";
  phone: string;
  name: string;
}

export interface SupervisorSession {
  kind: "supervisor";
  phone: string;
  name: string;
  joiningDate: string;
  monthlySalary: number;
  dailySignInTime?: string;
  dailySignOutTime?: string;
  access: SupervisorAccess;
}

export type AppSession = AdminSession | SupervisorSession;

/** @deprecated use AppSession */
export type LegacyAdminSession = { phone: string; name: string };

export interface Employee {
  id: string;
  name: string;
  phone: string;
  joiningDate: string;
  monthlySalary: number;
  profilePhotoUrl?: string;
  attendancePercentage: number;
  role: Role;
  password?: string;
  /** Overpaid kharcha carried forward from a previous (kaariger) order — auto-applied to their next bill. */
  creditBalance?: number;
  /**
   * Opening / running closing balance owed TO this kaariger (editable on profile).
   * On each Saturday bill: opening := opening + ADD BALANCE (maal − deductions − week kharcha).
   */
  openingBalance?: number;
  /**
   * Unpaid weekly kharcha carried from previous weeks (sheet "OLD KHARCHA").
   * Legacy — cleared into opening on next bill; new model uses kharchaCarry.
   */
  oldKharcha?: number;
  /**
   * Signed kharcha carry into the next week’s box: paid − budget from last closed week.
   * Overpay → positive (next box shrinks); underpay → negative (next box grows).
   * Does not change Total Remaining.
   */
  kharchaCarry?: number;
  /**
   * Optional per-staff shift. When set, late/early/pay use these instead of
   * the global Attendance settings. Empty/missing → company default.
   */
  dailySignInTime?: string;
  dailySignOutTime?: string;
  /** Per-staff shift history — changes apply from the next day. */
  shiftHistory?: ShiftScheduleEntry[];
  salaryRemaining?: number;
  /** When true, salaryRemaining is set manually and auto-sync is skipped. */
  salaryDueManual?: boolean;
  /** Web supervisor — admin toggles which dashboard sections are visible. */
  supervisorAccess?: Partial<SupervisorAccess>;
}

export interface RawMaterial {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minimumStock: number;
  supplier: string;
  lastUpdatedBy: string;
  lastUpdatedTime: number;
  /** Optional ₹ per piece. When set, bill page fills material price automatically. */
  price?: number;
}

export interface FinishedProduct {
  id: string;
  name: string;
  quantity: number;
  color: string;
  unitPrice: number;
  lastUpdatedBy: string;
  lastUpdatedTime: number;
  orderId?: string;
}

export interface OrderMaterial {
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  usedQuantity?: number;
  remainingQuantity?: number;
}

/** Product name list for Kaarigar bills. Optional price auto-fills on the bill page. */
export interface CatalogProduct {
  id: string;
  name: string;
  /** Optional ₹ per piece. When set, bill page fills price automatically. */
  price?: number;
  createdAt?: number;
  createdBy?: string;
}

/** One product line in a Kaarigar order — price is always per piece. */
export interface OrderProductLine {
  productName: string;
  quantity: number;
  pricePerPiece: number;
  lineTotal: number;
}

/** One raw-material entry deducted from a kaariger bill. */
export interface RawMaterialDeductionRef {
  /** ID of the RawMaterialKaarigerEntry inside its bill */
  entryId: string;
  /** ID of the parent RawMaterialBill */
  rawMaterialBillId: string;
  billNo: string;
  materialName: string;
  totalQuantity: number;
  ratePerPiece: number;
  totalAmount: number;
}

export interface KaarigerOrder {
  id: string;
  kaarigerId: string;
  kaarigerName: string;
  productName: string;
  targetQuantity: number;
  color: string;
  rawMaterials: OrderMaterial[];
  totalDealAmount: number;
  pricePerPiece?: number;
  pricingType: "PER_PIECE" | "OVERALL";
  status: string;
  approvedQuantity: number;
  deliveredQuantity?: number;
  deliveryColor?: string;
  verifiedBy?: string;
  verifiedAt?: number;
  materialUsageReported?: boolean;
  createdBy: string;
  createdAt: number;
  notes?: string;
  /** Original deal before any repairing deductions (set on first repair). */
  originalDealAmount?: number;
  /** Cumulative repairing deductions from deal. */
  repairDeductionTotal?: number;
  /** Multiple products with qty × price/pc, set from the Kaarigar creation form. */
  products?: OrderProductLine[];
  /** Sum of all product line totals, before any deductions. */
  productsTotal?: number;
  /** Runner / Fitting / Astar / Material cost deductions taken at order creation. */
  materialDeductions?: RepairLineItem[];
  /** Sum of materialDeductions line totals. */
  materialDeductionsTotal?: number;
  /** Raw-material entries explicitly deducted by admin when saving this bill. */
  rawMaterialDeductions?: RawMaterialDeductionRef[];
  /** Sum of rawMaterialDeductions totalAmount values. */
  rawMaterialDeductionsTotal?: number;
  /**
   * This week's kharcha budget (set on Saturday bill create).
   * Full amount is cut from Remaining at create; Pay only fills/empties the Kharcha box.
   */
  kharchaGiven?: number;
  /**
   * Signed carry from prior week folded into this bill’s Kharcha box only
   * (paid − budget). Remaining still uses full kharchaGiven.
   */
  kharchaCarryIn?: number;
  /**
   * Legacy: portion of kharchaGiven rolled into opening under the old model.
   * New weeks leave this at 0; carry uses kharchaCarryIn instead.
   */
  kharchaCarriedForward?: number;
  /**
   * Human week name for this Saturday bill, e.g. "October 1st week".
   * Derived from createdAt when missing (backfill on read).
   */
  weekLabel?: string;
  /** Stable week id for sorting, e.g. "2025-10-W1". */
  weekKey?: string;
  /** Opening balance snapshot when this week bill was created (before ADD). */
  openingAtCreation?: number;
  /** ADD BALANCE = MAAL − deductions − repair at creation (kharcha not included). */
  addBalance?: number;
  /** Closing = openingAtCreation + addBalance at creation. */
  closingAtCreation?: number;
}

export interface OrderApprovalRecord {
  id: string;
  orderId: string;
  productName: string;
  kaarigerId: string;
  kaarigerName: string;
  batchQuantity: number;
  rejectedQuantity?: number;
  approvedTotalAfter: number;
  targetQuantity: number;
  color: string;
  colorBreakdown?: string;
  verifiedByName: string;
  verifiedByPhone: string;
  verifiedAt: number;
}

export interface KaarigerPayment {
  id: string;
  orderId: string;
  kaarigerId: string;
  amount: number;
  date: string;
  time: string;
  remarks?: string;
  createdBy: string;
  /** Epoch ms when payment was written — preferred for newest-first sorting. */
  createdAt?: number;
  /**
   * Same id on every Firestore row written from one Pay click
   * (e.g. ₹20k split into week kharcha + opening).
   */
  payBatchId?: string;
}

export type RepairItemType = "RUNNER" | "FITTING" | "ASTAR" | "MATERIAL";

export interface RepairLineItem {
  type: RepairItemType;
  label: string;
  quantity: number;
  pricePerPiece: number;
  lineTotal: number;
}

/** Staff-submitted repairs start as PENDING; only APPROVED ones deduct from Hisaab. */
export type RepairStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * Sentinel orderId for repairing when the kaariger has no bill yet.
 * Approved costs deduct from overall hisaab remaining (not a specific bill).
 */
export const STANDALONE_REPAIR_ORDER_ID = "__standalone__";

export function isStandaloneRepair(orderId?: string | null) {
  return !orderId || orderId === STANDALONE_REPAIR_ORDER_ID;
}

/** Approved repairing waiting for admin to add it to a bill (no remaining impact yet). */
export function isPendingBillRepair(r: {
  orderId?: string | null;
  status?: RepairStatus | string;
  deferToNextBill?: boolean;
}) {
  return (
    isStandaloneRepair(r.orderId) &&
    Boolean(r.deferToNextBill) &&
    (!r.status || r.status === "APPROVED")
  );
}

/** Approved standalone repairing that reduces Total Remaining until linked to a bill. */
export function isRemainingStandaloneRepair(r: {
  orderId?: string | null;
  status?: RepairStatus | string;
  deferToNextBill?: boolean;
}) {
  return (
    isStandaloneRepair(r.orderId) &&
    (!r.status || r.status === "APPROVED") &&
    !r.deferToNextBill
  );
}

export interface OrderRepair {
  id: string;
  /** Bill id, or STANDALONE_REPAIR_ORDER_ID when there is no bill. */
  orderId: string;
  kaarigerId: string;
  kaarigerName: string;
  productName: string;
  faultyQuantity: number;
  faultyPricePerPiece: number;
  faultyTotal: number;
  items: RepairLineItem[];
  totalRepairCost: number;
  originalDealAmount: number;
  dealAfterThisRepair: number;
  notes?: string;
  createdBy: string;
  createdAt: number;
  /** Missing status on older docs is treated as APPROVED (already deducted). */
  status?: RepairStatus;
  reviewedBy?: string;
  reviewedAt?: number;
  /**
   * When true, approved but not deducted yet — admin must add it to a bill.
   * Does not reduce Total Remaining until attached. Cleared once linked.
   */
  deferToNextBill?: boolean;
}

export interface AttendanceSettings {
  dailySignInTime: string;
  dailySignOutTime: string;
  /** When a Sunday is a working day, use these times instead of weekday shift. */
  sundaySignInTime?: string;
  sundaySignOutTime?: string;
  /** Past schedules — lateness uses the entry effective on each date. */
  shiftHistory?: ShiftScheduleEntry[];
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  signInTime?: string;
  signOutTime?: string;
  signInGps?: string;
  signOutGps?: string;
  signInAddress?: string;
  signOutAddress?: string;
  signInImageLocalPath?: string;
  signOutImageLocalPath?: string;
  status: string;
  lateMinutes: number;
  workingHours: number;
  /**
   * Admin override: forgive late/early (or credit an absent day).
   * FULL = full-day present, no time cut. HALF = half-day pay, no time cut.
   */
  dayCredit?: "FULL" | "HALF" | null;
  dayCreditBy?: string;
  dayCreditAt?: number;
}

export type PaymentType = "SALARY_PAYMENT" | "ADVANCE" | "EXTRA_PAYMENT" | "DEDUCTION";

export interface PaymentTransaction {
  id: string;
  employeeId: string;
  amount: number;
  type: PaymentType;
  date: string;
  time: string;
  remarks?: string;
  createdBy: string;
  /** Pay period this salary payment applies to (fixes paying previous month). */
  periodStart?: string;
  periodEnd?: string;
}

export interface PickupRecord {
  id: string;
  productName: string;
  color: string;
  quantity: number;
  /** Qty under Claris entity. */
  clarisQuantity?: number;
  /** Qty under Bliss entity. */
  blissQuantity?: number;
  /** Marketplace / company — Amazon, Flipkart, etc. */
  partner: string;
  /** Courier / delivery partner — Amazon Delivery, eKart, etc. */
  deliveryPartner: string;
  staffName: string;
  date: string;
  time: string;
}

export interface ReturnRecord {
  id: string;
  productName: string;
  color: string;
  quantity: number;
  clarisQuantity?: number;
  blissQuantity?: number;
  /** Marketplace / company — Amazon, Flipkart, etc. */
  partner: string;
  /** Courier / delivery partner — Amazon Delivery, eKart, etc. */
  deliveryPartner: string;
  returnType: string;
  staffName: string;
  date: string;
  time: string;
  notes?: string;
}

/**
 * Marketplace / company in Firestore `marketplace_companies` — shared with staff Pickup/Return.
 * Admin adds/deletes; staff only sees this list.
 */
export interface MarketplaceCompany {
  id: string;
  name: string;
  createdAt: number;
}

/** Courier in Firestore `delivery_partners` — shared with staff Pickup/Return. */
export interface DeliveryPartner {
  id: string;
  name: string;
  createdAt: number;
}

// ─── Raw Material Billing ────────────────────────────────────────────────────

export interface RawMaterialRoll {
  rollNumber: number;
  quantity: number; // pieces
}

export interface RawMaterialKaarigerEntry {
  id: string;
  /** Firestore employee phone (used as ID) */
  kaarigerId: string;
  kaarigerName: string;
  materialName: string;
  ratePerPiece: number;
  rolls: RawMaterialRoll[];
  totalQuantity: number;
  totalAmount: number;
  /** "pending" = not yet deducted from any bill; "adjusted" = already deducted */
  adjustmentStatus: "pending" | "adjusted";
  /** The kaariger_orders doc id this entry was deducted in */
  adjustedInKaarigerBillId?: string;
  adjustedAt?: number;
}

export interface RawMaterialBill {
  id: string;
  billNo: string;
  date: string; // YYYY-MM-DD
  companyName?: string;
  kaarigers: RawMaterialKaarigerEntry[];
  grandTotalQuantity: number;
  grandTotalAmount: number;
  status: "active" | "deleted";
  createdAt: number;
  createdBy: string;
  deletedAt?: number;
}

/** Supplier company list for Raw Material bills — Firestore `raw_material_companies`. */
export interface RawMaterialCompany {
  id: string;
  name: string;
  createdAt: number;
}

// ─── Bill Report ─────────────────────────────────────────────────────────────

/** Client's business entity that buys from suppliers (Bill Report). */
export type BillOwner = "CLARIS" | "BLISS";

/** Supplier / company profile under Claris or Bliss. */
export interface BillCompany {
  id: string;
  name: string;
  owner: BillOwner;
  /** Starting amount still owed to this supplier (optional). */
  openingBalance: number;
  notes?: string;
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
}

/**
 * Ledger line for a supplier.
 * EXTRA_BILL increases remaining (money owed).
 * TRANSFER decreases remaining (payment sent).
 */
export type BillEntryType = "EXTRA_BILL" | "TRANSFER";

export interface BillEntry {
  id: string;
  companyId: string;
  owner: BillOwner;
  type: BillEntryType;
  amount: number;
  date: string;
  time: string;
  /** Google Drive (or any) link to the bill PDF. */
  driveLink?: string;
  remarks?: string;
  /** For transfers — marked done when money left the bank. */
  transferDone?: boolean;
  createdAt: number;
  createdBy: string;
}
