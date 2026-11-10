"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, timeAgo } from "@/lib/client";
import { Chip, Logo, btnGhost, btnPrimary, inputCls, Card } from "@/components/ui";
import LinkHint from "@/components/LinkHint";
import { CAPS } from "@/lib/plans";

export interface LibNote {
  id: string; title: string; updated_at: number; words: number; private: number; mode: string; snippet: string | null;
  notebook_id: string; notebook: string; error: number; question: number; direction: number; pinned: boolean;
}
interface Props {
  user: { name: string; email: string };
  notebooks: { id: string; name: string; is_journal: number }[];
  notes: LibNote[];
  used: { margin: number; visuals: number };
}

export default function LibraryClient({ user, notebooks, notes, used }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [lib, setLib] = useState<"all" | "recent" | "pinned">("all");
  const [nbFilter, setNbFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<"recent" | "az">("recent");
  const [busy, startBusy] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // SP1: single fair-use tier (caps live in CAPS)
  const tier = { label: "Free", notesMonth: CAPS.notesMonth };
  const filtered = useMemo(() => {
    let list = notes;
    if (nbFilter) list = list.filter((n) => n.notebook_id === nbFilter);
    if (lib === "recent") list = list.filter((n) => Date.now() - n.updated_at < 7 * 86400000);
    if (lib === "pinned") list = list.filter((n) => n.pinned);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((n) => n.title.toLowerCase().includes(s) || n.notebook.toLowerCase().includes(s) || (n.snippet || "").toLowerCase().includes(s));
    }
    return [...list].sort((a, b) => (sort === "recent" ? b.updated_at - a.updated_at : a.title.localeCompare(b.title)));
  }, [notes, q, lib, nbFilter, sort]);
  const hero = filtered[0];
  const rest = filtered.slice(1);

  function newNote() {
    startBusy(async () => {
      try {
        const r = await api<{ id: string }>("/api/notes", { method: "POST", body: JSON.stringify(nbFilter ? { notebookId: nbFilter } : {}) });
        router.push(`/notes/${r.id}`);
      } catch (x: unknown) {
        setErr(x instanceof Error ? x.message : "Could not create the note. Try again.");
      }
    });
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-[1330px] items-center gap-4 px-5">
          <Link href="/notes"><Logo /></Link>
          <div className="mx-auto w-full max-w-[440px]">
            <input className={inputCls + " h-10"} placeholder="Search notes, tags and notebooks" aria-label="Search notes, tags and notebooks" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/account" className={btnGhost}>Settings</Link>
            <button onClick={newNote} disabled={busy} className={btnPrimary + " !h-10" + (busy ? " busy-pulse" : "")}>New note</button>
          </div>
        </div>
      </header>
      {err && <div className="border-b border-line bg-amber-50 px-5 py-2 text-center text-[13px] font-semibold text-amber-700">{err}</div>}

      <div className="mx-auto grid max-w-[1330px] gap-8 px-5 py-7 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* rail */}
        <aside>
          <div className="text-[11.5px] font-bold tracking-[0.14em] text-muted">LIBRARY</div>
          {([["all", "All notes"], ["recent", "Recent"], ["pinned", "Pinned"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setLib(k)}
              className={`mt-1 block w-full rounded-lg px-3 py-2 text-left text-[14.5px] ${lib === k ? "bg-line font-bold text-ink" : "text-ink-soft hover:bg-paper-soft"}`}
            >
              {label}
            </button>
          ))}
          <div className="mt-6 text-[11.5px] font-bold tracking-[0.14em] text-muted">NOTEBOOKS</div>
          {notebooks.map((nb) => (
            <button
              key={nb.id}
              onClick={() => setNbFilter(nbFilter === nb.id ? null : nb.id)}
              className={`flex w-full items-baseline justify-between rounded-lg px-3 py-2 text-left text-[14.5px] ${
                nbFilter === nb.id ? "bg-line font-bold text-ink" : "text-ink-soft hover:bg-paper-soft"
              }`}
            >
              <span>{nb.name}</span>
              {!!nb.is_journal && <span className="text-[12.5px] text-muted">Private</span>}
            </button>
          ))}

          <Card className="mt-10 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-bold text-ink">AI notes</span>
              <span className="text-[12.5px] font-semibold text-muted">this month</span>
            </div>
            <div className="mt-2.5 h-[7px] overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (used.margin / tier.notesMonth) * 100)}%` }} />
            </div>
            <div className="mt-2 text-[12.5px] text-ink-soft">{used.margin} of {tier.notesMonth} used</div>
          </Card>
        </aside>

        {/* main */}
        <main>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="font-serif text-[42px] font-medium leading-tight text-ink">Your notes</h1>
              <p className="mt-1 text-[14.5px] text-ink-soft">Pick up where your thinking left off.</p>
            </div>
            <div className="flex rounded-xl bg-line p-1">
              {(["recent", "az"] as const).map((k) => (
                <button key={k} onClick={() => setSort(k)} className={`h-9 rounded-[8px] px-4 text-[13.5px] font-bold ${sort === k ? "bg-card text-ink shadow-sm" : "text-ink-soft"}`}>
                  {k === "recent" ? "Recent" : "A to Z"}
                </button>
              ))}
            </div>
          </div>

          {hero && (
            <Link href={`/notes/${hero.id}`} className="mt-6 block rounded-2xl border border-line bg-card p-6 shadow-sm hover:border-ink-soft/30">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="text-[11.5px] font-bold tracking-[0.12em] text-muted">CONTINUE WRITING</div>
                  <div className="mt-1.5 font-serif text-[30px] font-medium text-ink">{hero.title}</div>
                  <div className="mt-1 text-[13.5px] text-muted"><span>{hero.notebook} · edited {timeAgo(hero.updated_at)}</span><LinkHint /></div>
                  <div className="mt-3 truncate font-serif text-[15.5px] text-ink-soft">
                    {hero.private ? "Private entry — preview hidden." : hero.snippet || ""}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {!!hero.error && <Chip kind="error">1 error flag</Chip>}
                  {!!hero.question && <Chip kind="question">{hero.question} question{hero.question > 1 ? "s" : ""}</Chip>}
                  {!!hero.direction && <Chip kind="direction">{hero.direction} next step</Chip>}
                </div>
              </div>
            </Link>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {rest.map((n) => (
              <Link key={n.id} href={`/notes/${n.id}`} className="rounded-2xl border border-line bg-card p-5 hover:border-ink-soft/30">
                <div className="text-[12.5px] font-semibold text-muted">{n.private ? "Journal, private" : n.notebook}</div>
                {n.private ? (
                  <>
                    <div className="mt-1 flex items-center gap-1.5 font-serif text-[22px] font-medium text-ink">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="var(--muted)"/><path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" stroke="var(--muted)"/></svg>
                      {n.title}
                    </div>
                    <p className="mt-2 text-[14px] text-ink-soft">Private entry. The preview is hidden and Ask mode is the default here.</p>
                  </>
                ) : (
                  <>
                    <div className="mt-1 font-serif text-[22px] font-medium leading-snug text-ink">{n.title}</div>
                    <div className="mt-1 line-clamp-3 font-serif text-[15px] leading-relaxed text-ink-soft">{n.snippet || ""}</div>
                  </>
                )}
                <div className="mt-4 flex items-center justify-between text-[12.5px] text-muted">
                  <span>{timeAgo(n.updated_at)}</span>
                  <span>{countOf(n)}</span>
                </div>
              </Link>
            ))}
            {!filtered.length && !q && (
              <Card className="p-6">
                <div className="text-[15px] font-bold text-ink">Nothing here yet</div>
                <p className="mt-1.5 text-[13.5px] text-ink-soft">Start with one rough paragraph — Marginalia answers in the margin, never in the body.</p>
                <button onClick={newNote} className={btnPrimary + " mt-4"}>New note</button>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function countOf(n: LibNote) {
  const t = (n.error || 0) + (n.question || 0) + (n.direction || 0);
  return t ? `${t} margin note${t > 1 ? "s" : ""}` : "No margin notes yet";
}
