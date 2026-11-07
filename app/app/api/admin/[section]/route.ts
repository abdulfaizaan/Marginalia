import { db, uid } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { metrics, auditLog } from "@/lib/admin";

type Ctx = { params: Promise<{ section: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return jsonError(403, "Admins only.");
  const { section } = await ctx.params;
  const url = new URL(req.url);

  if (section === "overview") {
    const flagged = db.prepare("SELECT id,type,body,note_id FROM margins WHERE review_state='flagged' ORDER BY created_at LIMIT 12").all();
    const activity = db.prepare("SELECT action,detail,created_at FROM audit ORDER BY created_at DESC LIMIT 4").all();
    return Response.json({ m: metrics(), flagged, activity });
  }
  if (section === "users") {
    const filter = url.searchParams.get("plan") || "All";
    const q = (url.searchParams.get("q") || "").toLowerCase().trim();
    let rows = db.prepare("SELECT id,email,name,plan,promo,joined_at,last_active,status FROM users WHERE role!='admin' ORDER BY joined_at").all() as any[];
    if (filter !== "All") rows = rows.filter((r) => r.plan.toLowerCase() === filter.toLowerCase());
    if (q) rows = rows.filter((r) => r.email.toLowerCase().includes(q));
    return Response.json({ users: rows });
  }
  if (section === "promo-codes") {
    const codes = db.prepare("SELECT code,total,used,note FROM promo_codes ORDER BY rowid").all();
    return Response.json({ codes });
  }
  if (section === "ai-quality") {
    // user text stays hidden: reviewers see the AI note only
    const queue = db.prepare("SELECT id,type,body,review_state FROM margins WHERE review_state='flagged' ORDER BY created_at DESC").all();
    const rated = db.prepare("SELECT body,type,rating FROM margins WHERE rating IS NOT NULL ORDER BY orig_created_at DESC LIMIT 40").all();
    return Response.json({ queue, rated });
  }
  if (section === "audit-log") {
    return Response.json({ entries: db.prepare("SELECT admin,action,detail,created_at FROM audit ORDER BY created_at DESC LIMIT 100").all() });
  }
  return jsonError(404, "Unknown section.");
}

// POST actions: promo create; review resolve; user deletion completion
export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return jsonError(403, "Admins only.");
  const { section } = await ctx.params;
  const b = await req.json() as { action: string; code?: string; total?: number; note?: string; id?: string; userId?: string; decision?: string };
  if (b.action === "add_promo" && section === "promo-codes") {
    const code = (b.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) return jsonError(400, "Code: 4-16 letters/digits.");
    if (!b.total || b.total < 1 || b.total > 100000) return jsonError(400, "Total redemptions 1-100000.");
    if (db.prepare("SELECT 1 FROM promo_codes WHERE code=?").get(code)) return jsonError(409, "That code exists.");
    db.prepare("INSERT INTO promo_codes VALUES(?,?,0,?)").run(code, b.total, b.note?.slice(0, 80) || "");
    auditLog(user.email, `Promo created: ${code} x${b.total}`);
    return Response.json({ ok: true });
  }
  if (b.action === "review" && section === "ai-quality") {
    if (!b.id) return jsonError(400, "Missing note id.");
    const m = db.prepare("SELECT id FROM margins WHERE id=? AND review_state='flagged'").get(b.id);
    if (!m) return jsonError(404, "Flagged note not found.");
    db.prepare("UPDATE margins SET review_state=? WHERE id=?").run(b.decision === "flag_ok" ? null : "resolved", b.id);
    auditLog(user.email, b.decision === "flag_ok" ? "AI note kept after review" : "AI note marked unhelpful after review", "AI note only — user text hidden");
    return Response.json({ ok: true });
  }
  if (b.action === "complete_deletion") {
    if (!b.userId) return jsonError(400, "Missing user id.");
    const u = db.prepare("SELECT id,email,status FROM users WHERE id=?").get(b.userId) as { id: string; email: string; status: string } | undefined;
    if (!u) return jsonError(404, "User not found.");
    const ids = (db.prepare("SELECT id FROM notes WHERE user_id=?").all(u.id) as { id: string }[]).map((r) => r.id);
    for (const id of ids) for (const t of ["margins", "ask_messages", "visuals", "versions"]) db.prepare(`DELETE FROM ${t} WHERE note_id=?`).run(id);
    for (const t of ["notes", "notebooks", "sessions", "promo_redemptions", "usage"]) db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(u.id);
    db.prepare("DELETE FROM users WHERE id=?").run(u.id);
    auditLog(user.email, "Account deletion completed", u.email);
    return Response.json({ ok: true });
  }
  return jsonError(400, "Unknown action.");
}
