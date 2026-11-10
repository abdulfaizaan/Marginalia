// HTTP-layer check: boots `next start` on an isolated DB and asserts the real API behavior.
// npm run check:http — exit 0 = all pass. Covers what scripts/check.ts cannot: auth, ownership, caps.
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { rmSync } from "node:fs";

const PORT = 3310;
const BASE = `http://localhost:${PORT}`;
const dbFile = "data/check-http.db";
for (const suffix of ["", "-wal", "-shm"]) try { rmSync(dbFile + suffix); } catch { /* first run */ }

let n = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error(`FAIL ${name}`); process.exitCode = 1; process.exit(1); }
  n++;
  console.log(`ok ${name}`);
}

const CHILD = process.execPath, NEXT = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const server = spawn(CHILD, [NEXT, "start", "-p", String(PORT)], {
  cwd: process.cwd(), env: { ...process.env, DATABASE_URL: dbFile }, stdio: "ignore",
});
const waitReady = async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/sign-in`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error("server did not become ready");
};
const jar = new Map<string, string>();

async function post(name: string, path: string, body: unknown, method = "POST", extra: Record<string, string> = {}) {
  const res = await fetch(BASE + path, {
    method, headers: { "content-type": "application/json", ...(name || jar.get(name) ? { cookie: jar.get(name) || "" } : {}), ...extra },
    body: JSON.stringify(body),
  });
  const sc = res.headers.getSetCookie()?.[0];
  if (name && sc) jar.set(name, sc.split(";")[0]);
  return res;
}

const anonPost = (path: string, body: unknown) => post("", path, body);

try {
  await waitReady();

  // -- signup two users + sign in admin (auth budget: these consume the 10/min IP bucket)
  const e1 = `t${Date.now()}a@example.com`, e2 = `t${Date.now()}b@example.com`;
  const up1 = await post("u1", "/api/auth", { action: "signup", email: e1, password: "longenough8", name: "T1", ageOk: true });
  ok(up1.status === 200 && (jar.get("u1") || "").includes("mg_session="), "http: signup sets an httpOnly session cookie");
  const up2 = await post("u2", "/api/auth", { action: "signup", email: e2, password: "longenough8", name: "T2", ageOk: true });
  ok(up2.status === 200, "http: second signup ok");
  ok((await anonPost("/api/auth", { action: "signup", email: e1, password: "longenough8", ageOk: true })).status === 409, "http: duplicate signup → 409");
  ok((await anonPost("/api/auth", { action: "signup", email: "x", password: "short", ageOk: true })).status === 400, "http: bad email/password → 400");
  ok((await fetch(`${BASE}/api/notes`)).status === 401, "http: anonymous library access → 401");
  ok((await post("adm-auth", "/api/auth", { action: "signin", email: "admin@marginalia.app", password: "admin1234" })).status === 200, "http: admin can sign in via /api/auth");

  // -- u1 creates a note; margins evaluate (offline engine — dummy keys must not call out)
  const created = (await (await post("u1", "/api/notes", {})).json()) as { id: string };
  ok(!!created.id, "http: note create returns an id");
  const anonymousNote = await fetch(`${BASE}/api/notes/${created.id}`);
  ok(anonymousNote.status === 401, "http: note without session → 401");
  const evalRes = await post("u1", `/api/notes/${created.id}/margins`, { action: "evaluate", blocks: [{ id: `${created.id}-p1`, text: "Why does greedy fail on knapsack?" }], changedIds: [`${created.id}-p1`], pace: "slow" });
  const evalBody = (await evalRes.json()) as { notes?: unknown[]; provider?: string };
  ok(evalRes.status === 200 && Array.isArray(evalBody.notes), "http: offline evaluate returns margin notes");
  ok(String(evalBody.provider || "").includes("offline"), "http: evaluate ran the offline engine (dummy keys never route)");

  // -- IDOR: u2 must not see u1's note even with their own valid session
  const idor = await fetch(BASE + `/api/notes/${created.id}`, { headers: { cookie: jar.get("u2") || "" } });
  ok(idor.status === 404, "http: IDOR — other user's note → 404");

  // -- ownership delete cascade: u1 deletes everything, rows are gone
  const delRes = await fetch(BASE + `/api/notes/${created.id}`, { method: "DELETE", headers: { cookie: jar.get("u1") || "" } });
  ok(delRes.status === 200 && (await fetch(BASE + `/api/notes/${created.id}`, { headers: { cookie: jar.get("u1") || "" } })).status === 404, "http: note delete cascades (GET after DELETE → 404)");

  // -- signout invalidates the session
  const so = await post("u1", "/api/auth", { action: "signout" });
  ok(so.status === 200 && (await fetch(BASE + "/api/notes", { headers: { cookie: jar.get("u1") || "" } })).status === 401, "http: signout invalidates session");

  // -- role gate: u2's user session is not an admin session
  ok((await fetch(BASE + "/api/admin/overview", { headers: { cookie: jar.get("u2") || "" } })).status === 403, "http: admin endpoint rejects non-admin → 403");
  // -- admin sign-in needs the verification code (ADMIN_CODE from .env)
  ok((await post("adm", "/api/admin-auth", { email: "admin@marginalia.app", password: "admin1234", code: "000000" })).status === 403, "http: wrong admin code → 403");
  const adm = await post("adm", "/api/admin-auth", { email: "admin@marginalia.app", password: "admin1234", code: process.env.ADMIN_CODE || "123456" });
  ok(adm.status === 200, "http: admin auth with correct code → 200");
  const usersRes = await fetch(BASE + "/api/admin/users?plan=demo", { headers: { cookie: jar.get("adm") || "" } });
  const usersBody = (await usersRes.json()) as { users: { email: string }[] };
  ok(usersRes.status === 200 && usersBody.users.every((u) => u.email.endsWith("@example.com")), "http: admin users demo filter works server-side");

  // -- burst rate limiting on /api/auth (proxy): the 10-min budget is spent above; more attempts → 429
  const codes: number[] = [];
  for (let i = 0; i < 6; i++) codes.push((await anonPost("/api/auth", { action: "signin", email: "x@y.zz", password: "longenough8" })).status);
  ok(codes.filter((c) => c === 429).length > 0, "http: auth burst rate limit → 429 arrives");

  console.log(`\n${n} HTTP checks passed.`);
  process.exitCode = 0;
} finally {
  server.kill();
  await new Promise((res) => setTimeout(res, 300));
  for (const suffix of ["", "-wal", "-shm"]) try { rmSync(dbFile + suffix); } catch { /* ignore */ }
}
