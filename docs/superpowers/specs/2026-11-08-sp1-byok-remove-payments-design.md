# SP1 design — Marginalia goes free, users bring their own key (BYOK)

Status: approved in conversation (user "go head", after three decision questions + design presentation).
Date: 2026-11-08

## Intent

Remove payments. Marginalia becomes free; every user configures their own AI vendor
key (or runs the built-in offline engine with no key at all). This restores the "essence":
margins point at the gap in *your* note, because a real vendor is behind them when a key is set.

## Decisions logged from the conversation

- Feedback scope: first run empty/silent, editor not alive, flow disjointed → decomposed into
  SP1 (this spec) → SP2 (first-run magic) → SP3 (write-time aliveness) → SP4 (flow coherence).
- Key storage: **server-stored, encrypted at rest** (AES-256-GCM under server secret). 
  Browser-direct was rejected (CORS fragility, no usage counting, client-side key exposure).
- Caps: **one generous free cap for everyone** (protects server/db; user pays its own vendor bill).
- Key setup: **choose among all wired vendors** — OpenAI, Grok (XAI), Google Gemini,
  plus a custom "OpenAI-compatible" entry (base URL + key + model) for Ollama/LM Studio etc.
- `/pricing` → **redirect to `/notes`** (ruling: fewest files; SP2 handles one-time guides).

## 1. Schema & crypto

- `users` table gains (guarded ALTER at init; existing columns untouched):
  - `ai_vendor TEXT` — "openai" | "xai" | "gemini" | "custom"
  - `ai_key_enc BLOB` — AES-256-GCM ciphertext (12-byte nonce prefix + ciphertext + tag)
  - `ai_model TEXT` — optional model override (vendor default when NULL)
- `lib/crypto.ts`: `encryptSecret(plain) / decryptSecret(blob)` using `APP_SECRET`
  (32+ bytes hex/base64). Boot writes a generated `APP_SECRET` into `.env` if missing
  (dev convenience; prod users should set it). Wrong/missing secret → treat as no key
  (fail closed to offline engine, never 500 into the editor).
- Legacy `plan`/`promo` columns remain in schema (data-compatible for a future re-enable)
  but no code reads them for gating anymore.

## 2. Provider routing

- `routeFor(plan)` → `routeFor(cfg)` where `cfg = { vendor, model, customBase }` from the
  user row (decrypted key in-memory only, per request).
- Vendor table:
  | vendor | base | default model |
  |---|---|---|
  | openai | https://api.openai.com/v1 | gpt-4o-mini |
  | xai | https://api.x.ai/v1 | grok-3-mini |
  | gemini | https://generativelanguage.googleapis.com/v1beta | gemini-2.0-flash |
  | custom | user base URL (must be http(s)) | user model string (required) |
- No vendor configured (no key) → existing offline engine, unchanged behavior.
- Vendor errors/cancellation → existing offline-engine fallback path (unchanged).
- All plan-tier gating around AI quality is removed: ladder rung 4 and the strictness
  setting become available to every user. The `plan` parameter disappears from call sites;
  guards now depend on the key config only.

## 3. Payments removal

- Delete: `app/api/billing/route.ts`, `components/PricingClient.tsx`, `app/pricing/page.tsx`
  (replaced by a 2-line redirect page to `/notes`), `components/BillingClient…` (if any),
  promo admin section (`AdminSection "promo-codes"`), promo UI in AccountClient.
- Caps flatten: `TIERS` collapses to one entry `{ notesMonth: 200, visualsMonth: 40, … }`
  (constants live in `lib/plans.ts`, which keeps only tier-shaped constants used by now
  for fair-use). Routes keep the same 429 cap behavior and copy but say "free monthly limit".
- UI removals: Library rail Upgrade button, Account plan card + cancel/switch + promo card,
  OptionsClient "pro" gating (strictness always on), any `LAUNCH50`/price copy on landing,
  Pricing CTA targets everywhere → Library or Account.
- Landing: strip pricing section/nav + price strip + launch-offer chip; CTAs read
  "Start writing free".
- Admin: sections shrink to Users / AI quality / Audit log. Users grid plan column becomes
  "AI" badge: vendor name (or "demo" when no key). Audit log unchanged.

## 4. Key onboarding UI

- AccountClient gets an "AI key" card: vendor select (OpenAI / Grok / Gemini / Custom
  OpenAI-compatible), password-style key input, optional model field, base-URL field shown
  for custom, Save + Remove buttons, status line ("Using your Gemini key" / "Demo mode —
  no key set").
- New `POST /api/account/ai-key` (and `DELETE` to remove): validates vendor, custom needs
  base URL + model, encrypts, updates row, writes `audit_log` entry (never logs the key,
  never logs last-4 either in audit — audit says "AI key set: vendor").
- One-time dismissable nudge for signed-in users without a key appears once (localStorage flag)
  pointing to the card. Elaborate first-run magic is SP2, out of scope here.

## 5. Out of scope (later sub-projects)

SP2 sample-notebook first run, SP3 editor arrival/reading states, SP4 flow unification.

## 6. Verification strategy

- `check.ts` (assert suite): crypto round-trip + wrong-secret fails closed;
  `routeFor` maps every vendor (+custom, +none→offline); flat cap single tier;
  `/api/billing` gone (404); promo-codes admin section gone; key endpoint requires auth;
  key stored encrypted (row round-trip decrypts under APP_SECRET).
- Existing pins that referenced billing/promo/tier gates get rewritten alongside.
- Manual: sign in → set OpenAI-compatible key (Ollama) → margins/ask/visual route through it;
  remove key → offline engine resumes.

## 7. Risks

- Encrypting with a regenerated secret orphans existing ciphertexts → boot never
  overwrites an existing APP_SECRET; docs instruct setting it before first use.
- Vendor CORS/base quirks behind custom base → request timeout already wrapped by
  existing try/catch → offline fallback.
- Usage counters keep working identically (unchanged paths), so capping behavior is stable.
