"use client";

import { ArrowLeft, Menu } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBackClick?: () => void;
  onMenuClick?: () => void;
};

export default function TopAppBar({
  title,
  subtitle,
  showBack,
  onBackClick,
  onMenuClick,
}: Props) {
  return (
    <div className="atrium-header">
      <button
        type="button"
        className="btn-icon lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {showBack && (
        <button
          type="button"
          className="btn-icon hidden sm:inline-flex"
          onClick={onBackClick}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg font-bold tracking-tight text-[var(--text)] sm:text-xl">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-[var(--text-muted)] sm:text-sm">{subtitle}</p>
        )}
      </div>

      <div className="hidden items-center gap-2 rounded-full border border-jade/20 bg-jade-soft/60 px-3 py-1.5 text-xs font-semibold text-jade-deep backdrop-blur md:flex">
        <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-jade" />
        Systems live
      </div>
    </div>
  );
}
