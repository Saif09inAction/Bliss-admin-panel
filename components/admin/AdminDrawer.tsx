"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DRAWER_NAV } from "@/lib/navigation";
import { NavIcon } from "./NavIcon";
import type { AdminSession } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  session: AdminSession;
  onLogout: () => void;
}

export default function AdminDrawer({ open, onClose, session, onLogout }: Props) {
  const pathname = usePathname();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(300px,85vw)] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="drawer-header shrink-0 px-6 pb-6 text-white">
          <div className="flex items-center gap-3">
            <div className="bb-monogram !mx-0 !h-12 !w-12 !text-3xl" aria-hidden />
            <div>
              <p className="text-xl font-black tracking-widest text-[var(--bliss-green-light)]">BLISS</p>
              <p className="text-[10px] font-bold tracking-[0.35em] text-[var(--bliss-gold)]">BOMBAY</p>
            </div>
          </div>
          <p className="mt-2 text-xs uppercase tracking-widest text-white/50">Admin Panel</p>
          <div className="mt-5 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--bliss-gold)]/40 bg-[var(--bliss-green)]/20 text-xl font-black text-[var(--bliss-green-light)]">
              {session.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold">{session.name}</p>
              <p className="text-sm text-[var(--bliss-gold)]">ADMIN</p>
              <p className="text-xs text-white/60">Phone: {session.phone}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {DRAWER_NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`drawer-nav-item ${active ? "drawer-nav-active" : ""}`}
              >
                <NavIcon
                  name={item.icon}
                  className={`h-5 w-5 ${active ? "text-[var(--bliss-green-light)]" : "text-slate-500"}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex w-full items-center gap-4 rounded-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <NavIcon name="logout" className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
