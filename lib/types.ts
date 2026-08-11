export type Role = "STAFF" | "KAARIGER";

export interface AdminSession {
  phone: string;
  name: string;
}

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
   * Opening balance owed TO this kaariger (editable on profile).
   * Hisaab remaining = openingBalance + unpaid bill balances − creditBalance.
   */
  openingBalance?: number;
  /**
   * Optional per-staff shift. When set, late/early/pay use these instead of
   * the global Attendance settings. Empty/missing → company default.
   */
  dailySignInTime?: string;
  dailySignOutTime?: string;
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
  /** Kharcha (advance) given to the kaariger at the time this order was created. */
  kharchaGiven?: number;
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
}

export interface AttendanceSettings {
  dailySignInTime: string;
  dailySignOutTime: string;
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

export const MARKETPLACE_COMPANIES = [
  "Amazon",
  "Flipkart",
  "Myntra",
  "Meesho",
  "Snapdeal",
  "Ajio",
  "Nykaa",
  "Other",
] as const;

export const DELIVERY_PARTNERS = [
  "Amazon Delivery",
  "eKart",
  "BlueDart",
  "Shiprocket",
  "Delhivery",
  "DTDC",
  "Ecom Express",
  "Xpressbees",
  "Shadowfax",
  "India Post",
  "Valmo",
] as const;

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
