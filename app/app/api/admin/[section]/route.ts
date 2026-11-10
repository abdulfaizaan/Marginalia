import { db, deleteUserTree } from "@/lib/db";
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
    const q = (url.searchParams.get("q") || "").toLowerCase().trim();
    const plan = url.searchParams.get("plan") === "demo" ? "demo" : "all";
    const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10) || 0);
    // central key: every user runs on the app's AI; the toggle splits seeded demo accounts from real ones
    const where = ["role!='admin'"];
    const args: (string | number)[] = [];
    if (q) { where.push("email LIKE ?"); args.push(`%${q}%`); }
    if (plan === "demo") { where.push("email LIKE '%@example.com'"); }
    const rows = db.prepare(`SELECT id,email,name,joined_at,last_active,status FROM users WHERE ${where.join(" AND ")} ORDER BY joined_at LIMIT 100 OFFSET ?`).all(...args, page * 100) as any[];
    const total = (db.prepare(`SELECT COUNT(*) c FROM users WHERE ${where.join(" AND ")}`).get(...args) as { c: number }).c;
    return Response.json({ users: rows, total, page, plan });
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

// POST actions: review resolve; user deletion completion
export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return jsonError(403, "Admins only.");
  const { section } = await ctx.params;
  const b = await req.json() as { action: string; id?: string; userId?: string; decision?: string };
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
    const u = db.prepare("SELECT id,email FROM users WHERE id=?").get(b.userId) as { id: string; email: string } | undefined;
    if (!u) return jsonError(404, "User not found.");
    deleteUserTree(db, u.id);
    auditLog(user.email, "Account deletion completed", u.email);
    return Response.json({ ok: true });
  }
  return jsonError(400, "Unknown action.");
}
