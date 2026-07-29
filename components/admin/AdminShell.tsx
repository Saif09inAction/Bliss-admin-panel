"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { getRouteMeta, greeting, todayHeading } from "@/lib/navigation";
import AdminDrawer from "./AdminDrawer";
import FloatingBottomNav from "./FloatingBottomNav";
import Sidebar from "./Sidebar";
import TopAppBar from "./TopAppBar";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const meta = getRouteMeta(pathname);

  const subtitle =
    pathname === "/dashboard"
      ? `${greeting()} · ${todayHeading()}`
      : meta.subtitle;

  if (!session) return null;

  function handleLogout() {
    logout();
    router.replace("/");
  }

  return (
    <div className="atrium-app">
      <div className="atrium-shell">
        <Sidebar
          sessionName={session.name || "Admin"}
          sessionPhone={session.phone}
          onLogout={handleLogout}
        />

        <AdminDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          session={session}
          onLogout={handleLogout}
        />

        <div className="atrium-main">
          <TopAppBar
            title={meta.title}
            subtitle={subtitle}
            showBack={pathname !== "/dashboard"}
            onBackClick={() => router.push("/dashboard")}
            onMenuClick={() => setDrawerOpen(true)}
          />

          <main className="atrium-content">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          <FloatingBottomNav />
        </div>
      </div>
    </div>
  );
}
