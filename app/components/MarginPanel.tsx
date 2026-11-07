"use client";

import { useState, useTransition, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Chip, btnBlueMini, btnMini, inputCls, Card } from "@/components/ui";
import type { MarginRowLite } from "./types";

export function chipLabel(t: string): string {
  const map: Record<string, string> = {
    error: "Error flag", question: "Question", challenge: "Challenge",
    direction: "Next step", hint: "Hint", answer: "Answer",
  };
  return map[t] || t;
}

interface Props {
  noteId: string;
  margins: MarginRowLite[];
  setMargins: Dispatch<SetStateAction<MarginRowLite[]>>;
  replyTo: string | null;
  setReplyTo: Dispatch<SetStateAction<string | null>>;
  capped: string | null;
  double: boolean;
  addAsk: (user: string, assistant: string, kind: string, level: number) => void;
  goAsk: () => void;
}

export default function MarginPanel({ noteId, margins, setMargins, replyTo, setReplyTo, capped, double: cols, addAsk, goAsk }: Props) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, startBusy] = useTransition();

  function act(marginId: string, action: "rate" | "rate_down" | "dismiss" | "pin" | "unpin") {
    setMargins((ms) =>
      ms.map((m) =>
        m.id === marginId
          ? {
              ...m,
              status: action === "dismiss" ? "dismissed" : action === "pin" ? "pinned" : action === "unpin" ? "open" : m.status,
              rating: action === "rate" ? 1 : action === "rate_down" ? -1 : m.rating,
            }
          : m
      )
    );
    if (action === "unpin") return; // pin toggles back to open instantly — one POST is enough
    startBusy(async () => {
      await api(`/api/notes/${noteId}/margins`, {
        method: "POST",
        body: JSON.stringify(action.startsWith("rate") ? { action: "rate", marginId, rating: action === "rate" ? 1 : -1 } : { action, marginId }),
      });
    });
  }

  const visible = margins.filter((m) => m.status === "open" || m.status === "pinned");
  const ordered = [...visible].sort((a, b) =>
    (a.status === "pinned" ? 0 : 1) - (b.status === "pinned" ? 0 : 1) || a.num - b.num
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = reply.trim();
    if (!body) return;
    const to = replyTo;
    setReply("");
    if (to) {
      setReplyTo(null);
      startBusy(async () => {
        const r = await api<{ reply: string }>(`/api/notes/${noteId}/margins`, {
          method: "POST", body: JSON.stringify({ action: "reply", marginId: to, body }),
        });
        setMargins((ms) => ms.map((m) => (m.id === to ? { ...m, reply: r.reply } : m)));
      });
    } else {
      startBusy(async () => {
        const r = await api<{ asked: { user: string; assistant: string; kind: string; level: number } }>(`/api/notes/${noteId}/margins`, {
          method: "POST", body: JSON.stringify({ action: "reply", body }),
        });
        if (r.asked) {
          addAsk(r.asked.user, r.asked.assistant, r.asked.kind, r.asked.level);
          goAsk();
        }
      });
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-line bg-paper-soft">
      <div className="flex items-baseline justify-between px-5 pt-5">
        <span className="text-[11.5px] font-bold tracking-[0.16em] text-muted">MARGIN</span>
        <span className="text-[12px] text-muted">{visible.length} note{visible.length === 1 ? "" : "s"}</span>
      </div>

      {capped && (
        <div className="mx-5 mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-amber-800">
          {capped} <Link href="/pricing" className="underline">See plans</Link>
        </div>
      )}

      <div className={`mt-3 flex-1 space-y-3 overflow-y-auto px-4 pb-3 ${cols ? "columns-2 gap-3" : ""}`}>
        {ordered.map((m) => (
          <MarginCard key={m.id} m={m} noteId={noteId} act={act} busy={busy} setReplyTo={setReplyTo} replyTo={replyTo} setMargins={setMargins} router={router} />
        ))}
        {!ordered.length && (
          <p className="px-1 pt-2 text-[13px] leading-relaxed text-muted">
            Marginalia speaks only after you pause. It asks and points; it never writes your note.
          </p>
        )}
      </div>

      <div className="px-5 pb-5">
        {replyTo && (
          <div className="mb-1.5 text-[12px] text-accent">
            Replying to note {visible.find((m) => m.id === replyTo)?.num ?? ""} ·{" "}
            <button onClick={() => setReplyTo(null)} className="underline">cancel</button>
          </div>
        )}
        <form onSubmit={send}>
          <input
            className={inputCls + " py-2.5 text-[13.5px]"}
            placeholder={replyTo ? "Answer this note…" : "Ask about a line, or answer a note"}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
        </form>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">AI never writes into your body text uninvited.</p>
      </div>
    </div>
  );
}

function MarginCard({ m, noteId, act, busy, setReplyTo, replyTo, setMargins, router }: {
  m: MarginRowLite; noteId: string; act: (id: string, a: "rate" | "rate_down" | "dismiss" | "pin" | "unpin") => void; busy: boolean;
  setReplyTo: Dispatch<SetStateAction<string | null>>; replyTo: string | null;
  setMargins: Dispatch<SetStateAction<MarginRowLite[]>>; router: ReturnType<typeof useRouter>;
}) {
  const [conv, setConv] = useState(false);
  const gridSel = /([A-Za-z]{2,6})\s+against\s+([A-Za-z]{2,6})/.exec(m.body)?.[0] || "";

  async function convert() {
    setConv(true);
    try {
      const r = await api<{ doc: unknown }>(`/api/notes/${noteId}/margins`, {
        method: "POST", body: JSON.stringify({ action: "convert", marginId: m.id }),
      });
      setMargins((ms) => ms.filter((x) => x.id !== m.id));
      window.dispatchEvent(new CustomEvent("mg-doc-replace", { detail: r.doc }));
      router.refresh();
    } finally { setConv(false); }
  }

  return (
    <Card className={`mb-3 break-inside-avoid p-3.5 ${m.status === "pinned" ? "border-accent/60" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">{m.num}</span>
        <Chip kind={m.type} small>{chipLabel(m.type)}</Chip>
        {m.status === "pinned" && <span className="ml-auto text-[11px] font-semibold text-accent">Pinned</span>}
      </div>
      <p className="mt-2 font-serif text-[14.5px] leading-relaxed text-ink">{m.body}</p>
      {m.reply && (
        <div className="mt-2 space-y-1 border-t border-line pt-2">
          {m.reply.split("\n").map((line, i) => (
            <p key={i} className="text-[13px] font-semibold text-ink-soft">{line}</p>
          ))}
        </div>
      )}
      {m.want_visual ? (
        <div className="mt-3 flex gap-2">
          <Link href={`/notes/${noteId}/visual${gridSel ? `?sel=${encodeURIComponent(gridSel)}` : ""}`} className={btnBlueMini}>Show the grid</Link>
          <button onClick={() => act(m.id, "dismiss")} className={btnMini}>Not now</button>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-2.5 text-[12.5px] font-semibold text-accent">
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => setReplyTo(replyTo === m.id ? null : m.id)} className="hover:underline">Reply</button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => act(m.id, m.status === "pinned" ? "unpin" : "pin")} className="text-ink-soft hover:underline">
            {m.status === "pinned" ? "Unpin" : "Pin"}
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={convert} disabled={busy || conv} className="text-ink-soft hover:underline disabled:opacity-50">Turn into thread</button>
          <span className="ml-auto flex items-center gap-1.5">
            <button aria-label="Helpful" disabled={busy} onClick={() => act(m.id, "rate")} className={m.rating === 1 ? "" : "opacity-70"}>👍</button>
            <button aria-label="Not helpful" disabled={busy} onClick={() => act(m.id, "rate_down")} className={m.rating === -1 ? "" : "opacity-70"}>👎</button>
            <button disabled={busy} onClick={() => act(m.id, "dismiss")} className="text-muted hover:underline">Dismiss</button>
          </span>
        </div>
      )}
    </Card>
  );
}
