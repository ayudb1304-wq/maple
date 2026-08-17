# ARCHITECTURE — SkyTonight

## System shape

```
Browser
  ├─ / (landing: geolocate or search → verdict UI)
  ├─ /sky/[city]         (SSR programmatic page, ISR revalidate 6h)
  └─ MapLibre GL JS ──────────► OpenFreeMap tiles (direct, keyless, unlimited)

Next.js (Vercel)
  ├─ app/api/verdict     GET ?lat&lon → aggregated JSON (score + sections)
  ├─ app/api/geocode     GET ?q=      → proxied Open-Meteo geocoding (cached)
  ├─ app/api/card        GET ?lat&lon&city&date → 1200×630 PNG (@vercel/og, Edge)
  └─ lib/providers/*     server-only fetchers with per-provider TTLs
        ├─ openmeteo.ts   (cloud cover hourly; geocoding)
        ├─ swpc.ts        (OVATION grid + Kp forecast)
        ├─ sunrisesunset.ts (v2: golden/blue hour, moon)
        └─ geoapify.ts    (static map PNG, key from env)
```

## Data flow for the verdict

1. Client obtains coordinates (browser geolocation, or `/api/geocode` for typed city).
2. Client calls `/api/verdict?lat&lon`. Server:
   - Rounds coordinates to 2 decimals (~1km) → this is the **cache key**. Rounding makes nearby users share cache entries and keeps free-tier usage tiny.
   - Fetches all providers **in parallel** with `Promise.allSettled`; each provider fetcher uses Next `fetch(url, { next: { revalidate: TTL } })`.
   - Computes Sky Score in `lib/score.ts` (pure function, unit-tested).
   - Returns `{ score, verdict, goldenHour, blueHour, moon, aurora?, cloudCoverEvening, attribution[] }`.
3. Any provider failure → that section is `null`; score computed from what's available; response includes `degraded: true`.

## TTLs (mirror of API_REFERENCE — the source of truth is there)

| Data | TTL |
|---|---|
| Geocoding result | 30 days |
| OVATION aurora grid | 15 min |
| Kp forecast | 1 h |
| Cloud cover (Open-Meteo) | 1 h |
| Sunrise/sunset/moon | 24 h (keyed by date+latlon) |
| Geoapify static map PNG | 30 days (background barely changes) |

## The card pipeline (the tricky part)

- Route: `app/api/card/route.tsx`, `export const runtime = 'edge'`.
- Steps:
  1. Fetch the Geoapify static map (server-side, key from `process.env.GEOAPIFY_KEY`) sized 1200×630, dark style, one marker. Fetch it **through our own cached helper**, not fresh per card.
  2. Fetch the same verdict JSON used by the page (share the aggregation function directly, don't HTTP-self-call).
  3. Build the Satori tree: `<div style={{display:'flex' ...}}>` with the map PNG as an absolutely-positioned `<img>` (Satori accepts PNG/JPEG only — never pass WebP or SVG-with-foreignObject).
  4. Return `new ImageResponse(tree, { width: 1200, height: 630 })` with `Cache-Control: public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800`.
- Constraints to respect: flexbox only (no grid), keep the Edge bundle <500KB (load one weight of one font, e.g., Inter Bold, as a fetched ArrayBuffer), and keep base64 payloads small — pass the map as a URL to our own cached proxy route rather than a giant data URI.
- Fonts: fetch the .ttf from `/public` at module scope once.

## Credit math (why this stays free)

Geoapify free tier = 3,000 credits/day. A 1200×630 static map ≈ `1 + (1200*630)/(256*256)/4 + 1 marker ≈ 5` credits → ~600 fresh map fetches/day, and with 30-day caching per rounded-latlon each city costs that only once a month. Realistically thousands of card views/day at $0. If usage approaches limits, `docs/API_REFERENCE.md` has the self-host escape hatch (Protomaps PMTiles on Cloudflare R2 + sharp tile-stitching).

## Client map

- MapLibre GL JS, dynamically imported (`next/dynamic`, `ssr:false`) so the landing page paints before the map loads.
- Style: OpenFreeMap "dark" (or Positron adapted dark). Attribution control must remain visible: OpenStreetMap contributors + OpenFreeMap/OpenMapTiles.
- The map is presentational in v1 — a marker on the location plus (when applicable) a translucent aurora-probability overlay rendered from the OVATION grid as a canvas layer at latitudes >45°. Skip the overlay entirely below 45° latitude.

## State (v1, no DB)

- `localStorage`: `{ savedLocation, lastCheckedDates: string[] }` → derive a check-in streak client-side. Show the streak subtly ("🔥 5-day sky check streak") — this is the seed of the Phase 2 investment mechanic.
- Pro gating in v1 is honor-system UI (buttons that link to Dodo checkout); real entitlements arrive with Phase 2 auth+webhooks.

## Env vars

```
GEOAPIFY_KEY=            # server only
DODO_CHECKOUT_URL=       # hosted checkout link
NEXT_PUBLIC_APP_URL=     # canonical URL for cards/OG
```

## Failure modes & handling

- SWPC down → hide aurora chip, note nothing (users at low latitude never see it anyway).
- Open-Meteo down → score becomes "Golden hour only" mode with copy "cloud data unavailable right now".
- Geoapify down/over-limit → card renders on a solid dark gradient instead of the map (keep a branded fallback background in `/public`).
- OpenFreeMap down → interactive map hidden, verdict panel unaffected. (No SLA on OpenFreeMap; this fallback is mandatory, not optional.)

## Testing

- `lib/score.test.ts`: scoring edge cases (full moon + clear, cloudy + Kp 7, polar day, missing sections).
- `lib/time.test.ts`: "tonight" window logic across timezones and DST — use the location's IANA timezone from geocoding, never server time.
- One Playwright smoke: landing → type "Bengaluru" → verdict visible; `/api/card` returns image/png 200.
