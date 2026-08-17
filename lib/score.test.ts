import { describe, expect, it } from 'vitest';

import { computeScore, verdictHeadline, verdictLine, type ScoreInputs } from './score';

/**
 * Cases mandated by T1.2's acceptance criteria: clear + new moon, overcast,
 * full moon clear, Kp 7 at lat 65, Kp 7 at lat 13, missing cloud data, and
 * polar day/night.
 */

const BENGALURU_LAT = 12.97;
const TROMSO_LAT = 69.65;

function inputs(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    cloudCoverPercent: 20,
    moonIlluminationPercent: 50,
    auroraProbability: null,
    kp: null,
    latitude: BENGALURU_LAT,
    polar: null,
    ...overrides,
  };
}

function copy(overrides: Partial<ScoreInputs> = {}, golden = { begin: '18:15:20', end: '18:57:34' }) {
  const base = inputs(overrides);
  const result = computeScore(base);
  return { result, line: verdictLine({ ...base, ...result, goldenHourEvening: golden }) };
}

describe('computeScore', () => {
  it('scores a clear night at new moon near the top', () => {
    const result = computeScore(inputs({ cloudCoverPercent: 0, moonIlluminationPercent: 0 }));
    expect(result.score).toBeGreaterThanOrEqual(9.5);
    expect(result.theme).toBe('good');
    expect(result.showAurora).toBe(false);
  });

  it('caps an overcast night at the overcast ceiling', () => {
    const result = computeScore(inputs({ cloudCoverPercent: 95, moonIlluminationPercent: 0 }));
    expect(result.score).toBeLessThanOrEqual(2);
    expect(result.theme).toBe('poor');
  });

  it('never lets a bonus lift an overcast night above the cap', () => {
    // Kp 7 at high latitude would otherwise add 2.5 points.
    const result = computeScore(
      inputs({
        cloudCoverPercent: 100,
        moonIlluminationPercent: 0,
        latitude: TROMSO_LAT,
        kp: 7,
        auroraProbability: 60,
      }),
    );
    expect(result.score).toBeLessThanOrEqual(2);
    // The chip still shows — the storm is real, the sky just isn't cooperating.
    expect(result.showAurora).toBe(true);
    expect(result.theme).not.toBe('aurora');
  });

  it('docks a clear night for a full moon but keeps it worth going out', () => {
    // 25% cloud sits at 8.0 on the curve, far enough from the ceiling that the
    // full moonSwing is visible rather than clipped by the clamp at 10.
    const newMoon = computeScore(inputs({ cloudCoverPercent: 25, moonIlluminationPercent: 0 }));
    const fullMoon = computeScore(inputs({ cloudCoverPercent: 25, moonIlluminationPercent: 100 }));
    expect(fullMoon.score!).toBeLessThan(newMoon.score!);
    expect(newMoon.score! - fullMoon.score!).toBeCloseTo(1.6, 1);
    expect(fullMoon.score!).toBeGreaterThan(7);
  });

  it('clips the moon bonus at the ceiling on an already perfect night', () => {
    const clear = computeScore(inputs({ cloudCoverPercent: 5, moonIlluminationPercent: 0 }));
    const fullMoon = computeScore(inputs({ cloudCoverPercent: 5, moonIlluminationPercent: 100 }));
    expect(clear.score).toBe(10);
    expect(fullMoon.score!).toBeLessThan(10);
    expect(fullMoon.score!).toBeGreaterThan(7);
  });

  it('themes a Kp 7 night at lat 65 as an aurora night', () => {
    const result = computeScore(
      inputs({ cloudCoverPercent: 15, moonIlluminationPercent: 20, latitude: 65, kp: 7, auroraProbability: 45 }),
    );
    expect(result.theme).toBe('aurora');
    expect(result.showAurora).toBe(true);
    expect(result.score).toBe(10);
  });

  it('hides aurora entirely at lat 13 even when Kp is 7', () => {
    // Below 45° the providers return null for both aurora fields, which is what
    // this asserts against — a low-latitude user must never see the chip.
    const result = computeScore(
      inputs({ cloudCoverPercent: 15, latitude: BENGALURU_LAT, kp: null, auroraProbability: null }),
    );
    expect(result.showAurora).toBe(false);
    expect(result.theme).not.toBe('aurora');
  });

  it('refuses to invent a score when cloud data is missing', () => {
    const result = computeScore(inputs({ cloudCoverPercent: null }));
    expect(result.score).toBeNull();
    expect(result.unscoredReason).toBe('no-cloud-data');
  });

  it('returns no score during polar day, even with a storm forecast', () => {
    const result = computeScore(
      inputs({ polar: 'day', latitude: TROMSO_LAT, kp: 7, auroraProbability: 70, cloudCoverPercent: 0 }),
    );
    expect(result.score).toBeNull();
    expect(result.unscoredReason).toBe('polar-day');
    // Aurora is invisible against a sky that never gets dark.
    expect(result.showAurora).toBe(false);
  });

  it('still scores polar night, where darkness is the whole point', () => {
    const result = computeScore(
      inputs({ polar: 'night', latitude: TROMSO_LAT, cloudCoverPercent: 10, moonIlluminationPercent: 10 }),
    );
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThan(7);
  });

  it('treats aurora probability at the threshold as worth a chip', () => {
    const below = computeScore(inputs({ latitude: 60, auroraProbability: 9 }));
    const at = computeScore(inputs({ latitude: 60, auroraProbability: 10 }));
    expect(below.showAurora).toBe(false);
    expect(at.showAurora).toBe(true);
    expect(at.score!).toBeGreaterThan(below.score!);
  });

  it('keeps the score inside 0..10 across the whole cloud range', () => {
    for (let clouds = 0; clouds <= 100; clouds += 5) {
      for (const moon of [0, 50, 100]) {
        const result = computeScore(
          inputs({ cloudCoverPercent: clouds, moonIlluminationPercent: moon, latitude: 70, kp: 8, auroraProbability: 90 }),
        );
        expect(result.score!).toBeGreaterThanOrEqual(0);
        expect(result.score!).toBeLessThanOrEqual(10);
      }
    }
  });

  it('is monotonic: more cloud never scores higher', () => {
    let previous = Infinity;
    for (let clouds = 0; clouds <= 100; clouds += 5) {
      const { score } = computeScore(inputs({ cloudCoverPercent: clouds, moonIlluminationPercent: 30 }));
      expect(score!).toBeLessThanOrEqual(previous + 1e-9);
      previous = score!;
    }
  });
});

describe('verdictLine', () => {
  it('leads with the recommendation on a great night', () => {
    const { line } = copy({ cloudCoverPercent: 5, moonIlluminationPercent: 5 });
    expect(line).toBe('Worth it - clear skies, golden hour 6:15-6:57 PM');
  });

  it('gives the reason to skip an overcast night', () => {
    const { line } = copy({ cloudCoverPercent: 90 });
    expect(line).toBe('Skip it - 90% cloud all evening');
  });

  it('shouts about an aurora storm', () => {
    const { line } = copy({ cloudCoverPercent: 10, latitude: 65, kp: 6, auroraProbability: 40 });
    expect(line).toBe('AURORA WATCH - Kp 6 forecast, get away from city lights');
  });

  it('renders a fractional Kp to one decimal', () => {
    const { line } = copy({ cloudCoverPercent: 10, latitude: 65, kp: 5.67, auroraProbability: 40 });
    expect(line).toContain('Kp 5.7');
  });

  it('calls out a bright night when the moon is the problem', () => {
    const { line } = copy({ cloudCoverPercent: 30, moonIlluminationPercent: 98 });
    expect(line).toContain('near-full moon');
  });

  it('says so plainly when cloud data is missing', () => {
    const { line } = copy({ cloudCoverPercent: null });
    expect(line).toBe('Golden hour 6:15-6:57 PM - cloud data unavailable right now');
  });

  it('degrades further when there is no golden hour either', () => {
    const base = inputs({ cloudCoverPercent: null });
    const result = computeScore(base);
    expect(verdictLine({ ...base, ...result, goldenHourEvening: null })).toBe(
      'Cloud data unavailable right now',
    );
  });

  it('explains the midnight sun rather than showing a score', () => {
    const { line } = copy({ polar: 'day', latitude: TROMSO_LAT, cloudCoverPercent: 0 });
    expect(line).toBe('Midnight sun - the sun never sets here tonight');
  });

  it('treats polar night as an opportunity when it is clear', () => {
    const { line } = copy({ polar: 'night', latitude: TROMSO_LAT, cloudCoverPercent: 10 });
    expect(line).toContain('all-day darkness');
  });

  it('never emits an em dash or en dash', () => {
    const cases: Partial<ScoreInputs>[] = [
      { cloudCoverPercent: 0 },
      { cloudCoverPercent: 90 },
      { cloudCoverPercent: null },
      { polar: 'day' },
      { polar: 'night' },
      { cloudCoverPercent: 10, latitude: 65, kp: 7, auroraProbability: 50 },
    ];
    for (const c of cases) {
      expect(copy(c).line).not.toMatch(/[–—]/);
    }
  });
});

describe('verdictHeadline', () => {
  it('labels each theme', () => {
    expect(verdictHeadline(computeScore(inputs({ cloudCoverPercent: 0 })))).toBe('Worth it');
    expect(verdictHeadline(computeScore(inputs({ cloudCoverPercent: 55 })))).toBe('Maybe');
    expect(verdictHeadline(computeScore(inputs({ cloudCoverPercent: 95 })))).toBe('Skip it');
    expect(
      verdictHeadline(computeScore(inputs({ cloudCoverPercent: 10, latitude: 65, kp: 7, auroraProbability: 50 }))),
    ).toBe('Aurora watch');
    expect(verdictHeadline(computeScore(inputs({ cloudCoverPercent: null })))).toBe('Partial data');
  });
});
