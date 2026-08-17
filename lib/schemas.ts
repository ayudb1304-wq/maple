import { z } from 'zod';

/**
 * Zod schemas for every third-party response.
 *
 * These are transcribed from REAL responses captured in docs/probe-output.md
 * (T0.2), not from prose. Where the live shape disagreed with the original
 * docs/API_REFERENCE.md the live shape wins — see findings D1–D4 in that file.
 *
 * Rule: schemas are permissive about fields we do not use (no .strict()) and
 * strict about the ones we do, so a provider adding a field never breaks us.
 */

// --- Open-Meteo geocoding ------------------------------------------------

export const geocodeResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  admin1: z.string().optional(),
  admin2: z.string().optional(),
  population: z.number().optional(),
  /** GeoNames feature code, e.g. "PPLA" (populated place) or "ISL" (island). */
  feature_code: z.string().optional(),
});

/** `results` is absent entirely (not an empty array) when nothing matches. */
export const geocodeResponseSchema = z.object({
  results: z.array(geocodeResultSchema).optional(),
});

export type GeocodeResult = z.infer<typeof geocodeResultSchema>;

// --- Open-Meteo forecast (cloud cover) -----------------------------------

export const forecastResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  utc_offset_seconds: z.number(),
  timezone: z.string(),
  hourly: z.object({
    /** Naive local ISO strings like "2026-08-17T00:00" (no zone suffix). */
    time: z.array(z.string()),
    /** Percent 0–100. Null defensively: a gap in the series must not throw. */
    cloud_cover: z.array(z.number().nullable()),
  }),
});

// --- NOAA SWPC: OVATION aurora grid --------------------------------------

/** [lon 0–359, lat -90..90, probability 0–100] on a 1x1 degree grid. */
export const ovationCellSchema = z.tuple([z.number(), z.number(), z.number()]);

/**
 * The grid is ~65,000 cells (~1.6MB). Deep-parsing every tuple on each request
 * would cost more than the lookup itself, so the envelope is validated here and
 * only the handful of cells actually read are validated with `ovationCellSchema`.
 */
export const ovationResponseSchema = z.object({
  'Observation Time': z.string(),
  'Forecast Time': z.string(),
  coordinates: z.array(z.unknown()),
});

// --- NOAA SWPC: planetary K-index forecast -------------------------------

/**
 * D1: this is an array of OBJECTS, not the [time_tag, kp, observed] rows the
 * original spec described. `kp` is fractional and `time_tag` is UTC with no
 * trailing "Z".
 */
export const kpRowSchema = z.object({
  time_tag: z.string(),
  kp: z.number(),
  observed: z.enum(['observed', 'estimated', 'predicted']),
  noaa_scale: z.string().nullable().optional(),
});

export const kpResponseSchema = z.array(kpRowSchema);

export type KpRow = z.infer<typeof kpRowSchema>;

// --- SunriseSunset.io v2 -------------------------------------------------

/** "HH:MM:SS" in the requested timezone, or null at high latitude (D3). */
const localTime = z.string().nullable();

const hourWindowSchema = z
  .object({ begin: localTime, end: localTime })
  .nullable()
  .optional();

export const sunMoonResultsSchema = z.object({
  date: z.string(),
  sunrise: localTime,
  sunset: localTime,
  dawn: localTime,
  dusk: localTime,
  solar_noon: localTime,
  day_length: z.string().nullable(),
  /** IANA zone echoed back, plus the offset in MINUTES (not seconds). */
  timezone: z.string(),
  utc_offset: z.number(),
  /** "normal" | polar-day/polar-night markers. */
  sun_status: z.string().optional(),

  golden_hour_evening: hourWindowSchema,
  blue_hour_evening: hourWindowSchema,
  golden_hour_morning: hourWindowSchema,
  blue_hour_morning: hourWindowSchema,

  moonrise: localTime,
  moonset: localTime,
  /** Percent illuminated, 0–100. */
  moon_illumination: z.number().nullable(),
  /** Human label, e.g. "Waxing Crescent". */
  moon_phase: z.string().nullable(),
  /** Position in the lunation cycle, 0–1 (0 = new, 0.5 = full). */
  moon_phase_value: z.number().nullable(),
  moon_always_up: z.boolean().optional(),
  moon_always_down: z.boolean().optional(),
});

export const sunMoonResponseSchema = z.object({
  results: sunMoonResultsSchema,
  status: z.string(),
});

export type SunMoonResults = z.infer<typeof sunMoonResultsSchema>;
