"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImageExt from "@tiptap/extension-image";
import { EditorContent, useEditor, type Editor as TEditor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { idAttr, markerKey, markers } from "./markerSetup";
import MarginPanel from "./MarginPanel";
import AskPanel from "./AskPanel";
import SideRail from "./SideRail";
import { btnGhost, btnMini } from "@/components/ui";
import { api, docText, docUserWords } from "@/lib/client";
import type { AskMsgLite, MarginRowLite, NotebookLite, VisualLite } from "./types";
import type { Doc } from "@/lib/exporters";

export interface EditorSettings {
  pace: "slow" | "normal" | "frequent"; strictness: string;
  margins: "single" | "double"; focus: boolean; font: string; size: number;
}
export interface EditorNote {
  id: string; title: string; mode: "think" | "ask"; doc: Doc; private: boolean; notebook: string;
  settings: EditorSettings;
}

const PACE_MS = { slow: 12_000, normal: 6_000, frequent: 3_000 } as const;
const SIZE_PX = [15, 16.5, 18, 20];
const FONT_MAP: Record<string, string> = {
  serif: '"Newsreader", Georgia, serif',
  sans: "Inter, system-ui, sans-serif",
  mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
};

interface Props {
  note: EditorNote;
  margins0: MarginRowLite[];
  ask0: AskMsgLite[];
  visuals: VisualLite[];
  notebooks: NotebookLite[];
}

export default function Editor({ note, margins0, ask0, visuals, notebooks }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(note.title);
  const [save, setSave] = useState<"saved" | "saving" | "unsaved">("saved");
  const [margins, setMargins] = useState<MarginRowLite[]>(margins0);
  const [ask, setAsk] = useState<AskMsgLite[]>(ask0);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [rail, setRail] = useState<"margin" | "ask">(note.mode === "ask" ? "ask" : "margin");
  const [mode, setMode] = useState<"think" | "ask">(note.mode);
  const [pace, setPace] = useState<EditorSettings["pace"]>(note.settings.pace);
  const [capped, setCapped] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ x: number; y: number; text: string } | null>(null);

  const focus = note.settings.focus;
  const doubleM = note.settings.margins === "double";
  const fontPx = SIZE_PX[note.settings.size] ?? 16.5;

  // refs so timers never see stale values
  const texts = useRef<Map<string, string>>(new Map());
  const modeRef = useRef(mode); modeRef.current = mode;
  const paceRef = useRef(pace); paceRef.current = pace;
  const probeRef = useRef(probe); probeRef.current = probe;
  const titleRef = useRef(title); titleRef.current = title;
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkT = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** text content per block id — diffing this yields changedIds for the AI */
  function blkMap(ed: TEditor) {
    const out = new Map<string, string>();
    ed.state.doc.descendants((n) => {
      if ((n.type.name === "paragraph" || n.type.name === "heading") && n.attrs?.id) {
        out.set(n.attrs.id as string, n.textContent);
      }
      return true;
    });
    return out;
  }

  /** New paragraphs have no id — assign one so margin anchors can attach. */
  function ensureIds(ed: TEditor, noteId: string) {
    const tr = ed.state.tr;
    let dirty = false;
    ed.state.doc.descendants((n, pos) => {
      if ((n.type.name === "paragraph" || n.type.name === "heading") && !n.attrs?.id) {
        tr.setNodeAttribute(pos, "id", `${noteId.slice(0, 8)}-u${Math.random().toString(36).slice(2, 8)}`);
        dirty = true;
        return false; // ponytail: ids are random per paragraph; block moves remap — visible only as a re-evaluation
      }
      return true;
    });
    if (dirty) ed.view.dispatch(tr);
  }

  const editorRef = useRef<TEditor | null>(null);

  const scheduleSave = useCallback((ed: TEditor, titleOverride?: string) => {
    setSave("unsaved");
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      setSave("saving");
      api(`/api/notes/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: titleOverride ?? titleRef.current,
          doc: ed.getJSON(),
          text: docText(ed.getJSON() as never),
          mode: modeRef.current,
        }),
      })
        .then(() => {
          texts.current = blkMap(ed);
          setSave("saved");
        })
        .catch(() => setSave("unsaved"));
    }, 900);
  }, [note.id]);

  const scheduleThink = useCallback(() => {
    if (thinkT.current) clearTimeout(thinkT.current);
    thinkT.current = setTimeout(evaluate, PACE_MS[paceRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const evaluate = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed || modeRef.current !== "think" || note.private) return;
    const blocks: { id: string; text: string }[] = [];
    ed.state.doc.descendants((n) => {
      if ((n.type.name === "paragraph" || n.type.name === "heading") && n.attrs?.id) {
        blocks.push({ id: n.attrs.id as string, text: n.textContent });
      }
      return true;
    });
    const changedIds = blocks.filter((b) => texts.current.get(b.id) !== b.text).map((b) => b.id);
    if (!changedIds.length) return;
    try {
      const r = await api<{ notes?: MarginRowLite[]; capped?: boolean; error?: string }>(`/api/notes/${note.id}/margins`, {
        method: "POST",
        body: JSON.stringify({ action: "evaluate", blocks, changedIds, pace: paceRef.current }),
      });
      if (r.capped) { setCapped(r.error || "Your monthly margin notes are used up."); return; }
      if (r.notes?.length) setMargins((ms) => [...ms, ...r.notes!]);
    } catch (x: unknown) {
      // api() throws on 429 with the server's cap message — surface it in the margin rail
      setCapped(x instanceof Error ? x.message : "Could not reach Marginalia — try the next pause.");
    }
  }, [note.id, note.private]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        ImageExt,
        Placeholder.configure({
          placeholder: "Start writing — Marginalia speaks in the margin, only after you pause.",
        }),
        idAttr,
        markers,
      ],
      content: note.doc as never,
      immediatelyRender: false,
      editorProps: { attributes: { class: "mg-doc" } },
      onCreate: ({ editor: ed }) => { editorRef.current = ed; ensureIds(ed, note.id); texts.current = blkMap(ed); },
      onUpdate: ({ editor: ed }) => {
        editorRef.current = ed;
        ensureIds(ed, note.id);
        scheduleSave(ed);
        scheduleThink();
      },
    },
    [note.id]
  );
  if (editor && editorRef.current !== editor) editorRef.current = editor;

  // margin number chips (decorations) follow the margin list
  useEffect(() => {
    if (!editor) return;
    const map = new Map<string, number[]>();
    for (const m of margins) {
      if (m.status === "dismissed" || !m.anchor) continue;
      const arr = map.get(m.anchor) || [];
      arr.push(m.num);
      map.set(m.anchor, arr);
    }
    editor.view.dispatch(editor.state.tr.setMeta(markerKey, map));
  }, [editor, margins]);

  // convert-to-thread / version restore push the new doc in
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent).detail as Doc;
      const ed = editorRef.current;
      if (!ed) return;
      ed.commands.setContent(detail as never);
      texts.current = blkMap(ed);
    };
    window.addEventListener("mg-doc-replace", h);
    return () => window.removeEventListener("mg-doc-replace", h);
  }, []);

  // floating "Probe this" on selection
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty || to - from < 6) { setProbe(null); return; }
      const text = editor.state.doc.textBetween(from, to, " ");
      const coords = editor.view.coordsAtPos(from);
      setProbe({ x: coords.left, y: coords.bottom, text: text.slice(0, 600) });
    };
    editor.on("selectionUpdate", update);
    return () => { editor.off("selectionUpdate", update); };
  }, [editor]);

  const doProbe = useCallback(async () => {
    const sel = probeRef.current?.text;
    setProbe(null);
    if (!sel) return;
    setRail("ask");
    try {
      const r = await api<{ body: string; kind: string; level?: number }>("/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ noteId: note.id, kind: "probe", selection: sel }),
      });
      const now = Date.now();
      setAsk((ms) => [
        ...ms,
        { id: "u" + now, role: "user", body: `Probe: ${sel}`, kind: "nudge", level: 0, created_at: now },
        { id: "a" + now, role: "assistant", body: r.body, kind: r.kind, level: r.level || 0, created_at: now },
      ]);
    } catch { /* surfaced by rail state on next refresh */ }
  }, [note.id]);

  // Ctrl+Shift+P probe · Ctrl+/ toggle rail
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p")) { e.preventDefault(); void doProbe(); }
      if (e.ctrlKey && e.key === "/") { e.preventDefault(); setRail((r) => (r === "ask" ? "margin" : "ask")); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [doProbe]);

  function toggleMode(m: "think" | "ask") {
    if (m === mode) return;
    setMode(m);
    setRail(m === "ask" ? "ask" : "margin");
    api(`/api/notes/${note.id}`, { method: "PATCH", body: JSON.stringify({ mode: m }) }).catch(() => {});
  }

  function cyclePace() {
    const next = ({ slow: "normal", normal: "frequent", frequent: "slow" } as const)[pace];
    setPace(next);
    api(`/api/notes/${note.id}`, { method: "PATCH", body: JSON.stringify({ settings: { pace: next } }) }).catch(() => {});
  }

  function addAsk(user: string, assistant: string, kind: string, level: number) {
    const now = Date.now();
    setAsk((ms) => [
      ...ms,
      { id: "u" + now, role: "user", body: user, kind: "nudge", level: 0, created_at: now },
      { id: "a" + now, role: "assistant", body: assistant, kind, level, created_at: now },
    ]);
  }

  const goAsk = useCallback(() => setRail("ask"), []);

  // original-thought ratio from the live doc (user words / all words)
  const userW = editor ? docUserWords(editor.getJSON() as never) : 0;
  const totalW = editor ? docText(editor.getJSON() as never).split(/\s+/).filter(Boolean).length : 0;
  const origPct = totalW ? Math.round((userW / totalW) * 100) : 100;

  const modeHint =
    mode === "think"
      ? `Think with You — AI reads along, speaks after ${PACE_MS[pace] / 1000}s quiet`
      : "Ask mode — AI answers only when asked (select a line, or open Ask)";

  return (
    <div className={`grid min-h-dvh ${focus ? "" : "lg:grid-cols-[230px,minmax(0,1fr),380px]"}`}>
      {!focus && <SideRail noteId={note.id} notebooks={notebooks} visuals={visuals} />}

      <div className="flex min-w-0 flex-col border-r border-line bg-paper">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
          {focus ? (
            <button
              onClick={() =>
                api(`/api/notes/${note.id}`, { method: "PATCH", body: JSON.stringify({ settings: { focus: false } }) })
                  .then(() => router.refresh())
              }
              className={btnGhost + " !h-8"}
            >
              Exit focus
            </button>
          ) : (
            <>
              <Link href="/notes" className="text-[13px] font-semibold text-ink-soft hover:text-ink max-lg:hidden">← Library</Link>
              <span className="text-[12px] text-muted max-lg:hidden">{note.notebook}</span>
            </>
          )}
          <input
            className="min-w-0 flex-1 bg-transparent font-serif text-[20px] font-semibold text-ink outline-none"
            value={title}
            onChange={(e) => {
              titleRef.current = e.target.value;
              setTitle(e.target.value);
              if (editorRef.current) scheduleSave(editorRef.current, e.target.value);
            }}
          />
          {mode !== "think" && <span className="text-[12px] text-muted max-lg:hidden">{mode === "ask" ? "Ask" : ""}</span>}
          <div className="flex rounded-[10px] bg-[#e4e8ef] p-1">
            {(["think", "ask"] as const).map((m) => (
              <button key={m} onClick={() => toggleMode(m)} className={`h-8 rounded-[8px] px-3 text-[12.5px] font-bold ${mode === m ? "bg-card text-ink shadow-sm" : "text-ink-soft"}`}>
                {m === "think" ? "Think with You" : "Ask"}
              </button>
            ))}
          </div>
          <Link href={`/notes/${note.id}/options`} className={btnGhost + " !h-8 !px-2.5"} title="Page options">Aa</Link>
        </header>

        {mode === "think" && !note.private && (
          <div className="shrink-0 bg-accent-soft px-4 py-2 text-[12.5px] font-semibold text-accent">
            Think with You — keep writing; Marginalia speaks in the margin. Explicit help lives one click away.
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-[720px]" style={{ fontFamily: FONT_MAP[note.settings.font] || FONT_MAP.serif, fontSize: fontPx }}>
            {editor && <EditorContent editor={editor} />}
          </div>
        </div>

        <footer className="flex h-10 shrink-0 items-center gap-4 border-t border-line bg-paper px-4 text-[12px] text-muted">
          <span className="truncate">{modeHint}</span>
          <button onClick={cyclePace} className={btnMini + " !h-6 !px-2 !text-[11px]"} title="AI speaking pace">
            {pace === "slow" ? "Slow" : pace === "normal" ? "Normal" : "Frequent"}
          </button>
          <span>Original thought {origPct}% of this page</span>
          <span className="ml-auto font-semibold">{save === "saved" ? "Saved" : save === "saving" ? "Saving…" : "Unsaved changes"}</span>
        </footer>
      </div>

      {!focus && (
        <aside className="min-w-0 max-lg:hidden">
          {rail === "margin" ? (
            <MarginPanel
              noteId={note.id}
              margins={margins}
              setMargins={setMargins}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              capped={capped}
              double={doubleM}
              addAsk={addAsk}
              goAsk={goAsk}
            />
          ) : (
            <AskPanel noteId={note.id} msgs={ask} setMsgs={setAsk} journal={note.private} />
          )}
        </aside>
      )}

      {probe && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void doProbe()}
          className="fixed z-50 rounded-lg bg-btn-dark px-3 py-1.5 text-[12.5px] font-bold text-white shadow-lg"
          style={{ left: Math.min(probe.x, (typeof window !== "undefined" ? window.innerWidth - 120 : 600)), top: probe.y + 6 }}
        >
          Probe this
        </button>
      )}
    </div>
  );
}
