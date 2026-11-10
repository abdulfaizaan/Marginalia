# Deploying Marginalia

Target: **one VPS / one container**, single SQLite file, Docker (multi-stage, non-root).
This is not a horizontally-scaling service — the write path is a synchronous local file.

## 1. Build and run

```bash
docker build -t marginalia .
docker run -d --name marginalia \
  -p 80:3000 \
  -v marginalia-data:/app/data \
  -e NODE_ENV=production \
  -e ADMIN_CODE=<your 6-digit code> \
  -e GEMINI_API_KEY=<real key, or a dummy to run offline> \
  --restart unless-stopped \
  marginalia
```

- The image contains no database — everything lives in the `marginalia-data` volume (`/app/data`).
- `DATABASE_URL` defaults to `data/marginalia.db`; set it explicitly only if you mount elsewhere.
- Sessions are `Secure`+`HttpOnly` when `NODE_ENV=production` — put HTTPS in front of the
  container (Caddy/nginx/cloud LB). Over plain HTTP the browser drops the cookie, by design.

## 2. Health checks

`GET /api/health` → `200 {"ok":true,"uptime":N}` when the DB answers, `503` otherwise.
Wire your process supervisor / LB to it.

## 3. Backups

```bash
npm run backup       # inside the container: docker exec marginalia npm run backup
```

Consistent snapshot (`VACUUM INTO`) to `app/backups/`, newest 7 kept. Run it from cron
(daily is plenty at this scale) and copy the directory off-box occasionally — a backup
on the same disk is not a backup.

## 4. Rollback

Same strategy as the code: `docker stop marginalia && docker rm marginalia` and run the
**previous image tag**. The data volume is independent of the image, so no data step is
needed for a rollback. Schema migrations are version-gated (`lib/db.ts` `FUTURE_MIGRATIONS`);
a new image applies pending migrations on boot — read the migration list before downgrading
past one.

## 5. First-boot checklist

1. `/api/health` returns 200.
2. Sign up the real admin at `/sign-in`, then change the seeded admin password or delete
   the seeded demo accounts for a public deployment (they're in the seed, password `demo1234`).
3. Set a strong `ADMIN_CODE` — the demo `123456` is rate-limited but not secret.
4. `docker exec marginalia npm run backup` once, to prove the volume and rotation work.
5. Confirm the crisis-care path in journal mode works even without a real `GEMINI_API_KEY`
   (it never routes — but verify the journal answers as expected).

## 6. Known trade-offs (deliberate)

- **In-memory rate limiting** — resets per process restart; fine for one node. If you ever
  run multiple replicas, move it to a shared store first.
- **SQLite, WAL, busy-timeout 5s** — read scaling is excellent (indexed), writes serialize.
  At ~90 write req/s measured ceiling on dev hardware, this serves a small group comfortably.
- **No FK constraints on tables** — integrity is enforced by the transactional cascade
  helpers (`deleteNoteTree`/`deleteUserTree`); every delete path goes through them.
- **Structured log shipping** — stdout logging is fine at this scale; ship the container
  logs with your host's normal mechanism if you want retention.
