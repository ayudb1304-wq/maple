import { describe, expect, it } from 'vitest';

import { advanceStreak, streakLength, EMPTY_STATE, type StoredState } from './streak';

/**
 * T2.3's acceptance criterion: revisiting the next day increments the streak,
 * revisiting the same day does not.
 */

const state = (dates: string[]): StoredState => ({ savedLocation: null, lastCheckedDates: dates });

describe('advanceStreak', () => {
  it('records the first check-in', () => {
    expect(advanceStreak(EMPTY_STATE, '2026-08-17').lastCheckedDates).toEqual(['2026-08-17']);
  });

  it('does not advance on a same-day revisit', () => {
    const first = advanceStreak(EMPTY_STATE, '2026-08-17');
    const second = advanceStreak(first, '2026-08-17');
    expect(second.lastCheckedDates).toEqual(['2026-08-17']);
    // Returned unchanged, so no needless write to storage.
    expect(second).toBe(first);
  });

  it('advances the next day', () => {
    const day1 = advanceStreak(EMPTY_STATE, '2026-08-17');
    const day2 = advanceStreak(day1, '2026-08-18');
    expect(day2.lastCheckedDates).toEqual(['2026-08-18', '2026-08-17']);
  });

  it('preserves the saved location', () => {
    const withPlace: StoredState = {
      savedLocation: { name: 'Bengaluru', latitude: 12.97, longitude: 77.59, timezone: 'Asia/Kolkata' },
      lastCheckedDates: [],
    };
    expect(advanceStreak(withPlace, '2026-08-17').savedLocation?.name).toBe('Bengaluru');
  });

  it('caps the stored history', () => {
    let s = EMPTY_STATE;
    for (let d = 1; d <= 70; d++) {
      s = advanceStreak(s, `2026-06-${String(d).padStart(2, '0')}`);
    }
    expect(s.lastCheckedDates.length).toBeLessThanOrEqual(60);
  });
});

describe('streakLength', () => {
  it('is zero with no history', () => {
    expect(streakLength([], '2026-08-17')).toBe(0);
  });

  it('counts an unbroken run ending today', () => {
    expect(streakLength(['2026-08-17', '2026-08-16', '2026-08-15'], '2026-08-17')).toBe(3);
  });

  it('still counts a run ending yesterday, before today’s visit registers', () => {
    // The badge must not flash 0 between page load and the check-in write.
    expect(streakLength(['2026-08-16', '2026-08-15'], '2026-08-17')).toBe(2);
  });

  it('resets when a day was missed', () => {
    expect(streakLength(['2026-08-15', '2026-08-14'], '2026-08-17')).toBe(0);
  });

  it('stops at the first gap rather than counting every stored date', () => {
    expect(streakLength(['2026-08-17', '2026-08-16', '2026-08-13', '2026-08-12'], '2026-08-17')).toBe(2);
  });

  it('counts across a month boundary', () => {
    expect(streakLength(['2026-09-01', '2026-08-31', '2026-08-30'], '2026-09-01')).toBe(3);
  });

  it('counts across a year boundary', () => {
    expect(streakLength(['2027-01-01', '2026-12-31'], '2027-01-01')).toBe(2);
  });

  it('ignores duplicates rather than double counting', () => {
    // Defensive: a duplicate should not inflate the run.
    expect(streakLength(['2026-08-17', '2026-08-17', '2026-08-16'], '2026-08-17')).toBe(1);
  });

  it('matches what advanceStreak produces over consecutive days', () => {
    let s = state([]);
    for (const d of ['2026-08-15', '2026-08-16', '2026-08-17']) {
      s = advanceStreak(s, d);
    }
    expect(streakLength(s.lastCheckedDates, '2026-08-17')).toBe(3);
  });
});
