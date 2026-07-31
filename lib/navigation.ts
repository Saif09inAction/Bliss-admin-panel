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
    subtitle: "Live pulse of operations",
    icon: "home",
    group: "ops",
  },
  {
    href: "/dashboard/workers",
    label: "Brothers",
    title: "Brothers",
    subtitle: "Staff & kaarigers",
    icon: "groups",
    group: "people",
  },
  {
    href: "/dashboard/attendance",
    label: "Attendance",
    title: "Attendance",
    subtitle: "Shifts & presence",
    icon: "calendar",
    group: "people",
  },
  {
    href: "/dashboard/holidays",
    label: "Holidays",
    title: "Holidays",
    subtitle: "Off days & working Sundays",
    icon: "holiday",
    group: "people",
  },
  {
    href: "/dashboard/salary",
    label: "Salary",
    title: "Salary",
    subtitle: "Pay & track dues",
    icon: "salary",
    group: "finance",
  },
  {
    href: "/dashboard/orders",
    label: "Orders",
    title: "Kaariger Orders",
    subtitle: "Assign & track work",
    icon: "orders",
    group: "ops",
  },
  {
    href: "/dashboard/repairing",
    label: "Repairing",
    title: "Repairing",
    subtitle: "Faulty stock & deductions",
    icon: "repair",
    group: "ops",
  },
  {
    href: "/dashboard/materials",
    label: "Materials",
    title: "Raw Materials",
    subtitle: "Stock & suppliers",
    icon: "inventory",
    group: "catalog",
  },
  {
    href: "/dashboard/catalog",
    label: "Catalog",
    title: "Product Catalog",
    subtitle: "Manage product names",
    icon: "catalog",
    group: "catalog",
  },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    title: "Store Inventory",
    subtitle: "Finished products",
    icon: "store",
    group: "catalog",
  },
  {
    href: "/dashboard/records",
    label: "Records",
    title: "All Records",
    subtitle: "History & exports",
    icon: "list",
    group: "ops",
  },
  {
    href: "/dashboard/admins",
    label: "Admins",
    title: "Admins",
    subtitle: "Panel login access",
    icon: "admins",
    group: "people",
  },
];

export const BOTTOM_NAV: NavRoute[] = [
  SIDEBAR_NAV[0], // Overview
  SIDEBAR_NAV[1], // Brothers
  SIDEBAR_NAV[5], // Orders
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
    description: "Directory, roles & login access",
    href: "/dashboard/workers",
    icon: "groups",
  },
  {
    title: "Attendance",
    description: "Daily presence & monthly calendar",
    href: "/dashboard/attendance",
    icon: "calendar",
  },
  {
    title: "Holidays",
    description: "Set holidays & working Sundays",
    href: "/dashboard/holidays",
    icon: "holiday",
  },
  {
    title: "Salary",
    description: "Payouts, kharcha & dues",
    href: "/dashboard/salary",
    icon: "salary",
  },
  {
    title: "Raw Materials",
    description: "Stock levels & suppliers",
    href: "/dashboard/materials",
    icon: "inventory",
  },
  {
    title: "Product Catalog",
    description: "Manage product names",
    href: "/dashboard/catalog",
    icon: "catalog",
  },
  {
    title: "Store Inventory",
    description: "Approved finished goods",
    href: "/dashboard/inventory",
    icon: "store",
  },
  {
    title: "Kaariger Orders",
    description: "Create orders & kharcha",
    href: "/dashboard/orders",
    icon: "orders",
  },
  {
    title: "Repairing",
    description: "Faulty pcs & material deductions",
    href: "/dashboard/repairing",
    icon: "repair",
  },
  {
    title: "All Records",
    description: "Orders, pickups, returns, CSV",
    href: "/dashboard/records",
    icon: "list",
  },
  {
    title: "Admins",
    description: "Create panel logins",
    href: "/dashboard/admins",
    icon: "admins",
  },
];
