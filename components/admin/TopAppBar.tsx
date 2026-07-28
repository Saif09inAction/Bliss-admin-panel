"use client";

import { NavIcon } from "./NavIcon";

interface Props {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBackClick?: () => void;
  onMenuClick: () => void;
}

export default function TopAppBar({
  title,
  subtitle,
  showBack = false,
  onBackClick,
  onMenuClick,
}: Props) {
  return (
    <header>
      <div className="flex items-center gap-2 px-3 py-2.5">
        {showBack ? (
          <button
            type="button"
            onClick={onBackClick}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--bliss-dark)] transition hover:bg-[var(--bliss-green)]/10"
            aria-label="Go back"
          >
            <NavIcon name="back" className="h-6 w-6" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onMenuClick}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--bliss-dark)] transition hover:bg-[var(--bliss-green)]/10"
            aria-label="Open menu"
          >
            <NavIcon name="menu" className="h-6 w-6" />
          </button>
        )}
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-base font-bold text-[var(--bliss-dark)]">{title}</h1>
          {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
        {showBack ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--bliss-dark)] transition hover:bg-[var(--bliss-green)]/10"
            aria-label="Open menu"
          >
            <NavIcon name="menu" className="h-5 w-5" />
          </button>
        ) : (
          <div className="h-10 w-10 shrink-0" />
        )}
      </div>
    </header>
  );
}
