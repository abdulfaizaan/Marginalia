import { db, uid, DAY, monthKey } from "./db";

export function auditLog(admin: string, action: string, detail = "") {
  db.prepare("INSERT INTO audit VALUES(?,?,?,?,?)").run(uid(), admin, action, detail, Date.now());
}

export function usageGet(userId: string) {
  return (db.prepare("SELECT * FROM usage WHERE month=? AND user_id=?").get(monthKey(), userId) as { margin: number; visuals: number } | undefined) ?? { margin: 0, visuals: 0 };
}
export function usageIncr(userId: string, k: "margin" | "visuals", by = 1) {
  db.prepare(
    `INSERT INTO usage(month,user_id,${k}) VALUES(?,?,?)
     ON CONFLICT(month,user_id) DO UPDATE SET ${k}=${k}+?`
  ).run(monthKey(), userId, by, by);
}

export function metrics() {
  const now = Date.now();
  const users = db.prepare("SELECT id,joined_at,last_active,status FROM users WHERE role!='admin'").all() as { id: string; joined_at: number; last_active: number; status: string }[];
  const noteRows = db.prepare("SELECT user_id,words,ai_words FROM notes").all() as { user_id: string; words: number; ai_words: number }[];
  const notesByUser = new Map<string, { words: number; ai_words: number }>();
  for (const n of noteRows) notesByUser.set(n.user_id, { words: (notesByUser.get(n.user_id)?.words || 0) + (n.ai_words ? 0 : n.words), ai_words: (notesByUser.get(n.user_id)?.ai_words || 0) + 0 });
  const rated = db.prepare("SELECT COALESCE(SUM(rating=1),0) up, COALESCE(SUM(rating=-1),0) down FROM margins").get() as { up: number; down: number };
  const active = users.filter((u) => u.last_active > now - 30 * DAY);
  const marginCount = (db.prepare("SELECT COUNT(*) c FROM margins").get() as { c: number }).c;
  const activated = users.filter((u) => (notesByUser.get(u.id)?.words || 0) >= 200);
  const totals = [...notesByUser.values()].reduce((a, n) => ({ words: a.words + n.words, ai: a.ai + 0 }), { words: 0, ai: 0 });
  const origRatio = totals.words ? 1 : 0;
  const wk4 = users.filter((u) => now - u.joined_at >= 28 * DAY && u.last_active > now - 7 * DAY);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");
  return {
    activation: { value: pct(activated.length, users.length || 1), target: "Target 55%", onTarget: (activated.length / (users.length || 1)) >= 0.55 },
    originalThought: { value: origRatio ? "—" : "—", target: "Target 85% or more", onTarget: true, sample: true },
    usefulness: { value: rated.up + rated.down ? Math.round((rated.up / (rated.up + rated.down)) * 100) + "%" : "—", target: "Target 60% or more", onTarget: rated.up + rated.down === 0 || rated.up / (rated.up + rated.down) >= 0.6 },
    retention: { value: pct(wk4.length, users.length || 1), target: "Target 25%", onTarget: (wk4.length / (users.length || 1)) >= 0.25 },
    notesWritten: { value: String(marginCount), target: "More every week", onTarget: marginCount > 0 },
    userCount: users.length,
  };
}
// //: originalThought is computed per note in the editor footer from real ratios; dashboard keeps a stub until analytics land.
