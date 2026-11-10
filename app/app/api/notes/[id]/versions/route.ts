import { db, uid, transact } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { CAPS } from "@/lib/plans";
import { userWordsInDoc, plainText, type Doc } from "@/lib/exporters";

type Ctx = { params: Promise<{ id: string }> };

// GET — version list (plan retention window: 7 / 30 / unlimited)
export async function GET(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const { id } = await ctx.params;
  const cutoff = CAPS.versionsDays ? Date.now() - CAPS.versionsDays * 86_400_000 : 0;
  // ownership: this note must belong to the caller
  const owned = db.prepare("SELECT id FROM notes WHERE id=? AND user_id=?").get(id, user.id);
  if (!owned) return jsonError(404, "Note not found.");
  const rows = db.prepare("SELECT id,words,created_at FROM versions WHERE note_id=? AND created_at>? ORDER BY created_at DESC LIMIT 60").all(id, cutoff);
  // housekeeping: prune beyond window
  if (cutoff) db.prepare("DELETE FROM versions WHERE note_id=? AND created_at<=?").run(id, cutoff);
  return Response.json({ versions: rows, retentionDays: CAPS.versionsDays });
}

// POST — restore a version into the live note (snapshots current state first)
export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const { id } = await ctx.params;
  const note = db.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").get(id, user.id) as any;
  if (!note) return jsonError(404, "Note not found.");
  const { versionId } = await req.json() as { versionId: string };
  const v = db.prepare("SELECT * FROM versions WHERE id=? AND note_id=?").get(versionId, id) as any;
  if (!v) return jsonError(404, "Version not found.");

  // snapshot current, then restore — one transaction so the note is never left half-restored
  const doc = JSON.parse(v.content_json as string) as Doc;
  transact(db, () => {
    db.prepare("INSERT INTO versions(id,note_id,content_json,words,created_at) VALUES(?,?,?,?,?)")
      .run(uid(), id, note.content_json, note.words, Date.now());
    const text = plainText(doc);
    const uw = userWordsInDoc(doc);
    db.prepare("UPDATE notes SET content_json=?, text=?, words=?, ai_words=?, updated_at=? WHERE id=?")
      .run(v.content_json, text, uw, Math.max(0, text.trim().split(/\s+/).filter(Boolean).length - uw), Date.now(), id);
  });
  return Response.json({ ok: true, doc });}
