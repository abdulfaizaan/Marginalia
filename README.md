# Marginalia

The notebook that thinks *with* you, not *for* you. An AI notebook where the AI only speaks
**in the margins** — questions, challenges, error flags and directions (≤60 words), and
step-through visuals. It never writes your note for you unless you explicitly walk the hint
ladder in Ask mode.

- **Stack:** Next.js 16 (App Router, `cacheComponents`) + `node:sqlite` (built-in, zero DB to install)
- **Deploy model:** single node (Dockerfile provided — see `docs/DEPLOY.md`). Not horizontal-scale.

## Run it

```bash
cd app
npm install
npm run dev        # http://localhost:3000
```

Requires Node 24+. Data lives in `app/data/marginalia.db` (created and seeded on first boot;
delete the file to re-seed).

## Environment

`.env` (optional — the app runs fully offline with dummies):

| Var | Purpose |
|---|---|
| `GEMINI_API_KEY` | The one AI key (central routing). Any `dummy`/`placeholder` value routes to the built-in offline engine instead. |
| `ADMIN_CODE` | 6-digit code required at `/admin/sign-in`. **Required in production** — boot throws without it (no default). |
| `DATABASE_URL` | SQLite file path (default `data/marginalia.db`). Set per-instance in deployment. |

Crisis-safety routing in journal mode is hard-coded and never vendor-routed.

## Demo accounts (all password `demo1234`, all free tier)

| Account | Notes |
|---|---|
| `maya@example.com` | LCS note with seeded margin notes + hint chat |
| `dev@example.com` | — |
| `sam@example.com` | — |
| `lee@example.com` | — |
| `jo@example.com` | — |
| `kai@example.com` | deletion requested (admin queue demo) |
| `ren@example.com` / `ana@example.com` | — |
| `google-demo@marginalia.app` | the "Continue with Google" dummy OAuth account |

Admin console: `/admin/sign-in` — `admin@marginalia.app` / `admin1234` / your `ADMIN_CODE`
(demo default `123456`; set a real one in production and rotate it).

## What's inside

- **Think mode** — pace (Slow/Normal/Frequent), per-block margin notes
  (question/challenge/error/direction, ≤60 words), reply/pin/dismiss/turn-into-thread,
  probe selection (`Ctrl+Shift+P`), Ask rail (`Ctrl+/`), strict gate (no answers, ever)
- **Step-through visuals** — DP grid (a11y: text description + STEP n OF M), two-box sketches
  otherwise; pin-to-note inserts an AI-flagged line
- **Exports** — PDF (browser print, sandboxed CSP), Word `.doc`, Markdown, hide-AI + margin footnotes
- **Versions** — 30-day retention, restore (confirm + auto-snapshot) from note options
- **Accounts** — email+password (scrypt), 13+ gate, dummy Google sign-in, data export, deletion request → confirm flow
- **Admin console** — code-gated sign-in, metrics (incl. real original-thought ratio),
  users filter/search (no note content), AI-quality review queue (AI text only), audit log
- **Limits (free tier, enforced server-side):** 200 margin notes + 40 visuals/month, 30-day versions
- **Hardening:** rate limiting on auth (10/min) and AI (15/min) via `proxy.ts`; IDOR-ownership checks
  on every note route; WAL + busy-timeout SQLite; periodic retention sweep on boot

## Checks

```bash
npm run check      # 91 assertions: engine, planners, exporters, rate limiter, parity/a11y/dead-code pins
npm run check:http # 18 assertions against a real `next start` on an isolated DB (auth, IDOR, caps, admin)
npm run build      # type-checked production build (Proxy registered)
```

## Measured performance

Load-tested on a dev laptop (loadtest profile, 20 connections, 5s each; single Node process):

| Profile | req/s | p50 | p99 |
|---|---:|---:|---:|
| Library GET (session) | 205–282 | 66–78ms | 162–387ms |
| Sign-in POST (rate-limited) | 195–216 | 80–87ms | 315–521ms |
| Note-create POST (write) | 87–89 | 231–236ms | 306–323ms |

Zero connection errors in every run. The write ceiling (~90 req/s) is the synchronous
single-file SQLite `INSERT` path — appropriate for the single-node target; reads are indexed.
Reproduce with `npm run loadtest`. Numbers are from one machine — verify on your own hardware.

CI (`.github/workflows/ci.yml`) runs check + http + build + `npm audit` on every push/PR.

## Operations

Backups: `npm run backup` — consistent `VACUUM INTO` snapshot to `app/backups/`, 7 kept.
Deployment, health checks and rollback: see `docs/DEPLOY.md`.
