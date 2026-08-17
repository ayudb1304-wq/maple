/**
 * Shapes shared between the server aggregation and the client UI.
 *
 * These live apart from lib/verdict.ts so client components can import the
 * types without pulling a `server-only` module into their graph.
 */

export type ScoreTheme = 'good' | 'mixed' | 'poor' | 'aurora';

export type HourWindow = {
  begin: string | null;
  end: string | null;
  /** Pre-formatted for display, e.g. "6:15-6:57 PM". */
  label: string | null;
};

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
  theme: ScoreTheme;
  goldenHour: HourWindow | null;
  blueHour: HourWindow | null;
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
  sunMoonSource: 'sunrisesunset.io' | 'suncalc';
};

/** A place the user can look at, from search, geolocation or a seeded city. */
export type Place = {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country?: string | null;
  admin1?: string | null;
};

export type GeocodeApiResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country: string | null;
  countryCode: string | null;
  admin1: string | null;
  population: number | null;
};
