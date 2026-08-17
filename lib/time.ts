/**
 * Timezone-correct "tonight" logic.
 *
 * Timezone correctness is a product feature, not an implementation detail: all
 * of this works in the *location's* IANA timezone (from Open-Meteo geocoding),
 * never the server's. Nothing here reads `new Date()` without being handed the
 * instant, so it is fully unit-testable.
 *
 * Two representations are used deliberately:
 *  - **naive local ms** — a wall-clock date+time with no zone, encoded through
 *    `Date.UTC` purely so it can be compared and added to. Open-Meteo returns
 *    hourly timestamps and SunriseSunset.io returns times in exactly this form,
 *    so comparing them naively is correct and avoids a whole class of DST bugs.
 *  - **real UTC instants** — needed only when crossing to a source that speaks
 *    UTC (the SWPC Kp forecast).
 */

export const HOUR_MS = 3_600_000;

/** Evening window is sunset ± 2h, per PRD §4. */
export const EVENING_WINDOW_HOURS = 2;

/**
 * Before this local hour, "tonight" still means the night already in progress,
 * so a 1 AM visitor sees the evening they are standing in rather than one that
 * is 23 hours away.
 */
export const NIGHT_ROLLOVER_HOUR = 4;

/** Minutes east of UTC for `tz` at instant `at`. Handles DST because it asks Intl per-instant. */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };

  // Intl can render midnight as hour 24 in some locales/zones.
  const hour = get('hour') % 24;
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  const whole = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((asIfUtc - whole) / 60_000);
}

/** The local calendar date at `tz`, as "YYYY-MM-DD". */
export function localDateString(tz: string, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Local hour (0–23) at `tz`. */
export function localHour(tz: string, at: Date): number {
  const value = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
  }).format(at);
  return Number(value) % 24;
}

/** Add days to a "YYYY-MM-DD" string without touching timezones. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Which local date "tonight" refers to at `tz`.
 *
 * Normally today. Between midnight and NIGHT_ROLLOVER_HOUR it is yesterday,
 * because that evening's sky is the one currently overhead.
 */
export function tonightDate(tz: string, now: Date): string {
  const today = localDateString(tz, now);
  return localHour(tz, now) < NIGHT_ROLLOVER_HOUR ? addDays(today, -1) : today;
}

/**
 * Encode a wall-clock date + "HH:MM(:SS)" as comparable naive-local ms.
 * Returns null for the nulls that high-latitude responses are full of.
 */
export function naiveMs(dateStr: string, timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null;
  return Date.UTC(y, m - 1, d, hh, mm, Number.isFinite(ss) ? ss : 0);
}

/** Parse a naive local ISO string like "2026-08-17T18:00" to naive-local ms. */
export function parseNaiveIso(iso: string): number | null {
  const [datePart, timePart] = iso.split('T');
  if (!datePart || !timePart) return null;
  return naiveMs(datePart, timePart.length === 5 ? `${timePart}:00` : timePart);
}

export type EveningWindow = { start: number; end: number };

/** Sunset ± EVENING_WINDOW_HOURS, in naive-local ms. Null when there is no sunset. */
export function eveningWindow(dateStr: string, sunset: string | null): EveningWindow | null {
  const center = naiveMs(dateStr, sunset);
  if (center === null) return null;
  return {
    start: center - EVENING_WINDOW_HOURS * HOUR_MS,
    end: center + EVENING_WINDOW_HOURS * HOUR_MS,
  };
}

/**
 * Convert a wall-clock time in `tz` to a real UTC instant.
 * Two-pass so it lands correctly on DST transition days.
 */
export function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date | null {
  const naive = naiveMs(dateStr, timeStr);
  if (naive === null) return null;
  const firstGuess = new Date(naive - tzOffsetMinutes(tz, new Date(naive)) * 60_000);
  const refinedOffset = tzOffsetMinutes(tz, firstGuess);
  return new Date(naive - refinedOffset * 60_000);
}

/** Format "18:44:08" as "6:44 PM". Returns null for null input. */
export function formatTime12h(timeStr: string | null | undefined): string | null {
  if (!timeStr) return null;
  const [hhRaw, mm] = timeStr.split(':');
  const hh = Number(hhRaw);
  if (!Number.isFinite(hh)) return null;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${mm} ${suffix}`;
}

/** Format a window as "6:15–6:57 PM", collapsing a shared meridiem. */
export function formatWindow(
  begin: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const a = formatTime12h(begin);
  const b = formatTime12h(end);
  if (!a || !b) return null;
  const [aTime, aSuffix] = a.split(' ');
  const [bTime, bSuffix] = b.split(' ');
  return aSuffix === bSuffix ? `${aTime}-${bTime} ${bSuffix}` : `${aTime} ${aSuffix}-${bTime} ${bSuffix}`;
}
