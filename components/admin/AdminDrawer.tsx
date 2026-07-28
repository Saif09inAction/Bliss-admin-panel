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
        className={`fixed inset-0 z-40 bg-[#021024]/40 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="drawer-header shrink-0 px-6 pb-6 pt-12 text-white">
          <p className="text-2xl font-bold tracking-wider">LAIZA</p>
          <p className="text-xs uppercase tracking-widest text-white/70">Admin Panel</p>
          <div className="mt-5 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-xl font-black">
              {session.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold">{session.name}</p>
              <p className="text-sm text-white/80">ADMIN</p>
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
                className={`mb-1 flex items-center gap-4 rounded-full px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "bg-[#0F3D91]/12 text-[#0F3D91]"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <NavIcon name={item.icon} className={`h-5 w-5 ${active ? "text-[#0F3D91]" : "text-slate-500"}`} />
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
