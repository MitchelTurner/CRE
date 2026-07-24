# Greenville CRE Lead Engine

Lead-generation system for a commercial real estate **investment sales** agent in Greenville County, SC. Ingests public county parcel records, scores every commercial parcel on sell-likelihood, enriches top leads (SoS / ROD / distress / skip-trace), and emails a weekly digest.

**Core thesis:** investment-sales leads are property owners who are statistically likely to sell — predictable from hold period, absentee ownership, land use, loan maturity, and distress signals.

## Status (v2)

| Milestone | Status |
|---|---|
| M0 — ArcGIS layer discovery | Done |
| M1 — Ingestion (ArcGIS → Postgres) | Done |
| M2 — Scoring + weekly digest | Done |
| M3 — ROD / SoS / skip-trace / dashboard | Done (providers optional via env) |

### M0 findings (layer 52)

- **Endpoint:** `…/MapServer/52` — Tax Parcel & Ownership, ~243k parcels, `maxRecordCount=5000`, **pagination supported**.
- **Situs address:** `STRNUM` + `LOCATE` (not `STREET`).
- **Mailing address:** `STREET`, `CITY`, `STATE`, `ZIP5`.
- **Tax / sale fields:** `FAIRMKTVAL`, `SLPRICE`, `TOTTAX`, `PAIDDATE`.
- **Commercial filter:** `PROPTYPE IN ('COMMERCIAL','INDUSTRIAL','MULTI-FAMILY')`.

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

Single-tenant UI for browsing scored parcels (signals / SoS / contacts), pipeline feedback, and admin sync/enrich/digest.

```bash
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
npx prisma migrate dev
npm run build
npm run start:dev -w @cre/api
```

## Jobs

| Job | Schedule | Notes |
|---|---|---|
| `parcels.dailySync` | `0 6 * * *` ET | Commercial pull → scoring → enrichment → rescore |
| `parcels.fullSync` | `POST /admin/sync` | Same chain |
| `scoring.runAll` | After sync / after enrichment | v2 components + active signals |
| `enrichment.pass` | `0 8 * * *` ET + after scoring | Tax/distress/SoS/ROD/skip-trace |
| `digest.weekly` | `0 12 * * 1` ET | Top N above FMV floor |

## API (Bearer `API_TOKEN` except `/health`)

- `POST /admin/sync`
- `POST /admin/enrich?topN=25`
- `GET /admin/sync-runs`
- `GET /parcels?minScore=&landUse=&absentee=&limit=&offset=`
- `GET /parcels/:pin`
- `POST /leads` `{ "parcelId" }`
- `PATCH /leads/:id` `{ "status" }`
- `POST /leads/:id/feedback` `{ "rating": "up"|"down", "note"? }`
- `POST /admin/digest/preview`
- `POST /admin/digest/send`

## Scoring (v2)

Tunable via `AppConfig` (`score_weights`, `landuse_priority`, `digest_fmv_floor`, …):

| Component | Points |
|---|---|
| Hold period | 0–40 |
| Absentee (in-state / out-of-state) | 15 / 25 |
| Entity owner | 0–10 |
| Multi-parcel owner (3+) | 0–10 |
| Land-use priority | 0–15 |
| Tax delinquent | 0–15 |
| Mortgage maturity (inferred) | 0–20 |
| Foreclosure | 0–25 |
| SoS dissolved / resolved | 10 / 3 |
| FMV band boost | 0–5 |

Total capped at 100. Digest filters `fairMarketVal >= DIGEST_FMV_FLOOR` (default $250k).

## Enrichment providers (optional)

| Env | Purpose |
|---|---|
| `SOS_API_KEY` / `OPENSOSDATA_API_KEY` | SC entity resolution (official SoS is captcha-gated) |
| `ROD_SCRAPER_ENABLED` + `ROD_EMAIL`/`ROD_PASSWORD` | Greenville GovOS deeds/mortgages |
| `SKIPTRACE_API_URL` + `SKIPTRACE_API_KEY` | Contact lookup (weekly cap) |
| `TAX_SALE_URL` / `FORECLOSURE_ROSTER_URL` | Distress list scrapers |
| `DISTRESS_SCRAPER_ENABLED=false` | Disable distress fetchers |

Without keys, clients stub safely and jobs still succeed (tax signals from parcel `PAIDDATE`/`TOTTAX` still apply).

## Config / env

See `.env.example`. County-specific values live in env + `AppConfig` — **not hardcoded in services**.

## Deploy (Railway)

1. Provision **Postgres** and **Redis** and link both (`DATABASE_URL` + `REDIS_URL` / `REDIS_PRIVATE_URL`).
2. Generate a public domain on the web service.
3. Set at least: `API_TOKEN`, `DIGEST_RECIPIENTS`, `DIGEST_FROM`, optionally `RESEND_API_KEY` and enrichment keys.
4. Deploy via repo `Dockerfile`. Entrypoint runs `prisma migrate deploy` then Nest on `0.0.0.0:$PORT`.

**“table does not exist” / SyncRun missing:** redeploy so boot migrations run. Keep start command `/docker-entrypoint.sh`.

## Legal / etiquette

- Sources are public records; usage mirrors industry CRE data products.
- Identify with a real User-Agent + contact email; max 2 concurrent ArcGIS requests; 250ms page delay.
- ROD scraper is behind `ROD_SCRAPER_ENABLED=false` by default.
- Skip-traced contacts are for **licensed-agent manual outreach only** — not automated dialing. Honor TCPA / DNC.

## Tests

```bash
npm test
```
