"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
          <div className="flex flex-col items-center bg-white px-6 pb-8 pt-16">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#021024]/5 text-4xl font-black text-[#052659]">
              L
            </div>
            <h1 className="text-xl font-extrabold tracking-[0.2em] text-[#021024]">LAIZA BAGS</h1>
            <p className="mt-2 text-sm text-slate-500">Admin Control Panel</p>
          </div>

          <div className="hero-gradient px-6 pb-10 pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#C1E8FF]">Mobile Number</label>
                <input
                  className="input !border-[#C1E8FF]/30 !bg-white/10 !text-white placeholder:!text-[#C1E8FF]/50"
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
                <label className="mb-1.5 block text-sm font-medium text-[#C1E8FF]">Password</label>
                <input
                  className="input !border-[#C1E8FF]/30 !bg-white/10 !text-white placeholder:!text-[#C1E8FF]/50"
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
                className="w-full rounded-full bg-[#C1E8FF] py-3.5 text-base font-bold text-[#021024] transition active:scale-[0.98] hover:bg-white disabled:opacity-50"
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
