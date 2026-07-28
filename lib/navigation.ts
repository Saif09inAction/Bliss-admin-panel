export type NavRoute = {
  href: string;
  label: string;
  title: string;
  subtitle?: string;
  icon: string;
  drawer?: boolean;
  bottom?: boolean;
};

export const BOTTOM_NAV: NavRoute[] = [
  {
    href: "/dashboard",
    label: "Overview",
    title: "Admin Dashboard",
    subtitle: "Control center for Laiza Bags",
    icon: "home",
    bottom: true,
  },
  {
    href: "/dashboard/workers",
    label: "Workers",
    title: "Workers Directory",
    subtitle: "Manage staff & kaarigers",
    icon: "groups",
    bottom: true,
  },
  {
    href: "/dashboard/materials",
    label: "Production",
    title: "Raw Materials",
    subtitle: "Inventory & stock levels",
    icon: "inventory",
    bottom: true,
  },
];

export const DRAWER_NAV: NavRoute[] = [
  { href: "/dashboard", label: "Dashboard", title: "Admin Dashboard", icon: "home", drawer: true },
  { href: "/dashboard/workers", label: "Workers Directory", title: "Workers Directory", icon: "groups", drawer: true },
  { href: "/dashboard/materials", label: "Raw Materials", title: "Raw Materials", icon: "inventory", drawer: true },
  { href: "/dashboard/inventory", label: "Store Inventory", title: "Store Inventory", icon: "store", drawer: true },
  { href: "/dashboard/orders", label: "Kaariger Orders", title: "Kaariger Orders", icon: "orders", drawer: true },
  { href: "/dashboard/attendance", label: "Attendance HQ", title: "Attendance HQ", icon: "calendar", drawer: true },
  { href: "/dashboard/records", label: "All Records", title: "All Records", icon: "list", drawer: true },
];

export function getRouteMeta(pathname: string): NavRoute {
  const all = [...DRAWER_NAV, ...BOTTOM_NAV];
  const exact = all.find((r) => r.href === pathname);
  if (exact) return exact;
  return {
    href: pathname,
    label: "Laiza",
    title: "Laiza Admin",
    subtitle: undefined,
    icon: "home",
  };
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
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
    title: "Workers Directory",
    description: "Add staff & kaarigers, set login passwords",
    href: "/dashboard/workers",
    gradient: "from-blue-500 to-blue-800",
    icon: "groups",
  },
  {
    title: "Raw Materials",
    description: "Manage stock, suppliers & minimum levels",
    href: "/dashboard/materials",
    gradient: "from-emerald-500 to-emerald-800",
    icon: "inventory",
  },
  {
    title: "Store Inventory",
    description: "View approved finished products",
    href: "/dashboard/inventory",
    gradient: "from-teal-500 to-teal-800",
    icon: "store",
  },
  {
    title: "Kaariger Orders",
    description: "Create orders & record advances",
    href: "/dashboard/orders",
    gradient: "from-violet-500 to-violet-800",
    icon: "orders",
  },
  {
    title: "Attendance HQ",
    description: "Shift times, search & monthly calendar",
    href: "/dashboard/attendance",
    gradient: "from-pink-500 to-rose-700",
    icon: "calendar",
  },
  {
    title: "All Records",
    description: "Orders, pickups, returns & export",
    href: "/dashboard/records",
    gradient: "from-slate-500 to-slate-700",
    icon: "list",
  },
];
