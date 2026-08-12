"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useIsMobile } from "@/lib/use-is-mobile";
import NavIcon from "./NavIcon";

export function StatCard({
  title,
  value,
  icon,
  hint,
  accent,
}: {
  title: string;
  value: string | number;
  icon: string;
  hint?: string;
  accent?: "jade" | "bronze" | "warn" | "danger";
}) {
  const isMobile = useIsMobile();
  const glow =
    accent === "bronze"
      ? "from-bronze/20"
      : accent === "warn"
        ? "from-warning/20"
        : accent === "danger"
          ? "from-danger/20"
          : "from-jade/20";

  const body = (
    <>
      {!isMobile && (
        <div
          className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${glow} to-transparent blur-2xl`}
        />
      )}
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="stat-card-label">{title}</p>
          <p className="stat-card-value mt-2">{value}</p>
          {hint && <p className="mt-1 text-xs text-[var(--text-faint)]">{hint}</p>}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--jade-soft)] text-[var(--jade-deep)]">
          <NavIcon name={icon} size={18} />
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return <div className="stat-card relative">{body}</div>;
  }

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="stat-card relative"
    >
      {body}
    </motion.div>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-header">
      <h2 className="section-title">{title}</h2>
      {subtitle && <p className="section-sub">{subtitle}</p>}
    </div>
  );
}

export function ModuleRow({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <Link href={href} className="module-row group">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-jade transition group-hover:scale-105 group-hover:shadow-glow">
        <NavIcon name={icon} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[var(--text)]">{title}</p>
        {description ? (
          <p className="truncate text-xs text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      <span className="text-[var(--text-faint)] transition group-hover:translate-x-0.5 group-hover:text-jade-deep">
        →
      </span>
    </Link>
  );
}
