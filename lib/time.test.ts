import { describe, expect, it } from 'vitest';

import {
  addDays,
  eveningWindow,
  formatTime12h,
  formatWindow,
  localDateString,
  localHour,
  naiveMs,
  parseNaiveIso,
  tonightDate,
  tzOffsetMinutes,
  zonedToUtc,
} from './time';

/**
 * "Tonight" must be resolved in the *location's* timezone, never the server's.
 * These cover the timezone and DST cases from ARCHITECTURE.md's testing notes.
 */

describe('tzOffsetMinutes', () => {
  it('handles a half-hour offset', () => {
    expect(tzOffsetMinutes('Asia/Kolkata', new Date('2026-08-17T12:00:00Z'))).toBe(330);
  });

  it('handles a negative offset', () => {
    expect(tzOffsetMinutes('America/Los_Angeles', new Date('2026-01-15T12:00:00Z'))).toBe(-480);
  });

  it('tracks DST rather than assuming a fixed offset', () => {
    const winter = tzOffsetMinutes('Europe/Oslo', new Date('2026-01-15T12:00:00Z'));
    const summer = tzOffsetMinutes('Europe/Oslo', new Date('2026-08-15T12:00:00Z'));
    expect(winter).toBe(60);
    expect(summer).toBe(120);
  });

  it('handles a 45-minute offset', () => {
    expect(tzOffsetMinutes('Asia/Kathmandu', new Date('2026-08-17T12:00:00Z'))).toBe(345);
  });
});

describe('localDateString / localHour', () => {
  it('rolls the date forward for a zone ahead of UTC', () => {
    // 20:00 UTC is already the next day in Kolkata (+5:30).
    const at = new Date('2026-08-17T20:00:00Z');
    expect(localDateString('Asia/Kolkata', at)).toBe('2026-08-18');
    expect(localDateString('UTC', at)).toBe('2026-08-17');
  });

  it('rolls the date back for a zone behind UTC', () => {
    const at = new Date('2026-08-17T04:00:00Z');
    expect(localDateString('America/Los_Angeles', at)).toBe('2026-08-16');
  });

  it('reads midnight as hour 0, not 24', () => {
    expect(localHour('Asia/Kolkata', new Date('2026-08-17T18:30:00Z'))).toBe(0);
  });
});

describe('tonightDate', () => {
  it('is today during the day', () => {
    // 12:00 local in Kolkata.
    expect(tonightDate('Asia/Kolkata', new Date('2026-08-17T06:30:00Z'))).toBe('2026-08-17');
  });

  it('is still yesterday just after midnight, when that night is overhead', () => {
    // 01:00 local on the 18th in Kolkata.
    expect(tonightDate('Asia/Kolkata', new Date('2026-08-17T19:30:00Z'))).toBe('2026-08-17');
  });

  it('flips to today once past the rollover hour', () => {
    // 04:30 local on the 18th.
    expect(tonightDate('Asia/Kolkata', new Date('2026-08-17T23:00:00Z'))).toBe('2026-08-18');
  });

  it('crosses a month boundary correctly', () => {
    // 02:00 local on 1 September in Kolkata.
    expect(tonightDate('Asia/Kolkata', new Date('2026-08-31T20:30:00Z'))).toBe('2026-08-31');
  });

  it('uses the location zone, not the server zone', () => {
    // One instant, two answers: 14:30 on the 17th in Kolkata, but 02:00 on the
    // 17th in Los Angeles, which is still inside the previous night.
    const at = new Date('2026-08-17T09:00:00Z');
    expect(tonightDate('Asia/Kolkata', at)).toBe('2026-08-17');
    expect(tonightDate('America/Los_Angeles', at)).toBe('2026-08-16');
  });
});

describe('addDays', () => {
  it('steps across month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('naiveMs / parseNaiveIso', () => {
  it('compares wall-clock times without any zone involved', () => {
    const six = naiveMs('2026-08-17', '18:00:00')!;
    const seven = naiveMs('2026-08-17', '19:00:00')!;
    expect(seven - six).toBe(3_600_000);
  });

  it('parses the naked ISO form Open-Meteo returns', () => {
    expect(parseNaiveIso('2026-08-17T18:00')).toBe(naiveMs('2026-08-17', '18:00:00'));
  });

  it('returns null for the nulls high-latitude responses contain', () => {
    expect(naiveMs('2026-08-17', null)).toBeNull();
    expect(parseNaiveIso('nonsense')).toBeNull();
  });
});

describe('eveningWindow', () => {
  it('spans sunset plus or minus two hours', () => {
    const window = eveningWindow('2026-08-17', '18:44:08')!;
    expect(window.end - window.start).toBe(4 * 3_600_000);
    expect(window.start).toBe(naiveMs('2026-08-17', '16:44:08'));
  });

  it('extends past midnight for a late high-latitude sunset', () => {
    const window = eveningWindow('2026-08-17', '23:30:00')!;
    // The far edge lands on the following day, which is why the forecast is
    // fetched with forecast_days=2.
    expect(window.end).toBe(naiveMs('2026-08-18', '01:30:00'));
  });

  it('is null when there is no sunset at all', () => {
    expect(eveningWindow('2026-08-17', null)).toBeNull();
  });
});

describe('zonedToUtc', () => {
  it('converts a wall-clock time to the right instant', () => {
    expect(zonedToUtc('2026-08-17', '18:44:08', 'Asia/Kolkata')!.toISOString()).toBe(
      '2026-08-17T13:14:08.000Z',
    );
  });

  it('applies summer time in a DST zone', () => {
    expect(zonedToUtc('2026-08-17', '21:38:20', 'Europe/Oslo')!.toISOString()).toBe(
      '2026-08-17T19:38:20.000Z',
    );
  });

  it('applies winter time in the same zone', () => {
    expect(zonedToUtc('2026-01-17', '15:30:00', 'Europe/Oslo')!.toISOString()).toBe(
      '2026-01-17T14:30:00.000Z',
    );
  });

  it('lands correctly on the evening of a DST transition day', () => {
    // Europe/Oslo springs forward at 02:00 on 29 March 2026. An evening time on
    // that date is already on the summer offset.
    expect(zonedToUtc('2026-03-29', '20:00:00', 'Europe/Oslo')!.toISOString()).toBe(
      '2026-03-29T18:00:00.000Z',
    );
  });

  it('lands correctly on the evening of an autumn transition day', () => {
    // Falls back at 03:00 on 25 October 2026, so the evening is on winter time.
    expect(zonedToUtc('2026-10-25', '20:00:00', 'Europe/Oslo')!.toISOString()).toBe(
      '2026-10-25T19:00:00.000Z',
    );
  });
});

describe('formatting', () => {
  it('renders 24h times as 12h', () => {
    expect(formatTime12h('18:44:08')).toBe('6:44 PM');
    expect(formatTime12h('00:05:00')).toBe('12:05 AM');
    expect(formatTime12h('12:00:00')).toBe('12:00 PM');
    expect(formatTime12h(null)).toBeNull();
  });

  it('collapses a shared meridiem in a window', () => {
    expect(formatWindow('18:15:20', '18:57:34')).toBe('6:15-6:57 PM');
  });

  it('keeps both meridiems when the window crosses noon or midnight', () => {
    expect(formatWindow('11:30:00', '12:30:00')).toBe('11:30 AM-12:30 PM');
  });

  it('is null if either end is missing', () => {
    expect(formatWindow('18:15:20', null)).toBeNull();
  });
});
