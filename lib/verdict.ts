import 'server-only';

import { ATTRIBUTION_LINE } from './constants';
import { fetchCloudCover } from './providers/openmeteo';
import { fetchSunMoon } from './providers/sunrisesunset';
import { fetchAuroraProbability, fetchKpForecast } from './providers/swpc';
import { roundCoord } from './providers/geoapify';
import { computeScore, verdictHeadline, verdictLine } from './score';
import { formatWindow, tonightDate } from './time';

/**
 * Verdict aggregation (ARCHITECTURE.md "Data flow for the verdict").
 *
 * Exported as a plain function, not an HTTP endpoint, so /api/card can share it
 * directly instead of self-calling over HTTP.
 *
 * Failure policy: one dead provider nulls one section and sets `degraded`.
 * Nothing in here throws for a provider outage.
 */

export type Verdict = {
  location: {
    latitude: number;
    longitude: number;
    timezone: string;
    city: string | null;
  };
  /** The local date "tonight" refers to at this location. */
  date: string;
  score: number | null;
  headline: string;
  verdict: string;
  theme: 'good' | 'mixed' | 'poor' | 'aurora';
  goldenHour: { begin: string | null; end: string | null; label: string | null } | null;
  blueHour: { begin: string | null; end: string | null; label: string | null } | null;
  sunset: string | null;
  moon: {
    illuminationPercent: number | null;
    phase: string | null;
    phaseValue: number | null;
  } | null;
  aurora: { probability: number | null; kp: number | null } | null;
  cloudCoverEvening: { meanPercent: number; minPercent: number } | null;
  polar: 'day' | 'night' | null;
  /** True when any section came back empty because a provider failed. */
  degraded: boolean;
  /** Which sections are missing, for honest UI copy. */
  missing: string[];
  attribution: string;
  /** Whether sun/moon came from the API or the local suncalc fallback. */
  sunMoonSource: 'sunrisesunset.io' | 'suncalc';
};

export type VerdictOptions = {
  latitude: number;
  longitude: number;
  timezone: string;
  city?: string | null;
  /** Injected for testability; defaults to the real clock. */
  now?: Date;
};

export async function getVerdict(options: VerdictOptions): Promise<Verdict> {
  const now = options.now ?? new Date();
  // Rounding is the cache key: nearby users collapse onto one cache entry,
  // which is what keeps the free tiers viable (ARCHITECTURE.md).
  const latitude = roundCoord(options.latitude);
  const longitude = roundCoord(options.longitude);
  const timezone = options.timezone;
  const date = tonightDate(timezone, now);

  // Sun/moon comes first because sunset defines the evening window that both
  // the cloud average and the Kp lookup are computed over. It never fails
  // outright — it falls back to suncalc.
  const sunMoon = await fetchSunMoon(latitude, longitude, timezone, date);

  const [cloud, auroraProbability, kp] = await Promise.all([
    fetchCloudCover(latitude, longitude, timezone, date, sunMoon.sunset),
    fetchAuroraProbability(latitude, longitude),
    fetchKpForecast(latitude, timezone, date, sunMoon.sunset),
  ]);

  const scoreInputs = {
    cloudCoverPercent: cloud?.eveningMeanPercent ?? null,
    moonIlluminationPercent: sunMoon.moonIlluminationPercent,
    auroraProbability,
    kp,
    latitude,
    polar: sunMoon.polar,
  };

  const result = computeScore(scoreInputs);
  const verdict = verdictLine({
    ...scoreInputs,
    ...result,
    goldenHourEvening: sunMoon.goldenHourEvening,
  });

  const missing: string[] = [];
  if (!cloud) missing.push('cloud');
  if (sunMoon.source === 'suncalc') missing.push('sunmoon-api');

  return {
    location: { latitude, longitude, timezone, city: options.city ?? null },
    date,
    score: result.score,
    headline: verdictHeadline(result),
    verdict,
    theme: result.theme,
    goldenHour: sunMoon.goldenHourEvening
      ? {
          ...sunMoon.goldenHourEvening,
          label: formatWindow(sunMoon.goldenHourEvening.begin, sunMoon.goldenHourEvening.end),
        }
      : null,
    blueHour: sunMoon.blueHourEvening
      ? {
          ...sunMoon.blueHourEvening,
          label: formatWindow(sunMoon.blueHourEvening.begin, sunMoon.blueHourEvening.end),
        }
      : null,
    sunset: sunMoon.sunset,
    moon: {
      illuminationPercent: sunMoon.moonIlluminationPercent,
      phase: sunMoon.moonPhaseLabel,
      phaseValue: sunMoon.moonPhaseValue,
    },
    // The aurora section is omitted entirely rather than nulled below 45°, so a
    // low-latitude client has nothing to accidentally render.
    aurora: result.showAurora || auroraProbability !== null || kp !== null
      ? { probability: auroraProbability, kp }
      : null,
    cloudCoverEvening: cloud
      ? { meanPercent: cloud.eveningMeanPercent, minPercent: cloud.eveningMinPercent }
      : null,
    polar: sunMoon.polar,
    degraded: missing.length > 0,
    missing,
    attribution: ATTRIBUTION_LINE,
    sunMoonSource: sunMoon.source,
  };
}
