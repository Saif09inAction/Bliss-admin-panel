"use client";

import { NavIcon } from "./NavIcon";

interface Props {
  title: string;
  subtitle?: string;
  onMenuClick: () => void;
}

export default function TopAppBar({ title, subtitle, onMenuClick }: Props) {
  return (
    <header className="sticky top-0 z-30 bg-[#F7F9FC]/90 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#0F172A] transition hover:bg-white/80"
          aria-label="Open menu"
        >
          <NavIcon name="menu" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-base font-bold text-[#0F172A]">{title}</h1>
          {subtitle && (
            <p className="truncate text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        <div className="h-10 w-10" />
      </div>
    </header>
  );
}
