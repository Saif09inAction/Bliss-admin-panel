"use client";

import {
  Home,
  Users,
  CalendarDays,
  Wallet,
  Package,
  Warehouse,
  ClipboardList,
  ScrollText,
  Palmtree,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  groups: Users,
  calendar: CalendarDays,
  holiday: Palmtree,
  salary: Wallet,
  inventory: Package,
  store: Warehouse,
  orders: ClipboardList,
  repair: Wrench,
  list: ScrollText,
};

export default function NavIcon({
  name,
  size = 18,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[name] || Home;
  return <Icon size={size} strokeWidth={1.75} className={className} />;
}
