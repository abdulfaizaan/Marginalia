import { db, uid } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";

// GET /api/notes?notebook=<id> — library list with margin-note counts
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const url = new URL(req.url);
  const notebook = url.searchParams.get("notebook");
  const notes = db.prepare(
    `SELECT n.id,n.title,n.updated_at,n.words,n.private,n.mode,nb.name AS notebook
     FROM notes n JOIN notebooks nb ON nb.id=n.notebook_id
     WHERE n.user_id=? ${notebook ? "AND n.notebook_id=?" : ""}
     ORDER BY n.updated_at DESC`
  ).all(...(notebook ? [user.id, notebook] : [user.id])) as { id: string; title: string; updated_at: number; words: number; private: number; mode: string; notebook: string }[];
  const counts = db.prepare(
    `SELECT note_id,
      SUM(type='error') errors, SUM(type='question') questions,
      SUM(type='direction') directions, SUM(type='challenge') challenges, SUM(status='pinned') pinnedCnt
     FROM margins WHERE user_id=? GROUP BY note_id`
  ).all(user.id) as { note_id: string; errors: number; questions: number; directions: number; challenges: number; pinnedCnt: number }[];
  const byNote = Object.fromEntries(counts.map((c) => [c.note_id, c]));
  const hasPinned = new Set(Object.entries(byNote).filter(([, c]) => c.pinnedCnt > 0).map(([id]) => id));
  return Response.json({
    notes: notes.map((n) => ({
      ...n,
      margins: (byNote[n.id]?.errors || 0) + (byNote[n.id]?.questions || 0) + (byNote[n.id]?.directions || 0) + (byNote[n.id]?.challenges || 0),
      chips: { error: byNote[n.id]?.errors || 0, question: byNote[n.id]?.questions || 0, direction: byNote[n.id]?.directions || 0 },
      pinned: hasPinned.has(n.id),
    })),
  });
}

// POST /api/notes {notebookId?} — create (Journal → private + Ask default)
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const b = (await req.json().catch(() => ({}))) as { notebookId?: string };
  const nb = b.notebookId
    ? db.prepare("SELECT * FROM notebooks WHERE id=? AND user_id=?").get(b.notebookId, user.id)
    : db.prepare("SELECT * FROM notebooks WHERE user_id=? ORDER BY position LIMIT 1").get(user.id);
  if (!nb) return jsonError(400, "Notebook missing.");
  const n = nb as { id: string; name: string; is_journal: number };
  const id = uid();
  const now = Date.now();
  const doc = { type: "doc", content: [{ type: "paragraph", attrs: { id: `${id}-p1` } }] };
  db.prepare(
    `INSERT INTO notes(id,user_id,notebook_id,title,content_json,text,words,ai_words,mode,settings,private,pinned_visual,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, user.id, n.id, "Untitled", JSON.stringify(doc), "", 0, 0,
    n.is_journal ? "ask" : "think",
    JSON.stringify({ pace: "slow", strictness: "balanced", margins: "single", focus: false, font: "serif", size: 2 }),
    n.is_journal ? 1 : 0, null, now, now
  );
  return Response.json({ id, mode: n.is_journal ? "ask" : "think" });
}
