"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { btnPrimary, inputCls, Logo, Field } from "@/components/ui";
import LinkHint from "@/components/LinkHint";

export default function AuthForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ action: mode, email, password: pw, name, ageOk: age }) });
      const next = params.get("next") || "/notes";
      router.push(/^\/[a-z]/i.test(next) ? next : "/notes"); // no open redirect via ?next=//evil.com
    } catch (x: unknown) {
      setErr(x instanceof Error ? x.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function google() {
    setBusy(true); setErr(null);
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "google" }) });
      router.push("/notes");
    } catch (x: unknown) {
      setErr(x instanceof Error ? x.message : "Google sign-in failed."); // dummy OAuth: covered users
    } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[#101a2c] p-10 lg:flex" style={{ background: "#101a2c" }}>
        <Logo dark />
        <div>
          <h1 className="max-w-[16ch] font-serif text-[54px] font-medium leading-[1.06] text-white">
            Write first. Let the margin ask the questions.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[15.5px] leading-relaxed text-white/75">
            A notebook that thinks with you, not for you. Your ideas stay yours; Marginalia points at the gaps.
          </p>
          <div className="mt-9 max-w-[430px] rounded-2xl border border-white/15 bg-white/5 p-5">
            <span className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white">Question</span>
            <p className="mt-2.5 text-[15px] text-white/90">Who is this idea for, and what would make them stop scrolling?</p>
          </div>
        </div>
        <p className="text-[13px] text-white/60">Your notes are private by default and never used for training.</p>
      </div>

      <div className="flex items-center justify-center bg-paper p-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 lg:hidden"><Logo /></div>
          <div className="mb-7 flex rounded-xl bg-[#e4e8ef] p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`h-10 flex-1 rounded-[9px] text-[13.5px] font-bold transition-colors ${
                  mode === m ? "bg-card text-ink shadow-sm" : "text-ink-soft"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <h2 className="font-serif text-[30px] font-medium text-ink">{mode === "signin" ? "Welcome back" : "Start a notebook"}</h2>
          <p className="mt-1 mb-6 text-[14px] text-muted">
            {mode === "signin" ? "Pick up where your thinking left off." : "13+ only. Your first notebook is ready in seconds."}
          </p>

          <button onClick={google} disabled={busy} className="w-full rounded-[10px] border border-line bg-card py-2.5 text-[14.5px] font-semibold text-ink hover:bg-paper-soft">
            Continue with Google
          </button>
          <div className="my-5 flex items-center gap-3 text-[12.5px] text-muted">
            <span className="h-px flex-1 bg-line" /> or use email <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={go} className="space-y-4">
            {mode === "signup" && (
              <Field label="Name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="How notes greet you" />
              </Field>
            )}
            <Field label="Email">
              <input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            <Field label="Password" right={mode === "signin" && <a href="#" className="text-[12.5px] font-semibold text-accent hover:underline">Forgot password?</a>}>
              <input className={inputCls} type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} />
            </Field>
            {mode === "signup" && (
              <label className="flex items-start gap-2.5 text-[13px] text-ink-soft">
                <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} className="mt-[3px] h-4 w-4 rounded accent-[var(--accent)]" />
                <span>I confirm I am 13 or older (parental consent where required by region).</span>
              </label>
            )}
            {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13.5px] font-semibold text-rose-800">{err}</div>}
            <button type="submit" disabled={busy} className={btnPrimary + " w-full"}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-[13.5px] text-muted">
            Running the product?{" "}
            <Link href="/admin/sign-in" className="font-bold text-accent hover:underline">Admin sign-in<LinkHint /></Link>
          </p>
        </div>
      </div>
    </div>
  );
}
