import 'server-only';

import { cachedFetchJson } from '../http';
import { kpResponseSchema, ovationCellSchema, ovationResponseSchema, type KpRow } from '../schemas';
import { zonedToUtc } from '../time';
import { AURORA_MIN_LATITUDE } from '../constants';

/**
 * NOAA SWPC — aurora. Public domain, keyless.
 * TTLs per docs/API_REFERENCE.md: OVATION grid 15 min, Kp forecast 1 hour.
 */

const OVATION_TTL = 60 * 15;
const KP_TTL = 60 * 60;

// --- OVATION grid --------------------------------------------------------

/**
 * Probability at the nearest grid cell, taken as the max over the 3x3
 * neighbourhood so a user sitting on a cell boundary doesn't see the number
 * flicker between refreshes (docs/API_REFERENCE.md §2).
 */
export function lookupAuroraProbability(
  coordinates: unknown[],
  lat: number,
  lon: number,
): number | null {
  // Grid longitudes run 0–359, so wrap negatives (western hemisphere).
  const targetLon = Math.round(((lon % 360) + 360) % 360);
  const targetLat = Math.round(lat);

  let best: number | null = null;
  for (const raw of coordinates) {
    const cell = ovationCellSchema.safeParse(raw);
    if (!cell.success) continue;
    const [cellLon, cellLat, probability] = cell.data;

    // Longitude distance must wrap across the 359/0 seam.
    const rawLonDelta = Math.abs(cellLon - targetLon);
    const lonDelta = Math.min(rawLonDelta, 360 - rawLonDelta);
    if (lonDelta > 1 || Math.abs(cellLat - targetLat) > 1) continue;

    if (best === null || probability > best) best = probability;
  }
  return best;
}

export async function fetchAuroraProbability(lat: number, lon: number): Promise<number | null> {
  // Skip the 1.6MB download entirely for the majority of users.
  if (Math.abs(lat) < AURORA_MIN_LATITUDE) return null;

  const json = await cachedFetchJson('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', {
    revalidate: OVATION_TTL,
    label: 'swpc-ovation',
    timeoutMs: 8_000, // the grid is large; 5s is tight on a cold edge
  });
  if (json === null) return null;

  const parsed = ovationResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('[provider:swpc-ovation] response failed schema validation');
    return null;
  }
  return lookupAuroraProbability(parsed.data.coordinates, lat, lon);
}

// --- Kp forecast ---------------------------------------------------------

/**
 * Highest *predicted* Kp inside tonight's local evening window.
 *
 * D1: rows are objects with a fractional `kp`, and `time_tag` is UTC written
 * without a trailing "Z" — appending one is required or every timestamp is
 * silently reinterpreted as local server time.
 */
export function maxPredictedKp(rows: KpRow[], windowStartUtc: Date, windowEndUtc: Date): number | null {
  let max: number | null = null;
  for (const row of rows) {
    if (row.observed !== 'predicted') continue;
    const at = new Date(`${row.time_tag}Z`).getTime();
    if (Number.isNaN(at)) continue;
    if (at < windowStartUtc.getTime() || at > windowEndUtc.getTime()) continue;
    if (max === null || row.kp > max) max = row.kp;
  }
  return max;
}

/**
 * Tonight's peak forecast Kp. The window is the local evening (sunset to
 * roughly astronomical dark, extended to 02:00 for aurora chasers) converted to
 * real UTC instants, because SWPC speaks UTC only.
 */
export async function fetchKpForecast(
  lat: number,
  timezone: string,
  dateStr: string,
  sunset: string | null,
): Promise<number | null> {
  if (Math.abs(lat) < AURORA_MIN_LATITUDE) return null;

  const start = zonedToUtc(dateStr, sunset ?? '18:00:00', timezone);
  if (!start) return null;
  // Aurora viewing runs well past midnight; 8h covers the useful night.
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);

  const json = await cachedFetchJson(
    'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
    { revalidate: KP_TTL, label: 'swpc-kp' },
  );
  if (json === null) return null;

  const parsed = kpResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('[provider:swpc-kp] response failed schema validation');
    return null;
  }
  return maxPredictedKp(parsed.data, start, end);
}
