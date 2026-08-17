import 'server-only';
import SunCalc from 'suncalc';

import { cachedFetchJson } from '../http';
import { sunMoonResponseSchema, type SunMoonResults } from '../schemas';

/**
 * SunriseSunset.io v2 — sun and moon. Keyless, 24h TTL per (date, rounded latlon).
 *
 * Decision recorded at T0.2: this API is the primary source because its v2 moon
 * and golden/blue-hour fields are all present and stable. `suncalc` is the
 * offline fallback so an outage still yields golden-hour times and a moon phase
 * rather than an empty panel.
 *
 * Attribution ("Sun & moon times by SunriseSunset.io") is a condition of free
 * commercial use and is rendered in the footer and on every card.
 */

const TTL = 60 * 60 * 24;

export type SunMoon = {
  sunset: string | null;
  sunrise: string | null;
  dusk: string | null;
  goldenHourEvening: { begin: string | null; end: string | null } | null;
  blueHourEvening: { begin: string | null; end: string | null } | null;
  moonIlluminationPercent: number | null;
  moonPhaseLabel: string | null;
  /** 0–1 position in the lunation cycle (0 = new, 0.5 = full). */
  moonPhaseValue: number | null;
  /** True when the sun never sets or never rises — the polar cases. */
  polar: 'day' | 'night' | null;
  /** Which source answered, so the UI can be honest about precision. */
  source: 'sunrisesunset.io' | 'suncalc';
};

/** "18:44:08" from a Date rendered in a given IANA zone. */
function timeInZone(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(at);
}

/** Human phase label from a 0–1 cycle position, matching the API's vocabulary. */
export function moonPhaseLabel(phaseValue: number): string {
  const p = ((phaseValue % 1) + 1) % 1;
  if (p < 0.03 || p > 0.97) return 'New Moon';
  if (p < 0.22) return 'Waxing Crescent';
  if (p < 0.28) return 'First Quarter';
  if (p < 0.47) return 'Waxing Gibbous';
  if (p < 0.53) return 'Full Moon';
  if (p < 0.72) return 'Waning Gibbous';
  if (p < 0.78) return 'Last Quarter';
  return 'Waning Crescent';
}

/** Detect polar day/night from the API's own signals plus a missing sunset. */
function detectPolar(results: SunMoonResults): 'day' | 'night' | null {
  const status = results.sun_status?.toLowerCase() ?? '';
  if (status.includes('polar day') || status.includes('always up')) return 'day';
  if (status.includes('polar night') || status.includes('always down')) return 'night';
  if (!results.sunset && !results.sunrise) {
    // No sunrise and no sunset: day length disambiguates the two poles of it.
    return results.day_length === '00:00:00' ? 'night' : 'day';
  }
  return null;
}

export function normalizeSunMoon(results: SunMoonResults): SunMoon {
  return {
    sunset: results.sunset,
    sunrise: results.sunrise,
    dusk: results.dusk,
    goldenHourEvening: results.golden_hour_evening
      ? { begin: results.golden_hour_evening.begin, end: results.golden_hour_evening.end }
      : null,
    blueHourEvening: results.blue_hour_evening
      ? { begin: results.blue_hour_evening.begin, end: results.blue_hour_evening.end }
      : null,
    moonIlluminationPercent: results.moon_illumination,
    moonPhaseLabel: results.moon_phase,
    moonPhaseValue: results.moon_phase_value,
    polar: detectPolar(results),
    source: 'sunrisesunset.io',
  };
}

/**
 * Local computation used when the API fails. suncalc gives sunset, dusk and
 * moon illumination directly; the golden/blue hour windows are derived from its
 * solar-elevation events, which is what those windows are defined by anyway.
 */
export function computeSunMoonLocally(
  lat: number,
  lon: number,
  dateStr: string,
  timezone: string,
): SunMoon {
  // Noon UTC on the target date keeps suncalc on the right calendar day for
  // every timezone without needing an offset round-trip.
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  const times = SunCalc.getTimes(noonUtc, lat, lon);
  const moon = SunCalc.getMoonIllumination(noonUtc);

  const valid = (d: Date | undefined) => (d && !Number.isNaN(d.getTime()) ? d : null);
  const sunsetDate = valid(times.sunset);
  const duskDate = valid(times.dusk);
  const sunriseDate = valid(times.sunrise);
  const goldenStart = valid(times.goldenHour);
  const blueStart = valid(times.sunsetStart);

  let polar: 'day' | 'night' | null = null;
  if (!sunsetDate && !sunriseDate) {
    const altitude = SunCalc.getPosition(noonUtc, lat, lon).altitude;
    polar = altitude > 0 ? 'day' : 'night';
  }

  return {
    sunset: sunsetDate ? timeInZone(sunsetDate, timezone) : null,
    sunrise: sunriseDate ? timeInZone(sunriseDate, timezone) : null,
    dusk: duskDate ? timeInZone(duskDate, timezone) : null,
    goldenHourEvening:
      goldenStart && sunsetDate
        ? { begin: timeInZone(goldenStart, timezone), end: timeInZone(sunsetDate, timezone) }
        : null,
    blueHourEvening:
      blueStart && duskDate
        ? { begin: timeInZone(blueStart, timezone), end: timeInZone(duskDate, timezone) }
        : null,
    moonIlluminationPercent: Math.round(moon.fraction * 1000) / 10,
    moonPhaseLabel: moonPhaseLabel(moon.phase),
    moonPhaseValue: Math.round(moon.phase * 100) / 100,
    polar,
    source: 'suncalc',
  };
}

/** Never returns null: falls back to local computation so the panel always has times. */
export async function fetchSunMoon(
  lat: number,
  lon: number,
  timezone: string,
  dateStr: string,
): Promise<SunMoon> {
  const url =
    'https://api.sunrisesunset.io/json' +
    `?lat=${lat}&lng=${lon}&date=${dateStr}&timezone=${encodeURIComponent(timezone)}&time_format=24`;

  const json = await cachedFetchJson(url, { revalidate: TTL, label: 'sunrisesunset' });
  if (json !== null) {
    const parsed = sunMoonResponseSchema.safeParse(json);
    if (parsed.success && parsed.data.status === 'OK') {
      return normalizeSunMoon(parsed.data.results);
    }
    console.warn('[provider:sunrisesunset] unusable response, falling back to suncalc');
  }
  return computeSunMoonLocally(lat, lon, dateStr, timezone);
}
