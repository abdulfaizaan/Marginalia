// Runnable check: node scripts/check.ts (per ponytail AGENTS.md — one assert script, no frameworks)
// Exit 0 = all pass; first failure stops with FAIL + message.
import { capWords, validDraft, askRespond, journalRespond, WORD_CAP, countWords } from "../lib/engine.ts";
import { parsePair, buildVisual, type VisualSpec } from "../lib/visualize.ts";
import { toMarkdown, toPrintHtml, type Doc } from "../lib/exporters.ts";
import type { MarginRow } from "../lib/db.ts";

let n = 0;
function ok(cond: boolean, name: string) {
  if (!cond) {
    console.error(`FAIL ${name}`);
    process.exit(1);
  }
  n++;
  console.log(`ok ${name}`);
}

// ---------- engine: word cap ----------
const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
ok(countWords(capWords(long)) <= WORD_CAP && capWords(long).length > 0, "capWords clamps to 60");
ok(capWords(long) === Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ") || countWords(capWords(long)) === WORD_CAP, "capWords fallback first-60");

const two = "First sentence is short. " + Array.from({ length: 70 }, (_, i) => `w${i}`).join(" ") + " not counted.";
ok(countWords(capWords(two)) <= WORD_CAP && capWords(two).startsWith("First sentence is short."), "capWords keeps whole sentences");

// ---------- engine: draft validation ----------
ok(validDraft({ anchor: "p1", type: "question", body: "Which case breaks first?" }), "validDraft accepts good draft");
ok(!validDraft({ anchor: "p1", type: "mistake" as never, body: "Which case breaks first?" }), "validDraft rejects unknown type");
ok(!validDraft({ anchor: "", type: "question", body: "Which case breaks first?" }), "validDraft rejects empty anchor");
ok(!validDraft({ anchor: "p1", type: "question", body: "" }), "validDraft rejects empty body");
ok(!validDraft({ anchor: "p1", type: "question", body: long }), "validDraft rejects over-cap body");

// ---------- engine: ask ladder (plan-free rules) ----------
const base = { kind: "chat" as const, noteText: "note", selection: undefined, history: [], strictness: "balanced" as const, userMessage: "Stuck here." };
ok(askRespond({ ...base, hintLevel: 1 }).kind === "hint", "ladder: hint nudges along");
ok(askRespond({ ...base, hintLevel: 3 }).kind === "hint", "ladder: hint even at rung 3 when not asking for the answer");
const flat3 = askRespond({ ...base, userMessage: "Just give me the full answer", hintLevel: 3 });
ok(flat3.kind === "answer" && flat3.level === 4, "ladder: walked rungs + explicit ask → answer");
const directReq = askRespond({ ...base, strictness: "direct", userMessage: "Give me the actual answer", hintLevel: 1 });
ok(directReq.kind === "answer", "Direct: full answer on request");
const strict = askRespond({ ...base, strictness: "strict", userMessage: "Just give me the full answer", hintLevel: 3 });
ok(strict.kind === "hint", "strict: never the answer");

// ---------- engine: journal care ----------
ok(journalRespond("I can't go on anymore with this.").kind === "care", "journal crisis routes to care");
ok(journalRespond("just a quiet day, thinking it over").kind === "reflect", "journal non-crisis reflects");
ok(journalRespond("no reason to live").body.includes("988") || journalRespond("no reason to live").body.includes("emergency"), "care message carries resources");

// ---------- visualize: pair parsing + LCS grid ----------
const pair = parsePair("starting with ABCB against BDCB.");
ok(!!pair && pair.a === "ABCB" && pair.b === "BDCB", "parsePair reads the mock selection");
const vis = buildVisual("ABCB against BDCB");
ok(!vis.error && vis.spec !== null, "buildVisual builds the grid");
const spec = vis.spec as VisualSpec;
ok(spec.kind === "grid" && spec.steps.length === 16, "LCS grid fills 16 cells");
const last = spec.steps[spec.steps.length - 1];
// A=ABCB, B=BDCB: B→C→B appears in both → LCS = 3 (B, C, B)
ok(spec.values?.[4]?.[4] === 3 && last.value === 3, "LCS(ABCB, BDCB) = 3 via BCB");
ok(spec.steps.every((s) => s.caption.length > 8 && s.textDescription.length > 8), "every step has caption + a11y text");
ok(spec.steps[0].textDescription.toLowerCase().includes("step 1"), "steps are a11y-labelled");
ok(!!buildVisual("the dp table for lcs").error, "no pair → asks for two strings by name");

// ---------- exporters ----------
const doc: Doc = {
  type: "doc",
  content: [
    { type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text: "My own idea stands." }] },
    { type: "paragraph", attrs: { id: "p2", ai: "1" }, content: [{ type: "text", marks: [{ type: "italic" }], text: "AI (question): What if the opposite held?" }] },
  ],
};
const margins: MarginRow[] = [
  { anchor: "p1", num: 1, type: "question", body: "Which case breaks first?", status: "open" },
] as unknown as MarginRow[];
const withFn = toMarkdown("T", doc, { hideAi: false, margins, footnotes: true });
ok(withFn.includes("[^note-1]") && withFn.includes("Which case breaks first?"), "md footnotes attach margin notes");
const hidden = toMarkdown("T", doc, { hideAi: true, margins: [], footnotes: false });
ok(!hidden.includes("AI (question)") && hidden.includes("My own idea stands."), "hide-AI strips AI paragraphs from md");
const shown = toMarkdown("T", doc, { hideAi: false, margins: [], footnotes: false });
ok(shown.includes("AI (question)") ? shown.includes("What if the opposite held?") : false, "md keeps AI text when not hidden");
ok(toPrintHtml("T", doc, { hideAi: false, margins: [], footnotes: false }).includes("window.print()"), "print HTML auto-opens print dialog");

// ---------- crypto: secrets at rest ----------
const { encryptSecret, decryptSecret } = await import("../lib/crypto.ts");
const secretBlob = encryptSecret("sk-test-1234567890");
ok(secretBlob.length > 28, "encryptSecret produces non-trivial blob");
ok(decryptSecret(secretBlob) === "sk-test-1234567890", "decryptSecret round-trips");
const swapped = Buffer.from(secretBlob); swapped[0] ^= 0xff;
ok(decryptSecret(swapped) === null, "decryptSecret fails closed on tamper");
ok(decryptSecret("garbage") === null, "decryptSecret fails closed on garbage");

console.log(`\n${n} checks passed.`);
