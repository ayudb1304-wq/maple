# BUILD_PLAN — SkyTonight v1

Work top to bottom. Each task has acceptance criteria (AC). Don't start a task until the previous one's AC pass. Commit per task.

## Phase 0 — Scaffold (30 min)

**T0.1** `create-next-app` (TypeScript, App Router, Tailwind, ESLint). Add zod, suncalc, vitest, @playwright/test. Set up `lib/`, `app/api/`, env vars in `.env.local` + `.env.example`.
AC: `npm run dev` boots; `npm run typecheck` and `npm run lint` pass; `.env.example` documents all three vars from ARCHITECTURE.md.

**T0.2** Verify all live endpoints with a throwaway script (`scripts/probe.ts`): hit each endpoint in API_REFERENCE.md for Bengaluru (12.97, 77.59) and a high-latitude city (Tromsø 69.65, 18.96), print shapes.
AC: script output committed as `docs/probe-output.md`; zod schemas in `lib/schemas.ts` written from REAL responses, not guesses. **If any endpoint is dead or shaped differently than API_REFERENCE.md says, stop and report before proceeding.**

## Phase 1 — Data layer (2–3 h)

**T1.1** Provider fetchers in `lib/providers/` (openmeteo, swpc, sunrisesunset, geoapify) with TTL caching (`next.revalidate`), timeouts, typed returns, and the User-Agent header.
AC: unit-testable pure parsing functions; each fetcher returns `null` (not throw) on failure.

**T1.2** `lib/score.ts` — Sky Score per PRD §4, plus verdict copy generator (short, human: "Worth it — clear skies after 6 PM", "Skip it — 90% cloud all evening", "AURORA WATCH — Kp 6 forecast, get away from city lights").
AC: `lib/score.test.ts` covers: clear+new moon, overcast, full moon clear, Kp 7 at lat 65, Kp 7 at lat 13 (no aurora chip), missing cloud data, polar day/night.

**T1.3** `app/api/verdict/route.ts` — parallel aggregation per ARCHITECTURE.md, coordinate rounding, `degraded` flag.
AC: `curl /api/verdict?lat=12.97&lon=77.59` returns valid JSON in <1.5s warm; killing one provider (bad URL in env) still returns 200 with that section null.

**T1.4** `app/api/geocode/route.ts` — proxy Open-Meteo geocoding, 30-day cache.
AC: `?q=beng` returns Bengaluru with timezone `Asia/Kolkata`.

## Phase 2 — Landing experience (3–4 h)

**T2.1** Landing page `/`: hero with search box + "Use my location" button; on result, verdict panel renders (score dial, verdict line, golden/blue hour, moon chip, aurora chip when applicable, cloud chip). Dark theme, one accent color driven by score per PRD §5.
AC: from cold load to verdict in <3s on fast 3G throttle for a typed city; zero layout shift when the panel appears; works with JS-computed local "tonight" using the location's timezone.

**T2.2** MapLibre map, lazy-loaded below the verdict, marker on location, OpenFreeMap dark style, attribution visible, graceful hide on tile failure.
AC: landing page JS (excluding lazy map chunk) < 150KB gzipped; disabling network to tiles.openfreemap.org hides the map without console spam or layout break.

**T2.3** localStorage saved location + streak counter ("🔥 N-day sky check streak", increments once per local calendar day).
AC: revisit next day (simulate by editing storage) increments; same-day revisit doesn't.

## Phase 3 — The card (2–3 h) ← the product's heart, budget time for polish

**T3.1** `app/api/card/route.tsx` per ARCHITECTURE.md pipeline. Layout: map background dimmed 40%, top-left city+date, center-left score dial + verdict, bottom row chips (golden hour, moon, aurora), footer strip with app URL + full attribution string from API_REFERENCE.md.
AC: `curl -o card.png "/api/card?lat=12.97&lon=77.59&city=Bengaluru"` → valid 1200×630 PNG; renders in <2s warm; Cache-Control headers set; Geoapify failure produces the gradient-fallback card, still 200.

**T3.2** Share UX: "Share tonight's sky" button → Web Share API with the PNG on mobile, copy-link + download on desktop.
AC: pasted link on X/WhatsApp preview shows the card (OG tags on `/` and `/sky/[city]` point at `/api/card?...`).

**T3.3** Visual QA loop: generate cards for 6 scenarios (great night, bad night, aurora night, full moon, degraded no-clouds, long city name "Thiruvananthapuram") and iterate until all look intentional.
AC: 6 sample PNGs saved to `docs/card-samples/`; no text overflow/clipping in any.

## Phase 4 — SEO pages + Pro hook (2 h)

**T4.1** `lib/cities.ts` with ~50 seeded cities (mix: Indian metros, aurora-belt cities, iconic sunset spots). `/sky/[slug]` SSR page: verdict for that city, unique title/description per PRD §8, OG image = live card, ISR revalidate 6h. `sitemap.xml` + `robots.txt`.
AC: `/sky/bengaluru`, `/sky/tromso`, `/sky/santorini` render with distinct meta; Lighthouse SEO ≥ 95.

**T4.2** Pro teaser: "Save more locations" / "See the 7-day outlook" buttons open a modal with the Pro pitch → `DODO_CHECKOUT_URL`. If env var unset, show "Coming soon".
AC: modal appears at the two paywall moments per PRD §6, never before the first verdict.

## Phase 5 — Ship (1 h)

**T5.1** Playwright smoke test (search → verdict → card 200). README with setup, env vars, deploy steps, and the two deferred-cost notes (Open-Meteo commercial plan; Geoapify limit escape hatch).
**T5.2** Deploy to Vercel, set env vars, verify production card rendering and OG previews via an OG debugger.
AC: production URL passes the Phase 2–4 ACs; Lighthouse mobile ≥ 85.

## Deferred (Phase 2 of the product — do NOT build now)

Auth, DB, Dodo webhooks/entitlements, alert emails/push, observation log, monthly recap card, ISS-pass sibling product.

## Time budget

~11–14 focused hours total = one hard weekend. If over budget, cut in this order: T4.1 city count 50→15, T3.2 Web Share (keep download only), T2.2 aurora overlay on the interactive map (keep the chip). Never cut T3.3 — the card's polish is the business.
