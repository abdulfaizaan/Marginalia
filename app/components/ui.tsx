import type { CSSProperties, ReactNode } from "react";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-md border"
        style={{
          borderColor: dark ? "#fff" : "var(--ink)",
          borderWidth: 1.5,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="9" height="12" rx="1.4" stroke={dark ? "#fff" : "var(--ink)"} strokeWidth="1.6" />
          <line x1="12" y1="1" x2="12" y2="13" stroke="var(--accent)" strokeWidth="2" />
        </svg>
      </span>
      <span className={`font-semibold tracking-tight ${dark ? "text-white" : "text-ink"}`} style={{ fontSize: 17 }}>
        Marginalia
      </span>
    </span>
  );
}

export function Chip({ kind, children, small = false }: { kind: string; children: ReactNode; small?: boolean }) {
  const map: Record<string, { bg: string; ink: string }> = {
    error: { bg: "var(--chip-err-bg)", ink: "var(--chip-err-ink)" },
    challenge: { bg: "var(--chip-ch-bg)", ink: "var(--chip-ch-ink)" },
    question: { bg: "var(--chip-q-bg)", ink: "var(--chip-q-ink)" },
    direction: { bg: "var(--chip-dir-bg)", ink: "var(--chip-dir-ink)" },
    "next step": { bg: "var(--chip-dir-bg)", ink: "var(--chip-dir-ink)" },
  };
  const c = map[kind] || { bg: "var(--accent-soft)", ink: "var(--accent)" };
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${small ? "px-2 py-[1px] text-[10.5px]" : "px-2.5 py-[3px] text-[11.5px]"}`}
      style={{ background: c.bg, color: c.ink }}
    >
      {children}
    </span>
  );
}

export const btn =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-[filter,background] active:scale-[.99] disabled:opacity-50 disabled:pointer-events-none";
export const btnPrimary = `${btn} bg-accent text-accent-ink px-5 h-11 text-[14.5px] hover:brightness-110`;
export const btnDark = `${btn} bg-btn-dark text-btn-dark-text px-5 h-11 text-[14.5px] hover:brightness-125`;
export const btnGhost = `${btn} border border-line bg-card text-ink px-4 h-10 text-[14px] hover:bg-paper-soft`;
export const btnMini = `${btn} border border-line bg-card text-ink px-3 h-8 text-[12.5px] hover:bg-paper-soft`;
export const btnBlueMini = `${btn} bg-accent text-accent-ink px-3.5 h-9 text-[13px] hover:brightness-110`;
export const btnLink = "text-accent font-semibold hover:underline";

export function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`rounded-2xl border border-line bg-card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Field({ label, children, hint, right }: { label: string; children: ReactNode; hint?: string; right?: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13.5px] font-semibold text-ink">{label}</span>
        {right}
      </div>
      {children}
      {hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-[10px] border border-line bg-card px-3.5 py-2.5 text-[14.5px] text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25";

export function RadioRow({ title, sub, checked, onChange, disabled, pro, first }: {
  title: string; sub: string; checked: boolean; onChange?: () => void; disabled?: boolean; pro?: boolean; first?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors ${
        checked ? "border-accent bg-accent-soft" : "border-line bg-card"
      } ${disabled ? "opacity-60" : "hover:border-ink-soft/40"} ${first ? "mt-0" : "mt-2.5"}`}
    >
      <span
        className={`mt-[3px] inline-block h-4 w-4 shrink-0 rounded-full border ${checked ? "border-accent" : "border-muted"}`}
        style={checked ? { boxShadow: "inset 0 0 0 4.5px var(--accent)" } : undefined}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`text-[14.5px] font-bold ${disabled ? "text-muted" : "text-ink"}`}>{title}</span>
          {pro && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-[1px] text-[10.5px] font-bold text-amber-700">
              Pro
            </span>
          )}
        </span>
        <span className={`mt-0.5 block text-[13px] ${disabled ? "text-muted" : "text-ink-soft"}`}>{sub}</span>
      </span>
    </button>
  );
}

export function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onChange(!on)}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{ background: on ? "var(--accent)" : "var(--line)" }}
      >
        <span
          className="absolute top-[2px] h-4 w-4 rounded-full bg-white shadow transition-all"
          style={{ left: on ? 18 : 2 }}
        />
      </button>
      <span>
        <span className="block text-[14px] font-bold text-ink">{label}</span>
        {sub && <span className="block text-[13px] text-ink-soft">{sub}</span>}
      </span>
    </label>
  );
}

export function Checkbox({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      {/* real checkbox keeps keyboard space-toggle and screen-reader state; visuals are a peer-disclosed twin */}
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <span
        aria-hidden="true"
        className={`peer mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border ${on ? "border-accent bg-accent" : "border-muted bg-card"} peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60`}
      >
        {on && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.2 4.6 8.8 10 3.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span>
        <span className="block text-[14px] font-bold text-ink">{label}</span>
        {sub && <span className="block text-[12.5px] text-ink-soft">{sub}</span>}
      </span>
    </label>
  );
}
