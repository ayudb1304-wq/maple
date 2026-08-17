/**
 * Coordinate precision and URL builders.
 *
 * Client-safe (no `server-only` import) so components can build share links.
 *
 * Two precisions exist on purpose, per the decision recorded in docs/PRD.md:
 *  - **Cache precision (2dp, ~1.1km)** for everything that costs money or hits
 *    a provider. Weather does not vary at 11m, and this rounding is what keeps
 *    Geoapify at roughly 5 credits per city per month.
 *  - **Display precision** may be finer, so a user can frame their own street.
 *    It never leaves the browser.
 *
 * Share URLs always use cache precision. A card gets pasted into group chats,
 * and a home address must not travel with it.
 */

export const MIN_MAP_ZOOM = 3;
export const MAX_MAP_ZOOM = 18;
export const DEFAULT_MAP_ZOOM = 9;
/** Above this, the frame is tight enough to identify a building. */
export const STREET_ZOOM = 15;

/** ~1.1km. The cache key for every provider call and every shared link. */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampZoom(zoom: number | null | undefined): number {
  if (!Number.isFinite(zoom ?? NaN)) return DEFAULT_MAP_ZOOM;
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, Math.round(zoom as number)));
}

/**
 * Parse a `zoom` query param.
 *
 * Deliberately not `clampZoom(Number(raw))`: `Number(null)` is **0**, not NaN,
 * so a missing param would sail through the finite check and clamp to the
 * minimum zoom, rendering a whole continent instead of a city.
 */
export function parseZoom(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === '') return DEFAULT_MAP_ZOOM;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampZoom(parsed) : DEFAULT_MAP_ZOOM;
}

/**
 * Parse a coordinate query param, returning null when it is absent or invalid.
 *
 * The explicit null check is the whole point. `Number(null)` is **0**, not NaN,
 * so `Number(params.get('lat'))` turns a missing parameter into a perfectly
 * valid coordinate: 0,0 in the Gulf of Guinea. The endpoint then answers
 * confidently about the wrong place instead of rejecting the request.
 */
export function parseCoord(raw: string | null | undefined, limit: 90 | 180): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) return null;
  return parsed;
}

export const parseLatitude = (raw: string | null | undefined) => parseCoord(raw, 90);
export const parseLongitude = (raw: string | null | undefined) => parseCoord(raw, 180);

/** Our own cached proxy for the Geoapify raster. Never contains the API key. */
export function staticMapUrl(
  appUrl: string,
  lat: number,
  lon: number,
  zoom: number = DEFAULT_MAP_ZOOM,
): string {
  return `${appUrl}/api/map?lat=${roundCoord(lat)}&lon=${roundCoord(lon)}&zoom=${clampZoom(zoom)}`;
}

export type CardUrlOptions = {
  latitude: number;
  longitude: number;
  city?: string | null;
  /** YYYY-MM-DD. Omitted means tonight. Present makes the card immutable. */
  date?: string | null;
  zoom?: number;
};

/**
 * The share card URL. Deterministic and cacheable, per ARCHITECTURE.md.
 *
 * `date` is part of the contract from day one even though v1 only renders
 * tonight: it is what the Phase 3 memory card will use, and baking it in now
 * means those URLs never have to change shape.
 */
export function cardUrl(appUrl: string, options: CardUrlOptions): string {
  const params = new URLSearchParams({
    lat: String(roundCoord(options.latitude)),
    lon: String(roundCoord(options.longitude)),
  });
  if (options.city) params.set('city', options.city);
  if (options.date) params.set('date', options.date);
  if (options.zoom && options.zoom !== DEFAULT_MAP_ZOOM) params.set('zoom', String(clampZoom(options.zoom)));
  return `${appUrl}/api/card?${params.toString()}`;
}
