"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { btnGhost, btnPrimary, Card, inputCls, Logo } from "@/components/ui";
import { TIERS, type Plan } from "@/lib/plans";

export default function PricingClient({ signedIn, currentPlan }: { signedIn: boolean; currentPlan: Plan | null }) {
  const router = useRouter();
  const [sel, setSel] = useState<"plus" | "pro">("plus");
  const [promo, setPromo] = useState("");
  const [card, setCard] = useState({ number: "", email: "" });
  const [summary, setSummary] = useState<{ charged: number; renews: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const priceCents = summary ? summary.charged : TIERS[sel].priceCents;
  const payLabel = !signedIn ? "Sign in to check out" : `Pay $${(priceCents / 100).toFixed(2)}`;

  async function apply() {
    setErr(null);
    try {
      const r = await api<{ charged: number; renews?: string }>("/api/billing", { method: "POST", body: JSON.stringify({ plan: sel, promo, preview: true }) });
      setSummary({ charged: r.charged, renews: r.renews || `Renews monthly at $${(TIERS[sel].priceCents / 100).toFixed(2)}.` });
    } catch (x: unknown) { setErr(x instanceof Error ? x.message : "Promo failed."); setSummary(null); }
  }

  async function pay() {
    if (!signedIn) { router.push("/sign-in?next=/pricing"); return; }
    setBusy(true); setErr(null);
    try {
      await api("/api/billing", { method: "POST", body: JSON.stringify({ plan: sel, promo, card }) });
      router.push("/notes");
    } catch (x: unknown) { setErr(x instanceof Error ? x.message : "Payment failed."); } finally { setBusy(false); }
  }

  function Plan({ id }: { id: "free" | "plus" | "pro" }) {
    const t = TIERS[id];
    const chosen = id !== "free" && sel === id;
    return (
      <div className={`rounded-2xl border bg-card p-5 ${chosen ? "border-accent" : "border-line"} ${id === "plus" ? "relative" : ""}`}>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[16.5px] font-bold text-ink">{t.label}</div>
            <div className="text-[12.5px] text-muted">{t.tagline}</div>
          </div>
          {id === "plus" && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10.5px] font-bold text-accent">Most chosen</span>}
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-serif text-[34px] font-semibold text-ink">${(t.priceCents / 100).toFixed(2).replace(".00", "")}</span>
          {!!t.priceCents && <span className="text-[13px] text-muted">per month</span>}
        </div>
        <ul className="mt-4 space-y-2 text-[13.5px] text-ink-soft">
          {id === "free" && <><li className="flex gap-2"><Dot />Think with You and Ask modes, with limited AI notes</li><li className="flex gap-2"><Dot />A few visualizations a month</li><li className="flex gap-2"><Dot />PDF export</li><li className="flex gap-2"><Dot />7 days of version history</li></>}
          {id === "plus" && <><li className="flex gap-2"><Dot />Everything in Free, with a generous AI allowance</li><li className="flex gap-2"><Dot />Standard visualization allowance</li><li className="flex gap-2"><Dot />PDF, Word and Markdown export, with hide-AI option</li><li className="flex gap-2"><Dot />30 days of version history</li></>}
          {id === "pro" && <><li className="flex gap-2"><Dot />Everything in Plus, with the highest AI and visualization allowance</li><li className="flex gap-2"><Dot />Hint strictness control</li><li className="flex gap-2"><Dot />Unlimited version history</li></>}
        </ul>
        {id === "free" ? (
          <button onClick={() => signedIn ? router.push("/notes") : router.push("/sign-in?mode=signup")} className={btnGhost + " mt-5 w-full"}>Start free</button>
        ) : (
          <button
            onClick={() => setSel(id as "plus" | "pro")}
            className={`mt-5 w-full ${chosen ? btnPrimary : btnGhost}`}
          >
            {chosen ? (currentPlan === id ? `${t.label} selected` : `${t.label} selected`) : `Choose ${t.label}`}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-5">
          <Logo />
          <button onClick={() => router.push("/notes")} className={btnGhost}>Back to notebooks</button>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-5 pb-16">
        <h1 className="pt-10 font-serif text-[46px] font-medium text-ink">Pay for room to think.</h1>
        <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">Every plan keeps your thinking first. Plans differ by how much AI margin you get and how much history you keep.</p>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Plan id="free" />
          <Plan id="plus" />
          <Plan id="pro" />
        </div>

        <div className="mt-9 grid gap-6 lg:grid-cols-[1.5fr,1fr]">
          <Card className="p-6">
            <h2 className="font-serif text-[26px] font-medium text-ink">Checkout</h2>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-[13px] font-semibold text-ink">Email for receipts</span>
                <input className={inputCls + " mt-1.5"} value={card.email} onChange={(e) => setCard({ ...card, email: e.target.value })} placeholder={signedIn ? "prefilled" : "you@example.com"} />
              </label>
              <label className="block">
                <span className="text-[13px] font-semibold text-ink">Card number</span>
                <input className={inputCls + " mt-1.5"} value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} placeholder="4242 4242 4242 4242" />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block"><span className="text-[13px] font-semibold text-ink">Expiry</span>
                  <input className={inputCls + " mt-1.5"} placeholder="MM / YY" /></label>
                <label className="block"><span className="text-[13px] font-semibold text-ink">CVC</span>
                  <input className={inputCls + " mt-1.5"} placeholder="123" /></label>
              </div>
              <label className="block">
                <span className="text-[13px] font-semibold text-ink">Promo code</span>
                <div className="mt-1.5 flex gap-2">
                  <input className={inputCls} placeholder="Try LAUNCH50" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} />
                  <button onClick={apply} className="h-[42px] shrink-0 rounded-[10px] bg-btn-dark px-4 text-[13.5px] font-bold text-white">Apply</button>
                </div>
              </label>
              {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13.5px] font-semibold text-rose-800">{err}</div>}
              <button onClick={pay} disabled={busy} className={btnPrimary + " w-full"}>{payLabel}</button>
              <p className="text-[12.5px] text-muted">Cancel in two clicks from Settings. We email you before the price changes.</p>
            </div>
          </Card>

          <Card className="h-fit p-6">
            <h3 className="text-[15.5px] font-bold text-ink">Order summary</h3>
            <div className="mt-4 flex items-baseline justify-between text-[14px] text-ink-soft">
              <span>{TIERS[sel].label} plan, monthly</span>
              <span>${(TIERS[sel].priceCents / 100).toFixed(2)}</span>
            </div>
            {summary?.charged !== TIERS[sel].priceCents && summary && (
              <div className="mt-2 flex items-baseline justify-between text-[14px] text-ink-soft"><span>LAUNCH50 applied</span><span>-$3.00 + prorated</span></div>
            )}
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex items-baseline justify-between text-[15.5px] font-bold text-ink">
                <span>Due today</span>
                <span>${(priceCents / 100).toFixed(2)}</span>
              </div>
              <p className="mt-2 text-[12.5px] text-muted">
                {summary ? summary.renews : `Renews monthly at $${(TIERS[sel].priceCents / 100).toFixed(2)}${sel === "pro" ? ".99" : ""}.`}
              </p>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
const Dot = () => <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-soft" />;
