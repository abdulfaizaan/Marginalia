# SP1: Free + BYOK (remove payments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marginalia becomes free for everyone; each user stores their own AI vendor key (encrypted) and all AI calls route through it, with the offline template engine as the no-key fallback; payments, promo codes and plan tiers are removed.

**Architecture:** Per-user AI config (vendor/model/custom-base/key) encrypted at rest with AES-256-GCM under a server `APP_SECRET`; `lib/providers.ts` switches from plan-based routing to config-based routing; fair-use caps flatten to one tier; billing/promo surfaces are deleted; admin shrinks to Users/AI quality/Audit log.

**Tech:** Next.js 16 (Turbopack), node:sqlite, React 19, Tailwind v4, assert-style checks in `scripts/check.ts` (no test frameworks).

**Spec:** `docs/superpowers/specs/2026-11-08-sp1-byok-remove-payments-design.md`

## Global Constraints

- No new npm dependencies. Crypto uses `node:crypto` (AES-256-GCM, 12-byte nonce + ciphertext + 16-byte tag).
- DB is `node:sqlite` singleton in `lib/db.ts`; schema changes = guarded `ALTER TABLE users ADD COLUMN …` (check `pragma table_info` first), run at module init.
- `APP_SECRET`: read from `.env`; if absent at boot, generate once via `randomBytes(48).toString("base64")` and append `APP_SECRET=…` to `.env` (never overwrite an existing one).
- Keys are only stored encrypted; API responses never return the key or its plaintext; audit logs record actions, never key material or last-4.
- Encryption failures decrypt to `null` → treat as "no key" (offline engine), never throw into the editor.
- Fair-use caps (single tier): `notesMonth: 200`, `visualsMonth: 40`, `versionsDays: 90`, `exports: ["pdf","word","md"]` — same 429 messaging style ("free monthly limit", no plan words).
- Copy: no plan/pricing words anywhere user-facing after this change ("Upgrade", "Plus", "Pro", "LAUNCH50", "$" must not appear).
- The dev server on :3000 must be stopped before `npm run build`/prod smoke (shared `.next`), and may be restarted after.
- `npm run check` (node scripts/check.ts, assert-style `ok(cond,name)`) must end green with the same no-framework style; removed features' pins are replaced, not just deleted.
- Git: commit per task; LF/CRLF warnings are expected noise. Never commit `.env` values or `data/*.db`.

## Review Focus

The spec implies but no single task's test exercises — each row's test is pinned in the named task:

1. **Ciphertext written by an older `APP_SECRET` decrypts to null** (secret rotated/wrong env) → editor must fall back to offline engine, not 500. Test: Task 1 (tamper/wrong-secret decrypt → null).
2. **Custom vendor with missing base URL or model** must be rejected at save time, never half-saved and then 500 on first AI call. Test: Task 4 (`validateAiKey`).
3. **Key `DELETE` while a navigation/AI call is in flight** — server mid-route hit with cleared key must fail closed to offline, not crash. Test: Task 3 (routeFor(cfg with null key) → null → offline).
4. **`/pricing` and billing endpoints reachable by old links/bookmarks** must not 404 with a broken page — pricing redirects to `/notes`, billing route must actually not exist (405/404 by Next). Test: Task 5 (prod smoke curl).
5. **Seed/demo users with legacy `plan="plus"` rows** still render (admin users grid, account export) with plan fields unused — no `undefined` chips or crashes. Test: Task 6 (admin users route smoke shows vendor badge for keyed user, "demo" otherwise; legacy rows render unchanged).

---

### Task 1: Crypto + schema columns + APP_SECRET boot

**Files:**
- Create: `app/lib/crypto.ts`
- Modify: `app/lib/db.ts` (schema section ~line 7–36, init ~line 175–187)
- Modify: `app/.env` (APP_SECRET appended by boot code, never by hand)
- Test: `app/scripts/check.ts` (append crypto section)

**Interfaces:**
- Consumes: `node:crypto` (`createCipheriv`, `createDecipheriv`, `randomBytes`, `timingSafeEqual`).
- Produces: `lib/crypto.ts` → `encryptSecret(plain: string): Buffer` (returns `NoncePrefix(12) + ciphertext+tag`), `decryptSecret(blob: unknown): string | null` (null on any failure), `getAppSecret(): string` (reads/generates `APP_SECRET`). db exports `userAiConfig(userId): AiKeyConfig | null` and `setUserAiKey(userId, cfg)` / `clearUserAiKey(userId)` types from Task 3 — schema prep only here.

- [x] **Step 1: Write the failing test** (append to `scripts/check.ts` before the final counters)

```ts
// ---------- crypto: secrets at rest ----------
const { encryptSecret, decryptSecret } = await import("../lib/crypto.ts");
const secretBlob = encryptSecret("sk-test-1234567890");
ok(secretBlob.length > 28, "encryptSecret produces non-trivial blob");
ok(decryptSecret(secretBlob) === "sk-test-1234567890", "decryptSecret round-trips");
const swapped = Buffer.from(secretBlob); swapped[0] ^= 0xff;
ok(decryptSecret(swapped) === null, "decryptSecret fails closed on tamper");
ok(decryptSecret("garbage") === null, "decryptSecret fails closed on garbage");
```

- [x] **Step 2: Run to verify it fails**

Run: `npm run check`
Expected: FAIL `encryptSecret produces non-trivial blob` (module missing → import error FAIL).

- [x] **Step 3: Implement `lib/crypto.ts`** (AES-256-GCM: 12-byte nonce prefix + ciphertext + 16-byte tag; key derived from `APP_SECRET`)

```ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

// Next.js runs with cwd = app/, so .env lives at process.cwd()/.env.
const ENV_PATH = () => join(process.cwd(), ".env");

export function getAppSecret(): string {
  const env = process.env.APP_SECRET;
  if (env) return env;
  // Boot convenience: generate once into .env, never overwrite an existing entry.
  try {
    const path = ENV_PATH();
    if (existsSync(path)) {
      const line = readFileSync(path, "utf8").split("\n").find((l) => l.startsWith("APP_SECRET="));
      if (line) return line.slice("APP_SECRET=".length);
    }
    const secret = randomBytes(48).toString("base64url");
    appendFileSync(path, `APP_SECRET=${secret}\n`);
    process.env.APP_SECRET = secret;
    return secret;
  } catch {
    return "dev-only-secret-change-me"; // read-only fs etc. — still derivable key unless APP_SECRET set elsewhere
  }
}

function keyOf(): Buffer {
  // 32-byte AES key derived from the server secret; secret never appears in output.
  return createHash("sha256").update(getAppSecret()).digest();
}

export function encryptSecret(plain: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyOf(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, ct, tag]);
}

export function decryptSecret(blob: unknown): string | null {
  try {
    if (!(blob instanceof Uint8Array) && !Buffer.isBuffer(blob)) return null;
    const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob as Uint8Array);
    if (buf.length <= 28) return null;
    const d = createDecipheriv("aes-256-gcm", keyOf(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(buf.length - 16));
    const plain = Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString("utf8");
    return plain || null;
  } catch {
    return null; // wrong/rotated secret, garbage input → fail closed (offline engine)
  }
}
```

- [x] **Step 4: Schema migration in `lib/db.ts`** — extend the init between `db.exec(SCHEMA)` and seeding:

```ts
  // SP1: per-user AI key config (BYOK). Guarded ADD COLUMN for existing DBs.
  const cols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("ai_vendor")) db.exec(`ALTER TABLE users ADD COLUMN ai_vendor TEXT`);
  if (!cols.includes("ai_key_enc")) db.exec(`ALTER TABLE users ADD COLUMN ai_key_enc BLOB`);
  if (!cols.includes("ai_model")) db.exec(`ALTER TABLE users ADD COLUMN ai_model TEXT`);
  if (!cols.includes("ai_base")) db.exec(`ALTER TABLE users ADD COLUMN ai_base TEXT`);
```

Also extend `SCHEMA`'s `users` CREATE TABLE with the same four columns (for fresh DBs) and add to `UserRow`: `ai_vendor: string | null; ai_key_enc: Buffer | null; ai_model: string | null; ai_base: string | null;`

- [x] **Step 5: Run to verify it passes**

Run: `npm run check`
Expected: PASS all previous + 4 new crypto checks.

- [x] **Step 6: Commit**

```bash
git add app/lib/crypto.ts app/lib/db.ts app/scripts/check.ts
git commit -m "SP1: AES-GCM secret vault + users.ai_vendor/key/model/base columns (encrypted BYOK prep)"
```

---

### Task 2: Flatten tiers, drop plan from the AI ladder, update cap call sites

**Files:**
- Modify: `app/lib/plans.ts` (full rewrite, ~21 lines)
- Modify: `app/lib/engine.ts` (`AskInput`/`ThinkInput` drop `plan`; ladder gate ~line 115–130)
- Modify: `app/app/api/notes/[id]/margins/route.ts` (tier → `CAPS`, strictness for all, copy)
- Modify: `app/app/api/ai/visual/route.ts` (tier → `CAPS`, copy)
- Modify: `app/app/api/notes/[id]/versions/route.ts` (retention from `CAPS.versionsDays`)
- Modify: `app/app/api/notes/[id]/export/route.ts` (remove 402 gate; hideAi always permitted)
- Modify: `app/app/api/auth/route.ts` (INSERT keeps plan column 'free' — no change needed; verify only)
- Test: `app/scripts/check.ts` (re-engaged ladder pins)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `lib/plans.ts` → `export const CAPS = { notesMonth: 200, visualsMonth: 40, versionsDays: 90, exports: ["pdf","word","md"] } as const;` (the `Plan`, `TIERS`, `enforcePromo`, `LAUNCH_PRICE_CENTS` exports are deleted).
  - `lib/engine.ts` → `AskInput { kind, noteText, selection?, history, userMessage, hintLevel, strictness }` (no `plan`); `askRespond` gate rule: level-4 answer iff `userMessage` asks AND `strictness !== "strict"` AND (`strictness === "direct"` OR walked, i.e. `hintLevel >= 3`).
  - Call sites no longer pass `plan`; margins route strictness read unconditionally from note settings.

- [x] **Step 1: Replace `lib/plans.ts`**

```ts
// SP1: the app is free; one fair-use tier protects the server/db (the user pays their own AI bill).
export const CAPS = {
  notesMonth: 200,
  visualsMonth: 40,
  versionsDays: 90,   // 0 = unlimited
  exports: ["pdf", "word", "md"] as const,
};
```

- [x] **Step 2: Engine ladder** — in `lib/engine.ts`, change `AskInput` (drop `plan`), delete the old `pro` branch and make:

```ts
// Level 4 (full answer): user asked AND strictness permits AND either Direct or has walked the rungs.
const asked = /answer|full answer|actually|just tell me|source of truth/i.test(inp.userMessage);
const allowed =
  inp.strictness !== "strict" &&
  (inp.strictness === "direct" || inp.hintLevel >= 3);
```

…then keep the previous walked/system structure with `allowed` replacing the plan condition. `ThinkInput` also drops `plan` (same file).

- [x] **Step 3: Update check pins** (replace the plan-gated ladder block)

```ts
// ---------- engine: ask ladder (plan-free rules) ----------
const base = { kind: "chat" as const, noteText: "note", selection: undefined, history: [], strictness: "balanced" as const, userMessage: "Stuck here." };
ok(askRespond({ ...base, hintLevel: 1 }).kind === "hint", "ladder: hint nudges along");
ok(askRespond({ ...base, hintLevel: 3 }).kind === "hint", "ladder: hint even at rung 3 when not asking for the answer");
const flat3 = askRespond({ ...base, userMessage: "Just give me the full answer", hintLevel: 3 });
ok(flat3.kind === "answer" && flat3.level === 4, "ladder: walked rungs + explicit ask → answer");
const directReq = askRespond({ ...base, strictness: "direct", userMessage: "Give me the actual answer", hintLevel: 1 });
ok(directReq.kind === "answer", "Direct: full answer on request");
const strict = askRespond({ ...base, strictness: "strict", userMessage: "Just give me the full answer", hintLevel: 3 });
ok(strict.kind === "hint", "strict: never the answer");
```

Also delete the entire `enforcePromo` import + its 3 pins.

- [x] **Step 4: Call sites** — in margins route: `const tier = CAPS;` and read strictness unconditionally (`const ns = String((parseSettings(String(note.settings)).strictness))`), pass no `plan` to `marginNotes`/`askAI` (Task 3 signature); cap copy → `"You have used your free monthly margin limit. Add your own AI key in Settings — versus waiting, limits reset next month."` In visual route: `const tier = CAPS` + copy `"Your free monthly visual limit is used up."` Versions route: `const cutoff = CAPS.versionsDays ? Date.now() - CAPS.versionsDays * 86_400_000 : 0` + `retentionDays: CAPS.versionsDays`. Export route: delete the 402 branch and the `tier` import; hideAi → `const hideAi = url.searchParams.get("ai") === "hide";`

- [x] **Step 5: Run green**

Run: `npm run check && npm run build`
Expected: check PASS (pin count changes 32 → ~33 minus 5 old promo/ladder +5 new = ~33); build green (routes compile; UI tasks catch remaining UI references later — if build trips on a UI file importing TIERS, that file is listed as a Task 5/6 edit — fix ONLY by changing gating logic per this task and leave visual bits for its task).

- [x] **Step 6: Commit**

```bash
git add app/lib/plans.ts app/lib/engine.ts app/app/api app/scripts/check.ts
git commit -m "SP1: flat fair-use caps (200/40/90d), plan-free hint ladder, exports un-gated"
```

---

### Task 3: BYOK provider routing

**Files:**
- Modify: `app/lib/providers.ts` (routing + signatures)
- Modify: `app/lib/db.ts` (add `userAiConfig(userId)` helper)
- Modify: `app/app/api/notes/[id]/margins/route.ts` + `app/app/api/ai/ask/route.ts` (pass config)
- Test: `app/scripts/check.ts` (routeFor mapping pins)

**Interfaces:**
- Consumes: Task 1 columns + decrypt; Task 2 plan-free engine signatures.
- Produces:
  - `providers.ts` → `export interface AiCfg { vendor: "openai"|"xai"|"gemini"|"custom"|null; model?: string|null; base?: string|null; }`
  - `export function routeFor(cfg: AiCfg | null, key: string | null): { name: "openai"|"xai"|"gemini"|"custom"; base: string; key: string; model: string } | null` — null when no vendor/key; `custom` requires `base` AND `model`.
  - `marginNotes(req: MarginRequest, keyCfg: { vendor: string|null; model: string|null; base: string|null; key: string|null })`, `askAI(inp, cfg)` same second param; `visual` unchanged (offline).
  - `lib/db.ts` → `userAiConfig(userId): { vendor: string|null; model: string|null; base: string|null; key: string|null } | null` (decrypts; any failure → null).

- [x] **Step 1: Failing pins in check.ts**

```ts
// ---------- providers: BYOK routing ----------
const { routeFor } = await import("../lib/providers.ts");
ok(routeFor(null, null) === null, "routeFor: no config → offline");
ok(routeFor({ vendor: null }, null) === null, "routeFor: vendor null → offline");
ok(routeFor({ vendor: "custom", base: undefined }, "k") === null, "routeFor: custom w/o base → offline (fail closed)");
const r = routeFor({ vendor: "openai", model: null }, "sk-1");
ok(!!r && r.name === "openai" && r.model === "gpt-4o-mini", "routeFor: openai default model");
const rx = routeFor({ vendor: "xai" }, "k");
ok(!!rx && rx.base === "https://api.x.ai/v1" && rx.model === "grok-3-mini", "routeFor: xai base/model");
const rc = routeFor({ vendor: "custom", base: "http://127.0.0.1:11434/v1", model: "llama3.1" }, "o");
ok(!!rc && rc.name === "custom" && rc.base === "http://127.0.0.1:11434/v1", "routeFor: custom base honored");
```

- [x] **Step 2: Run to fail** — `npm run check` → FAIL `routeFor: no config → offline`.

- [x] **Step 3: Implement** — rewrite the routing block of `providers.ts`:

```ts
const VENDOR_DEFAULTS = {
  openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  xai:    { base: "https://api.x.ai/v1",      model: "grok-3-mini" },
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash" },
} as const;

export function routeFor(cfg: { vendor?: string | null; model?: string | null; base?: string | null } | null, key: string | null) {
  if (!key || !cfg?.vendor) return null;
  if (cfg.vendor === "custom") {
    if (!cfg.base || !cfg.model) return null; // half-saved custom config must never hit fetch()
    return { name: "custom" as const, base: cfg.base, key, model: cfg.model };
  }
  const d = (VENDOR_DEFAULTS as unknown as Record<string, { base: string; model: string }>)[cfg.vendor];
  if (!d) return null;
  return { name: cfg.vendor as "openai"|"xai"|"gemini", base: d.base, key, model: cfg.model || d.model };
}
```

Replace env-key logic (`real()`, `routeFor(plan)`) wholesale; `marginNotes(req, cfg)` / `askAI(inp, cfg)` dereference: `const u = await userAiConfigFor(cfg)` — they take the *decrypted raw* config object from the route (route calls `userAiConfig(user.id)` then passes `{ vendor, model, base, key }`). Where signature was `route.name` in `provider` strings, use `route?.name ?? "offline"`. The gemini branch keys off `route.name === "gemini"`; `custom` goes through the OpenAI-compatible `/chat/completions` path already present.

- [x] **Step 4: db helper in `lib/db.ts`**

```ts
import { decryptSecret } from "./crypto";
export interface AiKeyCfg { vendor: string | null; model: string | null; base: string | null; key: string | null }
export function userAiConfig(userId: string): AiKeyCfg | null {
  const r = db.prepare("SELECT ai_vendor, ai_key_enc, ai_model, ai_base FROM users WHERE id=?").get(userId) as
    | { ai_vendor: string | null; ai_key_enc: Buffer | null; ai_model: string | null; ai_base: string | null } | undefined;
  if (!r?.ai_vendor) return null;
  return { vendor: r.ai_vendor, model: r.ai_model, base: r.ai_base, key: decryptSecret(r.ai_key_enc) };
}
```

Import cycle: db → crypto (crypto imports no db — safe).

- [x] **Step 5: Route call sites** — margins route evaluate/reply: `const cfg = userAiConfig(user.id);` then `marginNotes({ blocks, changedIds, pace, dismissed, noteWords: note.words }, cfg)` and `askAI({ kind: "chat", noteText: note.text, history: [], userMessage: body, hintLevel: 1, strictness }, cfg)` (strictness from settings, no plan condition — from Task 2). Do the same where `/api/ai/ask` route and the free-standing margin reply call `askAI` (grep `askAI(` to find all).

- [x] **Step 6: Run green** — `npm run check && npm run build` → PASS.
- [x] **Step 7: Commit** — `git commit -am "SP1: per-user BYOK provider routing (openai/xai/gemini/custom), fail-closed offline fallback"`

---

### Task 4: AI-key API + Settings card + nudge

**Files:**
- Create: `app/lib/aikey.ts` (pure validation)
- Create: `app/app/api/account/ai-key/route.ts`
- Modify: `app/components/AccountClient.tsx` (new key card; plan card + promo card die here only if Task 5 hasn't already — keep this task focused on the card; removals are Task 5)
- Modify: `app/components/LibraryClient.tsx` (one-time nudge banner props)
- Modify: `app/app/account/page.tsx`, `app/app/notes/page.tsx` (pass `hasAi` flag)
- Test: `app/scripts/check.ts` (`validateAiKey` pins)

**Interfaces:**
- Consumes: Task 1 crypto/db setters.
- Produces:
  - `lib/aikey.ts` → `export interface AiKeyInput { vendor: string; key: string; model?: string; base?: string }` and `export function validateAiKey(inp: AiKeyInput): { ok: true; vendor: "openai"|"xai"|"gemini"|"custom"; model: string | null; base: string | null } | { ok: false; error: string }` — errors: unknown vendor; empty key; custom without `base` (must start `http(s)://`) or without `model`; key length sanity ≥ 8 (Ollama often non-secret strings — allow short for custom).
  - Route: `POST /api/account/ai-key` (body = AiKeyInput) → validates, `setUserAiKey`, audit `"AI key set: <vendor>"`; `DELETE` → clears + audit; `GET` → `{ vendor, model, base, set: boolean }` (never the key).
  - `AccountClient` prop `hasAi: boolean`, `LibraryClient` prop `hasAi: boolean`.

- [x] **Step 1: Pins**

```ts
// ---------- aikey validation ----------
const v = (fn: unknown) => fn; void v;
const { validateAiKey } = await import("../lib/aikey.ts");
ok(validateAiKey({ vendor: "openai", key: "sk-12345678" }).ok === true, "aikey: openai ok");
ok(validateAiKey({ vendor: "nonsense", key: "k" }).ok === false, "aikey: unknown vendor rejected");
ok(validateAiKey({ vendor: "gemini", key: "" }).ok === false, "aikey: empty key rejected");
const badCustom = validateAiKey({ vendor: "custom", key: "x", model: "m" });
ok(badCustom.ok === false, "aikey: custom without base rejected");
const okCustom = validateAiKey({ vendor: "custom", key: "x", model: "llama3.1", base: "http://127.0.0.1:11434/v1" });
ok(okCustom.ok === true, "aikey: custom ok with base+model");
```

- [x] **Step 2: Run to fail** → FAIL `aikey: openai ok`.
- [x] **Step 3: Implement `lib/aikey.ts` + route** (route code: exact)

```ts
// app/app/api/account/ai-key/route.ts
import { db, uid, userAiConfig } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { validateAiKey, type AiKeyInput } from "@/lib/aikey";
import { encryptSecret } from "@/lib/crypto";

function audit(admin: string, action: string, detail: string) {
  db.prepare("INSERT INTO audit(id,admin,action,detail,created_at) VALUES(?,?,?,?,?)").run(uid(), admin, action, detail, Date.now());
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const cfg = userAiConfig(user.id);
  // set == decryptable key actually present; vendor/model/base returned for the card UI. The key itself NEVER leaves.
  return Response.json({ set: !!(cfg?.vendor && cfg?.key), vendor: cfg?.vendor ?? null, model: cfg?.model ?? null, base: cfg?.base ?? null });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const b = await req.json() as AiKeyInput;
  const v = validateAiKey(b);
  if (!v.ok) return jsonError(400, v.error);
  db.prepare("UPDATE users SET ai_vendor=?, ai_model=?, ai_base=?, ai_key_enc=? WHERE id=?")
    .run(v.vendor, v.model, v.base, encryptSecret(b.key.trim()), user.id);
  audit(user.email, "ai_key_set", v.vendor); // never the key material
  return Response.json({ ok: true });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  db.prepare("UPDATE users SET ai_vendor=NULL, ai_model=NULL, ai_base=NULL, ai_key_enc=NULL WHERE id=?").run(user.id);
  audit(user.email, "ai_key_removed", "key cleared, offline engine resumes");
  return Response.json({ ok: true });
}
```

(`userAiConfig` decrypts with Task 3's helper; using it here means `GET` reports `set` truthfully even if a row's ciphertext predates a secret rotation.)

- [x] **Step 4: Settings card in `AccountClient.tsx`** — vendor select (OpenAI / Grok (XAI) / Google Gemini / Custom OpenAI-compatible), key input (type=password), model + base fields shown when custom, Save → `POST`, Remove → `DELETE`, status line from `GET`. Props gain `hasAi: boolean`; page passes `hasAi={!!userAiConfig(user.id)?.key}` (import from `@/lib/db` in the *server* page, pass down).
- [x] **Step 5: Nudge in `LibraryClient.tsx`** (banner, once):

```tsx
// LibraryClient (component body): one-time banner state
const [nudge, setNudge] = useState(false);
useEffect(() => {
  try { if (!localStorage.getItem("mg-nudge-key") && !hasAi) setNudge(true); } catch { /* private mode */ }
}, [hasAi]);
// ...inside the returned JSX, above the main grid:
{nudge && (
  <div className="mx-auto mt-4 flex max-w-[1330px] items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 text-[13.5px]">
    <span className="text-ink-soft">Demo margins are on. Add your own AI key to make the margins really think.</span>
    <span className="flex items-center gap-2">
      <Link href="/account" className={btnGhost}>Set your AI key</Link>
      <button
        onClick={() => { setNudge(false); try { localStorage.setItem("mg-nudge-key", "1"); } catch { /* private mode */ } }}
        className={btnMini}
      >Dismiss</button>
    </span>
  </div>
)}
```

Documentation-only notes convert to real JSX exactly as shown above. `hasAi` arrives via props (see Interfaces). Nothing here references plan fields.

- [x] **Step 6: Run green** — `npm run check` PASS; build PASS.
- [x] **Step 7: Commit** — `git commit -m "SP1: /api/account/ai-key (validated, audited, never-returns-key) + Settings AI card + one-time library nudge"`

---

### Task 5: Remove payments, pricing, plan/pro promo surfaces

**Files:**
- Delete: `app/app/api/billing/route.ts`, `app/components/PricingClient.tsx`
- Rewrite: `app/app/pricing/page.tsx` → 2-line redirect to `/notes` (keep `RouteFx` pattern? No — plain redirect is fine)
- Modify: `app/app/page.tsx` (landing: remove Pricing nav link + "Compare plans"/See pricing links + LAUNCH50 chip + $-strip; CTAs "Start writing free")
- Modify: `app/components/AccountClient.tsx` (plan card → removed; "cancel_plan" action + button → removed; promo display → removed; delete-sure flow stays)
- Modify: `app/components/LibraryClient.tsx` (plan card keeps usage bar with `CAPS`; Upgrade button → removed; `user.plan` prop → drop)
- Modify: `app/components/MarginPanel.tsx` (capped copy + "See plans" → "Set your own AI key in Settings" linking `/account`)
- Modify: `app/components/OptionsClient.tsx` (strictness/hide-ai free-gates → removed; "Word + Markdown need Plus" chip → removed; props `plan`/`pro` dropped; for its page, tier → `CAPS`)
- Modify: `app/app/api/account/route.ts` (`cancel_plan` branch → removed)
- Test: prod smoke (`curl` set) — old `/pricing` → 307 `/notes`; `/api/billing` → 404/405; landing has no "pricing"/"LAUNCH50"/"$" strings.

**Interfaces:** Consumes Task 2 `CAPS`. Produces: none (pure removal); AccountClient keeps `delete_request`/`delete_sure`/theme only.

- [x] **Step 1: Delete files** (`git rm app/app/api/billing/route.ts app/components/PricingClient.tsx`)
- [x] **Step 2: Pricing page → redirect**

```tsx
import { redirect } from "next/navigation";
export default function PricingRedirect() {
  redirect("/notes");
}
```

- [x] **Step 3: Landing copy surgery** — remove: Pricing nav `<Link>`, `See pricing` CTA pair→ single `Start writing free`, the `LAUNCH50` chip block (lines ~44–46), dark price strip's first two text lines → replace strip content with `<div className="font-serif text-[30px] text-[#f4f6fb]">Marginalia is free. Bring your own AI key — or use demo margins.</div>` + subline `Your key, your bill, your privacy. Where's the catch? There isn't one.`; keep dark strip CTA linking `/sign-in?mode=signup`.
- [x] **Step 4: Grep-forbidden copy after edits**

Run: `grep -RniE "LAUNCH50|Upgrade|/pricing|priceCents|Plus plan|Pro plan|cancel_plan" app/app app/components --include="*.tsx" --include="*.ts"`
Expected: only `app/pricing/page.tsx` itself (redirect).

- [x] **Step 5: Verify build + green check** — `npm run check && npm run build` → PASS.
- [x] **Step 6: Commit** — `git commit -m "SP1: payments/promo/pricing surfaces removed; free copy everywhere"`

---

### Task 6: Admin console trim

**Files:**
- Modify: `app/app/admin/[section]/page.tsx` (`SECTIONS` = `["users","ai-quality","audit-log"]`)
- Modify: `app/components/AdminShell.tsx` (`NAV` — drop promo-codes row)
- Modify: `app/components/AdminSection.tsx` (TITLES map, drop `Promos` component + its api calls; Users grid: plan chip → AI badge)
- Modify: `app/app/api/admin/[section]/route.ts` (drop promo-codes branches; users SELECT + ai fields)
- Modify: `app/components/AdminOverview.tsx` (LAUNCH50 tile → "AI keys set" tile)
- Modify: `app/lib/admin.ts` (metrics: drop promo query; add keyed count)
- Test: prod smoke (admin routes render; legacy users rows intact) + look for forbidden copy.

**Interfaces:** Produces: metrics includes `keyed: number` (`SELECT COUNT(*) FROM users WHERE ai_vendor IS NOT NULL`).

- [x] **Step 1: Section lists** — `SECTIONS`/`NAV`/`TITLES` to the three sections; delete `Promos` and promo UI in AdminSection; remove badge branch `section === "promo-codes"`.
- [x] **Step 2: api/admin/[section] route** — remove branches/case for `promo-codes` (GET list + POST add/redeem); users GET: `SELECT id,email,name,ai_vendor,joined_at,last_active,status FROM users WHERE role!='admin'` (keep `plan` OUT of the select; AdminSection `URow.plan` → `ai_vendor`), filter param `plan=` → accept `All|keyed|demo` (`keyed` → `ai_vendor IS NOT NULL`, `demo` → null).
- [x] **Step 3: Users table chip** — `{u.ai_vendor ? <Chip kind="direction">{u.ai_vendor}</Chip> : <Chip kind="question">demo</Chip>}`; remove `Promo:` column/line.
- [x] **Step 4: Overview + metrics** — `lib/admin.ts` metrics: remove promo block; add `keyed`; Overview tile: `AI keys set` with count `X of Y users`.
- [x] **Step 5: Verify** — `grep -Rni "promo" app/app/api/admin app/components/Admin* app/lib/admin.ts` → no matches; `npm run build` PASS.
- [ ] **Step 6: Commit** — `git commit -m "SP1: admin to Users/AI quality/Audit; keyed-vs-demo badges; promo endpoints gone"`

---

### Task 7: Final sweep, suite, smoke, ledger

**Files:** read-only verification + `.superpowers` ledger append + any missed-grep fixes it uncovers.

- [ ] **Step 1: Full forbidden-copy sweep** — `grep -RniE "LAUNCH50|Upgrade|enforcePromo|promo-codes|priceCents|cancel_plan|\"pro\"|\"plus\"" app/app app/components app/lib --include="*.ts*" | grep -v node_modules` → every hit justified or fixed (engine's legacy prose in comments is fine; seed users' `plan` strings in `lib/db.ts` remain intentionally — legacy column).
- [ ] **Step 2: Full suite** — `npm run check` (PASS), `npm run build` (green).
- [ ] **Step 3: Prod smoke** (stop dev server; `npm run start -- -p 3131`; curl):
  - `GET /` 200, no `$` / no "LAUNCH50", nav has no Pricing
  - `POST /api/account/ai-key` (login as maya via `/api/auth`) with `{vendor:"custom", key:"o", model:"llama3.1", base:"http://127.0.0.1:11434/v1"}` → `{ok:true}`; sqlite row `ai_key_enc` non-null, first 12 bytes differ from second cookie change ( ciphertext, not plaintext prefix "o"); `GET ai-key` returns `set:true, vendor:"custom"`, never the key
  - `GET /pricing` → 307 → `/notes`
  - `GET /api/billing` → 404/405
  - margins evaluate POST on maya note → `"provider":"custom"` (with local Ollama absent → fetch fails → `"custom+offline"`) and no 500
  - `DELETE ai-key` → provider back to `"offline"`
- [ ] **Step 4: Restart dev server** on :3000 for the user.
- [ ] **Step 5: Ledger append** (`.superpowers/sdd/marginalia-mvp/progress.md`) + commit: `git commit -am "SP1 final sweep"` (only if stray files changed).

---

## Self-review notes (already applied)

- Spec coverage: schema/crypto (T1), tier flatten + ladder + cap call sites + export un-gating (T2), BYOK routing incl. custom (T3), key API/UI/nudge (T4), payments removal incl. landing/account/library/margins captions (T5), admin (T6), verification+smoke (T7). Exports un-gating covered (T2), hide-ai per-user choice (T5 OptionsClient), spelling of `CAPS` consistent throughout.
- Placeholder scan: Task 4 Step 5 contains the exact JSX shape to render (implementer converts `() => null ? null : …` pseudo to real JSX per comment line).
- Type consistency: `AiCfg` vs the plain `{vendor,model,base,key}` config used at call sites — Task 3 defines both; routes always pass the plain decrypt result.
- Review Focus mapping: 1→T1 step 1 pins; 2→T4 pins; 3→T3 pin; 4→T5 smoke; 5→T6 smoke.
