"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Lock, Phone } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { session, loading, login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace("/dashboard");
  }, [loading, session, router]);

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

  if (loading || session) {
    return (
      <div className="login-app">
        <div className="h-8 w-8 animate-pulseSoft rounded-full bg-jade/40" />
      </div>
    );
  }

  return (
    <div className="login-app">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[420px] w-[420px] rounded-full bg-jade/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] h-[360px] w-[360px] rounded-full bg-bronze/15 blur-[90px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="login-frame"
      >
        <div className="login-scroll px-7 pb-8 pt-10 sm:px-9">
          <div className="flex flex-col items-center text-center">
            <div className="bb-monogram" aria-hidden />
            <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-white">
              Bliss Bombay
            </h1>
            <p className="mt-1.5 text-sm text-white/45">Admin operations studio</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-9 space-y-4">
            <div>
              <label className="label !text-white/45">Mobile number</label>
              <div className="relative">
                <Phone size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  className="input !border-white/10 !bg-white/[0.04] !pl-10 !text-white placeholder:!text-white/25"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Admin mobile"
                  required
                />
              </div>
            </div>
            <div>
              <label className="label !text-white/45">Password</label>
              <div className="relative">
                <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  className="input !border-white/10 !bg-white/[0.04] !pl-10 !text-white placeholder:!text-white/25"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={6}
                />
              </div>
            </div>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-danger/15 px-3 py-2 text-sm text-red-200"
              >
                {error}
              </motion.p>
            )}
            <button type="submit" className="btn btn-primary mt-2 w-full !py-3.5" disabled={submitting}>
              {submitting ? "Signing in…" : "Enter studio"}
              {!submitting && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-white/25">
            Secure access · Bliss Bombay manufacturing
          </p>
        </div>
      </motion.div>
    </div>
  );
}
