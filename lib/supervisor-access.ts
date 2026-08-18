import type { NavRoute } from "./navigation";
import { SIDEBAR_NAV } from "./navigation";

/** Admin-toggleable sections for supervisor web login. */
export type SupervisorPermissionKey =
  | "overview"
  | "catalog"
  | "materials"
  | "pickupReturn"
  | "inventory"
  | "kaariger"
  | "repairing"
  | "recordsKaariger"
  | "hisaab"
  | "billReport"
  | "brothers"
  | "attendanceAdmin"
  | "holidays"
  | "salaryAdmin"
  | "admins";

export type SupervisorAccess = Record<SupervisorPermissionKey, boolean>;

export const SUPERVISOR_PERMISSION_LABELS: Record<SupervisorPermissionKey, string> = {
  overview: "Overview",
  catalog: "Product catalog",
  materials: "Raw materials",
  pickupReturn: "Pickup & return",
  inventory: "Store inventory",
  kaariger: "Kaariger",
  repairing: "Repairing",
  recordsKaariger: "Kaarigar bills (Records tab)",
  hisaab: "Hisaab",
  billReport: "Bill report",
  brothers: "Brothers",
  attendanceAdmin: "Attendance roster",
  holidays: "Holidays",
  salaryAdmin: "Salary (pay board)",
  admins: "Admins",
};

export const DEFAULT_SUPERVISOR_ACCESS: SupervisorAccess = {
  overview: false,
  catalog: true,
  materials: true,
  pickupReturn: true,
  inventory: false,
  kaariger: false,
  repairing: false,
  recordsKaariger: false,
  hisaab: false,
  billReport: false,
  brothers: false,
  attendanceAdmin: false,
  holidays: false,
  salaryAdmin: false,
  admins: false,
};

const PERMISSION_TO_HREF: Partial<Record<SupervisorPermissionKey, string>> = {
  overview: "/dashboard",
  catalog: "/dashboard/catalog",
  materials: "/dashboard/materials",
  pickupReturn: "/dashboard/records",
  inventory: "/dashboard/inventory",
  kaariger: "/dashboard/orders",
  repairing: "/dashboard/repairing",
  hisaab: "/dashboard/hisaab",
  billReport: "/dashboard/bill-report",
  brothers: "/dashboard/workers",
  attendanceAdmin: "/dashboard/attendance",
  holidays: "/dashboard/holidays",
  salaryAdmin: "/dashboard/salary",
  admins: "/dashboard/admins",
};

export const SUPERVISOR_SELF_NAV: NavRoute[] = [
  {
    href: "/dashboard/my-attendance",
    label: "My attendance",
    title: "My attendance",
    icon: "calendar",
    group: "people",
  },
  {
    href: "/dashboard/my-salary",
    label: "My salary",
    title: "My salary",
    icon: "salary",
    group: "finance",
  },
];

export function normalizeSupervisorAccess(raw?: Partial<SupervisorAccess> | null): SupervisorAccess {
  const out = { ...DEFAULT_SUPERVISOR_ACCESS };
  if (!raw) return out;
  for (const key of Object.keys(DEFAULT_SUPERVISOR_ACCESS) as SupervisorPermissionKey[]) {
    if (typeof raw[key] === "boolean") out[key] = raw[key]!;
  }
  return out;
}

export function supervisorNavRoutes(access: SupervisorAccess): NavRoute[] {
  const routes: NavRoute[] = [];
  for (const [key, href] of Object.entries(PERMISSION_TO_HREF) as [SupervisorPermissionKey, string][]) {
    if (!access[key]) continue;
    const meta = SIDEBAR_NAV.find((r) => r.href === href);
    if (meta) routes.push(meta);
  }
  routes.push(...SUPERVISOR_SELF_NAV);
  return routes;
}

export function supervisorAllowedHrefs(access: SupervisorAccess): string[] {
  return supervisorNavRoutes(access).map((r) => r.href);
}

export function supervisorCanAccessPath(pathname: string, access: SupervisorAccess): boolean {
  const allowed = supervisorAllowedHrefs(access);
  if (allowed.some((href) => href === "/dashboard" && pathname === "/dashboard")) return true;
  return allowed.some((href) => href !== "/dashboard" && pathname.startsWith(href));
}

export function supervisorDefaultPath(access: SupervisorAccess): string {
  const routes = supervisorNavRoutes(access);
  if (routes.length === 0) return "/dashboard/my-attendance";
  return routes[0].href;
}

export function isPayrollRole(role: string | undefined): boolean {
  return role === "STAFF" || role === "SUPERVISOR" || !role;
}
