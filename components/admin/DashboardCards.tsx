import Link from "next/link";
import { NavIcon } from "./NavIcon";

export function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <NavIcon name={icon} className="h-5 w-5 text-[var(--bliss-gold)]" />
      </div>
      <p className="mt-2 text-xl font-bold text-[var(--bliss-dark)]">{value}</p>
    </div>
  );
}

export function ModuleCard({
  title,
  description,
  href,
  gradient,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  gradient: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className={`module-card bg-gradient-to-br ${gradient} text-white shadow-md transition hover:scale-[1.02] hover:shadow-lg`}
      style={{ borderColor: "rgba(212, 175, 55, 0.35)" }}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--bliss-gold)]/30 bg-[var(--bliss-lime)]/10">
        <NavIcon name={icon} className="h-5 w-5 text-[var(--bliss-lime)]" />
      </div>
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/75">{description}</p>
    </Link>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-[var(--bliss-dark)]">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}
