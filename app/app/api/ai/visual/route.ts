import { db, uid } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { buildVisual } from "@/lib/visualize";
import { CAPS } from "@/lib/plans";
import { usageGet, usageIncr } from "@/lib/admin";
import { userWordsInDoc, plainText, type Doc } from "@/lib/exporters";

// POST /api/ai/visual  {noteId, action:'create'|'pin', selection?, visualId?}
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const b = await req.json() as { noteId: string; action: "create" | "pin"; selection?: string; visualId?: string };
  const tier = CAPS; // SP1: single fair-use tier
  const note = db.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").get(b.noteId, user.id) as any;
  if (!note) return jsonError(404, "Note not found.");
  const reindex = (doc: Doc) => {
    const text = plainText(doc);
    const uw = userWordsInDoc(doc);
    db.prepare("UPDATE notes SET content_json=?, text=?, words=?, ai_words=?, updated_at=? WHERE id=?")
      .run(JSON.stringify(doc), text, uw, Math.max(0, text.trim().split(/\s+/).filter(Boolean).length - uw), Date.now(), b.noteId);
  };

  if (b.action === "create") {
    const u = usageGet(user.id);
    if (u.visuals >= tier.visualsMonth)
      return Response.json({ capped: true, error: "Your free monthly visual limit is used up." }, { status: 429 });
    const { spec, error } = buildVisual(b.selection || String(note.text).slice(-400));
    if (!spec) return Response.json({ error: error || "Could not build a visual from that." }, { status: 400 });
    const id = uid();
    db.prepare("INSERT INTO visuals VALUES(?,?,?,?,?)").run(id, b.noteId, user.id, JSON.stringify(spec), Date.now());
    usageIncr(user.id, "visuals");
    return Response.json({ id, spec });
  }

  if (b.action === "pin") {
    const v = b.visualId && (db.prepare("SELECT * FROM visuals WHERE id=? AND user_id=?").get(b.visualId, user.id) as any);
    if (!v) return jsonError(404, "Visualization not found.");
    const spec = JSON.parse(v.spec as string) as { title: string; kind: string };
    const doc = JSON.parse(note.content_json || "{}") as Doc;
    (doc.content || []).push({
      type: "paragraph", attrs: { id: `${b.noteId}-pin-${v.id.slice(0, 8)}`, ai: "1", pinnedVisual: v.id },
      content: [{ type: "text", marks: [{ type: "code" }], text: `Pinned visual — ${spec.kind === "grid" ? "step-through grid" : "sketch"}: ${spec.title} (open the visualizer to step through)` }],
    });
    reindex(doc);
    db.prepare("UPDATE notes SET pinned_visual=? WHERE id=?").run(v.spec as string, b.noteId);
    return Response.json({ ok: true });
  }
  return jsonError(400, "Unknown action.");
}
