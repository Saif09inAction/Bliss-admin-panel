"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV } from "@/lib/navigation";
import { NavIcon } from "./NavIcon";

export default function FloatingBottomNav() {
  const pathname = usePathname();
  const activeIndex = BOTTOM_NAV.findIndex((item) => item.href === pathname);
  const index = activeIndex >= 0 ? activeIndex : 0;
  const pillLeft = `calc(${(index / BOTTOM_NAV.length) * 100}% + 4px)`;
  const pillWidth = `calc(${100 / BOTTOM_NAV.length}% - 8px)`;

  return (
    <div className="bottom-nav-wrap">
      <nav className="floating-bottom-nav">
        {activeIndex >= 0 && (
          <div
            className="nav-pill"
            style={{ left: pillLeft, width: pillWidth }}
          />
        )}
        {BOTTOM_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-tab ${active ? "nav-tab-active" : ""}`}
            >
              <NavIcon
                name={item.icon}
                className={`h-[22px] w-[22px] transition-transform ${active ? "scale-110 text-[#0F3D91]" : "text-gray-500"}`}
              />
              <span className={`text-[11px] font-medium ${active ? "font-bold text-[#0F3D91]" : "text-gray-500"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
