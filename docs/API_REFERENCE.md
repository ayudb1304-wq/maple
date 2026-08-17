# API_REFERENCE — external providers

Source of truth for endpoints, caching TTLs, and terms. If an endpoint 404s or terms look different at build time, STOP and flag it to the user instead of silently substituting another provider.

## 1. Open-Meteo (cloud cover + geocoding)

- **Geocoding:** `https://geocoding-api.open-meteo.com/v1/search?name={q}&count=5&language=en&format=json`
  Returns lat, lon, country, admin1, **timezone**, population. Keyless. Cache 30 days per query string.
- **Forecast (cloud cover):** `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=cloud_cover&forecast_days=2&timezone={iana_tz}`
  Keyless. Cache 1h per rounded latlon.
- **Terms note (important):** data is CC BY 4.0, but the free hosted endpoint is framed for non-commercial/low volume. Our mitigation: aggressive caching keeps volume trivial; attribution "Weather data by Open-Meteo.com" required in the app footer and card attribution line. If the product earns real revenue, budget for their commercial plan (~$29/mo tier) — note this in README, don't solve it now.

## 2. NOAA SWPC (aurora) — public domain, keyless

- **OVATION aurora grid:** `https://services.swpc.noaa.gov/json/ovation_aurora_latest.json`
  Array of `[lon, lat, probability]` on a 1°×1° global grid (lon 0–359, lat −90..90). Look up the cell nearest the user; also take max of the 3×3 neighborhood to avoid grid-edge flicker. Cache 15 min.
- **Kp forecast:** `https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json`
  Rows of `[time_tag, kp, observed|estimated|predicted]`. Use max predicted Kp for tonight's local evening window. Cache 1h.
- Attribution: "Aurora data: NOAA SWPC".

## 3. SunriseSunset.io (v2) — sun + moon, keyless

- `https://api.sunrisesunset.io/json?lat={lat}&lng={lon}&date={YYYY-MM-DD}&timezone={iana_tz}&time_format=24`
  Returns sunrise, sunset, golden_hour, dawn/dusk, day_length; v2 fields include moonrise/moonset, moon phase and illumination. Validate the exact field names against a live response at build time and encode them in the zod schema.
- Cache 24h per (date, rounded latlon).
- **Attribution is a condition of free commercial use:** visible link "Sun & moon times by SunriseSunset.io" in footer + card attribution line.
- Fallback if v2 moon fields are missing: compute moon phase locally with the `suncalc` npm package (BSD-2) — zero API risk, slightly less precise. Prefer suncalc for golden-hour math too if the API shape is unstable; the API then becomes a cross-check. Decide once at build time and note the choice in README.

## 4. Geoapify Static Maps — keyed, server-only

- `https://maps.geoapify.com/v1/staticmap?style=dark-matter-brown&width=1200&height=630&center=lonlat:{lon},{lat}&zoom=9&marker=lonlat:{lon},{lat};color:%2300d5be;size:large&apiKey={KEY}`
  (Style candidates: `dark-matter-brown`, `dark-matter`, `klokantech-basic` — pick the best-looking dark one at build time.)
- Free tier: 3,000 credits/day, commercial use allowed, results may be cached/stored. Our card ≈ 5 credits.
- Cache the fetched PNG 30 days per (rounded latlon, zoom, style). NEVER expose the key: fetch server-side, re-serve via our own route.
- Attribution: "© OpenStreetMap contributors · Map © Geoapify" must appear on the card image itself.

## 5. OpenFreeMap (interactive map tiles) — keyless

- Style URL: `https://tiles.openfreemap.org/styles/dark` (verify current style names at https://openfreemap.org; also `liberty`, `bright`, `positron`).
- Unlimited requests, no key, commercial OK, donation-funded, **no SLA** → the UI must degrade gracefully if tiles fail (hide map, keep verdict).
- Attribution control on the map: OpenStreetMap contributors + OpenFreeMap/OpenMapTiles credit.

## 6. Explicitly banned providers (do not use, even as fallback)

| Provider | Reason |
|---|---|
| tile.openstreetmap.org / tiles.openstreetmap.us | Commercial use prohibited by usage policy |
| Nominatim (hosted) | 1 req/s policy; unsuitable for product traffic |
| Google Maps (any API) | ToS bars caching/derived stored images — incompatible with share cards |
| Mapbox | No hard spend cap; viral card = billing risk |
| MapTiler free / Stadia free | Free tiers are non-commercial |
| OpenSky Network | Commercial/operational use requires a written license |

## Attribution line (exact string for the card footer, small type)

```
© OpenStreetMap contributors · Map © Geoapify · NOAA SWPC · Open-Meteo.com · SunriseSunset.io
```

## Rate-limit etiquette

- Descriptive `User-Agent` on all server-side fetches: `SkyTonight/1.0 (+{NEXT_PUBLIC_APP_URL})`.
- All fetches have a 5s timeout via AbortController; retries: 1, with jitter; failures degrade per ARCHITECTURE.md.
