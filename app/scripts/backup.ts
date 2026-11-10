// Backup: npm run backup — VACUUM INTO a timestamped copy, keep the newest 7.
// Safe against mid-write copies: VACUUM INTO snapshots a consistent page image.
import { mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const KEEP = 7;
const src = process.env.DATABASE_URL || "data/marginalia.db";
const dir = "backups";
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = join(dir, `marginalia-${stamp}.db`);
new DatabaseSync(src).exec(`VACUUM INTO '${out}'`);

// prune old backups beyond KEEP
const files = readdirSync(dir).filter((f) => /^marginalia-\d{4}-.*\.db$/.test(f))
  .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
for (const old of files.slice(KEEP)) rmSync(join(dir, old.f));

const kept = readdirSync(dir).length;
console.log(`backup: ${out}; backups retained: ${kept}`);
