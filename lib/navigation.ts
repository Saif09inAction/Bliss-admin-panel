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
    label: "Workers",
    title: "Workers",
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
    href: "/dashboard/materials",
    label: "Materials",
    title: "Raw Materials",
    subtitle: "Stock & suppliers",
    icon: "inventory",
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
];

export const BOTTOM_NAV: NavRoute[] = [
  SIDEBAR_NAV[0],
  SIDEBAR_NAV[1],
  SIDEBAR_NAV[2],
  SIDEBAR_NAV[3],
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
    title: "Workers",
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
    description: "Payouts, advances & dues",
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
    title: "Store Inventory",
    description: "Approved finished goods",
    href: "/dashboard/inventory",
    icon: "store",
  },
  {
    title: "Kaariger Orders",
    description: "Create orders & advances",
    href: "/dashboard/orders",
    icon: "orders",
  },
  {
    title: "All Records",
    description: "Orders, pickups, returns, CSV",
    href: "/dashboard/records",
    icon: "list",
  },
];
