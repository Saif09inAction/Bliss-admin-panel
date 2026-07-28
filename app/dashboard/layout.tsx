"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AdminShell from "@/components/admin/AdminShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/");
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="admin-app">
        <div className="admin-frame flex items-center justify-center bg-[#F7F9FC] text-slate-500">
          Loading...
        </div>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
