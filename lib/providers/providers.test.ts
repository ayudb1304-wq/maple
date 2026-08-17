import { describe, expect, it } from 'vitest';

import { rankGeocodeResults, summarizeCloudCover } from './openmeteo';
import { lookupAuroraProbability, maxPredictedKp } from './swpc';
import { moonPhaseLabel } from './sunrisesunset';
import type { GeocodeResult, KpRow } from '../schemas';

/**
 * Pure parsing/reduction functions only. The fetchers themselves are covered by
 * the endpoint probe (docs/probe-output.md) and the route-level checks.
 */

function place(overrides: Partial<GeocodeResult>): GeocodeResult {
  return {
    id: 1,
    name: 'Somewhere',
    latitude: 0,
    longitude: 0,
    timezone: 'UTC',
    ...overrides,
  };
}

describe('rankGeocodeResults', () => {
  it('surfaces a major city that Open-Meteo buries behind prefix matches', () => {
    // The real "beng" ordering: Bengaluru comes back at rank 18 of 20.
    const results = [
      place({ name: 'Benghazi', feature_code: 'PPLA', population: 757_490 }),
      place({ name: 'Beng', feature_code: 'PPL', population: 0 }),
      place({ name: 'Phumĭ Bœ̆ng Tôtœ̆ng', feature_code: 'PPL', population: 0 }),
      place({ name: 'Bengbu', feature_code: 'PPL', population: 972_784 }),
      place({ name: 'Benguela', feature_code: 'PPLA', population: 555_124 }),
      place({ name: 'Bengaluru', feature_code: 'PPLA', population: 8_495_492 }),
    ];
    expect(rankGeocodeResults(results, 'beng')[0].name).toBe('Bengaluru');
  });

  it('prefers a populated place over a same-named island', () => {
    // The real "Tromso" problem: an island outranks the city upstream.
    const results = [
      place({ name: 'Romssasuolu', feature_code: 'ISL', population: 39_882 }),
      place({ name: 'Tromso', feature_code: 'PPLA', population: 36_000 }),
    ];
    expect(rankGeocodeResults(results, 'tromso')[0].name).toBe('Tromso');
  });

  it('lets an exact name match beat a larger city', () => {
    const results = [
      place({ name: 'Yorkshire', feature_code: 'PPLA', population: 900_000 }),
      place({ name: 'York', feature_code: 'PPL', population: 153_000 }),
    ];
    expect(rankGeocodeResults(results, 'York')[0].name).toBe('York');
  });

  it('does not let an unpopulated hamlet win on an exact match alone', () => {
    // Cambodia really has a village called "Beng" with population 0. It must
    // not outrank Bengaluru just because the query matches it exactly.
    const results = [
      place({ name: 'Beng', feature_code: 'PPL', population: 0 }),
      place({ name: 'Bengaluru', feature_code: 'PPLA', population: 8_495_492 }),
    ];
    expect(rankGeocodeResults(results, 'beng')[0].name).toBe('Bengaluru');
  });

  it('does not mutate its input', () => {
    const results = [
      place({ name: 'A', population: 1 }),
      place({ name: 'B', population: 2 }),
    ];
    rankGeocodeResults(results, 'a');
    expect(results[0].name).toBe('A');
  });
});

describe('summarizeCloudCover', () => {
  const hoursOfDay = (values: number[]) => ({
    time: values.map((_, i) => `2026-08-17T${String(i).padStart(2, '0')}:00`),
    cloud_cover: values,
  });

  it('averages only the hours inside sunset plus or minus two', () => {
    // Cloudy all day, clear 17:00-21:00, which is the window around an 19:00 sunset.
    const values = Array.from({ length: 24 }, (_, h) => (h >= 17 && h <= 21 ? 0 : 100));
    const summary = summarizeCloudCover(hoursOfDay(values), '2026-08-17', '19:00:00')!;
    expect(summary.eveningMeanPercent).toBe(0);
    expect(summary.samples).toBe(5);
  });

  it('reports the best hour separately from the mean', () => {
    const values = Array.from({ length: 24 }, (_, h) => (h === 19 ? 10 : 90));
    const summary = summarizeCloudCover(hoursOfDay(values), '2026-08-17', '19:00:00')!;
    expect(summary.eveningMinPercent).toBe(10);
    expect(summary.eveningMeanPercent).toBeGreaterThan(10);
  });

  it('reaches into the next day for a late sunset', () => {
    const day1 = Array.from({ length: 24 }, (_, i) => ({
      time: `2026-08-17T${String(i).padStart(2, '0')}:00`,
      value: 100,
    }));
    const day2 = Array.from({ length: 24 }, (_, i) => ({
      time: `2026-08-18T${String(i).padStart(2, '0')}:00`,
      value: 0,
    }));
    const all = [...day1, ...day2];
    const summary = summarizeCloudCover(
      { time: all.map((h) => h.time), cloud_cover: all.map((h) => h.value) },
      '2026-08-17',
      '23:30:00',
    )!;
    // 21:30-01:30 covers 22:00, 23:00 (cloudy) and 00:00, 01:00 (clear).
    expect(summary.samples).toBe(4);
    expect(summary.eveningMeanPercent).toBe(50);
  });

  it('skips gaps in the series rather than treating them as clear', () => {
    const time = ['2026-08-17T18:00', '2026-08-17T19:00', '2026-08-17T20:00'];
    const summary = summarizeCloudCover(
      { time, cloud_cover: [80, null, 80] },
      '2026-08-17',
      '19:00:00',
    )!;
    expect(summary.eveningMeanPercent).toBe(80);
    expect(summary.samples).toBe(2);
  });

  it('is null when no sunset means no window', () => {
    expect(summarizeCloudCover(hoursOfDay([50]), '2026-08-17', null)).toBeNull();
  });

  it('is null when the window contains no samples at all', () => {
    const time = ['2026-08-17T03:00'];
    expect(summarizeCloudCover({ time, cloud_cover: [50] }, '2026-08-17', '19:00:00')).toBeNull();
  });
});

describe('lookupAuroraProbability', () => {
  const grid: [number, number, number][] = [
    [19, 70, 2],
    [20, 70, 15],
    [19, 69, 3],
    [180, 40, 99],
  ];

  it('takes the max of the 3x3 neighbourhood to avoid boundary flicker', () => {
    expect(lookupAuroraProbability(grid, 69.65, 18.96)).toBe(15);
  });

  it('wraps western longitudes into the 0-359 grid', () => {
    // -170 maps to 190; nothing is nearby, so there is no reading.
    expect(lookupAuroraProbability([[190, 65, 42]], 65, -170)).toBe(42);
  });

  it('wraps across the 359/0 seam', () => {
    expect(lookupAuroraProbability([[359, 65, 30]], 65, 0.2)).toBe(30);
  });

  it('is null where the grid has nothing nearby', () => {
    expect(lookupAuroraProbability(grid, 12.97, 77.59)).toBeNull();
  });

  it('ignores malformed cells instead of throwing', () => {
    const dirty = [null, 'nope', [19, 70], [19, 70, 5]];
    expect(lookupAuroraProbability(dirty, 69.65, 18.96)).toBe(5);
  });
});

describe('maxPredictedKp', () => {
  const rows: KpRow[] = [
    { time_tag: '2026-08-17T18:00:00', kp: 8, observed: 'observed' },
    { time_tag: '2026-08-17T21:00:00', kp: 5.67, observed: 'predicted' },
    { time_tag: '2026-08-18T00:00:00', kp: 6.33, observed: 'predicted' },
    { time_tag: '2026-08-19T00:00:00', kp: 9, observed: 'predicted' },
  ];

  const start = new Date('2026-08-17T19:00:00Z');
  const end = new Date('2026-08-18T03:00:00Z');

  it('takes the highest predicted value inside the window', () => {
    expect(maxPredictedKp(rows, start, end)).toBe(6.33);
  });

  it('ignores observed and estimated rows', () => {
    const observedOnly: KpRow[] = [
      { time_tag: '2026-08-17T21:00:00', kp: 9, observed: 'observed' },
      { time_tag: '2026-08-17T21:00:00', kp: 8, observed: 'estimated' },
    ];
    expect(maxPredictedKp(observedOnly, start, end)).toBeNull();
  });

  it('treats a time_tag without a Z suffix as UTC', () => {
    // If the missing Z were parsed as local time, this row would fall outside
    // the window in most of the world's timezones.
    const single: KpRow[] = [{ time_tag: '2026-08-17T21:00:00', kp: 7, observed: 'predicted' }];
    expect(maxPredictedKp(single, start, end)).toBe(7);
  });

  it('is null when nothing falls in the window', () => {
    expect(maxPredictedKp(rows, new Date('2026-08-20T00:00:00Z'), new Date('2026-08-20T08:00:00Z'))).toBeNull();
  });
});

describe('moonPhaseLabel', () => {
  it('matches the vocabulary the API uses', () => {
    expect(moonPhaseLabel(0)).toBe('New Moon');
    expect(moonPhaseLabel(0.16)).toBe('Waxing Crescent');
    expect(moonPhaseLabel(0.25)).toBe('First Quarter');
    expect(moonPhaseLabel(0.5)).toBe('Full Moon');
    expect(moonPhaseLabel(0.75)).toBe('Last Quarter');
    expect(moonPhaseLabel(0.99)).toBe('New Moon');
  });
});
