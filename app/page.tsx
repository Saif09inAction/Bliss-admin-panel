"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { session, loading, login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("admin-active");
    return () => document.documentElement.classList.remove("admin-active");
  }, []);

  if (!loading && session) {
    router.replace("/dashboard");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const err = await login(phone, password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <div className="login-app">
      <div className="login-frame">
        <div className="login-scroll">
          <div className="flex flex-col items-center bg-[var(--bliss-cream)] px-6 pb-8 pt-14">
            <Image
              src="/bliss-logo.png"
              alt="Bliss Bombay"
              width={112}
              height={112}
              className="mb-4 h-28 w-28 object-contain"
              priority
            />
            <h1 className="text-2xl font-black tracking-[0.25em] text-[var(--bliss-lime)] drop-shadow-sm">
              BLISS
            </h1>
            <p className="text-xs font-bold tracking-[0.45em] text-[var(--bliss-gold)]">BOMBAY</p>
            <p className="mt-3 text-sm text-slate-500">Admin Control Panel</p>
          </div>

          <div className="hero-gradient px-6 pb-10 pt-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--bliss-gold-light)]">
                  Mobile Number
                </label>
                <input
                  className="input !border-[var(--bliss-gold)]/30 !bg-white/5 !text-white placeholder:!text-white/40"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Admin mobile"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--bliss-gold-light)]">
                  Password
                </label>
                <input
                  className="input !border-[var(--bliss-gold)]/30 !bg-white/5 !text-white placeholder:!text-white/40"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={6}
                />
              </div>
              {error && <p className="text-sm text-red-300">{error}</p>}
              <button
                type="submit"
                className="w-full rounded-full bg-[var(--bliss-lime)] py-3.5 text-base font-black tracking-wide text-[var(--bliss-black)] transition active:scale-[0.98] hover:brightness-95 disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? "Signing in..." : "Login as Admin"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
