import { db, deleteUserTree } from "@/lib/db";
import { getSessionUser, jsonError, clearSessionCookie } from "@/lib/auth";

// GET — full account data export (AB-4)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const dump = {
    account: { email: user.email, name: user.name, plan: user.plan, joined: db.prepare("SELECT joined_at FROM users WHERE id=?").get(user.id) },
    notebooks: db.prepare("SELECT * FROM notebooks WHERE user_id=?").all(user.id),
    notes: db.prepare("SELECT * FROM notes WHERE user_id=?").all(user.id),
    margins: db.prepare("SELECT m.* FROM margins m JOIN notes n ON n.id=m.note_id WHERE n.user_id=?").all(user.id),
    ask_messages: db.prepare("SELECT a.* FROM ask_messages a JOIN notes n ON n.id=a.note_id WHERE n.user_id=?").all(user.id),
    visuals: db.prepare("SELECT v.* FROM visuals v JOIN notes n ON n.id=v.note_id WHERE n.user_id=?").all(user.id),
    versions: db.prepare("SELECT vv.* FROM versions vv JOIN notes n ON n.id=vv.note_id WHERE n.user_id=?").all(user.id),
  };
  return new Response(JSON.stringify(dump, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="marginalia-data.json"' },
  });
}

// POST {action:'theme'|'delete_request'|'delete_sure'}
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const b = await req.json() as { action: "theme" | "delete_request" | "delete_sure"; theme?: string };
  if (b.action === "theme") {
    const raw = user.settings || "{}";
    let cur: Record<string, unknown> = {};
    try { cur = JSON.parse(raw); } catch { /* default {} */ }
    cur.theme = b.theme === "dark" ? "dark" : b.theme === "system" ? "system" : "light";
    db.prepare("UPDATE users SET settings=? WHERE id=?").run(JSON.stringify(cur), user.id);
    return Response.json({ ok: true, theme: cur.theme });
  }
  if (b.action === "delete_request") {
    db.prepare("UPDATE users SET status='deletion_requested' WHERE id=?").run(user.id);
    return Response.json({ ok: true, status: "deletion_requested" });
  }
  if (b.action === "delete_sure") {
    // full wipe now (migration path: 30-day scheduled purge on request)
    deleteUserTree(db, user.id);
    return clearSessionCookie(Response.json({ ok: true }));
  }
  return jsonError(400, "Unknown action.");
}
