// Load test: boots `next start` on an isolated DB (seeded) and measures three profiles.
// npm run loadtest — prints req/s, latency percentiles, non-2xx rate per profile.
// Results are measured on this machine/spec at this tree — they are not universal claims.
import autocannon from "autocannon";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { rmSync } from "node:fs";

const PORT = 3320;
const BASE = `http://localhost:${PORT}`;
const dbFile = "data/loadtest.db";
for (const suffix of ["", "-wal", "-shm"]) try { rmSync(dbFile + suffix); } catch { /* first run */ }

const server = spawn(process.execPath, [join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], {
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
async function post(name: string, path: string, body: unknown) {
  const res = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", cookie: jar.get(name) || "" }, body: JSON.stringify(body) });
  const sc = res.headers.getSetCookie()?.[0];
  if (sc) jar.set(name, sc.split(";")[0]);
  return res;
}

async function run(name: string, opts: Record<string, string>, url: string, method = "GET") {
  const r = await autocannon({ url: BASE + url, method, connections: 20, duration: 5, ...opts });
  const stats = { rps: r.requests.average, p50: r.latency.p50, p99: r.latency.p99, non2xx: r.non2xx, errors: r.errors };
  console.log(`result ${name}: ${stats.rps} req/s | p50 ${stats.p50}ms | p99 ${stats.p99}ms | non2xx ${stats.non2xx} | errors ${stats.errors}`);
  return stats;
}

try {
  await waitReady();

  // seed one user (owns all cookie-bound assertions)
  const su = await post("u1", "/api/auth", { action: "signup", email: `lt${Date.now()}@example.com`, password: "longenough8", ageOk: true });
  if (su.status !== 200) throw new Error("seed signup failed");
  const note = await (await post("u1", "/api/notes", {})).json() as { id: string };
  const cookie = jar.get("u1") || "";

  const library = await run("library GET (session, indexed path)", { headers: { cookie } }, "/api/notes");
  const login = await run("sign-in POST (proxy rate bucket)", { headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signin", email: "nobody@example.com", password: "longenough8" }) }, "/api/auth", "POST");
  const create = await run("note-create POST (session)", { headers: { "content-type": "application/json", cookie }, body: JSON.stringify({}) }, "/api/notes", "POST");

  // presence check: all profiles actually served 2xx/3xx/4xx (not connection errors)
  if (library.errors + login.errors + create.errors > 0) { console.error("FAIL loadtest produced connection errors"); process.exitCode = 1; }
  else console.log("loadtest OK — no connection errors; numbers above are from this machine.");
} finally {
  server.kill();
  await new Promise((res) => setTimeout(res, 300));
  for (const suffix of ["", "-wal", "-shm"]) try { rmSync(dbFile + suffix); } catch { /* ignore */ }
}
