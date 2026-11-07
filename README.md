# Marginalia

The notebook that thinks *with* you, not *for* you. An AI notebook where the AI only speaks
**in the margins** — with questions, challenges, error flags and directions (≤60 words), and
step-through visuals. It never writes your note for you unless you explicitly open the hint
ladder in Ask mode.

Built to the PRD (`Marginalia - Product Requirements Document.docx`) and the UI design
(`Marginalia UI.pdf`) in this folder.

## Run it

```bash
cd app
npm install
npm run dev        # http://localhost:3000
```

Requires Node 24+ (uses the built-in `node:sqlite` — no DB to install).
Data lives in `app/data/marginalia.db` (created and seeded on first boot; delete the file to re-seed).

## Demo accounts (all password `demo1234`)

| Account | Plan | Notes |
|---|---|---|
| maya@example.com | Plus (LAUNCH50) | LCS note with 3 seeded margin notes + hint chat |
| dev@example.com | Free | — |
| sam@example.com | Pro | — |
| lee@example.com | Plus (LAUNCH50) | — |
| jo@example.com | Free | — |
| kai@example.com | Free | deletion requested (admin queue demo) |
| ren / ana | Plus / Pro | — |
| google-demo@marginalia.app | Free | the "Continue with Google" dummy OAuth account |

Admin console: `/admin/sign-in` — `admin@marginalia.app` / `admin1234` / code **123456**.
Billing: `BILLING_MODE=dummy` — any 15–19-digit card is accepted (try `4242 4242 4242 4242`).

## Dummy keys

`.env` ships with placeholder keys. The router (per PRD §11 + owner decision):

- **Plus** users → OpenAI (`OPENAI_API_KEY`)
- **Free/Pro** → Grok (XAI, `XAI_API_KEY`), falling back to Google AI Studio (`GEMINI_API_KEY`)
- A key containing `dummy`/`placeholder` never leaves the machine — the **offline deterministic
  engine** runs instead, so every P0 behavior (margin types, 60-word cap, hint ladder, journal
  care) still works with no real keys.
- Journaling crisis care is always hard-coded, never vendor-routed.

Replace keys in `.env` to switch to live providers — no code changes.

## LAUNCH50

Promo `LAUNCH50`: 50% off Plus ($4.99/mo × 3 months), first **100 users**, one redemption per
account — enforced server-side in the checkout + `lib/plans.ts` (`enforcePromo`), pinned by the
check script.

## What's inside

- **Think with You** — pace (Slow/Normal/Frequent, footer pill), per-block margin notes
  (question/challenge/error/direction, ≤60 words), reply/pin/dismiss/turn-into-thread,
  probe selection (`Ctrl+Shift+P`), Ask rail (`Ctrl+/`)
- **Ask mode** — 4-step hint ladder; Direct strictness + hide-AI export are Pro/Plus gated
- **Step-through visuals** — DP grid (a11y: text description + STEP n OF M) for selections like
  `ABCB against BDCB`, two-box sketches otherwise; pin-to-note inserts an AI-flagged line
- **Exports** — `?fmt=print` (PDF via browser print, all plans), Word `.doc`, Markdown, with
  hide-AI and margin-note footnotes
- **Versions** — 7/30/unlimited day retention by plan, restore from note options
- **Accounts** — email+password (scrypt), 13+ gate, dummy Google sign-in, data export
  (`/api/account`), two-click plan cancel, deletion request → confirm flow
- **Admin console** — 3-factor sign-in, metrics vs targets, users (no access to note content),
  promo codes, AI-quality review queue (AI text only), full audit log
- Limits: Free 30 margin notes + 3 visuals/month, enforced in the API

## Checks

```bash
npm run check     # 32 assertions over engine, promo rules, visualizer and exporters
```
