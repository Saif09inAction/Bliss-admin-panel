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
    subtitle: "Control center for Bliss Bombay",
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
    href: "/dashboard/attendance",
    label: "Attendance",
    title: "Attendance HQ",
    subtitle: "Shift times, search & monthly calendar",
    icon: "calendar",
    bottom: true,
  },
  {
    href: "/dashboard/salary",
    label: "Salary",
    title: "Salary Management",
    subtitle: "Pay staff & track dues",
    icon: "salary",
    bottom: true,
  },
];

export const DRAWER_NAV: NavRoute[] = [
  { href: "/dashboard", label: "Dashboard", title: "Admin Dashboard", icon: "home", drawer: true },
  { href: "/dashboard/workers", label: "Workers Directory", title: "Workers Directory", icon: "groups", drawer: true },
  { href: "/dashboard/attendance", label: "Attendance HQ", title: "Attendance HQ", icon: "calendar", drawer: true },
  { href: "/dashboard/salary", label: "Salary Management", title: "Salary Management", icon: "salary", drawer: true },
  { href: "/dashboard/materials", label: "Raw Materials", title: "Raw Materials", icon: "inventory", drawer: true },
  { href: "/dashboard/inventory", label: "Store Inventory", title: "Store Inventory", icon: "store", drawer: true },
  { href: "/dashboard/orders", label: "Kaariger Orders", title: "Kaariger Orders", icon: "orders", drawer: true },
  { href: "/dashboard/records", label: "All Records", title: "All Records", icon: "list", drawer: true },
];

export function getRouteMeta(pathname: string): NavRoute {
  const all = [...DRAWER_NAV, ...BOTTOM_NAV];
  const exact = all.find((r) => r.href === pathname);
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
    gradient: "from-[#0a0a0a] to-[#1a1f14]",
    icon: "groups",
  },
  {
    title: "Attendance HQ",
    description: "Shift times, search & monthly calendar",
    href: "/dashboard/attendance",
    gradient: "from-[#151a10] to-[#1a1f14]",
    icon: "calendar",
  },
  {
    title: "Salary Management",
    description: "Pay staff salaries & track pending dues",
    href: "/dashboard/salary",
    gradient: "from-[#0a0a0a] to-[#2a2a0a]",
    icon: "salary",
  },
  {
    title: "Raw Materials",
    description: "Manage stock, suppliers & minimum levels",
    href: "/dashboard/materials",
    gradient: "from-[#151a10] to-[#2a3318]",
    icon: "inventory",
  },
  {
    title: "Store Inventory",
    description: "View approved finished products",
    href: "/dashboard/inventory",
    gradient: "from-[#1e2418] to-[#3d4a20]",
    icon: "store",
  },
  {
    title: "Kaariger Orders",
    description: "Create orders & record advances",
    href: "/dashboard/orders",
    gradient: "from-[#0a0a0a] to-[#2a2a0a]",
    icon: "orders",
  },
  {
    title: "All Records",
    description: "Orders, pickups, returns & export",
    href: "/dashboard/records",
    gradient: "from-[#121417] to-[#1a1f14]",
    icon: "list",
  },
];
