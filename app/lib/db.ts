import { DatabaseSync } from "node:sqlite";
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------- schema ----------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT 'free', role TEXT NOT NULL DEFAULT 'user',
  promo TEXT, promo_months INT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
  age_ok INT NOT NULL DEFAULT 1, settings TEXT NOT NULL DEFAULT '{}',
  joined_at INT NOT NULL, last_active INT NOT NULL,
  ai_vendor TEXT, ai_key_enc BLOB, ai_model TEXT, ai_base TEXT
);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INT NOT NULL, expires_at INT NOT NULL);
CREATE TABLE IF NOT EXISTS notebooks(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, is_journal INT NOT NULL DEFAULT 0, position INT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, notebook_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Untitled',
  content_json TEXT NOT NULL DEFAULT '[]', text TEXT NOT NULL DEFAULT '', words INT NOT NULL DEFAULT 0, ai_words INT NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'think', settings TEXT NOT NULL DEFAULT '{}', private INT NOT NULL DEFAULT 0,
  pinned_visual TEXT, created_at INT NOT NULL, updated_at INT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY, note_id TEXT NOT NULL, content_json TEXT NOT NULL, words INT NOT NULL, created_at INT NOT NULL);
CREATE TABLE IF NOT EXISTS margins(
  id TEXT PRIMARY KEY, note_id TEXT NOT NULL, user_id TEXT NOT NULL, anchor TEXT NOT NULL DEFAULT '',
  num INT NOT NULL, type TEXT NOT NULL, body TEXT NOT NULL, reply TEXT,
  status TEXT NOT NULL DEFAULT 'open', rating INT, level INT NOT NULL DEFAULT 1,
  want_visual INT NOT NULL DEFAULT 0, review_state TEXT, created_at INT NOT NULL, orig_created_at INT
);
CREATE TABLE IF NOT EXISTS ask_messages(id TEXT PRIMARY KEY, note_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'nudge', level INT NOT NULL DEFAULT 0, created_at INT NOT NULL);
CREATE TABLE IF NOT EXISTS visuals(id TEXT PRIMARY KEY, note_id TEXT NOT NULL, user_id TEXT NOT NULL, spec TEXT NOT NULL, created_at INT NOT NULL);
CREATE TABLE IF NOT EXISTS promo_codes(code TEXT PRIMARY KEY, total INT NOT NULL, used INT NOT NULL, note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS promo_redemptions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code TEXT NOT NULL, redeemed_at INT NOT NULL);
CREATE TABLE IF NOT EXISTS usage(month TEXT NOT NULL, user_id TEXT NOT NULL, margin INT NOT NULL DEFAULT 0, visuals INT NOT NULL DEFAULT 0, PRIMARY KEY(month, user_id));
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, admin TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at INT NOT NULL);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_margins_note ON margins(note_id, num);
CREATE INDEX IF NOT EXISTS idx_margins_user ON margins(user_id);
CREATE INDEX IF NOT EXISTS idx_versions_note ON versions(note_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ask_note ON ask_messages(note_id, created_at);
CREATE INDEX IF NOT EXISTS idx_visuals_note ON visuals(note_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;
// //: removed duplicated CREATE from earlier scratch — single SCHEMA above is canonical
const DAY = 86_400_000;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pw, salt, 32).toString("hex");
}
export function checkPassword(pw: string, stored: string): boolean {
  const [salt, hex] = stored.split(":");
  const got = scryptSync(pw, salt, 32);
  return got.length === Buffer.from(hex, "hex").length && timingSafeEqual(got, Buffer.from(hex, "hex"));
}
export const uid = () => randomUUID();
export { DAY };

// ---------- tiny doc builder for seeds ----------
type Run = { t: "t" | "code"; s: string };
function block(id: string, runs: Run[]): object {
  return {
    type: "paragraph",
    attrs: { id },
    content: runs.map((r) =>
      r.t === "code"
        ? { type: "text", marks: [{ type: "code" }], text: r.s }
        : { type: "text", text: r.s }
    ),
  };
}
function doc(blocks: object[]) {
  return { type: "doc", content: blocks };
}

// ---------- seed ----------
function seedUsers(db: DatabaseSync) {
  const now = Date.now();
  const mk = (email: string, plan: string, promo: string | null, joined: number, status = "active") => {
    const id = uid();
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?,'active',1,'{}',?,?)").run(
      id, email, hashPassword("demo1234"), email.split("@")[0], plan, "user", promo,
      promo ? 3 : 0, joined, joined - 2 * DAY
    );
    return id;
  };
  const maya = mk("maya@example.com", "free", null, now - 35 * DAY);
  mk("dev@example.com", "free", null, now - 29 * DAY);
  mk("sam@example.com", "free", null, now - 47 * DAY);
  mk("lee@example.com", "free", null, now - 24 * DAY);
  mk("jo@example.com", "free", null, now - 10 * DAY);
  mk("kai@example.com", "free", null, now - 7 * DAY, "deletion_requested");
  mk("ren@example.com", "free", null, now - 38 * DAY);
  mk("ana@example.com", "free", null, now - 36 * DAY);
  const admin = uid();
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,0,'active',1,'{}',?,?)").run(
    admin, "admin@marginalia.app", hashPassword("admin1234"), "Admin", "user", "admin", null, now - 90 * DAY, now - DAY
  );

  // notebooks for maya
  const nb = (name: string, isJournal = 0, pos = 0) => {
    const id = uid();
    db.prepare("INSERT INTO notebooks VALUES(?,?,?,?,?)").run(id, maya, name, isJournal, pos);
    return id;
  };
  const alg = nb("Algorithms", 0, 0), chem = nb("Chemistry 101", 0, 1), vid = nb("Video ideas", 0, 2), jr = nb("Journal", 1, 3);

  // LCS note (matches the UI mock)
  const lcsId = uid();
  const lcsDoc = doc([
    block("p1", [{ t: "t", s: "Given two strings, I want the length of the longest sequence that appears in both in the same order. Brute force tries every subsequence of one string against the other, which is exponential, so I need to reuse work." }]),
    block("p2", [
      { t: "t", s: "Define dp[i][j] as the LCS length of the first i characters of A and the first j characters of B. If A[i] equals B[j], then " },
      { t: "code", s: "dp[i][j] = dp[i-1][j] + 1" },
      { t: "t", s: " because the match extends the best answer so far." },
    ]),
    block("p3", [{ t: "t", s: "Otherwise dp[i][j] = max(dp[i-1][j], dp[i][j-1]). Time and space are both O(n·m)." }]),
    block("p4", [{ t: "t", s: "I think a 2D grid is the right way to trace this by hand, starting with ABCB against BDCB." }]),
  ]);
  db.prepare("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    lcsId, maya, alg, "Longest common subsequence", JSON.stringify(lcsDoc),
    "Given two strings, I want the length of the longest sequence that appears in both in the same order. Brute force tries every subsequence of one string against the other, which is exponential, so I need to reuse work. Define dp[i][j] as the LCS length of the first i characters of A and the first j characters of B. If A[i] equals B[j], then dp[i][j] = dp[i-1][j] + 1 because the match extends the best answer so far. Otherwise dp[i][j] = max(dp[i-1][j], dp[i][j-1]). Time and space are both O(n·m). I think a 2D grid is the right way to trace this by hand, starting with ABCB against BDCB.",
    96, 0, "think", JSON.stringify({ pace: "slow", strictness: "balanced", margins: "single", focus: false, font: "serif", size: 2 }),
    0, null, now - 30_000, now - 30_000
  );
  const knap = uid(), chat = uid(), sleep = uid(), jour = uid();
  const note = (id: string, nbId: string, title: string, paras: string[], mode = "think", priv = 0, at: number) => {
    const blocks = paras.map((p, i) => block(`${id}-p${i + 1}`, [{ t: "t", s: p }]));
    const text = paras.join(" ");
    db.prepare("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id, maya, nbId, title, JSON.stringify(doc(blocks)), text, text.split(/\s+/).length, 0, mode,
      JSON.stringify({ pace: "slow", strictness: "balanced", margins: "single", focus: false, font: "serif", size: 2 }),
      priv, null, at, at
    );
  };
  note(knap, alg, "Knapsack variants", ["Why the greedy choice fails when items cannot be split, and what the table remembers instead. The greedy rule orders by value-to-weight and stops when the next item does not fit, but a cheaper-heavy pair can beat it."], "think", 0, now - DAY - 3_600_000);
  note(chat, chem, "Le Chatelier's principle", ["When a system at equilibrium is disturbed, it shifts to oppose the change. My example: adding heat to an exothermic reaction, where heat counts as a product."], "think", 0, now - 2 * DAY);
  note(sleep, vid, "Sleep and focus", ["Most people think more sleep means better focus. My angle is that everyone needs the same eight hours, so the video should open with one big claim."], "think", 0, now - 7 * DAY);
  note(jour, jr, "Saturday evening", ["A quiet day. I keep turning one conversation over, and I want to write it out before it calcifies into a story I never question."], "ask", 1, now - 3 * DAY);

  // margin notes on LCS (verbatim from the mock)
  const m1 = uid(), m2 = uid(), m3 = uid();
  db.prepare("INSERT INTO margins(id,note_id,user_id,anchor,num,type,body,status,level,created_at,orig_created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run
    (m1, lcsId, maya, "p2", 1, "error", "Look at the cell you extend from when the two characters match. If both are used by the match, which prefixes of A and B are left over?", "open", 1, now - 30_000, now - 30_000);
  db.prepare("INSERT INTO margins(id,note_id,user_id,anchor,num,type,body,status,level,created_at,orig_created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run
    (m2, lcsId, maya, "p3", 2, "question", "Which earlier rows does each cell actually read? Do you need to keep all of them?", "open", 1, now - 30_000, now - 30_000);
  db.prepare("INSERT INTO margins(id,note_id,user_id,anchor,num,type,body,status,level,want_visual,created_at,orig_created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run
    (m3, lcsId, maya, "p4", 3, "direction", "Tracing a small case by hand is a good test of the rule in note 1. Want a grid you can step through?", "open", 1, 1, now - 30_000, now - 30_000);

  // hint-ladder chat seed on knapsack
  db.prepare("INSERT INTO ask_messages VALUES(?,?,?,?,?,?,?,?)").run(uid(), knap, maya, "user", "Why does greedy fail here?", "nudge", 0, now - DAY);
  db.prepare("INSERT INTO ask_messages VALUES(?,?,?,?,?,?,?,?)").run(uid(), knap, maya, "assistant", "What does the greedy rule assume about the items when it makes its first pick?", "hint", 1, now - DAY + 4000);

  // flagged examples for the AI-quality review queue
  db.prepare("INSERT INTO margins(id,note_id,user_id,anchor,num,type,body,status,level,review_state,created_at,orig_created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run
    (uid(), chat, maya, "x1", 1, "error", "Check the base case in your recurrence. What happens for an empty prefix?", "dismissed", 1, "flagged", now - 2 * DAY, now - 2 * DAY);
  db.prepare("INSERT INTO margins(id,note_id,user_id,anchor,num,type,body,status,level,review_state,created_at,orig_created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run
    (uid(), sleep, maya, "x2", 1, "question", "What would a skeptical reader ask first?", "dismissed", 1, "flagged", now - 3 * DAY, now - 3 * DAY);
  db.prepare("INSERT INTO margins(id,note_id,user_id,anchor,num,type,body,status,level,review_state,created_at,orig_created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run
    (uid(), vid, maya, "x3", 1, "direction", "Consider adding an example for each case.", "dismissed", 1, "flagged", now - 4 * DAY, now - 4 * DAY);

  // usage + audit (the app is free — no promo/billing surfaces)
  db.prepare("INSERT INTO usage VALUES(?,?,?,?)").run(monthKey(now), maya, 18, 1);
  const a = (d: string) => db.prepare("INSERT INTO audit VALUES(?,?,?,?,?)").run(uid(), "admin@marginalia.app", d, "", now - d.length * DAY);
  a("Monthly fair-use report reviewed");
  a("Reviewed flagged margin notes");
  a("Account deletion request completed");
}

export function monthKey(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------- migrations: SCHEMA is idempotent DDL applied on every boot; versioned steps go here ----------
export const SCHEMA_VERSION = 1;
// Future migrations: gate on the stored schema_version and append before the stamp (v2 = ...).
const FUTURE_MIGRATIONS: { version: number; sql: string }[] = [];

export function migrate(database: DatabaseSync): void {
  database.exec(SCHEMA); // idempotent: tables + meta + indexes
  let stored = 0;
  const row = database.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as { value: string } | undefined;
  if (row) stored = parseInt(row.value, 10) || 0;
  for (const m of FUTURE_MIGRATIONS) if (stored < m.version) database.exec(m.sql);
  database.prepare(
    "INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(excluded.value AS INTEGER) > CAST(value AS INTEGER)"
  ).run(String(SCHEMA_VERSION));
}

// ---------- transactional cascade deletes: ONE implementation for every route (no half-erased trees) ----------
export function transact(database: DatabaseSync, fn: () => void): void {
  database.exec("BEGIN");
  try { fn(); database.exec("COMMIT"); }
  catch (e) { database.exec("ROLLBACK"); throw e; }
}

export function deleteNoteTree(database: DatabaseSync, noteId: string): void {
  transact(database, () => {
    for (const t of ["margins", "ask_messages", "visuals", "versions"]) database.prepare(`DELETE FROM ${t} WHERE note_id=?`).run(noteId);
    database.prepare("DELETE FROM notes WHERE id=?").run(noteId);
  });
}

export function deleteUserTree(database: DatabaseSync, userId: string): void {
  transact(database, () => {
    for (const id of (database.prepare("SELECT id FROM notes WHERE user_id=?").all(userId) as { id: string }[])) {
      for (const t of ["margins", "ask_messages", "visuals", "versions"]) database.prepare(`DELETE FROM ${t} WHERE note_id=?`).run(id.id);
    }
    for (const t of ["notes", "notebooks", "sessions", "promo_redemptions", "usage"]) database.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(userId);
    database.prepare("DELETE FROM users WHERE id=?").run(userId);
  });
}

/** node:sqlite rows come back with null prototypes — React server→client props reject them. */
export function plainRows<T extends object>(rows: readonly T[]): T[] {
  return rows.map((r) => ({ ...r }));
}

function createDb(): DatabaseSync {
  const file = process.env.DATABASE_URL || "data/marginalia.db";
  const full = file.includes("/") || file.includes("\\") // turbopackIgnore: the DB file is runtime data, never bundled
    ? (file.startsWith("data/") ? join(/*turbopackIgnore: true*/ process.cwd(), file) : file)
    : file;
  mkdirSync(dirname(full), { recursive: true });
  const db = new DatabaseSync(full);
  migrate(db);
  const n = (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;
  if (n === 0) seedUsers(db);
  return db;
}

// singleton across dev hot reloads
const g = globalThis as unknown as { __marginaliaDb?: DatabaseSync };
export const db: DatabaseSync = (g.__marginaliaDb ??= createDb());

// ---------- row types (parsed where convenient) ----------
export interface NoteRow { id: string; user_id: string; notebook_id: string; title: string; content_json: string; text: string; words: number; ai_words: number; mode: "think" | "ask"; settings: string; private: number; pinned_visual: string | null; created_at: number; updated_at: number; }
export interface MarginRow { id: string; note_id: string; user_id: string; anchor: string; num: number; type: string; body: string; reply: string | null; status: string; rating: number | null; level: number; want_visual: number; review_state: string | null; created_at: number; orig_created_at: number | null; }
export interface UserRow { id: string; email: string; password: string; name: string; plan: string; role: string; promo: string | null; promo_months: number; status: string; age_ok: number; settings: string; joined_at: number; last_active: number; ai_vendor: string | null; ai_key_enc: Buffer | null; ai_model: string | null; ai_base: string | null; }

// Central AI key (original PRD): the app itself carries one vendor key from .env —
// no per-user key UI. Unset or explicitly-dummy keys never route; the offline engine covers those.
// Kept per-user-shaped (AiKeyCfg) so every route call site stays untouched. mark: userId ignored.
export interface AiKeyCfg { vendor: string | null; model: string | null; base: string | null; key: string | null }
export function userAiConfig(userId: string): AiKeyCfg | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || /dummy|placeholder/i.test(key)) return null; // flagged dummies never leave the machine
  return { vendor: "gemini", model: process.env.GEMINI_MODEL || null, base: null, key };
}

export function parseSettings(s: string) {
  return { pace: "slow", strictness: "balanced", margins: "single", focus: false, font: "serif", size: 2, theme: "light", ...JSON.parse(s || "{}") };
}
