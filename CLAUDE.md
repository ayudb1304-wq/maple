# CLAUDE.md — SkyTonight

## What this project is

SkyTonight is a habit-forming micro-SaaS web app: **"Will tonight's sky be worth going outside for?"**
For any location it shows tonight's sunset quality window (golden/blue hour), moon phase, aurora probability (where relevant), and cloud cover — rendered on a dark map, with a **shareable PNG card** as the core viral artifact.

- Free tier: one location, tonight only, one share card.
- Pro (via Dodo Payments): multiple saved locations, quality-threshold alerts, observation log/history, monthly recap card.
- Business goal: $3K–$5K total revenue. Solo dev, weekend-scale build, near-$0 infra.

Read `docs/PRD.md` for the full product spec before building any feature.

## Stack (do not deviate without asking)

- **Framework:** Next.js 14+ (App Router), TypeScript, deployed on **Vercel** (hobby/free tier).
- **Interactive map:** MapLibre GL JS + **OpenFreeMap** public vector tiles (dark style). No API key. Attribution mandatory.
- **Share cards / OG images:** `@vercel/og` (Satori) on an Edge route. Base map raster comes from **Geoapify Static Maps API** (free tier, keyed — key lives ONLY in server env, never client).
- **Data APIs:** sunrise-sunset.org (v2), NOAA SWPC (aurora/Kp), Open-Meteo (cloud cover, geocoding). See `docs/API_REFERENCE.md` for exact endpoints, TTLs, and terms.
- **Caching:** every third-party call goes through a Next.js route handler with `fetch` cache / revalidate TTLs per `docs/API_REFERENCE.md`. Never call keyed APIs from the browser.
- **DB (Pro features only):** none in v1. Phase 2 may add a free-tier Postgres (e.g., Neon) or Cloudflare KV — ask before adding.
- **Payments:** Dodo Payments hosted checkout link (no SDK integration in v1; a "Go Pro" button links out, webhook handling is Phase 2).
- **Styling:** Tailwind CSS. Dark-first design. No component library unless asked.

## Hard rules (ToS / legal — never violate)

1. **Never** fetch tiles from `tile.openstreetmap.org` or `tiles.openstreetmap.us` (commercial use prohibited).
2. **Never** use Google Maps, Mapbox, MapTiler-free, or Stadia-free for anything (cost trap or non-commercial free tier).
3. **Never** use Nominatim for geocoding (1 req/s policy). Use Open-Meteo Geocoding (keyless) with cached results.
4. **Attribution must be baked into every generated share card image**: "© OpenStreetMap contributors · Map © Geoapify · Data: NOAA SWPC, Open-Meteo, SunriseSunset.io". Also show OSM/OpenFreeMap attribution on the interactive map control.
5. The Geoapify API key must never appear in client bundles, URLs returned to the client, or logs.
6. All external data must be cached server-side with the TTLs in `docs/API_REFERENCE.md` — hammering free APIs risks losing access.

## Conventions

- Route handlers under `app/api/`. One file per external provider under `lib/providers/` (e.g., `lib/providers/swpc.ts`), each exporting typed fetchers with built-in caching.
- All provider responses validated with zod schemas in `lib/schemas.ts`. Fail soft: if one data source is down, render the card without that section — never a hard 500 for the whole page.
- Timezone correctness is a feature: all "tonight" logic must use the *location's* timezone (Open-Meteo geocoding returns it), never the server's.
- Share card URLs must be deterministic and cacheable: `/api/card?lat=..&lon=..&date=YYYY-MM-DD` with `Cache-Control: public, max-age=86400, immutable` for past/today dates.
- Pages needed for SEO from day 1: `/sky/[city-slug]` programmatic pages with proper `<meta>` + OG image pointing at the card endpoint.
- Commit style: small conventional commits (`feat:`, `fix:`, `chore:`). Run `npm run lint && npm run typecheck` before declaring a task done.

## What "done" means for v1 (weekend scope)

See `docs/BUILD_PLAN.md` for the phased task list. v1 ships when:
1. Visitor lands, allows location or types a city → sees tonight's verdict + map in <3s, **no signup**.
2. "Share tonight's sky" produces a 1200×630 PNG card that looks good pasted into X/WhatsApp.
3. `/sky/bengaluru` (and ~50 seeded city slugs) render server-side with unique meta + OG cards.
4. A "Go Pro" button exists linking to a Dodo checkout URL (env var `DODO_CHECKOUT_URL`).
5. Lighthouse mobile score ≥ 85; total JS on the landing page kept lean (MapLibre lazy-loaded).

## What NOT to build in v1

- No auth, no database, no push notifications, no email, no webhook handling, no observation log. These are Phase 2 (`docs/PRD.md` §7).
- No aurora ground-track math beyond mapping the SWPC OVATION grid to the user's latitude.
- No LLM/AI features of any kind (cost constraint).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
