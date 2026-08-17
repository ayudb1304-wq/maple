/**
 * The Sky Score (PRD §4) and the verdict copy that goes with it.
 *
 * Pure and dependency-free so it can be unit-tested exhaustively and reused
 * unchanged by both /api/verdict and the card renderer.
 *
 * Every weight lives in SCORING below. Tune there, not in the logic.
 */

import { formatWindow } from './time';
import { AURORA_MIN_PROBABILITY } from './constants';

export const SCORING = {
  /**
   * Cloud cover is the dominant factor. Piecewise-linear so the curve is
   * legible and adjustable: [cloudPercent, points out of 10].
   */
  cloudCurve: [
    [0, 10],
    [10, 9.2],
    [25, 8],
    [40, 6.5],
    [60, 4.5],
    [80, 2],
    [100, 0.5],
  ] as [number, number][],

  /** Hard cap from PRD §4: above this much cloud, nothing rescues the night. */
  overcastThreshold: 80,
  overcastCap: 2,

  /**
   * Moon swing, applied as ±(this/2) between new and full. A dark sky helps
   * astro; a full moon is worth noting but is not a disaster for landscapes.
   */
  moonSwing: 1.6,

  /** Added when the OVATION grid shows a real chance overhead. */
  auroraProbabilityBonus: 1,
  /** Added on top when the Kp forecast turns the night into an event. */
  auroraStormBonus: 1.5,
  /** Kp at or above this makes the card aurora-themed. */
  auroraStormKp: 5,
} as const;

export type ScoreTheme = 'good' | 'mixed' | 'poor' | 'aurora';

export type ScoreInputs = {
  /** Mean cloud cover percent over the evening window, or null if unavailable. */
  cloudCoverPercent: number | null;
  /** Percent of the moon lit, 0–100. */
  moonIlluminationPercent: number | null;
  /** OVATION probability at the location, 0–100. Null below 45° latitude. */
  auroraProbability: number | null;
  /** Peak predicted Kp tonight. Null below 45° latitude. */
  kp: number | null;
  latitude: number;
  polar: 'day' | 'night' | null;
};

export type ScoreResult = {
  /** 0–10, one decimal. Null when there is no cloud data to score against. */
  score: number | null;
  theme: ScoreTheme;
  /** True when the aurora chip should be shown at all. */
  showAurora: boolean;
  /** Why the score is null, when it is. */
  unscoredReason: 'no-cloud-data' | 'polar-day' | null;
};

function interpolate(curve: [number, number][], x: number): number {
  if (x <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeScore(inputs: ScoreInputs): ScoreResult {
  const { cloudCoverPercent, moonIlluminationPercent, auroraProbability, kp, latitude, polar } =
    inputs;

  const stormy = kp !== null && kp >= SCORING.auroraStormKp && Math.abs(latitude) >= 45;
  const likely = auroraProbability !== null && auroraProbability >= AURORA_MIN_PROBABILITY;
  const showAurora = stormy || likely;

  // Polar day: the sun never sets, so there is no night to score. Aurora is
  // invisible against a lit sky, so this outranks even a Kp 7 storm.
  if (polar === 'day') {
    return { score: null, theme: 'mixed', showAurora: false, unscoredReason: 'polar-day' };
  }

  if (cloudCoverPercent === null) {
    // "Golden hour only" mode per ARCHITECTURE.md: we still show times and moon,
    // but refuse to invent a score from data we do not have.
    return {
      score: null,
      theme: showAurora ? 'aurora' : 'mixed',
      showAurora,
      unscoredReason: 'no-cloud-data',
    };
  }

  let score = interpolate(SCORING.cloudCurve, clamp(cloudCoverPercent, 0, 100));

  if (moonIlluminationPercent !== null) {
    // +half a swing at new moon, -half at full.
    score += (0.5 - clamp(moonIlluminationPercent, 0, 100) / 100) * SCORING.moonSwing;
  }

  if (likely) score += SCORING.auroraProbabilityBonus;
  if (stormy) score += SCORING.auroraStormBonus;

  // The overcast cap is applied last so no bonus can smuggle a socked-in sky
  // above it.
  if (cloudCoverPercent > SCORING.overcastThreshold) {
    score = Math.min(score, SCORING.overcastCap);
  }

  score = clamp(Math.round(score * 10) / 10, 0, 10);

  let theme: ScoreTheme;
  if (stormy && cloudCoverPercent <= SCORING.overcastThreshold) theme = 'aurora';
  else if (score >= 7) theme = 'good';
  else if (score >= 4) theme = 'mixed';
  else theme = 'poor';

  return { score, theme, showAurora, unscoredReason: null };
}

// --- verdict copy --------------------------------------------------------

export type VerdictCopyInputs = ScoreInputs &
  ScoreResult & {
    goldenHourEvening: { begin: string | null; end: string | null } | null;
  };

/**
 * One short, human line. Never hedges, never lists numbers the chips already
 * show — it answers "should I go outside tonight?" and nothing else.
 */
export function verdictLine(input: VerdictCopyInputs): string {
  const {
    score,
    theme,
    cloudCoverPercent,
    moonIlluminationPercent,
    kp,
    polar,
    unscoredReason,
    goldenHourEvening,
  } = input;

  const golden = formatWindow(goldenHourEvening?.begin, goldenHourEvening?.end);

  if (polar === 'night') {
    return cloudCoverPercent !== null && cloudCoverPercent < 40
      ? 'Polar night, clear overhead - all-day darkness for shooting'
      : 'Polar night - dark all day, but cloud is in the way';
  }
  if (unscoredReason === 'polar-day') {
    return 'Midnight sun - the sun never sets here tonight';
  }
  if (unscoredReason === 'no-cloud-data') {
    return golden
      ? `Golden hour ${golden} - cloud data unavailable right now`
      : 'Cloud data unavailable right now';
  }

  if (theme === 'aurora') {
    return `AURORA WATCH - Kp ${formatKp(kp)} forecast, get away from city lights`;
  }

  const clouds = cloudCoverPercent ?? 0;

  if (clouds > SCORING.overcastThreshold) {
    return `Skip it - ${Math.round(clouds)}% cloud all evening`;
  }

  if ((score ?? 0) >= 7) {
    if (golden) return `Worth it - clear skies, golden hour ${golden}`;
    return 'Worth it - clear skies tonight';
  }

  if ((score ?? 0) >= 4) {
    if (moonIlluminationPercent !== null && moonIlluminationPercent > 85 && clouds < 40) {
      return golden
        ? `Bright night - clear but a near-full moon, golden hour ${golden}`
        : 'Bright night - clear skies, but a near-full moon washes out the stars';
    }
    return golden
      ? `Maybe - ${Math.round(clouds)}% cloud, golden hour ${golden}`
      : `Maybe - ${Math.round(clouds)}% cloud tonight`;
  }

  return `Not tonight - ${Math.round(clouds)}% cloud through the evening`;
}

/** Kp reads as an integer when it is one, otherwise one decimal. */
function formatKp(kp: number | null): string {
  if (kp === null) return '?';
  return Number.isInteger(kp) ? String(kp) : kp.toFixed(1);
}

/** Short label under the dial, e.g. "Worth it". */
export function verdictHeadline(result: ScoreResult): string {
  if (result.unscoredReason === 'polar-day') return 'Midnight sun';
  if (result.unscoredReason === 'no-cloud-data') return 'Partial data';
  switch (result.theme) {
    case 'aurora':
      return 'Aurora watch';
    case 'good':
      return 'Worth it';
    case 'mixed':
      return 'Maybe';
    case 'poor':
      return 'Skip it';
  }
}
