import { db } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { toMarkdown, toWordHtml, toPrintHtml, type Doc } from "@/lib/exporters";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/notes/[id]/export?fmt=md|word|print|pdf&ai=hide|include&foot=1
export async function GET(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const fmt = url.searchParams.get("fmt") || "md";
  const note = db.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").get(id, user.id) as any;
  if (!note) return jsonError(404, "Note not found.");

  // hide-AI is a per-user choice — enforced here, not just in the UI
  const hideAi = url.searchParams.get("ai") === "hide";
  const footnotes = url.searchParams.get("foot") === "1";
  const margins = db.prepare("SELECT * FROM margins WHERE note_id=?").all(id) as never[];
  const title = note.title as string;
  const fileBase = (title.replace(/[^\w -]+/g, "").trim() || "note").slice(0, 60);

  if (fmt === "md") {
    const md = toMarkdown(title, JSON.parse(note.content_json) as Doc, { hideAi, margins, footnotes });
    return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${fileBase}.md"` } });
  }
  if (fmt === "print" || fmt === "pdf") {
    const html = toPrintHtml(title, JSON.parse(note.content_json) as Doc, { hideAi, margins, footnotes });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const html = toWordHtml(title, JSON.parse(note.content_json) as Doc, { hideAi, margins, footnotes });
  return new Response(html, { headers: { "content-type": "application/msword", "content-disposition": `attachment; filename="${fileBase}.doc"` } });
}
