import { db, uid, parseSettings, userAiConfig, transact } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { marginNotes } from "@/lib/providers";
import { CAPS } from "@/lib/plans";
import { usageGet, usageIncr } from "@/lib/admin";
import { capWords } from "@/lib/engine";
import { userWordsInDoc, plainText, type Doc } from "@/lib/exporters";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const { id } = await ctx.params;
  // ownership: margins belong to the note owner only (blocker fix: IDOR on user content)
  return Response.json({
    margins: db.prepare(
      "SELECT m.* FROM margins m JOIN notes n ON n.id=m.note_id WHERE n.id=? AND n.user_id=? AND m.review_state IS NULL ORDER BY m.num"
    ).all(id, user.id),
  });
}

// POST /api/notes/[id]/margins  {action: evaluate|reply|dismiss|pin|rate|convert, ...}
export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const { id } = await ctx.params;
  const note = db.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").get(id, user.id) as any;
  if (!note) return jsonError(404, "Note not found.");
  const b = await req.json() as {
    action: "evaluate" | "reply" | "dismiss" | "pin" | "unpin" | "rate" | "convert";
    blocks?: { id: string; text: string }[]; changedIds?: string[]; pace?: string;
    marginId?: string; body?: string; rating?: number;
  };
  const tier = CAPS; // SP1: single fair-use tier
  const nextNum = () => (db.prepare("SELECT COALESCE(MAX(num),0) m FROM margins WHERE note_id=?").get(id) as { m: number }).m + 1;

  if (b.action === "evaluate") {
    if (note.private) return Response.json({ ok: true, notes: [], provider: "journal-quiet" }); // Journal (Ask default) stays quiet in Think mode
    const u = usageGet(user.id);
    if (u.margin >= tier.notesMonth)
      return Response.json({ capped: true, error: "You have used your free monthly margin limit — it resets next month." }, { status: 429 });
    const all = (b.blocks || []).slice(0, 400).map((x) => ({ id: String(x.id).slice(0, 64), text: String(x.text || "").slice(0, 4000) }));
    const changedIds = (b.changedIds || []).slice(0, 40).map(String);
    // forward only changed blocks plus a short tail for context — bounds the per-call vendor payload
    const changed = all.filter((x) => changedIds.includes(x.id));
    const fwd: typeof changed = [];
    const seen = new Set<string>();
    for (const x of [...changed, ...all.slice(-10)]) {
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      fwd.push(x);
      if (fwd.length >= 40) break;
    }
    const blocks = fwd;
    const dismissed = (db.prepare("SELECT body FROM margins WHERE note_id=? AND status IN ('dismissed','thread')").all(id) as { body: string }[]).map((r) => r.body);
    const pace = (b.pace || "slow") as "slow" | "normal" | "frequent";
    const cfg = userAiConfig(user.id);
    const res = await marginNotes({ blocks, changedIds, pace, dismissed, noteWords: note.words as number }, cfg);
    const created: unknown[] = [];
    transact(db, () => {
      for (const d of res.notes) {
        const mid = uid();
        db.prepare("INSERT INTO margins(id,note_id,user_id,anchor,num,type,body,status,level,want_visual,created_at,orig_created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(mid, id, user.id, d.anchor, nextNum(), d.type, capWords(d.body), "open", 1, d.wantVisual ? 1 : 0, Date.now(), Date.now());
        usageIncr(user.id, "margin");
        created.push(db.prepare("SELECT * FROM margins WHERE id=?").get(mid));
      }
    });
    return Response.json({ notes: created.reverse(), provider: res.provider, capped: false });
  }

  if (b.action === "reply") {
    const body = (b.body || "").slice(0, 2000);
    if (!body.trim()) return jsonError(400, "Empty reply.");
    if (b.marginId) {
      const u = usageGet(user.id);
      if (u.margin >= tier.notesMonth)
        return Response.json({ capped: true, error: "You have used your free monthly margin limit — it resets next month." }, { status: 429 });
      const m = db.prepare("SELECT * FROM margins WHERE id=? AND note_id=? AND user_id=?").get(b.marginId, id, user.id) as any;
      if (!m) return jsonError(404, "Margin note not found.");
      const transcript = (m.reply ? m.reply + "\n" : "") + "You: " + body;
      db.prepare("UPDATE margins SET reply=? WHERE id=?").run(transcript, m.id);
      usageIncr(user.id, "margin");
      return Response.json({ ok: true, reply: transcript });
    } else {
      // free-standing question in the margin panel → behaves like Ask, lands as chat
      const u = usageGet(user.id);
      if (u.margin >= tier.notesMonth)
        return Response.json({ capped: true, error: "You have used your free monthly margin limit — it resets next month." }, { status: 429 });
      const mid = uid();
      db.prepare("INSERT INTO ask_messages VALUES(?,?,?,?,?,?,?,?)").run(mid, id, user.id, "user", body, "nudge", 0, Date.now());
      let strictness: "strict" | "balanced" | "direct" = "balanced";
      const ns = parseSettings(String(note.settings)).strictness as string;
      if (ns === "strict") strictness = "strict";
      if (ns === "direct") strictness = "direct";
      const answer = await import("@/lib/providers").then((p) =>
        p.askAI({ kind: "chat", noteText: note.text, history: [], userMessage: body, hintLevel: 1, strictness }, userAiConfig(user.id))
      );
      const aid = uid();
      db.prepare("INSERT INTO ask_messages VALUES(?,?,?,?,?,?,?,?)").run(aid, id, user.id, "assistant", answer.body, answer.kind, answer.level, Date.now());
      usageIncr(user.id, "margin");
      return Response.json({ ok: true, asked: { user: body, assistant: answer.body, kind: answer.kind, level: answer.level, provider: answer.provider } });
    }
  }

  const m = b.marginId && (db.prepare("SELECT * FROM margins WHERE id=? AND note_id=? AND user_id=?").get(b.marginId, id, user.id) as any);
  if (["dismiss", "pin", "unpin", "rate", "convert"].includes(b.action) && !m) return jsonError(404, "Margin note not found.");

  if (b.action === "dismiss") { db.prepare("UPDATE margins SET status='dismissed' WHERE id=?").run(m.id); return Response.json({ ok: true }); }
  if (b.action === "pin") { db.prepare("UPDATE margins SET status='pinned' WHERE id=?").run(m.id); return Response.json({ ok: true }); }
  if (b.action === "unpin") { db.prepare("UPDATE margins SET status='open' WHERE id=?").run(m.id); return Response.json({ ok: true }); }
  if (b.action === "rate") { db.prepare("UPDATE margins SET rating=? WHERE id=?").run(b.rating === -1 ? -1 : 1, m.id); return Response.json({ ok: true }); }

  if (b.action === "convert") {
    // TW-4: accepted thread — insert the AI note into the body as a visibly-AI quote block
    const doc = JSON.parse(note.content_json || "{}") as Doc;
    const idx = (doc.content || []).findIndex((bl) => (bl.attrs as { id?: string } | undefined)?.id === m.anchor);
    const at = idx >= 0 ? idx + 1 : (doc.content || []).length;
    (doc.content || []).splice(at, 0, {
      type: "paragraph", attrs: { id: `${id}-ai-${m.id.slice(0, 8)}`, ai: "1" },
      content: [{ type: "text", marks: [{ type: "italic" }], text: `AI (${m.type}): ${m.body}` }],
    });
    const text = plainText(doc);
    const uw = userWordsInDoc(doc);
    db.prepare("UPDATE notes SET content_json=?, text=?, words=?, ai_words=?, updated_at=? WHERE id=?")
      .run(JSON.stringify(doc), text, uw, Math.max(0, text.trim().split(/\s+/).filter(Boolean).length - uw), Date.now(), id);
    db.prepare("UPDATE margins SET status='thread' WHERE id=?").run(m.id);
    return Response.json({ ok: true, doc });
  }
  return jsonError(400, "Unknown action.");
}
