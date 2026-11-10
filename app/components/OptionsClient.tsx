"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setTheme, timeAgo } from "@/lib/client";
import { Card, Checkbox, RadioRow, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import LinkHint from "@/components/LinkHint";
interface Props {
  noteId: string;
  settings: { pace: string; strictness: string; margins: string; focus: boolean; font: string; size: number; theme: string };
  versions: { id: string; words: number; created_at: number }[];
  retentionDays: number;
}

export default function OptionsClient({ noteId, settings, versions, retentionDays }: Props) {
  const router = useRouter();
  const [pace, setPace] = useState(settings.pace);
  const [strictness, setStrictness] = useState(settings.strictness);
  const [margins, setMargins] = useState(settings.margins);
  const [focus, setFocus] = useState(settings.focus);
  const [font, setFont] = useState(settings.font);
  const [size, setSize] = useState(settings.size);
  const [theme, setThemeLocal] = useState(settings.theme);

  const [fmt, setFmt] = useState<"md" | "word" | "pdf">("md");
  const [hideAi, setHideAi] = useState(false);
  const [foot, setFoot] = useState(true);

  function save(patch: Record<string, unknown>) {
    api(`/api/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ settings: patch }) }).catch(() => {});
  }

  function applyTheme(t: string) {
    setThemeLocal(t);
    if (t === "dark") setTheme(true);
    else if (t === "light") setTheme(false);
    else { try { localStorage.removeItem("mg-theme"); } catch { /* private mode */ } document.documentElement.classList.remove("dark"); }
    api("/api/account", { method: "POST", body: JSON.stringify({ action: "theme", theme: t }) }).catch(() => {});
  }

  const exportHref = fmt === "pdf"
    ? `/api/notes/${noteId}/export?fmt=print&ai=${hideAi ? "hide" : "include"}&foot=${foot ? 1 : 0}`
    : `/api/notes/${noteId}/export?fmt=${fmt}&ai=${hideAi ? "hide" : "include"}&foot=${foot ? 1 : 0}`;

  const [restoreErr, setRestoreErr] = useState<string | null>(null);

  async function restore(versionId: string) {
    // destructive-feeling action: the current state is snapshotted server-side first, but warn anyway
    if (!confirm("Restore this version? The current text is saved into history first, but this replaces what's on the note.")) return;
    try {
      await api(`/api/notes/${noteId}/versions`, { method: "POST", body: JSON.stringify({ versionId }) });
      router.push(`/notes/${noteId}`);
    } catch (x: unknown) {
      setRestoreErr(x instanceof Error ? x.message : "Could not restore this version. Try again.");
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-[900px] items-center gap-4 px-5">
          <Link href={`/notes/${noteId}`} className="text-[13.5px] font-semibold text-ink-soft hover:text-ink">← Back to note<LinkHint /></Link>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-5 pb-16 pt-8">
        <div className="flex flex-wrap gap-4">
          {/* AI pacing */}
          <Card className="min-w-[300px] flex-1 p-5">
            <h2 className="font-serif text-[24px] font-medium text-ink">AI pacing</h2>
            <div className="mt-4">
              {([
                ["slow", "Slow", "Only after long pauses. Roughly one note per sitting."],
                ["normal", "Normal", "A note changes; the margin answers when you settle."],
                ["frequent", "Frequent", "Quick reactions while drafting. Great for think-aloud sessions."],
              ] as const).map(([v, t, s]) => (
                <RadioRow key={v} title={t} sub={s} checked={pace === v} first onChange={() => { setPace(v); save({ pace: v }); }} />
              ))}
            </div>

            <h3 className="mt-6 text-[15px] font-bold text-ink">Hint strictness</h3>
            <div className="mt-3">
              {([
                ["balanced", "Balanced", "Hints first; the full answer once you have walked the rungs."],
                ["strict", "Strict", "Questions only. No answers, ever, in this notebook."],
                ["direct", "Direct", "Full answers on request — the direct lane."],
              ] as const).map(([v, t, s]) => (
                <RadioRow
                  key={v}
                  title={t}
                  sub={s}
                  checked={strictness === v}
                  onChange={() => { setStrictness(v); save({ strictness: v }); }}
                />
              ))}
            </div>
          </Card>

          {/* Layout */}
          <Card className="min-w-[300px] flex-1 p-5">
            <h2 className="font-serif text-[24px] font-medium text-ink">Layout</h2>
            <label className="mt-4 block">
              <span className="text-[13px] font-semibold text-ink">Margins</span>
              <select className={inputCls + " mt-1.5"} value={margins} onChange={(e) => { setMargins(e.target.value); save({ margins: e.target.value }); }}>
                <option value="single">Single margin</option>
                <option value="double">Double margin</option>
              </select>
            </label>
            <label className="mt-4 block">
              <span className="text-[13px] font-semibold text-ink">Body font</span>
              <select className={inputCls + " mt-1.5"} value={font} onChange={(e) => { setFont(e.target.value); save({ font: e.target.value }); }}>
                <option value="serif">Serif (writing)</option>
                <option value="sans">Sans (screen)</option>
                <option value="mono">Mono (code-first)</option>
              </select>
            </label>
            <label className="mt-4 block">
              <span className="text-[13px] font-semibold text-ink">Text size</span>
              <input
                type="range" min={0} max={3} step={1} value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                onMouseUp={() => save({ size })}
                onTouchEnd={() => save({ size })}
                className="mt-2 w-full accent-[var(--accent)]"
              />
              <span className="text-[12px] text-muted">{["Tight", "Comfortable", "Large", "Grande"][size]}</span>
            </label>
            <div className="mt-5">
              <Checkbox on={focus} onChange={(v) => { setFocus(v); save({ focus: v }); }} label="Focus mode" sub="Hide the margins and rail while writing." />
            </div>
            <div className="mt-5">
              <span className="text-[13px] font-semibold text-ink">Theme</span>
              <select className={inputCls + " mt-1.5"} value={theme} onChange={(e) => applyTheme(e.target.value)}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">Follow device</option>
              </select>
            </div>
          </Card>
        </div>

        {/* Export */}
        <Card className="mt-6 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-[24px] font-medium text-ink">Export</h2>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              {([
                ["md", "Markdown", ".md — keeps your voice, drops formatting"],
                ["word", "Word", ".doc — opens in Word and Google Docs"],
                ["pdf", "PDF", "browser print dialog"],
              ] as const).map(([v, t, s]) => (
                <RadioRow key={v} title={t} sub={s} checked={fmt === v} onChange={() => setFmt(v)} />
              ))}
            </div>
            <div className="space-y-4">
              <Checkbox
                on={hideAi}
                onChange={(v) => setHideAi(v)}
                label="Hide AI writing"
                sub="AI lines stay out of the exported file."
              />
              <Checkbox on={foot} onChange={setFoot} label="Attach margin notes as footnotes" />
              {fmt === "pdf" ? (
                <a href={exportHref} target="_blank" rel="noreferrer" className={btnPrimary + " w-full"}>
                  Open PDF (print dialog)
                </a>
              ) : (
                <a href={exportHref} className={btnPrimary + " w-full"}>
                  Download .{fmt === "md" ? "md" : "doc"}
                </a>
              )}
            </div>
          </div>
        </Card>

        {/* Versions */}
        <Card className="mt-6 p-5">
          <h2 className="font-serif text-[24px] font-medium text-ink">Version history</h2>
          <p className="mt-1 text-[13px] text-muted">
            {retentionDays ? `History is kept for ${retentionDays} days.` : "Versions are kept forever."}
          </p>
          <div className="mt-4 divide-y divide-line">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-[14px] font-semibold text-ink">{v.words} words</div>
                  <div className="text-[12.5px] text-muted">{timeAgo(v.created_at)}</div>
                </div>
                <button onClick={() => restore(v.id)} className={btnGhost}>Restore</button>
              </div>
            ))}
            {!versions.length && <p className="py-3 text-[13.5px] text-muted">Snapshots appear as the note is saved over time.</p>}
            {restoreErr && <p className="py-2 text-[13px] font-semibold text-amber-700">{restoreErr}</p>}
          </div>
        </Card>
      </main>
    </div>
  );
}
