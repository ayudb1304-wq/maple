import 'server-only';

import { cachedFetchJson } from '../http';
import { forecastResponseSchema, geocodeResponseSchema, type GeocodeResult } from '../schemas';
import { eveningWindow, parseNaiveIso } from '../time';

/**
 * Open-Meteo — geocoding and hourly cloud cover. Keyless.
 * TTLs per docs/API_REFERENCE.md: geocoding 30 days, forecast 1 hour.
 */

const GEOCODE_TTL = 60 * 60 * 24 * 30;
const FORECAST_TTL = 60 * 60;

/** GeoNames codes starting with PPL are populated places (D4: rank these first). */
function isPopulatedPlace(result: GeocodeResult): boolean {
  return result.feature_code?.startsWith('PPL') ?? false;
}

/**
 * Rank so a typed city beats a same-named island, village or river.
 *
 * Open-Meteo orders by prefix match alone with no population weighting, so
 * "beng" puts Benghazi first and buries Bengaluru (8.5M people) at rank 18.
 * We therefore over-fetch and re-rank: exact name match, then populated places,
 * then population descending.
 */
/**
 * An exact name match only outranks a bigger city if the exact match is a real
 * settlement. Without this floor, the unpopulated hamlet of "Beng" in Cambodia
 * beats Bengaluru for the query "beng".
 */
const MIN_EXACT_MATCH_POPULATION = 1_000;

export function rankGeocodeResults(results: GeocodeResult[], query: string): GeocodeResult[] {
  const needle = query.trim().toLowerCase();
  const isMeaningfulExactMatch = (r: GeocodeResult) =>
    r.name.toLowerCase() === needle && (r.population ?? 0) >= MIN_EXACT_MATCH_POPULATION ? 1 : 0;

  return [...results].sort((a, b) => {
    const byKind = Number(isPopulatedPlace(b)) - Number(isPopulatedPlace(a));
    if (byKind !== 0) return byKind;
    const byExact = isMeaningfulExactMatch(b) - isMeaningfulExactMatch(a);
    if (byExact !== 0) return byExact;
    return (b.population ?? 0) - (a.population ?? 0);
  });
}

/** Over-fetch depth needed to surface a major city from a short prefix. */
const GEOCODE_FETCH_COUNT = 20;
/** How many ranked results the client actually sees. */
const GEOCODE_RETURN_COUNT = 6;

export async function geocode(query: string): Promise<GeocodeResult[] | null> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url =
    'https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(trimmed)}&count=${GEOCODE_FETCH_COUNT}&language=en&format=json`;

  const json = await cachedFetchJson(url, { revalidate: GEOCODE_TTL, label: 'openmeteo-geocode' });
  if (json === null) return null;

  const parsed = geocodeResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('[provider:openmeteo-geocode] response failed schema validation');
    return null;
  }
  // `results` is omitted entirely when nothing matches — that is a valid empty
  // answer, not a failure, so it must not be conflated with null.
  return rankGeocodeResults(parsed.data.results ?? [], trimmed).slice(0, GEOCODE_RETURN_COUNT);
}

export type CloudCover = {
  /** Mean cloud cover percent across the evening window. */
  eveningMeanPercent: number;
  /** Best (lowest) hourly reading in the window — "it clears up later" signal. */
  eveningMinPercent: number;
  /** How many hourly samples backed the average. */
  samples: number;
};

/**
 * Mean/min cloud cover over sunset ± 2h, computed entirely in naive local time.
 *
 * Both sides of the comparison are wall-clock in the same zone (we ask
 * Open-Meteo for the location's timezone), so no offset math is involved.
 */
export function summarizeCloudCover(
  hourly: { time: string[]; cloud_cover: (number | null)[] },
  dateStr: string,
  sunset: string | null,
): CloudCover | null {
  const window = eveningWindow(dateStr, sunset);
  if (!window) return null;

  const values: number[] = [];
  for (let i = 0; i < hourly.time.length; i++) {
    const at = parseNaiveIso(hourly.time[i]);
    const value = hourly.cloud_cover[i];
    if (at === null || value === null || value === undefined) continue;
    if (at >= window.start && at <= window.end) values.push(value);
  }
  if (values.length === 0) return null;

  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    eveningMeanPercent: Math.round(sum / values.length),
    eveningMinPercent: Math.min(...values),
    samples: values.length,
  };
}

/**
 * Fetch hourly cloud cover and reduce it to the evening summary.
 * `forecast_days=2` so a late sunset whose +2h window crosses midnight still
 * has hours available on the far side.
 */
export async function fetchCloudCover(
  lat: number,
  lon: number,
  timezone: string,
  dateStr: string,
  sunset: string | null,
): Promise<CloudCover | null> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}&hourly=cloud_cover&forecast_days=2` +
    `&timezone=${encodeURIComponent(timezone)}`;

  const json = await cachedFetchJson(url, { revalidate: FORECAST_TTL, label: 'openmeteo-forecast' });
  if (json === null) return null;

  const parsed = forecastResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('[provider:openmeteo-forecast] response failed schema validation');
    return null;
  }
  return summarizeCloudCover(parsed.data.hourly, dateStr, sunset);
}
