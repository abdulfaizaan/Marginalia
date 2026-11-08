// Marginalia behavior layer (PRD §8/§11) — deterministic offline engine.
// Real providers (providers.ts) call this when a key is missing/dummy or when
// provider output fails validation, so the guardrails below are always in force.

export type NoteType = "question" | "challenge" | "error" | "direction";
export const NOTE_TYPES: NoteType[] = ["question", "challenge", "error", "direction"];
export const WORD_CAP = 60;

export interface Block { id: string; text: string }
export interface MarginDraft { anchor: string; type: NoteType; body: string; wantVisual?: boolean }

export function countWords(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** Enforce the 60-word cap: keep sentences until the cap, never split mid-sentence. */
export function capWords(body: string): string {
  const sents = body.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+["']?/g) || [body.trim()];
  let out = "";
  for (const s of sents) {
    if (countWords((out + " " + s).trim()) > WORD_CAP) break;
    out = (out + " " + s).trim();
  }
  return out || sents[0].split(/\s+/).slice(0, WORD_CAP).join(" ");
}

export function validDraft(d: MarginDraft): boolean {
  return (
    NOTE_TYPES.includes(d.type) &&
    typeof d.anchor === "string" && d.anchor.length > 0 &&
    countWords(d.body) > 0 && countWords(d.body) <= WORD_CAP
  );
}

const rot = (arr: string[], seed: number) => arr[seed % arr.length];

// ---------- Think with You (proactive margin notes) ----------
const TEMPLATES: Record<NoteType, string[]> = {
  challenge: [
    "Is that true in every case? A single counterexample would sharpen this claim — what would it look like?",
    "You state this as settled. Which part is most likely to be challenged, and by whom?",
    "Who disagrees with this, and what do they know that this line does not account for yet?",
  ],
  error: [
    "Check the base case in your recurrence. What happens for an empty prefix?",
    "The formula in this line reads from cells you have not justified yet. Which rule pins each term down?",
    "Look at how the two indices move here. What stops either from leaving the table?",
  ],
  question: [
    "Which earlier rows does each cell actually read? Do you need to keep all of them?",
    "What would a skeptical reader ask first, and can the next line answer it?",
    "What should this quantity mean? Naming it usually reveals the boundary case.",
  ],
  direction: [
    "Tracing a small case by hand is a good test of the rule so far. Want a grid you can step through?",
    "A worked example would anchor this. Want a step-through you can move back and forth through?",
    "The next useful move is one concrete instance. Want a visual you can step through?",
  ],
};

function classify(text: string): { type: NoteType; seed: number; wantVisual?: boolean } {
  const t = text.toLowerCase();
  const h = [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  let wantVisual = false;
  if (/(dp\[|\bO\(n|\bO\(m|recurrence|base case|max\()/.test(t)) return { type: "error", seed: h };
  if (/(everyone|always|never|nobody|all users|no one|must\b)/.test(t)) return { type: "challenge", seed: h };
  if (/(\bi think\b|\bi feel\b|\bmaybe\b|\bsuppose\b|\bprobably\b)/.test(t)) return { type: "question", seed: h };
  const vis = /([A-Z]{2,8})\s+against\s+([A-Z]{2,8})/.exec(text);
  if (vis || /^(i think|i'll|we could|next)/.test(t.trim())) {
    wantVisual = !!vis;
    return { type: "direction", seed: h, wantVisual };
  }
  return { type: "question", seed: h };
}

const PACE_LIMIT = { slow: 1, normal: 2, frequent: 3 } as const;

export interface ThinkInput {
  blocks: Block[]; changedIds: string[]; pace: "slow" | "normal" | "frequent";
  dismissed: string[]; noteWords: number;
}

/** PRD: AI never responds to an empty/near-empty note; silenced by dismissal memory. */
export function thinkEvaluate(input: ThinkInput): MarginDraft[] {
  if (input.noteWords < 12) return [];
  const limit = PACE_LIMIT[input.pace];
  const out: MarginDraft[] = [];
  const seenDismissed = new Set(input.dismissed.map((s) => s.slice(0, 40).toLowerCase()));
  const anchors = new Set<string>();
  for (const b of input.blocks) {
    if (!input.changedIds.includes(b.id) && out.length > 0) continue;
    if (!input.changedIds.includes(b.id)) continue;
    if (countWords(b.text) < 8) continue;
    const { type, seed, wantVisual } = classify(b.text);
    // rotate templates until we find one not already dismissed for this block
    for (let i = 0; i < 3; i++) {
      const body = capWords(rot(TEMPLATES[type], seed + i * 5 + type.length));
      if (seenDismissed.has(body.slice(0, 40).toLowerCase())) continue;
      if (anchors.has(b.id)) break;
      out.push({ anchor: b.id, type, body, wantVisual });
      anchors.add(b.id);
      break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- Ask mode: 4-step hint ladder (PRD §8) ----------
export interface AskInput {
  kind: "chat" | "probe"; noteText: string; selection?: string;
  history: { role: "user" | "assistant"; body: string }[];
  userMessage: string; hintLevel: number; strictness: "strict" | "balanced" | "direct";
}
export interface AskResp { body: string; kind: "hint" | "answer"; level: number }

/** Ladder rules: level4 (full answer) only when the user asks AND strictness permits,
 *  and the rungs cannot be bypassed — 1-3 come first unless Direct is on. */
export function askRespond(inp: AskInput): AskResp {
  const wantsFull = /\b(full|actual) answer\b|\bjust (tell|give) me\b|\bsolve it for me\b|\bthe solution\b/i.test(inp.userMessage);
  const allowed =
    inp.strictness !== "strict" &&
    (inp.strictness === "direct" || inp.hintLevel >= 3);
  if (inp.strictness === "strict")
    return { body: capWords("Staying strict: only questions here. " + ladderNudge(inp.hintLevel + 1)), kind: "hint", level: Math.min(inp.hintLevel + 1, 3) };
  if (wantsFull && allowed)
    return { body: capWords(`Here is the full answer to keep or correct: consider ${shortTopic(inp)}. Work it once more; the answer only sticks when the steps feel owed.`), kind: "answer", level: 4 };
  if (wantsFull) {
    const rung = Math.min(inp.hintLevel, 3);
    return { body: capWords("I keep the ladder on — take Another hint and I will open the last rung when you have walked these. Then it is yours."), kind: "hint", level: rung || 1 };
  }
  return { body: capWords(ladderNudge(Math.min(inp.hintLevel + 1, 3))), kind: "hint", level: Math.min(inp.hintLevel + 1, 3) };
}

function ladderNudge(level: number): string {
  const q = [
    "What should this quantity mean, and what would make it 0?",
    "The idea to reach for is reuse: which smaller instance does each step extend?",
    "Work one step only: take the first match, compute its cell, and stop there.",
  ];
  return q[Math.max(0, level - 1)] || q[0];
}
function shortTopic(inp: AskInput): string {
  const m = inp.selection || inp.userMessage;
  return (m.match(/[A-Za-z][\w -]{3,30}/)?.[0] ?? "the problem").trim();
}

// ---------- Journaling (reflective listener + crisis care, PRD §8) ----------
export interface JournalResp { body: string; kind: "care" | "reflect" }
const CRISIS = /(kill myself|hurt myself|suicide|self[- ]?harm|can'?t go on|end it all|hopeless and|no reason to live)/i;
export function journalRespond(entry: string, userMessage?: string): JournalResp {
  const src = entry + "\n" + (userMessage || "");
  if (CRISIS.test(src))
    return {
      body: "I read that things are heavier than a notebook should hold alone. I am a journaling companion, not a professional or a crisis service — and this sounds bigger than exercises. If you are in immediate danger, call your local emergency number; in the US, call or text 988 (Suicide & Crisis Lifeline). You might also reach someone you trust today. You could write in the meantime, but only if it helps you feel steadier.",
      kind: "care",
    };
  const seeds = [
    "Reading this back: what is the sentence you would least want someone to question? That is usually the one worth testing.",
    "You use 'should' more than once here. Whose voice is the should, and does it still speak for you?",
    "What would make tomorrow one degree lighter — something within reach this week, not a life overhaul?",
  ];
  const h = [...entry].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 11);
  return { body: rot(seeds, h), kind: "reflect" };
}
