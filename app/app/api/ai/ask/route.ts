import { db, uid } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { askAI, journalAI } from "@/lib/providers";
import { TIERS, type Plan } from "@/lib/plans";
import { usageGet, usageIncr } from "@/lib/admin";

// POST /api/ai/ask  {noteId, kind:'chat'|'probe'|'journal', message, selection?, hintLevel}
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const b = await req.json() as { noteId?: string; kind: "chat" | "probe" | "journal"; message?: string; selection?: string; hintLevel?: number };
  const tier = TIERS[(user.plan || "free") as Plan] || TIERS.free;
  const u = usageGet(user.id);
  if (u.margin >= tier.notesMonth)
    return Response.json({ capped: true, error: "You have used your margin notes for this month. Upgrade for more headroom." }, { status: 429 });

  let noteText = "", noteId = "";
  if (b.noteId) {
    const n = db.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").get(b.noteId, user.id) as any;
    if (!n) return jsonError(404, "Note not found.");
    noteText = n.text as string; noteId = n.id as string;
  }

  // Journaling care runs offline (never routed to a vendor) and reports care kind.
  if (b.kind === "journal") {
    const r = journalAI(noteText, b.message || "");
    if (noteId) db.prepare("INSERT INTO ask_messages VALUES(?,?,?,?,?,?,?,?)").run(uid(), noteId, user.id, "assistant", r.body, r.kind, 0, Date.now());
    return Response.json({ body: r.body, kind: r.kind, provider: "offline-care" });
  }

  if (b.kind !== "chat" && b.kind !== "probe") return jsonError(400, "Unknown kind.");
  if (!noteText) return jsonError(400, "Note missing.");
  const focusOff = true; // Ask mode is explicit in both modes (PRD AK-*); focus mode silences proactive only
  void focusOff;
  const hist = (db.prepare("SELECT role,body FROM ask_messages WHERE note_id=? ORDER BY created_at DESC LIMIT 6").all(noteId) as { role: string; body: string }[]).reverse().map((r) => ({ role: r.role as "user" | "assistant", body: r.body }));
  const level = Math.max(1, Math.min(3, b.hintLevel || 1));
  const r = await askAI({
    kind: b.kind, noteText, selection: b.selection, history: hist,
    userMessage: b.message || (b.selection ? `Probe this: ${b.selection}` : "Help me with this note."),
    hintLevel: level,
    plan: (user.plan || "free") as Plan,
    strictness: "balanced",
  });
  const userLine = b.message || (b.selection ? `Probe: ${b.selection}` : "");
  if (userLine) db.prepare("INSERT INTO ask_messages VALUES(?,?,?,?,?,?,?,?)").run(uid(), noteId, user.id, "user", userLine.slice(0, 2000), "nudge", 0, Date.now());
  db.prepare("INSERT INTO ask_messages VALUES(?,?,?,?,?,?,?,?)").run(uid(), noteId, user.id, "assistant", r.body, r.kind, r.level, Date.now());
  usageIncr(user.id, "margin");
  return Response.json({ body: r.body, kind: r.kind, level: r.level, provider: r.provider });
}
