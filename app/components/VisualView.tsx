"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AskPanel from "@/components/AskPanel";
import { btnGhost, btnPrimary, btnMini, Chip } from "@/components/ui";
import LinkHint from "@/components/LinkHint";
import { api } from "@/lib/client";
import { buildVisual, type VisualSpec } from "@/lib/visualize";
import type { AskMsgLite, VisualLite } from "@/components/types";

export default function VisualView({ noteId, noteTitle, visuals0, ask0 }: {
  noteId: string; noteTitle: string; visuals0: VisualLite[]; ask0: AskMsgLite[];
}) {
  const selParam = useSearchParams().get("sel") || "";
  const [visuals, setVisuals] = useState<VisualLite[]>(visuals0);
  const [ask, setAsk] = useState<AskMsgLite[]>(ask0);
  // which visual to show; null = none yet, -1 = still creating from ?sel=
  const [selected, setSelected] = useState<VisualLite | null>(
    visuals0[0] ? visuals0[0] : null
  );
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const router = useRouter();

  const spec = useMemo(() => {
    if (!selected) return null;
    try { return JSON.parse(selected.spec) as VisualSpec; } catch { return null; }
  }, [selected]);

  // ?sel= was handed over from a margin note: reuse an existing grid or generate one
  useEffect(() => {
    if (!selParam || creating) return;
    const parsed = buildVisual(selParam);
    const title = parsed.spec?.title;
    const existing = title ? visuals.find((v) => { try { return (JSON.parse(v.spec) as { title?: string }).title === title; } catch { return false; } }) : undefined;
    if (existing) { setSelected(existing); return; }
    if (parsed.error) { setErr(parsed.error); return; }
    setCreating(true);
    api<{ id: string; spec: VisualSpec }>("/api/ai/visual", {
      method: "POST", body: JSON.stringify({ noteId, action: "create", selection: selParam }),
    })
      .then((r) => {
        const v: VisualLite = { id: r.id, spec: JSON.stringify(r.spec), created_at: Date.now() };
        setVisuals((vs) => [v, ...vs]);
        setSelected(v);
        setStepIdx(0);
        router.refresh();
      })
      .catch((x: unknown) => setErr(x instanceof Error ? x.message : "Could not build the visual."))
      .finally(() => setCreating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selParam]);

  async function pin() {
    if (!selected) return;
    await api("/api/ai/visual", { method: "POST", body: JSON.stringify({ noteId, action: "pin", visualId: selected.id }) });
    router.push(`/notes/${noteId}`);
  }

  const steps = spec?.steps || [];
  const step = steps[Math.min(stepIdx, steps.length - 1)];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col border-r border-line bg-paper">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
          <Link href={`/notes/${noteId}`} className="text-[13px] font-semibold text-ink-soft hover:text-ink">← Back to note<LinkHint /></Link>
          <span className="text-[12px] text-muted">{noteTitle}</span>
          {visuals.length > 1 && (
            <select
              className="ml-auto rounded-[8px] border border-line bg-card px-2 py-1.5 text-[12.5px] text-ink"
              value={selected?.id || ""}
              onChange={(e) => { setSelected(visuals.find((v) => v.id === e.target.value) || visuals[0]); setStepIdx(0); }}
            >
              {visuals.map((v) => {
                let t = "Visual";
                try { t = (JSON.parse(v.spec) as { title: string }).title; } catch { /* keep */ }
                return <option key={v.id} value={v.id}>{t}</option>;
              })}
            </select>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          {creating && <p className="text-sm text-muted">Building the step-through…</p>}
          {err && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13.5px] font-semibold text-amber-800">{err}</div>
          )}
          {!spec && !creating && !err && (
            <p className="text-sm text-muted">No visual yet. Select text in your note and choose Probe this, or ask Marginalia for a grid or sketch.</p>
          )}
          {spec && step && <SpecView spec={spec} stepIdx={Math.min(stepIdx, steps.length - 1)} onStep={setStepIdx} onPin={pin} />}
        </div>
      </div>

      <aside className="min-w-0 max-lg:hidden">
        <AskPanel noteId={noteId} msgs={ask} setMsgs={setAsk} journal={false} />
      </aside>
    </div>
  );
}

function SpecView({ spec, stepIdx, onStep, onPin }: { spec: VisualSpec; stepIdx: number; onStep: (i: number) => void; onPin: () => void }) {
  const steps = spec.steps;
  const step = steps[stepIdx];
  const R = spec.rowChars.length, C = spec.colChars.length;
  const filled = step?.filledCells ?? 0;
  const readsSet = new Set((step?.reads || []).map(([r, c]) => r + ":" + c));

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-[30px] font-medium text-ink">{spec.title}</h2>
          <p className="mt-1 text-[14px] text-ink-soft">{spec.subtitle}</p>
        </div>
        <Chip kind="direction" small>Visualization</Chip>
      </div>

      {spec.kind === "grid" && spec.values && (
        <div className="mt-6 overflow-x-auto">
          <table className="border-separate" style={{ borderSpacing: 4 }}>
            <thead>
              <tr>
                <th className="h-9 w-9" />
                {spec.colChars.map((ch, c) => (
                  <th key={c} className="h-9 w-11 rounded-md bg-line font-serif text-[15px] text-ink">{ch}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.values.map((row, r) => (
                <tr key={r}>
                  <th className="h-11 rounded-md bg-line font-serif text-[15px] text-ink">{spec.rowChars[r]}</th>
                  {row.map((val, c) => {
                    const idx = r === 0 || c === 0 ? -1 : (r - 1) * (C - 1) + (c - 1);
                    const shown = idx >= 0 && idx < filled;
                    const isRead = readsSet.has(`${r}:${c}`) && !shown;
                    const isCurrent = step && step.r === r && step.c === c && shown;
                    return (
                      <td
                        key={c}
                        className="h-11 w-11 rounded-md text-center font-serif text-[15.5px]"
                        aria-hidden={!shown && !isRead}
                        style={{
                          background: shown ? "var(--accent)" : isRead ? "transparent" : "var(--paper-soft)",
                          color: shown ? "#fff" : "var(--ink-soft)",
                          border: isRead ? "1.5px dashed var(--grid-dash)" : "1px solid transparent",
                          boxShadow: isCurrent ? "0 0 0 2px var(--ink)" : undefined,
                          fontWeight: isCurrent ? 700 : 400,
                        }}
                      >
                        {shown ? val : isRead ? "↖" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-4 text-[12px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: "var(--accent)" }} /> filled</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed" style={{ borderColor: "var(--grid-dash)" }} /> reading from these</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[var(--paper-soft)] border border-line" /> not filled yet</span>
          </div>
        </div>
      )}

      {spec.kind === "sketch" && spec.sketch && (
        <svg viewBox="0 0 560 240" className="mt-6 w-full max-w-[560px]" role="img" aria-label={spec.steps[0]?.textDescription || "Sketch"}>
          {spec.sketch.map((s, i) => {
            if (s.shape === "box")
              return (
                <g key={i}>
                  <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={10} fill="var(--accent-soft)" stroke="var(--accent)" />
                  <text x={s.x + 12} y={s.y + (s.h ?? 0) / 2 + 5} fontSize="13" fill="var(--ink)">{s.text}</text>
                </g>
              );
            if (s.shape === "arrow")
              return (
                <g key={i}>
                  <line x1={s.x} y1={s.y} x2={s.x + 56} y2={s.y} stroke="var(--accent)" strokeWidth={2.5} />
                  <path d={`M ${s.x + 48} ${s.y - 5} L ${s.x + 60} ${s.y} L ${s.x + 48} ${s.y + 5}`} fill="var(--accent)" />
                </g>
              );
            return <text key={i} x={s.x} y={s.y} fontSize="12.5" fill="var(--muted)">{s.text}</text>;
          })}
        </svg>
      )}

      <div className="mt-6 rounded-xl border border-line bg-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[11.5px] font-bold tracking-[0.14em] text-muted">
            STEP {stepIdx + 1} OF {steps.length}
          </span>
          {spec.kind === "grid" && <span className="text-[12px] text-muted">{filled} cells filled</span>}
        </div>
        <p className="mt-2 font-serif text-[16px] leading-relaxed text-ink">{step?.caption}</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted" role="status">
          {step?.textDescription}
        </p>
      </div>

      <div className="mt-5 flex items-center gap-2.5">
        <button onClick={() => onStep(stepIdx - 1)} disabled={stepIdx === 0} className={btnGhost}>← Back</button>
        <button onClick={() => onStep(stepIdx + 1)} disabled={stepIdx >= steps.length - 1} className={btnPrimary}>Next →</button>
        <button onClick={onPin} className={btnMini + " ml-auto"}>Pin to note</button>
      </div>
    </div>
  );
}
