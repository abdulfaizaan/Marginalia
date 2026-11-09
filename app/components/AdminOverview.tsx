"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Chip } from "@/components/ui";
import { api, timeAgo } from "@/lib/client";

const M_KEYS = [
  ["activation", "Activation", "Users with 200+ words written"],
  ["originalThought", "Original thought", "Share of AI-origin words on pages"],
  ["usefulness", "Usefulness", "👍 rate on margin notes"],
  ["retention", "4-week retention", "Active in week 4 after joining"],
  ["byok", "BYOK adoption", "Users running margins on their own AI key"],
  ["aiCost", "AI cost share", "Of revenue, ceiling 30%"],
] as const;

interface Metrics {
  [k: string]: { value: string; target: string; onTarget: boolean; sample?: boolean } | { used: number; total: number } | number;
}

export default function AdminOverview() {
  const [m, setM] = useState<Metrics | null>(null);
  const [flagged, setFlagged] = useState<FlagRow[]>([]);
  const [activity, setActivity] = useState<{ action: string; detail: string; created_at: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ m: Metrics; flagged: FlagRow[]; activity: { action: string; detail: string; created_at: number }[] }>("/api/admin/overview")
      .then((r) => { setM(r.m); setFlagged(r.flagged); setActivity(r.activity); })
      .catch((x: unknown) => setErr(x instanceof Error ? x.message : "Load failed."));
  }, []);

  async function review(id: string, decision: "flag_ok" | "resolved") {
    await api("/api/admin/ai-quality", { method: "POST", body: JSON.stringify({ action: "review", id, decision }) });
    setFlagged((q) => q.filter((f) => f.id !== id));
  }

  const byok = m?.byok as { value: string; target: string; onTarget: boolean } | undefined;

  return (
    <AdminShell active="Overview">
      <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-100">
        Sample data seeded for the demo — metrics reflect the seeded cohort, not production traffic.
      </div>

      {err && <p className="text-[13.5px] text-rose-300">{err}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {M_KEYS.map(([k, label, sub]) => {
          const v = m?.[k] as { value: string; target: string; onTarget: boolean; sample?: boolean } | undefined;
          return (
            <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[14px] font-bold text-white">{label}</div>
                  <div className="mt-0.5 text-[12px] text-white/50">{sub}</div>
                </div>
                {v && <Chip small kind={v.onTarget ? "question" : "challenge"}>{v.onTarget ? "On target" : "Below target"}</Chip>}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-serif text-[36px] text-white">{v?.value ?? "…"}</span>
                <span className="text-[11.5px] text-white/50">{v?.target}</span>
                {v?.sample && <span className="text-[11px] text-amber-200/80">sample</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
          <div className="text-[14px] font-bold text-white">AI keys set</div>
          <p className="mt-1 text-[12.5px] text-white/55">{typeof m?.keyed === "number" && typeof m?.userCount === "number" ? `${m.keyed} of ${m.userCount} users bring their own key` : "…"}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#6b93ff]" style={{ width: byok ? byok.value : "0%" }} />
          </div>
          <p className="mt-2 text-[12px] text-white/50">Keys are AES-GCM-encrypted at rest; users pay their own vendor bill.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
          <div className="flex items-baseline justify-between">
            <div className="text-[14px] font-bold text-white">AI quality review queue</div>
            <span className="text-[12px] text-white/50">{flagged.length} flagged</span>
          </div>
          <div className="mt-3 space-y-3">
            {flagged.slice(0, 3).map((f) => (
              <div key={f.id} className="rounded-xl bg-white/[0.04] p-3.5">
                <Chip small kind={f.type}>{f.type}</Chip>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/85">{f.body}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => review(f.id, "flag_ok")} className="rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white">Review ok</button>
                  <button onClick={() => review(f.id, "resolved")} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white/70 hover:text-white">Mark unhelpful</button>
                </div>
              </div>
            ))}
            {!flagged.length && <p className="text-[12.5px] text-white/50">Queue clear.</p>}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-5">
        <div className="text-[14px] font-bold text-white">Recent admin actions</div>
        <div className="mt-3 divide-y divide-white/10">
          {activity.map((a, i) => (
            <div key={i} className="flex items-baseline justify-between py-2 text-[13px]">
              <span className="text-white/85">{a.detail || a.action}</span>
              <span className="text-[12px] text-white/45">{timeAgo(a.created_at)}</span>
            </div>
          ))}
          {!activity.length && <p className="py-2 text-[12.5px] text-white/50">No actions yet.</p>}
        </div>
      </div>
    </AdminShell>
  );
}

interface FlagRow { id: string; type: string; body: string; note_id: string }
