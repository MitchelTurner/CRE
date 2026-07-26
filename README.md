# Greenville CRE Lead Engine

Lead-generation system for a commercial real estate **investment sales** agent in Greenville County, SC. Ingests public county parcel records, scores every commercial parcel on sell-likelihood, enriches top leads (SoS / ROD / distress / skip-trace), and emails a weekly digest.

**Core thesis:** investment-sales leads are property owners who are statistically likely to sell — predictable from hold period, absentee ownership, land use, loan maturity, and distress signals.

## Status (v3 + event intelligence addendum)

| Milestone | Status |
|---|---|
| M0 — ArcGIS layer discovery | Done |
| M1 — Ingestion (ArcGIS → Postgres) | Done |
| M2 — Scoring + weekly digest | Done |
| M3 — ROD / SoS / skip-trace / dashboard | Done (providers optional via env) |
| Portfolio graph, catalysts, map, HITL, CRM | Done (feeds optional via env) |
| **M4 — Event Feed** | Done (Eventbrite/ICS/HTML + manual; LLM optional) |
| **M5 — Event Intelligence** | Done (Person↔Owner matching + briefs + paste) |
| **M6 — Registered Agent Graph** | Done |
| **M7 — Market Report Generator** | Done (HTML; email to agent) |
| **M8 — Probate Signals** | Done (enrichment + paste-assist + delay config) |
| **M9 — Host Mode** | Done (invite-list CSV) |
| **AI analytics** | Done (Ask AI, parcel explain, outreach polish, market narrative — opt-in via Anthropic) |

### AI analytics (opt-in)

Set on Railway:

```bash
LLM_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...
# optional: LLM_MODEL=claude-sonnet-4-6
# optional: LLM_OPENER_POLISH=true
```

Surfaces: **Today → Ask AI**, **Admin → Ask AI / AI market narrative**, **Parcel → Explain with AI / Generate AI email**. Answers are grounded in your DB (queue, catalysts, scores, events) — not open-web search. No LinkedIn automation.

**Per-parcel scrape:** opening a parcel (or **Refresh public data**) pulls ArcGIS attributes, FEMA flood zone, county Real Property link/HTML (best-effort), SoS for entities, ROD mortgage when enabled, and nearby comps. **Outreach emails** use the LLM when `LLM_ENABLED` is on (template fallback otherwise).

### Event intelligence ethics

- Only ingest **public** directories / sponsor / speaker lists, or lists the agent lawfully possesses.
- No scraping behind logins. **No LinkedIn automation** — LinkedIn ToS forbids unauthenticated/automated search; event/people data enters only via manual paste (Events → Paste events / Paste people).
- Live feeds: Eventbrite token, public ICS (`EVENT_ICS_FEEDS`), optional HTML+LLM sources. `seed` source ships Greenville CRE placeholders so the calendar is never blank.
- Briefs are **internal prep**. Confidence is always shown; never fabricate matches.
- Probate outreach tone/timing is the agent's judgment (`PROBATE_LEAD_DELAY_DAYS`, default 60).

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

## Scoring (v3)

Tunable via `AppConfig` (`score_weights`, `landuse_priority`, `digest_fmv_floor`, …). Feedback thumbs-down can nudge weights via `POST /admin/tune-weights`.

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
| OOS long-hold decay | 0–10 |
| Portfolio / related-entity cluster | 0–8 |
| Zoning / permits / listings / probate / flood | signal-weighted |

Total capped at 100. Digest splits **Hot this week** (catalyst signals) vs evergreen. FMV floor default $250k.

**v3 UI:** Map, enrichment Review queue, outreach drafts on parcel detail, Admin tune-weights + CRM sync.

**UX workflow:** Today home (call queue + catalysts), saved parcel views, signal chips, score explain drawer, sticky call/email bar, keyboard next/prev (`J`/`K`), outcome + snooze + feedback reasons, digest include/exclude, drive-list CSV, job progress toasts.

**Second county:** set `COUNTY_SLUG=spartanburg` (scaffold) and verify field map with `npm run inspect:layer`.

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
