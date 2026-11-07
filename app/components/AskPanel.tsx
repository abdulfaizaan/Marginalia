"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Chip, btnGhost, inputCls } from "@/components/ui";
import { chipLabel } from "./MarginPanel";
import type { AskMsgLite } from "./types";

const LADDER_HINT = "The ladder: 1 · a nudge — 2 · the idea to reach for — 3 · one worked step — 4 · the full answer (on request).";

export default function AskPanel({ noteId, msgs, setMsgs, journal }: {
  noteId: string; msgs: AskMsgLite[]; setMsgs: Dispatch<SetStateAction<AskMsgLite[]>>; journal: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [level, setLevel] = useState(() => Math.max(1, ...msgs.filter((m) => m.role === "assistant").map((m) => m.level || 1), 1));
  const [answered, setAnswered] = useState(() => msgs.some((m) => m.kind === "answer"));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  function push(user: string, assistant: string, kind: string, lv: number) {
    const now = Date.now();
    setMsgs((ms) => [
      ...ms,
      { id: "u" + now, role: "user", body: user, kind: "nudge", level: 0, created_at: now },
      { id: "a" + now, role: "assistant", body: assistant, kind, level: lv, created_at: now },
    ]);
  }

  async function talk(body: string, hintLevel?: number) {
    if (!body.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await api<{ body: string; kind: string; level?: number }>(" /api/ai/ask".trim(), {
        method: "POST",
        body: JSON.stringify({ noteId, kind: journal ? "journal" : "chat", message: body, hintLevel }),
      });
      push(body, r.body, r.kind, r.level || 0);
      if (r.kind === "answer") setAnswered(true);
      if (r.level) setLevel(r.level);
      router.refresh(); // keep server-rendered transcript in sync for reloads
    } catch (x: unknown) {
      setErr(x instanceof Error ? x.message : "Ask failed.");
    } finally { setBusy(false); }
  }

  const canLadder = !journal && !answered;

  return (
    <div className="flex h-full flex-col border-l border-line bg-paper-soft">
      <div className="flex items-baseline justify-between px-5 pt-5">
        <span className="text-[11.5px] font-bold tracking-[0.16em] text-muted">{journal ? "ASK MARGINALIA · JOURNAL" : "ASK MARGINALIA"}</span>
        {!journal && <span className="text-[12px] text-muted">Hint {Math.min(level, 3)} of 3</span>}
      </div>

      <div ref={listRef} aria-live="polite" className="mt-3 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {msgs.map((m) => (
          m.role === "user" ? (
            <p key={m.id} className="ml-8 rounded-xl rounded-br-sm bg-accent-soft px-3.5 py-2.5 text-[14px] text-ink">{m.body}</p>
          ) : (
            <div key={m.id} className="rounded-xl border border-line bg-card p-3.5">
              <Chip kind={m.kind} small>{chipLabel(m.kind)}</Chip>
              <p className="mt-1.5 font-serif text-[14.5px] leading-relaxed text-ink">{m.body}</p>
              {m.kind === "care" && (
                <p className="mt-2 text-[11.5px] font-semibold text-muted">Marginalia is a journaling companion, not a crisis service.</p>
              )}
            </div>
          )
        ))}
        {!msgs.length && (
          <p className="px-1 pt-2 text-[13px] leading-relaxed text-muted">
            {journal ? "Write in your entry, then ask for perspective — reflectively, when you want it." : "Stuck on something? Ask, and work the ladder rung by rung."}
          </p>
        )}
      </div>

      {canLadder && (
        <div className="space-y-2 px-5 pb-2">
          <button onClick={() => talk("Another hint", level)} disabled={busy} className={btnGhost + " w-full !h-9 text-[13px]"}>
            Another hint
          </button>
          <button
            onClick={() => talk("Just give me the full answer", Math.max(level, 3))}
            disabled={busy}
            className={btnGhost + " w-full !h-9 text-[13px] font-semibold"}
          >
            Give me the full answer
          </button>
          <p className="text-[11px] leading-relaxed text-muted">{LADDER_HINT}</p>
        </div>
      )}

      {err && <div className="mx-5 mb-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-800">{err}</div>}

      <form
        onSubmit={(e) => { e.preventDefault(); const t = text; setText(""); talk(t); }}
        className="px-5 pb-5"
      >
        <input
          className={inputCls + " py-2.5 text-[13.5px]"}
          placeholder={journal ? "Ask for a perspective…" : "Stuck? Ask for a hint"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </form>
    </div>
  );
}
