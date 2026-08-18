"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, isSupervisorSession } from "@/lib/auth-context";
import AdminShell from "@/components/admin/AdminShell";
import {
  supervisorCanAccessPath,
  supervisorDefaultPath,
} from "@/lib/supervisor-access";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace("/");
  }, [loading, session, router]);

  useEffect(() => {
    if (!session || !isSupervisorSession(session)) return;
    if (!supervisorCanAccessPath(pathname, session.access)) {
      router.replace(supervisorDefaultPath(session.access));
    }
  }, [loading, session, pathname, router]);

  if (loading || !session) {
    return (
      <div className="atrium-app flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-pulseSoft rounded-2xl bg-jade/30" />
          <p className="text-sm text-white/40">Loading studio…</p>
        </div>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
