"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV, type NavRoute } from "@/lib/navigation";
import NavIcon from "./NavIcon";

type Props = {
  navRoutes?: NavRoute[];
};

export default function FloatingBottomNav({ navRoutes }: Props) {
  const pathname = usePathname();
  const items = navRoutes
    ? navRoutes.slice(0, 4)
    : BOTTOM_NAV;

  if (items.length === 0) return null;

  return (
    <nav className="floating-bottom-nav" aria-label="Primary">
      {items.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`dock-item ${active ? "active" : ""}`}
            prefetch
          >
            <span className="dock-icon-wrap">
              <NavIcon name={item.icon} size={22} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
