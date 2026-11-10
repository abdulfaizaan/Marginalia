// Runnable check: node scripts/check.ts (per ponytail AGENTS.md — one assert script, no frameworks)
// Exit 0 = all pass; first failure stops with FAIL + message.
import { capWords, validDraft, askRespond, journalRespond, WORD_CAP, countWords } from "../lib/engine.ts";
import { parsePair, buildVisual, type VisualSpec } from "../lib/visualize.ts";
import { toMarkdown, toWordHtml, toPrintHtml, type Doc } from "../lib/exporters.ts";
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
ok(journalRespond("I want to die tonight").kind === "care", "crisis: want to die → care (no false negative)");
ok(journalRespond("thinking about ending my life").kind === "care", "crisis: end my life → care (no false negative)");
ok(journalRespond("i could take my own life").kind === "care", "crisis: take my own life → care (no false negative)");
ok(journalRespond("everything feels hopeless").kind === "care", "crisis: bare hopeless → care (no false negative)");

// ---------- providers: BYOK routing ----------
const { routeFor } = await import("../lib/providers.ts");
ok(routeFor(null, null) === null, "routeFor: no config → offline");
ok(routeFor({ vendor: null }, null) === null, "routeFor: vendor null → offline");
ok(routeFor({ vendor: "custom", base: undefined }, "k") === null, "routeFor: custom w/o base → offline (fail closed)");
const r = routeFor({ vendor: "openai", model: null }, "sk-1");
ok(!!r && r.name === "openai" && r.model === "gpt-4o-mini", "routeFor: openai default model");
const rx = routeFor({ vendor: "xai" }, "k");
ok(!!rx && rx.base === "https://api.x.ai/v1" && rx.model === "grok-3-mini", "routeFor: xai base/model");
const rc = routeFor({ vendor: "custom", base: "http://127.0.0.1:11434/v1", model: "llama3.1" }, "o");
ok(!!rc && rc.name === "custom" && rc.base === "http://127.0.0.1:11434/v1", "routeFor: custom base honored");

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

// ---------- exporters: attribute escaping (no executable attribute injection in HTML exports) ----------
const xssDoc: Doc = {
  type: "doc",
  content: [
    { type: "image", attrs: { src: `x" onerror="alert(1)`, alt: `<y" onmouseover="alert(2)` } },
  ],
};
const wordXss = toWordHtml("T", xssDoc, { hideAi: false, margins: [], footnotes: false });
ok(!/onerror="/.test(wordXss) && !/onmouseover="/.test(wordXss), "word HTML: image attr injection cannot form event handlers");
ok(!/onerror="/.test(toPrintHtml("T", xssDoc, { hideAi: false, margins: [], footnotes: false })), "print HTML: image attr injection cannot form event handlers");

// ---------- central AI key: env-derived config (fail closed) ----------
const { userAiConfig } = await import("../lib/db.ts");
const realKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "sk-dummy-placeholder"; // flagged dummy → must never route
ok(userAiConfig("any-user") === null, "userAiConfig: dummy/placeholder key → null (offline)");
process.env.GEMINI_API_KEY = "AQ.test-real-key";
const cfg = userAiConfig("any-user");
ok(!!cfg && cfg.vendor === "gemini" && cfg.key === "AQ.test-real-key" && cfg.base === null, "userAiConfig: real key → central gemini config");
delete process.env.GEMINI_API_KEY;
ok(userAiConfig("any-user") === null, "userAiConfig: unset key → null (offline)");
if (realKey !== undefined) process.env.GEMINI_API_KEY = realKey;

// ---------- ui: tailwind arbitrary grid tracks must be _-separated (commas = dropped by browser) ----------
const fs = await import("node:fs");
const path = await import("node:path");
const root = path.join(path.dirname("" + new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
let gridScan = 0;
const badGrids: string[] = [];
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".tsx")) {
      const src = fs.readFileSync(p, "utf8");
      for (const m of src.matchAll(/grid-cols-\[([^\]]+)\]/g)) {
        gridScan++;
        if (m[1].replace(/\w+\([^()]*\)/g, "").includes(",")) badGrids.push(`${p}: ${m[0]}`);
      }
    }
  }
};
walk(path.join(root, "app"));
walk(path.join(root, "components"));
ok(gridScan > 5 && badGrids.length === 0, `ui: grid-cols-[…] tracks are _-separated (${gridScan} scanned)`);

const layoutSrc = fs.readFileSync(path.join(root, "app", "layout.tsx"), "utf8");
const cssSrc = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");
ok(layoutSrc.includes("Material+Symbols+Outlined") && cssSrc.includes("Material Symbols Outlined"), "ui: material symbols font loaded (layout + .msym)");

// ---------- theme restore: the inline reader must parse exactly what the saver writes (plain string) ----------
const clientSrcT = fs.readFileSync(path.join(root, "lib", "client.ts"), "utf8");
const layoutSrcT = fs.readFileSync(path.join(root, "app", "layout.tsx"), "utf8");
const savedTheme = /localStorage\.setItem\("mg-theme",/.test(clientSrcT);
const inline = /__html: `([^`]+)`/.exec(layoutSrcT)?.[1] || "";
const readExpr = /try\{if\((.*?)\)document/.exec(inline)?.[1] || "";
const themeEv = (val: string | null) => {
  try { return eval(readExpr.replace("localStorage.getItem('mg-theme')", JSON.stringify(val))) === true; } catch { return false; }
};
ok(savedTheme && readExpr.length > 0, "theme: saver and inline reader both present");
ok(themeEv("dark"), "theme: saved 'dark' string survives the inline-restoring parse");
ok(!themeEv(null), "theme: absent theme does not accidentally enable dark");

// ---------- api: notes INSERT matches schema (drift-checkable against lib/db.ts without imports) ----------
const routeSrc = fs.readFileSync(path.join(root, "app", "api", "notes", "route.ts"), "utf8");
const insM = routeSrc.match(/INSERT INTO notes\(([^)]*)\)[\s\S]*?VALUES\((\?[^\n]*?)\)/);
ok(!!insM, "api: notes route INSERT INTO notes(<cols>) VALUES(<phs>) present");
if (insM) {
  const dbSrc = fs.readFileSync(path.join(root, "lib", "db.ts"), "utf8");
  const scM = dbSrc.match(/const SCHEMA = `([\s\S]*?)`;/);
  ok(!!scM, "api: SCHEMA extractable from lib/db.ts");
  if (scM) {
    const { DatabaseSync } = await import("node:sqlite");
    const mem = new DatabaseSync(":memory:");
    mem.exec(scM[1]);
    const tblCols = mem.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
    const insCols = insM[1].split(",").map((s) => s.trim());
    const ph = insM[2].split(",").length;
    ok(ph === insCols.length && insCols.every((c) => tblCols.map((t) => t.name).includes(c)) && ph === tblCols.length,
      `api: notes INSERT (${insCols.length} cols, ${ph} ph) matches notes table (${tblCols.length} cols)`);
  }
}

console.log(`\n${n} checks passed.`);
