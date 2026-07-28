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
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <NavIcon name={icon} className="h-5 w-5 shrink-0 text-[var(--bliss-gold)]" />
      </div>
      <p className="stat-card-value">{value}</p>
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
    <Link href={href} className="module-row">
      <div className="module-row-icon">
        <NavIcon name={icon} className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="module-row-title">{title}</p>
        <p className="module-row-desc">{description}</p>
      </div>
      <NavIcon name="chevron" className="h-5 w-5 shrink-0 text-[var(--bliss-green)]" />
    </Link>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 mt-1">
      <h2 className="section-title">{title}</h2>
      {subtitle && <p className="section-sub">{subtitle}</p>}
    </div>
  );
}

/** @deprecated use ModuleRow */
export function ModuleCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  gradient?: string;
  icon: string;
}) {
  return <ModuleRow title={title} description={description} href={href} icon={icon} />;
}
