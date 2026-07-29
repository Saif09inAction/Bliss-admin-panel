"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LogOut, Sparkles } from "lucide-react";
import { NAV_GROUPS, SIDEBAR_NAV } from "@/lib/navigation";
import NavIcon from "./NavIcon";

type Props = {
  sessionName: string;
  sessionPhone: string;
  onLogout: () => void;
};

export default function Sidebar({ sessionName, sessionPhone, onLogout }: Props) {
  const pathname = usePathname();

  return (
    <aside className="atrium-sidebar">
      <div className="flex items-center gap-3 px-5 pb-2 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-jade to-jade-deep shadow-glow">
          <span className="font-display text-sm font-extrabold tracking-wide text-ink">BB</span>
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-bold tracking-wide text-white">Bliss Bombay</p>
          <p className="truncate text-[11px] text-white/45">Operations Studio</p>
        </div>
      </div>

      <div className="mx-4 mt-4 flex items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
        <Sparkles size={14} className="shrink-0 text-jade" />
        <p className="truncate text-[11px] text-white/55">
          Signed in as <span className="font-semibold text-white/80">{sessionName}</span>
        </p>
      </div>

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => {
          const items = SIDEBAR_NAV.filter((n) => n.group === group.id);
          if (!items.length) return null;
          return (
            <div key={group.id}>
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                          active ? "text-white" : "text-white/50 hover:bg-white/[0.04] hover:text-white/85"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="sidebar-active"
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-jade/20 to-jade/5 ring-1 ring-jade/25"
                            transition={{ type: "spring", stiffness: 380, damping: 34 }}
                          />
                        )}
                        <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-jade-glow group-hover:bg-white/[0.07]">
                          <NavIcon name={item.icon} size={16} />
                        </span>
                        <span className="relative z-10">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-4">
        <div className="mb-3 truncate px-1 text-[11px] text-white/35">{sessionPhone}</div>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-semibold text-white/70 transition hover:border-danger/40 hover:bg-danger/10 hover:text-white"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
