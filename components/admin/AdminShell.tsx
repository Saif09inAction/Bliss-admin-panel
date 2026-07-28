"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getRouteMeta, greeting, todayHeading } from "@/lib/navigation";
import AdminDrawer from "./AdminDrawer";
import FloatingBottomNav from "./FloatingBottomNav";
import TopAppBar from "./TopAppBar";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const meta = getRouteMeta(pathname);

  const subtitle =
    pathname === "/dashboard"
      ? `${greeting()} • ${todayHeading()}`
      : meta.subtitle;

  if (!session) return null;

  return (
    <div className="admin-shell">
      <AdminDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        session={session}
        onLogout={() => {
          logout();
          router.replace("/");
        }}
      />

      <TopAppBar
        title={meta.title}
        subtitle={subtitle}
        onMenuClick={() => setDrawerOpen(true)}
      />

      <main className="admin-main">{children}</main>

      <FloatingBottomNav />
    </div>
  );
}
