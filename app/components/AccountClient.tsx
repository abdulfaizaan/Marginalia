"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setTheme } from "@/lib/client";
import { btnGhost, btnPrimary, Card, Chip, inputCls } from "@/components/ui";
import LinkHint from "@/components/LinkHint";

interface Props {
  user: { email: string; name: string; plan: "free" | "plus" | "pro"; promo: string | null; promoMonths: number; status: string };
  used: { margin: number; visuals: number };
  caps: { margin: number; visuals: number };
  hasAi: boolean;
}

const VENDORS = [
  ["openai", "OpenAI"],
  ["xai", "Grok (xAI)"],
  ["gemini", "Google Gemini"],
  ["custom", "Custom (OpenAI-compatible)"],
] as const;

export default function AccountClient({ user, used, caps, hasAi }: Props) {
  const router = useRouter();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // --- AI key card state (POST /api/account/ai-key; key is write-only, never echoed back) ---
  const [aiSet, setAiSet] = useState(hasAi);
  const [aiVendor, setAiVendor] = useState<string | null>(null);
  const [vendorSel, setVendorSel] = useState("openai");
  const [keyIn, setKeyIn] = useState("");
  const [modelIn, setModelIn] = useState("");
  const [baseIn, setBaseIn] = useState("");
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  async function loadAi(statusNote?: string) {
    try {
      const j = await api<{ set: boolean; vendor: string | null; model: string | null; base: string | null }>("/api/account/ai-key");
      setAiSet(j.set); setAiVendor(j.vendor);
      setVendorSel(j.vendor || "openai"); setModelIn(j.model || ""); setBaseIn(j.base || "");
      setKeyIn("");
      if (statusNote !== undefined) setAiStatus(statusNote);
      else setAiStatus(j.set ? (j.vendor === "custom" ? `Live: ${j.vendor} · ${j.model} at ${j.base}` : j.model ? `Live: ${j.vendor} · ${j.model}` : `Live: ${j.vendor}`) : "No key set — demo margins are on.");
    } catch { setAiStatus(null); }
  }
  useEffect(() => { loadAi(); }, []);

  async function saveKey() {
    setBusy(true); setMsg(null);
    try {
      await api("/api/account/ai-key", { method: "POST", body: JSON.stringify({ vendor: vendorSel, key: keyIn, model: modelIn || undefined, base: baseIn || undefined }) });
      await loadAi("Saved. Your key is encrypted on our server — margins and Ask now run on it.");
    } catch (x: unknown) {
      setMsg(x instanceof Error ? x.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function removeKey() {
    setBusy(true); setMsg(null);
    try {
      await api("/api/account/ai-key", { method: "DELETE" });
      await loadAi("Key removed. Demo margins resume — nothing else changed.");
    } catch (x: unknown) {
      setMsg(x instanceof Error ? x.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function post(action: string, extra?: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ ok?: boolean; plan?: string } | (Response & { ok?: boolean })>("/api/account", {
        method: "POST", body: JSON.stringify({ action, ...extra }),
      });
      if (action === "delete_sure") { router.push("/sign-in"); return; }
      setMsg("Done."); router.refresh();
      return r;
    } catch (x: unknown) {
      setMsg(x instanceof Error ? x.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "signout" }) });
    router.push("/");
  }

  function toggleTheme(mode: "light" | "dark") {
    setTheme(mode === "dark");
    api("/api/account", { method: "POST", body: JSON.stringify({ action: "theme", theme: mode }) }).catch(() => {});
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-[860px] items-center justify-between px-5">
          <Link href="/notes" className="text-[13.5px] font-semibold text-ink-soft hover:text-ink">← Library<LinkHint /></Link>
          <div className="flex items-center gap-3">
            <button onClick={() => toggleTheme("light")} className={btnGhost + " !h-9"}>Light</button>
            <button onClick={() => toggleTheme("dark")} className={btnGhost + " !h-9"}>Dark</button>
            <button onClick={signOut} className={btnGhost + " !h-9"}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[860px] space-y-6 px-5 pb-16 pt-8">
        <div>
          <h1 className="font-serif text-[42px] font-medium text-ink">Account</h1>
          <p className="mt-1 text-[14.5px] text-ink-soft">Signed in as {user.email}</p>
        </div>

        {user.status === "deletion_requested" && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3.5 text-[13.5px] font-semibold text-rose-800">
            Deletion requested. Confirm below to erase everything now, or leave — an admin completes it later.
          </div>
        )}

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-serif text-[26px] font-medium text-ink">{user.plan === "free" ? "Free plan" : user.plan === "plus" ? "Plus plan" : "Pro plan"}</h2>
                {user.promo && <Chip kind="direction" small>{user.promo}{user.promoMonths ? ` · ${user.promoMonths} mo` : ""}</Chip>}
              </div>
              <p className="mt-1.5 text-[13.5px] text-ink-soft">
                This month: {used.margin}/{caps.margin} margin notes · {used.visuals}/{caps.visuals} visualizations.
              </p>
            </div>
            {user.plan !== "pro" && (
              <Link href="/pricing" className={btnPrimary + " !h-10"}>{user.plan === "free" ? "Upgrade" : "Switch to Pro"}</Link>
            )}
          </div>
          {user.plan !== "free" && (
            <div className="mt-5 border-t border-line pt-4">
              {confirmCancel ? (
                <div className="flex items-center gap-3">
                  <span className="text-[13.5px] font-semibold text-ink">Keep downgrading to Free?</span>
                  <button onClick={() => post("cancel_plan")} disabled={busy} className={btnGhost}>Yes, cancel plan</button>
                  <button onClick={() => setConfirmCancel(false)} className={btnGhost}>No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmCancel(true)} className={btnGhost}>Cancel plan</button>
              )}
              <p className="mt-2 text-[12px] text-muted">Two clicks — allowed any time, effective immediately, we never charge again.</p>
            </div>
          )}
        </Card>

        {msg && <div className="rounded-lg bg-emerald-50 px-4 py-2.5 text-[13px] font-semibold text-emerald-800">{msg}</div>}

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-bold text-ink">Your AI key</h2>
              <p className="mt-1.5 text-[13.5px] text-ink-soft">
                Marginalia is free — margins and Ask run on <i>your own</i> vendor key: your provider bill, your privacy.
                The key is stored encrypted, never shown again, and nothing runs without it.
              </p>
            </div>
            <Chip kind={aiSet ? "direction" : "question"} small>{aiSet ? "on" : "demo"}</Chip>
          </div>
          <p className="mt-3 rounded-lg bg-paper-soft px-3 py-2 text-[13px] text-ink-soft">{aiStatus || "…"}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[13px] font-semibold text-ink">
              Vendor
              <select value={vendorSel} onChange={(e) => setVendorSel(e.target.value)} className={inputCls + " mt-1"}>
                {VENDORS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label className="text-[13px] font-semibold text-ink">
              API key
              <input type="password" value={keyIn} onChange={(e) => setKeyIn(e.target.value)} autoComplete="off" placeholder="sk-…" className={inputCls + " mt-1"} />
            </label>
            {vendorSel === "custom" && (
              <>
                <label className="text-[13px] font-semibold text-ink">
                  Base URL
                  <input value={baseIn} onChange={(e) => setBaseIn(e.target.value)} placeholder="http://127.0.0.1:11434/v1" className={inputCls + " mt-1"} />
                </label>
                <label className="text-[13px] font-semibold text-ink">
                  Model
                  <input value={modelIn} onChange={(e) => setModelIn(e.target.value)} placeholder="llama3.1" className={inputCls + " mt-1"} />
                </label>
              </>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2.5">
            <button onClick={saveKey} disabled={busy || (aiSet && !keyIn)} className={btnPrimary + " !h-10"}>{aiSet ? "Replace key" : "Save key"}</button>
            {aiSet && <button onClick={removeKey} disabled={busy} className={btnGhost}>Remove key</button>}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-[17px] font-bold text-ink">Your data</h2>
          <p className="mt-1.5 text-[13.5px] text-ink-soft">Export everything: notes, margins, chats, versions — a single JSON file.</p>
          <a href="/api/account" download className={btnGhost + " mt-4 inline-flex"}>Download my data (.json)</a>
          {wipe ? (
            <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-[14px] font-bold text-rose-900">Last check — erase the account and every note?</div>
              <div className="mt-3 flex gap-2.5">
                <button onClick={() => post("delete_sure")} disabled={busy} className="rounded-[10px] bg-rose-600 px-4 py-2.5 text-[13.5px] font-bold text-white">Erase everything</button>
                <button onClick={() => setWipe(false)} className={btnGhost}>Keep my account</button>
              </div>
            </div>
          ) : (
            <div className="mt-6 border-t border-line pt-5">
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)} className="text-[13.5px] font-bold text-rose-700 hover:underline">Delete account</button>
              ) : (
                <div className="space-y-3">
                  <p className="text-[13.5px] font-semibold text-ink">This removes your notebook and notes. First click files the request; the second erases now.</p>
                  <div className="flex gap-2.5">
                    <button onClick={() => { setConfirmDelete(false); post("delete_request"); }} className={btnGhost}>File deletion request</button>
                  </div>
                  <label className="flex items-center gap-2 text-[13px] text-ink-soft">
                    <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                    Show the erase-everything button (final, cannot be undone)
                  </label>
                </div>
              )}
            </div>
          )}
        </Card>

        <p className="text-center text-[12.5px] text-muted pb-6">Account actions. Any data incident would be reported within 72 hours.</p>
      </main>
    </div>
  );
}
