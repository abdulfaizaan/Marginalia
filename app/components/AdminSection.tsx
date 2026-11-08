"use client";

import { Fragment, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Chip, btnMini, inputCls } from "@/components/ui";
import { api, timeAgo } from "@/lib/client";

const TITLES: Record<string, string> = {
  users: "Users",
  "ai-quality": "AI quality",
  "audit-log": "Audit log",
};

export default function AdminSection({ section }: { section: string }) {
  return <AdminShell active={TITLES[section] || section}>{section === "users" ? <Users /> : section === "ai-quality" ? <Quality /> : <Audit />}</AdminShell>;
}

function Users() {
  const [rows, setRows] = useState<URow[]>([]);
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api<{ users: URow[] }>(`/api/admin/users?plan=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}`);
      setRows(r.users);
    } catch (x: unknown) { setErr(x instanceof Error ? x.message : "Load failed."); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter, q]);

  async function completeDeletion(userId: string) {
    await api("/api/admin/users", { method: "POST", body: JSON.stringify({ action: "complete_deletion", userId }) });
    setRows((rs) => rs.filter((r) => r.id !== userId));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-serif text-[30px] font-medium text-white">Users</h1>
        <div className="flex rounded-xl bg-white/5 p-1">
          {["All", "Keyed", "Demo"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`h-8 rounded-[8px] px-3 text-[12.5px] font-bold ${filter === f ? "bg-white/15 text-white" : "text-white/60"}`}>{f}</button>
          ))}
        </div>
        <input className={inputCls + " h-9 !w-[220px] border-white/15 bg-white/[0.06] text-white placeholder:text-white/35"} placeholder="Search email…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <p className="mt-3 text-[13px] text-rose-300">{err}</p>}

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-white/[0.04] text-white/55">
            <tr><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">AI</th><th className="px-4 py-2.5">Joined</th><th className="px-4 py-2.5">Last active</th><th className="px-4 py-2.5">Status</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((u) => (
              <Fragment key={u.id}>
                <tr className="text-white/85">
                  <td className="px-4 py-2.5">{u.email}</td>
                  <td className="px-4 py-2.5"><Chip small kind={u.ai_vendor ? "direction" : "question"}>{u.ai_vendor || "demo"}</Chip></td>
                  <td className="px-4 py-2.5 text-white/55">{timeAgo(u.joined_at)}</td>
                  <td className="px-4 py-2.5 text-white/55">{timeAgo(u.last_active)}</td>
                  <td className="px-4 py-2.5">{u.status === "deletion_requested" ? <span className="font-bold text-rose-300">deletion requested</span> : <span className="text-white/50">active</span>}</td>
                  <td className="px-4 py-2.5"><button onClick={() => setOpen(open === u.id ? null : u.id)} className={btnMini + " !border-white/15 !bg-white/[0.06] text-white"}>{open === u.id ? "Close" : "View"}</button></td>
                </tr>
                {open === u.id && (
                  <tr className="bg-white/[0.03]">
                    <td colSpan={6} className="px-4 py-3 text-white/65">
                      <div className="flex flex-wrap items-center gap-6">
                        <span>Name: {u.name || "—"}</span>
                        <span>AI: {u.ai_vendor || "demo margins (no key)"}</span>
                        <span className="text-white/40">Member content stays hidden — admins cannot open notebooks.</span>
                        {u.status === "deletion_requested" && (
                          <button onClick={() => completeDeletion(u.id)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[12px] font-bold text-white">Complete deletion</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-6 text-white/50">No users match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Quality() {
  const [queue, setQueue] = useState<QRow[]>([]);
  const [rated, setRated] = useState<QRated[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    api<{ queue: QRow[]; rated: QRated[] }>("/api/admin/ai-quality")
      .then((r) => { setQueue(r.queue); setRated(r.rated); })
      .catch((x: unknown) => setErr(x instanceof Error ? x.message : "Load failed."));
  useEffect(() => { void load(); }, []);

  async function review(id: string, decision: "flag_ok" | "resolved") {
    await api("/api/admin/ai-quality", { method: "POST", body: JSON.stringify({ action: "review", id, decision }) });
    setQueue((q0) => q0.filter((x) => x.id !== id));
  }

  return (
    <div>
      <h1 className="font-serif text-[30px] font-medium text-white">AI quality</h1>
      <p className="mt-1 text-[13px] text-white/55">Reviewers see the AI text only — user content is never shown here.</p>
      {err && <p className="mt-3 text-[13px] text-rose-300">{err}</p>}

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="text-[14px] font-bold text-white">Flagged for review ({queue.length})</div>
        <div className="mt-3 space-y-3">
          {queue.map((f) => (
            <div key={f.id} className="rounded-xl bg-white/[0.05] p-4">
              <Chip small kind={f.type}>{f.type}</Chip>
              <p className="mt-1.5 max-w-[70ch] text-[13.5px] leading-relaxed text-white/85">{f.body}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => review(f.id, "flag_ok")} className="rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white">Keep</button>
                <button onClick={() => review(f.id, "resolved")} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white/70 hover:text-white">Mark unhelpful</button>
              </div>
            </div>
          ))}
          {!queue.length && <p className="text-[12.5px] text-white/50">Queue clear.</p>}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-white/[0.04] text-white/55"><tr><th className="px-4 py-2.5">AI note</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Rating</th></tr></thead>
          <tbody className="divide-y divide-white/10 text-white/85">
            {rated.map((r, i) => (
              <tr key={i}><td className="px-4 py-2.5 text-white/80">{r.body.slice(0, 90)}{r.body.length > 90 ? "…" : ""}</td><td className="px-4 py-2.5">{r.type}</td><td className="px-4 py-2.5">{r.rating === 1 ? "👍" : "👎"}</td></tr>
            ))}
            {!rated.length && <tr><td colSpan={3} className="px-4 py-6 text-white/50">No rated notes yet — ratings appear as users 👍/👎 margin notes.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Audit() {
  const [rows, setRows] = useState<{ admin: string; action: string; detail: string; created_at: number }[]>([]);
  useEffect(() => {
    api<{ entries: { admin: string; action: string; detail: string; created_at: number }[] }>("/api/admin/audit-log")
      .then((r) => setRows(r.entries))
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="font-serif text-[30px] font-medium text-white">Audit log</h1>
      <div className="mt-5 rounded-2xl border border-white/10">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-white/[0.04] text-white/55"><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Admin</th><th className="px-4 py-2.5">Action</th><th className="px-4 py-2.5">Detail</th></tr></thead>
          <tbody className="divide-y divide-white/10 text-white/85">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap px-4 py-2.5 text-white/55">{timeAgo(r.created_at)}</td>
                <td className="px-4 py-2.5">{r.admin}</td>
                <td className="px-4 py-2.5">{r.action}</td>
                <td className="px-4 py-2.5 text-white/55">{r.detail}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="px-4 py-6 text-white/50">No entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface URow { id: string; email: string; name: string; ai_vendor: string | null; joined_at: number; last_active: number; status: string }
interface QRow { id: string; type: string; body: string }
interface QRated { body: string; type: string; rating: number }
