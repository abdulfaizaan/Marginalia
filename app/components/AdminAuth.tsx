"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Logo, inputCls } from "@/components/ui";

export default function AdminAuth() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api("/api/admin-auth", { method: "POST", body: JSON.stringify({ email, password: pw, code }) });
      router.push("/admin");
    } catch (x: unknown) {
      setErr(x instanceof Error ? x.message : "Sign-in failed.");
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#111111] p-6" style={{ background: "#111111" }}>
      <div className="mb-8 flex items-center gap-2.5">
        <Logo dark />
        <span className="rounded-md bg-[#2a2a2a] px-2 py-[3px] text-[10.5px] font-black tracking-[0.12em] text-[#f3eee3]">ADMIN</span>
      </div>
      <form onSubmit={go} className="w-full max-w-[520px] rounded-3xl border border-white/10 bg-white/[0.06] p-8 backdrop-blur">
        <h1 className="font-serif text-[32px] font-medium text-white">Admin console</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/70">For the Marginalia team only. Every sign-in needs a verification code.</p>

        <label className="mt-6 block text-[13.5px] font-semibold text-white/90">Work email</label>
        <input className={inputCls + " mt-1.5 border-white/15 bg-white/[0.05] text-white placeholder:text-white/35"} value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />

        <label className="mt-5 block text-[13.5px] font-semibold text-white/90">Password</label>
        <input className={inputCls + " mt-1.5 border-white/15 bg-white/[0.05] text-white"} value={pw} onChange={(e) => setPw(e.target.value)} type="password" required />

        <label className="mt-5 block text-[13.5px] font-semibold text-white/90">Verification code</label>
        <input
          className={inputCls + " mt-1.5 border-white/15 bg-white/[0.05] font-mono tracking-[0.35em] text-white"}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6 digits"
          maxLength={6}
          required
        />
        <p className="mt-1.5 text-[12.5px] text-white/55">From your authenticator app. Demo code: 123456.</p>

        {err && <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-[13.5px] font-semibold text-rose-200">{err}</div>}
        <button type="submit" disabled={busy} className="mt-6 w-full rounded-xl bg-white py-3 text-[15px] font-bold text-[#111111] hover:bg-white/90 disabled:opacity-60">
          Sign in to admin
        </button>
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[13px] leading-relaxed text-white/70">
          Admin sessions expire after a period of inactivity, and every action is written to the audit log.
        </div>
      </form>
      <Link href="/sign-in" className="mt-8 text-[13.5px] font-semibold text-white/80 underline">Back to member sign-in</Link>
    </main>
  );
}
