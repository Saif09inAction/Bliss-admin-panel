"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { doc, getDoc } from "firebase/firestore";
import { getDb } from "./firebase";
import type { AdminSession } from "./types";

const STORAGE_KEY = "laiza_admin_session";

interface AuthContextValue {
  session: AdminSession | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setLoading(false);
  }, []);

  async function login(phone: string, password: string): Promise<string | null> {
    const trimPhone = phone.trim();
    if (!trimPhone || password.length < 6) {
      return "Enter a valid phone and password (min 6 chars).";
    }

    const snap = await getDoc(doc(getDb(), "admins", trimPhone));
    if (!snap.exists()) {
      return "Admin profile not found.";
    }

    const data = snap.data();
    const dbPassword = (data.password as string) || "123123";
    if (dbPassword !== password) {
      return "Incorrect password.";
    }

    const admin: AdminSession = {
      phone: trimPhone,
      name: (data.name as string) || `Admin ${trimPhone}`,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(admin));
    setSession(admin);
    return null;
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
