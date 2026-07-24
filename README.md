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
/apps/api          NestJS HTTP + BullMQ workers (single process for v1)
/packages/shared   Scoring + normalization pure functions
/prisma            Schema + migrations
/scripts           M0 inspect-layer.ts
```

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

Provision Postgres + Redis, set env vars from `.env.example`, deploy the Dockerfile (web + worker are the same process in v1). Run `prisma migrate deploy` on boot (included in `Dockerfile` CMD).

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