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
  deliveredQuantity?: number;
  deliveryColor?: string;
  verifiedBy?: string;
  verifiedAt?: number;
  createdBy: string;
  createdAt: number;
  notes?: string;
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

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  signInTime?: string;
  signOutTime?: string;
  status: string;
  lateMinutes: number;
  workingHours: number;
}

export interface PickupRecord {
  id: string;
  productName: string;
  color: string;
  quantity: number;
  partner: string;
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
  returnType: string;
  staffName: string;
  date: string;
  time: string;
  notes?: string;
}
