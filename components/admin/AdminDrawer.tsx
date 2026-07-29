"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, X } from "lucide-react";
import { NAV_GROUPS, SIDEBAR_NAV } from "@/lib/navigation";
import NavIcon from "./NavIcon";

type Props = {
  open: boolean;
  onClose: () => void;
  session: { name: string; phone: string };
  onLogout: () => void;
};

export default function AdminDrawer({ open, onClose, session, onLogout }: Props) {
  const pathname = usePathname();
  if (!open) return null;

  return (
    <>
      <button type="button" className="drawer-backdrop" aria-label="Close menu" onClick={onClose} />
      <div className="drawer-panel" role="dialog" aria-modal>
        <div
          className="drawer-header flex items-start justify-between gap-3"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <div>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-jade to-jade-deep">
              <span className="font-display text-sm font-extrabold text-ink">BB</span>
            </div>
            <p className="font-display text-base font-bold text-white">{session.name}</p>
            <p className="text-xs text-white/45">{session.phone}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-white/5 p-2 text-white/60 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => {
            const items = SIDEBAR_NAV.filter((r) => r.group === group.id);
            if (items.length === 0) return null;
            return (
              <div key={group.id}>
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active =
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                          active
                            ? "bg-jade/15 text-white ring-1 ring-jade/30"
                            : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                        }`}
                      >
                        <NavIcon name={item.icon} size={17} />
                        <span className="flex-1">{item.label}</span>
                        {item.subtitle && (
                          <span className="max-w-[88px] truncate text-[10px] font-normal text-white/30">
                            {item.subtitle.split(" ")[0]}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div
          className="border-t border-white/5 p-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 py-3 text-sm font-semibold text-white/70"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
