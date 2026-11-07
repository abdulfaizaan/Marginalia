"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { btnGhost } from "@/components/ui";
import type { NotebookLite, VisualLite } from "./types";

export default function SideRail({ noteId, notebooks, visuals }: { noteId: string; notebooks: NotebookLite[]; visuals: VisualLite[] }) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();

  function newNote() {
    startBusy(async () => {
      const r = await api<{ id: string }>("/api/notes", { method: "POST", body: JSON.stringify({}) });
      router.push(`/notes/${r.id}`);
    });
  }

  const pins = visuals.map((v) => {
    try { return { id: v.id, title: (JSON.parse(v.spec) as { title?: string }).title || "Visual" }; } catch { return { id: v.id, title: "Visual" }; }
  });

  return (
    <aside className="flex w-[230px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-paper px-4 py-5 max-lg:hidden">
      <Link href="/notes" className="text-[13.5px] font-semibold text-ink-soft hover:text-ink">← Library</Link>

      <button onClick={newNote} disabled={busy} className={btnGhost + " w-full text-[13.5px]"}>+ New note</button>

      <div>
        <div className="mb-1.5 text-[11px] font-bold tracking-[0.14em] text-muted">NOTEBOOKS</div>
        {notebooks.map((nb) => (
          <div key={nb.id} className="flex items-baseline justify-between rounded-lg px-2 py-1.5 text-[13.5px] text-ink-soft">
            <span className="truncate">{nb.name}</span>
            {!!nb.is_journal && <span className="pl-1 text-[11.5px] text-muted">Private</span>}
          </div>
        ))}
      </div>

      {pins.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-bold tracking-[0.14em] text-muted">PINNED VISUALS</div>
          {pins.map((p) => (
            <Link key={p.id} href={`/notes/${noteId}/visual`}>
              <div className="rounded-lg border border-line bg-card px-2.5 py-2 text-[12.5px] font-semibold text-ink-soft hover:border-ink-soft/40">{p.title}</div>
            </Link>
          ))}
        </div>
      )}

      <Link href={`/notes/${noteId}/options`} className="mt-auto text-[12.5px] font-semibold text-muted hover:text-ink">
        Page options & export
      </Link>
    </aside>
  );
}
