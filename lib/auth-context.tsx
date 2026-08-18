"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getDb } from "./firebase";
import type { AppSession, AdminSession, SupervisorSession } from "./types";
import { normalizeSupervisorAccess } from "./supervisor-access";

const STORAGE_KEY = "laiza_admin_session";

function supervisorSessionFromDoc(
  phone: string,
  data: Record<string, unknown>
): SupervisorSession {
  return {
    kind: "supervisor",
    phone,
    name: (data.name as string) || phone,
    joiningDate: (data.joiningDate as string) || "",
    monthlySalary: (data.monthlySalary as number) || 0,
    dailySignInTime: (data.dailySignInTime as string) || "",
    dailySignOutTime: (data.dailySignOutTime as string) || "",
    access: normalizeSupervisorAccess(
      data.supervisorAccess as Partial<Record<string, boolean>>
    ),
  };
}

function sessionsEqual(a: SupervisorSession, b: SupervisorSession): boolean {
  return (
    a.phone === b.phone &&
    a.name === b.name &&
    a.joiningDate === b.joiningDate &&
    a.monthlySalary === b.monthlySalary &&
    a.dailySignInTime === b.dailySignInTime &&
    a.dailySignOutTime === b.dailySignOutTime &&
    JSON.stringify(a.access) === JSON.stringify(b.access)
  );
}

function parseStoredSession(raw: string): AppSession | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data.phone || !data.name) return null;
    if (data.kind === "supervisor") {
      return {
        kind: "supervisor",
        phone: String(data.phone),
        name: String(data.name),
        joiningDate: String(data.joiningDate || ""),
        monthlySalary: Number(data.monthlySalary) || 0,
        dailySignInTime: (data.dailySignInTime as string) || "",
        dailySignOutTime: (data.dailySignOutTime as string) || "",
        access: normalizeSupervisorAccess(data.access as Partial<Record<string, boolean>>),
      };
    }
    return {
      kind: "admin",
      phone: String(data.phone),
      name: String(data.name),
    };
  } catch {
    return null;
  }
}

interface AuthContextValue {
  session: AppSession | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<string | null>;
  logout: () => void;
  isAdmin: boolean;
  isSupervisor: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSession(parseStoredSession(raw));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setLoading(false);
  }, []);

  /** Keep supervisor permissions in sync when admin updates access in Firestore. */
  useEffect(() => {
    if (!session || session.kind !== "supervisor") return;

    const phone = session.phone;
    const unsub = onSnapshot(doc(getDb(), "employees", phone), (snap) => {
      if (!snap.exists()) {
        localStorage.removeItem(STORAGE_KEY);
        setSession(null);
        return;
      }
      const data = snap.data();
      if ((data.role as string) !== "SUPERVISOR") {
        localStorage.removeItem(STORAGE_KEY);
        setSession(null);
        return;
      }
      const next = supervisorSessionFromDoc(phone, data as Record<string, unknown>);
      setSession((prev) => {
        if (!prev || prev.kind !== "supervisor" || prev.phone !== phone) return prev;
        if (sessionsEqual(prev, next)) return prev;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    });

    return () => unsub();
  }, [session?.kind, session?.phone]);

  async function login(phone: string, password: string): Promise<string | null> {
    const trimPhone = phone.trim();
    if (!trimPhone || password.length < 6) {
      return "Enter a valid phone and password (min 6 chars).";
    }

    const adminSnap = await getDoc(doc(getDb(), "admins", trimPhone));
    if (adminSnap.exists()) {
      const data = adminSnap.data();
      const dbPassword = (data.password as string) || "123123";
      if (dbPassword !== password) {
        return "Incorrect password.";
      }
      const admin: AdminSession = {
        kind: "admin",
        phone: trimPhone,
        name: (data.name as string) || `Admin ${trimPhone}`,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(admin));
      setSession(admin);
      return null;
    }

    const empSnap = await getDoc(doc(getDb(), "employees", trimPhone));
    if (!empSnap.exists()) {
      return "Account not found. Check mobile number.";
    }
    const emp = empSnap.data();
    if ((emp.role as string) !== "SUPERVISOR") {
      return "This login is for admin or supervisor only. Staff use the mobile app.";
    }
    const dbPassword = (emp.password as string) || "";
    if (!dbPassword || dbPassword !== password) {
      return "Incorrect password.";
    }

    const supervisor = supervisorSessionFromDoc(trimPhone, emp as Record<string, unknown>);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(supervisor));
    setSession(supervisor);
    return null;
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }

  const isAdmin = session?.kind === "admin";
  const isSupervisor = session?.kind === "supervisor";

  return (
    <AuthContext.Provider value={{ session, loading, login, logout, isAdmin, isSupervisor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function isAdminSession(session: AppSession | null): session is AdminSession {
  return session?.kind === "admin";
}

export function isSupervisorSession(session: AppSession | null): session is SupervisorSession {
  return session?.kind === "supervisor";
}
