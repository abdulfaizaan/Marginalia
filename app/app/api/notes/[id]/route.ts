import { db, uid, parseSettings } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { userWordsInDoc, type Doc } from "@/lib/exporters";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const { id } = await ctx.params;
  const note = db.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").get(id, user.id) as Record<string, unknown> | undefined;
  if (!note) return jsonError(404, "Note not found.");
  return Response.json({
    note,
    margins: db.prepare("SELECT * FROM margins WHERE note_id=? AND status!='dismissed' AND review_state IS NULL ORDER BY num").all(id),
    askMessages: db.prepare("SELECT * FROM ask_messages WHERE note_id=? ORDER BY created_at").all(id),
    visuals: db.prepare("SELECT * FROM visuals WHERE note_id=? ORDER BY created_at DESC").all(id),
  });
}

// autosave: content/text/title/mode/settings recomputed server-side + word counts
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const { id } = await ctx.params;
  const note = db.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").get(id, user.id) as any;
  if (!note) return jsonError(404, "Note not found.");
  const b = await req.json() as { title?: string; doc?: Doc; text?: string; mode?: "think" | "ask"; settings?: Record<string, unknown> };
  const title = (b.title ?? note.title as string).slice(0, 120);
  let docStr: string | undefined; let text: string | undefined; let words: number | undefined; let aiWords: number | undefined;
  if (b.doc) {
    docStr = JSON.stringify(b.doc);
    text = (b.text ?? "").slice(0, 200_000);
    words = userWordsInDoc(b.doc);
    const total = (b.text || "").trim().split(/\s+/).filter(Boolean).length;
    aiWords = Math.max(0, total - words);
  }
  let settingsStr: string | undefined;
  if (b.settings) settingsStr = JSON.stringify({ ...parseSettings(note.settings as string), ...b.settings, theme: undefined });
  db.prepare(
    `UPDATE notes SET title=?, content_json=COALESCE(?,content_json), text=COALESCE(?,text),
     words=COALESCE(?,words), ai_words=COALESCE(?,ai_words), mode=COALESCE(?,mode),
     settings=COALESCE(?,settings), updated_at=? WHERE id=?`
  ).run(title, docStr ?? null, text ?? null, words ?? null, aiWords ?? null, b.mode ?? null, settingsStr ?? null, Date.now(), id);

  // version snapshot: at most one per 10 minutes of writing (time-based, cheap)
  if (docStr) {
    const last = db.prepare("SELECT created_at FROM versions WHERE note_id=? ORDER BY created_at DESC LIMIT 1").get(id) as { created_at: number } | undefined;
    if (!last || Date.now() - last.created_at > 10 * 60_000) {
      db.prepare("INSERT INTO versions(id,note_id,content_json,words,created_at) VALUES(?,?,?,?,?)")
        .run(uid(), id, docStr, words ?? note.words, Date.now());
    }
  }
  return Response.json({ ok: true, savedAt: Date.now() });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const { id } = await ctx.params;
  const note = db.prepare("SELECT id FROM notes WHERE id=? AND user_id=?").get(id, user.id);
  if (!note) return jsonError(404, "Not found.");
  for (const q of ["DELETE FROM margins WHERE note_id=?", "DELETE FROM ask_messages WHERE note_id=?", "DELETE FROM visuals WHERE note_id=?", "DELETE FROM versions WHERE note_id=?", "DELETE FROM notes WHERE id=?"]) db.prepare(q).run(id);
  return Response.json({ ok: true });
}
