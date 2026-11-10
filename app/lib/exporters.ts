import type { MarginRow } from "./db.ts";

// Tiptap JSON -> plain text / markdown / Word-HTML. AI-inserted paragraphs carry
// attrs.ai = "1"; Hide-AI export strips them (EX-2).

interface TNode { type: string; attrs?: Record<string, unknown>; text?: string; content?: TNode[]; marks?: { type: string }[] }
export interface Doc { type: "doc"; content: TNode[] }

export function plainText(docJson: Doc): string {
  const parts: string[] = [];
  for (const b of docJson.content || []) {
    if (b.type === "codeBlock") { parts.push(b.content?.map((r) => r.text).join("") || ""); continue; }
    parts.push(runsOf(b));
  }
  return parts.filter(Boolean).join(" ");
}
function runsOf(b: TNode): string {
  return (b.content || []).map((r) => r.text ?? "").join("");
}

export function userWordsInDoc(docJson: Doc): number {
  const t = (docJson.content || []).filter((b) => !b.attrs?.ai).map(runsOf).join(" ");
  return t.trim() ? t.trim().split(/\s+/).length : 0;
}

function mdRuns(b: TNode): string {
  return (b.content || []).map((r) => {
    let t = r.text ?? "";
    if (r.marks?.some((m) => m.type === "code")) t = "`" + t + "`";
    if (r.marks?.some((m) => m.type === "italic")) t = "*" + t + "*";
    if (r.marks?.some((m) => m.type === "bold")) t = "**" + t + "**";
    return t;
  }).join("");
}

export function toMarkdown(title: string, docJson: Doc, opts: { hideAi: boolean; margins: MarginRow[]; footnotes: boolean }): string {
  const lines: string[] = ["# " + title, ""];
  const fns: string[] = [];
  (docJson.content || []).forEach((b, i) => {
    if (opts.hideAi && b.attrs?.ai) return;
    if (b.type === "codeBlock") {
      lines.push("```", b.content?.map((r) => r.text).join("") || "", "```", "");
    } else if (b.type === "heading") {
      lines.push("#".repeat(Number(b.attrs?.level || 2)) + " " + mdRuns(b), "");
    } else if (b.type === "image") {
      lines.push(`![${String(b.attrs?.alt || "image")}](${String(b.attrs?.src || "")})`, "");
    } else if (b.type === "bulletList" || b.type === "orderedList") {
      (b.content || []).filter((li) => li.type === "listItem").forEach((li, idx) => {
        const txt = (li.content || []).filter((p) => p.type === "paragraph").map((p) => mdRuns(p)).join(" / ");
        lines.push(b.type === "bulletList" ? "- " + txt : `${idx + 1}. ` + txt);
      });
      lines.push("");
    } else {
      if (b.attrs?.ai) { lines.push("> " + mdRuns(b), ""); return; }
      lines.push(mdRuns(b), "");
      if (opts.footnotes) {
        const anchors = opts.margins.filter((m) => m.anchor === b.attrs?.id && m.status !== "dismissed");
        anchors.forEach((m) => fns.push(`[^note-${m.num}]: (Marginalia, ${m.type}) ${m.body}`));
        if (anchors.length) lines[lines.length - 2] += " " + anchors.map((m) => `[^note-${m.num}]`).join(" ");
      }
    }
    void i;
  });
  if (opts.footnotes && fns.length) lines.push("", "---", ...fns);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

/** Word-compatible HTML (opens in Word/Google Docs). ponytail: upgrade path = docx lib for real .docx. */
export function toWordHtml(title: string, docJson: Doc, opts: { hideAi: boolean; margins: MarginRow[]; footnotes: boolean }): string {
  const body = (docJson.content || []).map((b) => {
    if (opts.hideAi && b.attrs?.ai) return "";
    if (b.type === "image") return `<p><img src="${esc(String(b.attrs?.src || ""))}" alt="${esc(String(b.attrs?.alt || "image"))}"/></p>`;
    const runs = (b.content || []).map((r) => {
      const t = esc(r.text ?? "");
      if (!t) return "";
      let s = t;
      if (r.marks?.some((m) => m.type === "code")) s = `<span style="font-family:Consolas,monospace">${s}</span>`;
      if (r.marks?.some((m) => m.type === "italic")) s = `<i>${s}</i>`;
      if (r.marks?.some((m) => m.type === "bold")) s = `<b>${s}</b>`;
      return s;
    }).join("");
    if (b.attrs?.ai) return `<p><i>${runs}</i></p>`;
    return `<p>${runs}</p>`;
  }).join("\n");
  const fns = opts.footnotes
    ? `<hr/><p>Margin notes</p>${opts.margins.filter((m) => m.status !== "dismissed").map((m) => `<p><small>(${m.type}) ${esc(m.body)}</small></p>`).join("")}`
    : "";
  return `<html><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="font-family:Georgia,serif;font-size:12pt;line-height:1.6;max-width:640px">
<h1 style="font-family:Georgia">${esc(title)}</h1>
${body}${fns}
</body></html>`;
}

/** Print-friendly HTML for the browser-print PDF route (browser saves as PDF).
 *  Auto-print runs from one hash-pinned inline script, so the route's CSP can deny every other source (sandbox in depth). */
export const PRINT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src * data:; script-src 'sha256-fqHSqjhW23E2S+2okoLQJgqx61AEBdVb6z+4iv1h2+E='";

export function toPrintHtml(title: string, docJson: Doc, opts: { hideAi: boolean; margins: MarginRow[]; footnotes: boolean }): string {
  return toWordHtml(title, docJson, opts)
    .replace("font-size:12pt", "font-size:12pt;background:white;color:#111")
    .replace("</body>", "<script>window.addEventListener(\"load\",()=>{window.print()});</script></body>");
}
