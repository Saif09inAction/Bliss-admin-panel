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
   * Old remaining amount owed TO this kaariger when migrating onto the software.
   * Admin pays this down via Pay; it does not auto-apply like creditBalance.
   */
  openingBalance?: number;
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

export interface OrderRepair {
  id: string;
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
  partner: string;
  /** Courier / delivery partner — BlueDart, Shiprocket, etc. */
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
  partner: string;
  /** Courier / delivery partner — BlueDart, Shiprocket, etc. */
  deliveryPartner: string;
  returnType: string;
  staffName: string;
  date: string;
  time: string;
  notes?: string;
}
