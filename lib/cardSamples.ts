import type { Verdict } from './types';

/**
 * Fixed verdicts for card visual QA (T3.3).
 *
 * The card has to look intentional on nights we cannot summon on demand: a Kp 7
 * aurora storm, a full moon, a provider outage. These fixtures make each one
 * reproducible.
 *
 * Gated behind ALLOW_CARD_SAMPLES so it can never be reached in production —
 * see the guard in app/api/card/route.tsx.
 */

export const SAMPLES_ENABLED = process.env.ALLOW_CARD_SAMPLES === '1';

function base(overrides: Partial<Verdict>): Verdict {
  return {
    location: { latitude: 12.97, longitude: 77.59, timezone: 'Asia/Kolkata', city: 'Bengaluru' },
    date: '2026-08-17',
    score: 7,
    headline: 'Worth it',
    verdict: 'Worth it - clear skies tonight',
    theme: 'good',
    goldenHour: { begin: '18:15:20', end: '18:57:34', label: '6:15-6:57 PM' },
    blueHour: { begin: '18:57:34', end: '19:06:04', label: '6:57-7:06 PM' },
    sunset: '18:44:08',
    moon: { illuminationPercent: 12, phase: 'Waxing Crescent', phaseValue: 0.1 },
    aurora: null,
    cloudCoverEvening: { meanPercent: 8, minPercent: 2 },
    polar: null,
    degraded: false,
    missing: [],
    attribution: '',
    sunMoonSource: 'sunrisesunset.io',
    ...overrides,
  };
}

export const CARD_SAMPLES: Record<string, Verdict> = {
  /** The jackpot: clear, new moon, high score. */
  great: base({
    score: 9.8,
    headline: 'Worth it',
    verdict: 'Worth it - clear skies, golden hour 6:15-6:57 PM',
    theme: 'good',
    moon: { illuminationPercent: 3, phase: 'New Moon', phaseValue: 0.01 },
    cloudCoverEvening: { meanPercent: 2, minPercent: 0 },
  }),

  /** Socked in. The card still has to look deliberate, not sad. */
  bad: base({
    score: 1.4,
    headline: 'Skip it',
    verdict: 'Skip it - 94% cloud all evening',
    theme: 'poor',
    moon: { illuminationPercent: 61, phase: 'Waning Gibbous', phaseValue: 0.7 },
    cloudCoverEvening: { meanPercent: 94, minPercent: 88 },
  }),

  /** Kp 7 at high latitude: the whole card goes aurora-green. */
  aurora: base({
    location: { latitude: 69.65, longitude: 18.96, timezone: 'Europe/Oslo', city: 'Tromsø' },
    score: 10,
    headline: 'Aurora watch',
    verdict: 'AURORA WATCH - Kp 7 forecast, get away from city lights',
    theme: 'aurora',
    goldenHour: { begin: '20:04:09', end: '22:36:07', label: '8:04-10:36 PM' },
    blueHour: { begin: '22:36:07', end: '23:28:48', label: '10:36-11:28 PM' },
    moon: { illuminationPercent: 18, phase: 'Waxing Crescent', phaseValue: 0.14 },
    aurora: { probability: 62, kp: 7 },
    cloudCoverEvening: { meanPercent: 12, minPercent: 4 },
  }),

  /** Clear but washed out: tests the "bright night" copy and a 100% moon. */
  fullmoon: base({
    score: 7.6,
    headline: 'Maybe',
    verdict: 'Bright night - clear but a near-full moon, golden hour 6:15-6:57 PM',
    theme: 'mixed',
    moon: { illuminationPercent: 99, phase: 'Full Moon', phaseValue: 0.5 },
    cloudCoverEvening: { meanPercent: 9, minPercent: 3 },
  }),

  /** Open-Meteo down: no score, no cloud chip, but the times still hold up. */
  degraded: base({
    score: null,
    headline: 'Partial data',
    verdict: 'Golden hour 6:15-6:57 PM - cloud data unavailable right now',
    theme: 'mixed',
    cloudCoverEvening: null,
    degraded: true,
    missing: ['cloud'],
  }),

  /** The longest Indian metro name, against the date beside it. */
  longcity: base({
    location: {
      latitude: 8.52,
      longitude: 76.94,
      timezone: 'Asia/Kolkata',
      city: 'Thiruvananthapuram',
    },
    score: 6.2,
    headline: 'Maybe',
    verdict: 'Maybe - 38% cloud, golden hour 6:23-7:05 PM',
    theme: 'mixed',
    goldenHour: { begin: '18:23:00', end: '19:05:00', label: '6:23-7:05 PM' },
    blueHour: { begin: '19:05:00', end: '19:14:00', label: '7:05-7:14 PM' },
    cloudCoverEvening: { meanPercent: 38, minPercent: 20 },
  }),
};
