import type { Plan } from "./plans.ts";
import { capWords } from "./engine.ts";

// ---------- declarative visual specs (PRD §11.4): steps stored, client renders ----------

export interface VisualStep {
  r: number; c: number; value: number | null; reads: [number, number][];
  filledCells: number; caption: string; textDescription: string; // a11y (VZ-5, P0)
}
export interface VisualSpec {
  kind: "grid" | "sketch";
  title: string; subtitle: string; rowLabel: string; colLabel: string;
  rowChars: string[]; colChars: string[]; // include leading '-'
  values: number[][] | null; // null → sketch
  sketch?: { shape: "box" | "arrow" | "label"; x: number; y: number; w?: number; h?: number; text: string }[];
  steps: VisualStep[];
  metaText: string;
}

/** Parse "ABCB against BDCB" / "A = ABCB, B = BDCB" style selections. */
export function parsePair(sel: string): { a: string; b: string } | null {
  const m = /([A-Za-z]{2,6})\s+against\s+([A-Za-z]{2,6})/i.exec(sel);
  if (m) return { a: m[1].toUpperCase(), b: m[2].toUpperCase() };
  const m2 = /A\s*=\s*([A-Za-z]{2,6})[,;\s]+B\s*=\s*([A-Za-z]{2,6})/i.exec(sel);
  if (m2) return { a: m2[1].toUpperCase(), b: m2[2].toUpperCase() };
  return null;
}

function buildLcs(a: string, b: string): VisualSpec {
  const R = a.length + 1, C = b.length + 1;
  const G: number[][] = Array.from({ length: R }, () => Array(C).fill(0));
  const steps: VisualStep[] = [];
  const cells = R * C - (C - 1) - (R - 1) + C + R; // total cells incl. zero row/col = R*C
  let filled = 0;
  for (let r = 1; r < R; r++) {
    for (let c = 1; c < C; c++) {
      const match = a[r - 1] === b[c - 1];
      if (match) G[r][c] = G[r - 1][c - 1] + 1;
      else G[r][c] = Math.max(G[r - 1][c], G[r][c - 1]);
      filled++;
      const reads: [number, number][] = match ? [[r - 1, c - 1]] : [[r - 1, c], [r, c - 1]];
      const caption = match
        ? `Both letters are ${a[r - 1]}. Take the diagonal cell and add 1, so dp[${r}][${c}] = ${G[r][c]}.`
        : `${a[r - 1]} and ${b[c - 1]} differ. Take the larger of the cell above and the one to the left, so dp[${r}][${c}] = ${G[r][c]}.`;
      steps.push({ r, c, value: G[r][c], reads, filledCells: filled, caption, textDescription: `Step ${filled} of ${cells - (R - 1) - (C - 1) || R * C}: ${caption}` });
    }
  }
  return {
    kind: "grid", title: `${a} against ${b}`,
    subtitle: `Rows follow A = ${a}. Columns follow B = ${b}. Each cell is the LCS length of two prefixes.`,
    rowLabel: "A", colLabel: "B", rowChars: ["-", ...a.split("")], colChars: ["-", ...b.split("")],
    values: G, steps,
    metaText: `Grid for ${a} against ${b}, step-through by cell.`,
  };
}

/** Simple two/three-box mechanism sketch (VZ-3 baseline; richer templates P1/free follow-ups). */
function buildSketch(topic: string): VisualSpec {
  const words = topic.replace(/\s+/g, " ").trim() || "the problem";
  const parts = words.split(/[,.]/).filter(Boolean);
  const a = (parts[0] || "Cause").slice(0, 28);
  const b = (parts[1] || "Effect").slice(0, 28);
  return {
    kind: "sketch", title: "Sketch", subtitle: "A two-box mechanism: what you named, and what it presses on.",
    rowLabel: "", colLabel: "", rowChars: [], colChars: [], values: null,
    sketch: [
      { shape: "box", x: 40, y: 90, w: 190, h: 64, text: a + " (input)" },
      { shape: "arrow", x: 250, y: 122, text: "" },
      { shape: "box", x: 320, y: 90, w: 190, h: 64, text: b + " (output)" },
      { shape: "label", x: 40, y: 190, text: "Add the missing middle: what turns one into the other?" },
    ],
    steps: [
      { r: 0, c: 0, value: null, reads: [], filledCells: 1, caption: "Step 1: name the two ends of the mechanism.", textDescription: "Sketch with two boxes connected by an arrow." },
    ],
    metaText: `Sketch generated from: ${words}`,
  };
}

export function buildVisual(sel: string): { spec: VisualSpec | null; error?: string } {
  const pair = parsePair(sel);
  if (pair) {
    const { a, b } = pair;
    if (a.length > 6 || b.length > 6) return { spec: null, error: "Grids work best with strings up to 6 letters each. Pick two shorter strings and I will trace them." };
    return { spec: buildLcs(a, b) };
  }
  const txt = sel.trim();
  if (!txt) return { spec: null, error: "Tell me what to trace — for example: ABCB against BDCB." };
  if (/dp\[|lcs|subsequence|longest/i.test(txt)) return { spec: null, error: "Name the two strings to trace, like: ABCB against BDCB." };
  return { spec: buildSketch(txt) };
}
