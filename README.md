# Greenville CRE Lead Engine

Lead-generation system for a commercial real estate **investment sales** agent in Greenville County, SC. Ingests public county parcel records, scores every commercial parcel on sell-likelihood, and emails a weekly digest of the top leads.

**Core thesis:** investment-sales leads are property owners who are statistically likely to sell — predictable from hold period, absentee ownership, land use, and (in v2) loan maturity / distress signals.

## Status (v1)

| Milestone | Status |
|---|---|
| M0 — ArcGIS layer discovery | Done |
| M1 — Ingestion (ArcGIS → Postgres) | Done |
| M2 — Scoring + weekly digest | Done |
| M3 — ROD / SoS / skip-trace / dashboard | Designed (interfaces only) |

### M0 findings (layer 52)

- **Endpoint:** `…/MapServer/52` — Tax Parcel & Ownership, ~243k parcels, `maxRecordCount=5000`, **pagination supported**.
- **Situs address:** `STRNUM` + `LOCATE` (not `STREET`).
- **Mailing address:** `STREET`, `CITY`, `STATE`, `ZIP5` — **present on layer 52**, so v1 absentee scoring is fully available.
- **Commercial filter:** prefer `PROPTYPE IN ('COMMERCIAL','INDUSTRIAL','MULTI-FAMILY')` (~16k parcels). LANDUSE code set also stored in `AppConfig` for tuning.
- **County Real Property deep link:** no stable PIN URL (ASP.NET form search). Digest links to the search homepage for now.

Re-run discovery anytime:

```bash
npm run inspect:layer
```

## Monorepo layout

```
/apps/api          NestJS HTTP + BullMQ workers (serves API + built web UI)
/apps/web          React + Vite + Tailwind dashboard
/packages/shared   Scoring + normalization pure functions
/prisma            Schema + migrations
/scripts           M0 inspect-layer.ts
```

## Web dashboard

Single-tenant UI for browsing scored parcels, managing pipeline status, and triggering sync/digest.

```bash
# API on :3000 and Vite on :5173 (proxied)
npm run start:dev          # terminal 1
npm run dev:web            # terminal 2
```

Sign in with your `API_TOKEN`. In production the Nest process serves `apps/web/dist` at `/`.

## Tech stack

NestJS · Prisma · PostgreSQL · BullMQ · Redis · Resend (Nodemailer/SMTP fallback)

## Quick start (local)

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev --name init
npm run build
npm run start:dev -w @cre/api
```

Trigger a full sync (Bearer token = `API_TOKEN`):

```bash
curl -X POST http://localhost:3000/admin/sync \
  -H "Authorization: Bearer $API_TOKEN"
```

Preview digest HTML without sending:

```bash
curl -X POST http://localhost:3000/admin/digest/preview \
  -H "Authorization: Bearer $API_TOKEN"
```

## Jobs

| Job | Schedule | Notes |
|---|---|---|
| `parcels.dailySync` | `0 6 * * *` America/New_York | Full commercial pull; chains scoring |
| `parcels.fullSync` | Manual via `POST /admin/sync` | Same as daily for v1 |
| `scoring.runAll` | After successful sync | Idempotent score rows |
| `digest.weekly` | `0 12 * * 1` America/New_York (Mon 8am ET) | Top N leads email |

## API (all routes except `/health` require `Authorization: Bearer $API_TOKEN`)

- `POST /admin/sync`
- `GET /admin/sync-runs`
- `GET /parcels?minScore=&landUse=&absentee=&limit=&offset=`
- `GET /parcels/:pin`
- `PATCH /leads/:id` `{ "status": "contacted" }`
- `POST /admin/digest/preview`
- `POST /admin/digest/send`

## Scoring (v1)

Tunable via `AppConfig` rows (`score_weights`, `landuse_priority`, `commercial_landuse_codes`):

| Component | Points |
|---|---|
| Hold period | 0–40 |
| Absentee (in-state / out-of-state) | 15 / 25 |
| Entity owner | 0–10 |
| Multi-parcel owner (3+) | 0–10 |
| Land-use priority | 0–15 |

`whyNow` is template-based (`WhyNowService`) — no LLM in v1.

## Config / env

See `.env.example`. County-specific values (layer URL, field map, land-use codes) live in env + `AppConfig` — **not hardcoded in services**.

## Deploy (Railway)

1. Provision **Postgres** and **Redis** plugins and **link both** to the web service (`DATABASE_URL` + `REDIS_URL` / `REDIS_PRIVATE_URL`).
2. Generate a public domain on the web service (Settings → Networking → Generate Domain).
3. Set at least: `API_TOKEN`, `DIGEST_RECIPIENTS`, `DIGEST_FROM`, and optionally `RESEND_API_KEY`.
4. Deploy via the repo `Dockerfile` (web + worker are one process in v1). Entrypoint runs `prisma migrate deploy` then starts Nest on `0.0.0.0:$PORT`.

**Railway “train has not arrived”** means nothing healthy is behind the domain — usually a crashed deploy. Check Deploy Logs. Common causes:
- Redis not linked (or app connecting to `localhost` because Redis URL was passed incorrectly)
- Postgres not linked / migrate failed
- No public domain assigned to the service

## Legal / etiquette

- Sources are public records; usage mirrors industry CRE data products.
- Identify with a real User-Agent + contact email; max 2 concurrent ArcGIS requests; 250ms page delay; exponential backoff on 5xx.
- ROD scraper (v2) is behind `ROD_SCRAPER_ENABLED=false`.
- Skip-traced contacts (v2) are for **licensed-agent manual outreach only** — not automated dialing. Honor TCPA / DNC.

## Tests

```bash
npm test
```

Unit tests cover scoring components, owner/address normalization, ArcGIS pagination against recorded fixtures, mapper field names, and sync idempotency against a fixture server (no live county calls).

## Open questions for the agent

1. Confirm / trim the commercial LANDUSE + PROPTYPE set (multifamily included by default).
2. Minimum fair-market-value floor for digest inclusion?
3. Preferred digest recipient list and From domain for Resend.