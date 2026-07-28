"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    document.documentElement.classList.add("admin-active");
    return () => document.documentElement.classList.remove("admin-active");
  }, []);

  if (!session) return null;

  return (
    <div className="admin-app">
      <div className="admin-frame">
        <AdminDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          session={session}
          onLogout={() => {
            logout();
            router.replace("/");
          }}
        />

        <div className="admin-topbar">
          <TopAppBar
            title={meta.title}
            subtitle={subtitle}
            showBack={pathname !== "/dashboard"}
            onBackClick={() => router.push("/dashboard")}
            onMenuClick={() => setDrawerOpen(true)}
          />
        </div>

        <main className="admin-scroll">
          <div className="admin-content">{children}</div>
        </main>

        <FloatingBottomNav />
      </div>
    </div>
  );
}
