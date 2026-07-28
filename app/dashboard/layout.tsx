"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/workers", label: "Staff & Kaarigers" },
  { href: "/dashboard/materials", label: "Raw Materials" },
  { href: "/dashboard/inventory", label: "Store Inventory" },
  { href: "/dashboard/orders", label: "Kaariger Orders" },
  { href: "/dashboard/attendance", label: "Attendance" },
  { href: "/dashboard/records", label: "All Records" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace("/");
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col bg-navy text-white md:flex">
        <div className="border-b border-white/10 p-6">
          <p className="text-lg font-bold">Laiza Admin</p>
          <p className="mt-1 text-xs text-ice/70">{session.name}</p>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? "bg-ice text-navy" : "text-ice/90 hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => {
            logout();
            router.replace("/");
          }}
          className="m-4 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10"
        >
          Logout
        </button>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
          <p className="font-semibold text-navy">Laiza Admin</p>
          <button onClick={logout} className="text-sm text-slate-600">
            Logout
          </button>
        </header>
        <div className="border-b bg-white px-4 py-2 md:hidden">
          <select
            className="input"
            value={pathname}
            onChange={(e) => router.push(e.target.value)}
          >
            {links.map((l) => (
              <option key={l.href} value={l.href}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
