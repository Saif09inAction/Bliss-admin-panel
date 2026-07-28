"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { session, loading, login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    <div className="flex min-h-screen flex-col bg-[#F1F7FC]">
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-[#021024]/5 text-5xl font-black text-[#052659]">
          L
        </div>
        <h1 className="text-2xl font-extrabold tracking-[0.2em] text-[#021024]">LAIZA BAGS</h1>
        <p className="mt-2 text-sm text-slate-500">Admin Control Panel</p>
      </div>

      <div className="hero-gradient rounded-t-[2.5rem] px-6 pb-10 pt-8">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#C1E8FF]">Mobile Number</label>
            <input
              className="w-full rounded-xl border border-[#C1E8FF]/30 bg-white/5 px-4 py-3 text-white placeholder:text-[#C1E8FF]/40 outline-none focus:border-[#C1E8FF]"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Admin mobile"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#C1E8FF]">Password</label>
            <input
              className="w-full rounded-xl border border-[#C1E8FF]/30 bg-white/5 px-4 py-3 text-white placeholder:text-[#C1E8FF]/40 outline-none focus:border-[#C1E8FF]"
              type="password"
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
            className="w-full rounded-full bg-[#C1E8FF] py-3.5 text-base font-bold text-[#021024] transition hover:bg-white disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Login as Admin"}
          </button>
        </form>
      </div>
    </div>
  );
}
