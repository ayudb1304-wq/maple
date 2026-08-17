import type { Place } from './types';

/**
 * localStorage-backed saved location and check-in streak (ARCHITECTURE.md
 * "State (v1, no DB)").
 *
 * This is the seed of the Phase 2 investment mechanic, so the reducer is kept
 * pure and separately testable: `advanceStreak` never touches storage or the
 * clock, and the thin read/write wrappers around it never throw.
 */

const STORAGE_KEY = 'skytonight:v1';

export type StoredState = {
  savedLocation: Place | null;
  /** Local calendar dates the user checked in on, oldest last, capped. */
  lastCheckedDates: string[];
};

export const EMPTY_STATE: StoredState = { savedLocation: null, lastCheckedDates: [] };

/** Keep the history bounded; nothing in v1 reads further back than the streak. */
const MAX_HISTORY = 60;

function previousDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Record a check-in for `today` (the user's *local* calendar date).
 *
 * Idempotent within a day: checking twice on the same date does not advance the
 * streak, which is the whole point of a daily habit counter.
 */
export function advanceStreak(state: StoredState, today: string): StoredState {
  if (state.lastCheckedDates[0] === today) return state;
  return {
    ...state,
    lastCheckedDates: [today, ...state.lastCheckedDates].slice(0, MAX_HISTORY),
  };
}

/**
 * Length of the unbroken run ending today (or yesterday, so the streak does not
 * appear to collapse before the user has opened the app that day).
 */
export function streakLength(dates: string[], today: string): number {
  if (dates.length === 0) return 0;

  let expected: string;
  if (dates[0] === today) expected = today;
  else if (dates[0] === previousDay(today)) expected = previousDay(today);
  else return 0; // the run is already broken

  let count = 0;
  for (const date of dates) {
    if (date !== expected) break;
    count++;
    expected = previousDay(expected);
  }
  return count;
}

// --- storage wrappers (never throw: private mode and quota are normal) ---

export function readState(): StoredState {
  if (typeof window === 'undefined') return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      savedLocation: parsed.savedLocation ?? null,
      lastCheckedDates: Array.isArray(parsed.lastCheckedDates)
        ? parsed.lastCheckedDates.filter((d): d is string => typeof d === 'string')
        : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function writeState(state: StoredState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing or a full quota. A missing streak is not worth an error.
  }
}
