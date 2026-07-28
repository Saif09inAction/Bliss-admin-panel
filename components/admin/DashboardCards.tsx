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
        <NavIcon name={icon} className="h-5 w-5 text-[#0F3D91]" />
      </div>
      <p className="mt-2 text-xl font-bold text-[#0F172A]">{value}</p>
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
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
        <NavIcon name={icon} className="h-5 w-5" />
      </div>
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/85">{description}</p>
    </Link>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-[#0F172A]">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}
