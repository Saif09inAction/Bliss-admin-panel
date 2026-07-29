"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BOTTOM_NAV } from "@/lib/navigation";
import NavIcon from "./NavIcon";

export default function FloatingBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="floating-bottom-nav" aria-label="Primary">
      {BOTTOM_NAV.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={`dock-item ${active ? "active" : ""}`}>
            {active && (
              <motion.span
                layoutId="dock-indicator"
                className="dock-indicator"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            )}
            <NavIcon name={item.icon} size={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
