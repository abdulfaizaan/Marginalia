import { thinkEvaluate, askRespond, journalRespond, validDraft, capWords, countWords, type MarginDraft, type ThinkInput, type AskInput, type AskResp, type JournalResp } from "./engine";

// Model routing (SP1 env fallback — replaced by per-user BYOK in Task 3):
// OPENAI_API_KEY → OpenAI; else XAI → Gemini fallback; missing/dummy keys → offline engine.

const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const XAI_BASE = process.env.XAI_BASE_URL || "https://api.x.ai/v1";
const GEMINI_BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";

const real = (k: string | undefined) => !!k && !/dummy|placeholder|your[-_]?key/i.test(k);

function routeFor(): { name: "openai" | "xai" | "gemini"; base: string; key: string; model: string } | null {
  if (real(process.env.OPENAI_API_KEY))
    return { name: "openai", base: OPENAI_BASE, key: process.env.OPENAI_API_KEY!, model: process.env.OPENAI_MODEL || "gpt-4o-mini" };
  if (real(process.env.XAI_API_KEY))
    return { name: "xai", base: XAI_BASE, key: process.env.XAI_API_KEY!, model: process.env.XAI_MODEL || "grok-3-mini" };
  if (real(process.env.GEMINI_API_KEY))
    return { name: "gemini", base: GEMINI_BASE, key: process.env.GEMINI_API_KEY!, model: process.env.GEMINI_MODEL || "gemini-2.0-flash" };
  return null;
}

export interface MarginRequest extends ThinkInput { dismissed: string[] }
export interface MarginsResult { notes: MarginDraft[]; provider: string }

// ---------- Think with You ----------
export async function marginNotes(req: MarginRequest): Promise<MarginsResult> {
  const offline = () => thinkEvaluate({ ...req }).map((d) => ({ ...d, body: capWords(d.body) }));
  const route = routeFor();
  if (!route) return { notes: offline().filter(validDraft).slice(0, 3), provider: "offline" };
  try {
    const sys = [
      "You are Marginalia, a Socratic margin collaborator embedded in a note-taking app.",
      "You NEVER write the user's note for them and never produce answers unless explicitly asked.",
      "Respond ONLY with 1-3 margin notes as JSON:",
      '{"notes":[{"anchor":"<block id from the provided blocks>","type":"question|challenge|error|direction","body":"<=60 words","wantVisual":true|false}]}',
      "Types: question (guiding question), challenge (attacks a premise), error (flags a likely mistake but NEVER states the corrected answer — ask instead), direction (suggests next move; set wantVisual=true when a step-through grid or sketch would help).",
      "Keep each note under 60 words. Never praise-only. Anchor notes to specific blocks. Challenge, don't flatter.",
    ].join(" ");
    const user = [
      `Note blocks (id: text): ${req.blocks.map((b) => `${b.id}: ${b.text}`).join(" | ")}`,
      `Changed blocks to consider: ${req.changedIds.join(", ")}`,
      `Do not repeat these dismissed phrasings: ${req.dismissed.slice(0, 6).join(" / ") || "none"}`,
    ].join("\n");
    const res = await chat(route, sys, user);
    const raw = JSON.parse(res);
    const notes: MarginDraft[] = (Array.isArray(raw.notes) ? raw.notes : [])
      .map((n: { anchor?: string; type?: string; body?: string; wantVisual?: boolean }) => ({
        anchor: String(n.anchor || ""), type: n.type as MarginDraft["type"], body: capWords(String(n.body || "")), wantVisual: !!n.wantVisual,
      }))
      .filter(validDraft)
      .filter((n: MarginDraft) => req.blocks.some((b) => b.id === n.anchor));
    if (!notes.length) return { notes: offline().filter(validDraft), provider: route.name + "+offline" };
    return { notes: notes.slice(0, 3), provider: route.name };
  } catch {
    return { notes: offline().filter(validDraft), provider: route.name + "+offline" };
  }
}

// ---------- Ask mode ----------
export async function askAI(inp: AskInput): Promise<(AskResp & { provider: string })> {
  const route = routeFor();
  if (!route) return { ...askRespond(inp), provider: "offline" };
  try {
    const sys = [
      "You are Marginalia in Ask mode. The user wrote a note; they ask you for help.",
      "You follow a 4-step hint ladder: level 1 nudge question, level 2 name the concept, level 3 work one partial step, level 4 full answer.",
      "Full answers (level 4) are ONLY allowed when the user explicitly asks AND the hint strictness permits (Direct setting, or must have walked rungs 1-3).",
      "Never write content for their note. Respond as JSON:",
      '{"body":"<=60 words","kind":"hint|answer","level":1..4}',
    ].join(" ");
    const user = `Note: ${inp.noteText.slice(0, 2000)}\nSelection: ${inp.selection || "none"}\nLadder level so far: ${inp.hintLevel}\nUser: ${inp.userMessage}`;
    const raw = JSON.parse(await chat(route, sys, user));
    const body = capWords(String(raw.body || ""));
    if (countWords(body) < 2) return { ...askRespond(inp), provider: route.name + "+offline" };
    // the offline gate is authoritative: a model may never unlock a rung the plan forbids
    const kind = raw.kind === "answer" ? "answer" : "hint";
    if (kind === "hint") return { body, kind, level: Math.min(3, Math.max(1, Number(raw.level) || 1)), provider: route.name };
    const gate = askRespond({ ...inp, userMessage: "Just give me the full answer", hintLevel: Math.max(inp.hintLevel, 3) });
    if (gate.kind !== "answer") return { ...gate, provider: route.name + "+gate" };
    return { body, kind: "answer", level: 4, provider: route.name };
  } catch {
    return { ...askRespond(inp), provider: route.name + "+offline" };
  }
}

// ---------- Journaling ----------
export function journalAI(entry: string, userMessage?: string): JournalResp & { provider: string } {
  // Journaling care rules are hard-coded (never routed to a vendor).
  return { ...journalRespond(entry, userMessage), provider: "offline-care" };
}

// ---------- provider chat ----------
async function chat(route: { name: string; base: string; key: string; model: string }, sys: string, user: string): Promise<string> {
  if (route.name === "gemini") {
    const res = await fetch(`${route.base}/models/${route.model}:generateContent?key=${route.key}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.4, response_mime_type: "application/json" },
      }),
    });
    if (!res.ok) throw new Error("gemini " + res.status);
    const j = await res.json();
    return (j.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  }
  const res = await fetch(`${route.base}/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${route.key}` },
    body: JSON.stringify({
      model: route.model, temperature: 0.4,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(route.name + " " + res.status);
  const j = await res.json();
  return String(j.choices?.[0]?.message?.content || "").trim();
}
