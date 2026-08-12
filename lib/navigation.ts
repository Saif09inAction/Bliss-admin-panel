export type NavRoute = {
  href: string;
  label: string;
  title: string;
  subtitle?: string;
  icon: string;
  group?: "ops" | "people" | "finance" | "catalog";
};

export const SIDEBAR_NAV: NavRoute[] = [
  {
    href: "/dashboard",
    label: "Overview",
    title: "Overview",
    icon: "home",
    group: "ops",
  },
  {
    href: "/dashboard/workers",
    label: "Brothers",
    title: "Brothers",
    icon: "groups",
    group: "people",
  },
  {
    href: "/dashboard/attendance",
    label: "Attendance",
    title: "Attendance",
    icon: "calendar",
    group: "people",
  },
  {
    href: "/dashboard/holidays",
    label: "Holidays",
    title: "Holidays",
    icon: "holiday",
    group: "people",
  },
  {
    href: "/dashboard/salary",
    label: "Salary",
    title: "Salary",
    icon: "salary",
    group: "finance",
  },
  {
    href: "/dashboard/orders",
    label: "Kaarigar",
    title: "Kaarigar",
    icon: "orders",
    group: "ops",
  },
  {
    href: "/dashboard/hisaab",
    label: "Hisaab",
    title: "Hisaab",
    icon: "hisaab",
    group: "finance",
  },
  {
    href: "/dashboard/bill-report",
    label: "Bill Report",
    title: "Bill Report",
    icon: "billreport",
    group: "finance",
  },
  {
    href: "/dashboard/repairing",
    label: "Repairing",
    title: "Repairing",
    icon: "repair",
    group: "ops",
  },
  {
    href: "/dashboard/materials",
    label: "Materials",
    title: "Raw Materials",
    icon: "inventory",
    group: "catalog",
  },
  {
    href: "/dashboard/catalog",
    label: "Catalog",
    title: "Product Catalog",
    icon: "catalog",
    group: "catalog",
  },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    title: "Store Inventory",
    icon: "store",
    group: "catalog",
  },
  {
    href: "/dashboard/records",
    label: "Records",
    title: "All Records",
    icon: "list",
    group: "ops",
  },
  {
    href: "/dashboard/admins",
    label: "Admins",
    title: "Admins",
    icon: "admins",
    group: "people",
  },
];

export const BOTTOM_NAV: NavRoute[] = [
  SIDEBAR_NAV[0], // Overview
  SIDEBAR_NAV[1], // Brothers
  SIDEBAR_NAV[5], // Kaarigar
  SIDEBAR_NAV[4], // Salary
];

/** @deprecated use SIDEBAR_NAV */
export const DRAWER_NAV = SIDEBAR_NAV;

export const NAV_GROUPS: { id: NavRoute["group"]; label: string }[] = [
  { id: "ops", label: "Operations" },
  { id: "people", label: "People" },
  { id: "finance", label: "Finance" },
  { id: "catalog", label: "Catalog" },
];

export function getRouteMeta(pathname: string): NavRoute {
  const exact = SIDEBAR_NAV.find((r) => r.href === pathname);
  if (exact) return exact;
  return {
    href: pathname,
    label: "Bliss",
    title: "Bliss Admin",
    subtitle: undefined,
    icon: "home",
  };
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function todayHeading(): string {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export const ADMIN_MODULES = [
  {
    title: "Brothers",
    description: "",
    href: "/dashboard/workers",
    icon: "groups",
  },
  {
    title: "Attendance",
    description: "",
    href: "/dashboard/attendance",
    icon: "calendar",
  },
  {
    title: "Holidays",
    description: "",
    href: "/dashboard/holidays",
    icon: "holiday",
  },
  {
    title: "Salary",
    description: "",
    href: "/dashboard/salary",
    icon: "salary",
  },
  {
    title: "Raw Materials",
    description: "",
    href: "/dashboard/materials",
    icon: "inventory",
  },
  {
    title: "Product Catalog",
    description: "",
    href: "/dashboard/catalog",
    icon: "catalog",
  },
  {
    title: "Store Inventory",
    description: "",
    href: "/dashboard/inventory",
    icon: "store",
  },
  {
    title: "Kaarigar",
    description: "",
    href: "/dashboard/orders",
    icon: "orders",
  },
  {
    title: "Hisaab",
    description: "",
    href: "/dashboard/hisaab",
    icon: "hisaab",
  },
  {
    title: "Bill Report",
    description: "",
    href: "/dashboard/bill-report",
    icon: "billreport",
  },
  {
    title: "Repairing",
    description: "",
    href: "/dashboard/repairing",
    icon: "repair",
  },
  {
    title: "All Records",
    description: "",
    href: "/dashboard/records",
    icon: "list",
  },
  {
    title: "Admins",
    description: "",
    href: "/dashboard/admins",
    icon: "admins",
  },
];
