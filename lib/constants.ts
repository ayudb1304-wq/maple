/**
 * Shared thresholds used by both the providers and the pure scoring logic.
 *
 * These live apart from lib/providers/* so lib/score.ts stays free of any
 * `server-only` import and remains testable and client-safe.
 */

/**
 * Below this absolute latitude the aurora section is hidden entirely and the
 * 1.6MB OVATION grid is never downloaded. A Bengaluru user must never see an
 * aurora chip (PRD §4).
 */
export const AURORA_MIN_LATITUDE = 45;

/** Show the aurora chip at or above this OVATION probability, per PRD §4. */
export const AURORA_MIN_PROBABILITY = 10;

/** Exact attribution string required on the card footer (docs/API_REFERENCE.md). */
export const ATTRIBUTION_LINE =
  '© OpenStreetMap contributors · Map © Geoapify · NOAA SWPC · Open-Meteo.com · SunriseSunset.io';
