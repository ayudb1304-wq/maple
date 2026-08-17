import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAP_ZOOM,
  cardUrl,
  parseLatitude,
  parseLongitude,
  parseZoom,
  roundCoord,
  staticMapUrl,
} from './geo';

/**
 * These exist because the same trap bit twice: `Number(null)` is **0**, not
 * NaN, so a naive `Number(searchParams.get(...))` turns a missing parameter
 * into a valid-looking value. It clamped zoom to a whole continent, and turned
 * a missing coordinate into 0,0 in the Gulf of Guinea.
 */

describe('parseZoom', () => {
  it('defaults when the param is absent', () => {
    expect(parseZoom(null)).toBe(DEFAULT_MAP_ZOOM);
    expect(parseZoom(undefined)).toBe(DEFAULT_MAP_ZOOM);
    expect(parseZoom('')).toBe(DEFAULT_MAP_ZOOM);
  });

  it('defaults on junk rather than clamping it', () => {
    expect(parseZoom('abc')).toBe(DEFAULT_MAP_ZOOM);
  });

  it('honours a real value', () => {
    expect(parseZoom('17')).toBe(17);
    expect(parseZoom('9')).toBe(9);
  });

  it('clamps out-of-range values', () => {
    expect(parseZoom('0')).toBe(3);
    expect(parseZoom('99')).toBe(18);
  });
});

describe('parseLatitude / parseLongitude', () => {
  it('returns null when the param is absent, never 0', () => {
    expect(parseLatitude(null)).toBeNull();
    expect(parseLongitude(null)).toBeNull();
    expect(parseLatitude('')).toBeNull();
  });

  it('still accepts a genuine zero', () => {
    // 0,0 is a real place; it just must be asked for explicitly.
    expect(parseLatitude('0')).toBe(0);
    expect(parseLongitude('0')).toBe(0);
  });

  it('rejects out-of-range coordinates', () => {
    expect(parseLatitude('91')).toBeNull();
    expect(parseLatitude('-91')).toBeNull();
    expect(parseLongitude('181')).toBeNull();
  });

  it('accepts the extremes', () => {
    expect(parseLatitude('90')).toBe(90);
    expect(parseLongitude('-180')).toBe(-180);
  });

  it('rejects junk', () => {
    expect(parseLatitude('north')).toBeNull();
    expect(parseLatitude('NaN')).toBeNull();
  });
});

describe('roundCoord', () => {
  it('rounds to the ~1.1km cache key', () => {
    expect(roundCoord(12.971944)).toBe(12.97);
    expect(roundCoord(77.593691)).toBe(77.59);
    expect(roundCoord(-0.126)).toBe(-0.13);
  });
});

describe('share URLs', () => {
  it('never carries precise coordinates', () => {
    // A card gets pasted into group chats; a home address must not go with it.
    const url = cardUrl('https://example.app', {
      latitude: 12.9716458,
      longitude: 77.5946001,
      city: 'Bengaluru',
    });
    expect(url).toContain('lat=12.97');
    expect(url).toContain('lon=77.59');
    expect(url).not.toContain('12.9716');
  });

  it('includes a date only when one is given', () => {
    const base = { latitude: 12.97, longitude: 77.59 };
    expect(cardUrl('https://x.app', base)).not.toContain('date=');
    expect(cardUrl('https://x.app', { ...base, date: '2019-06-15' })).toContain('date=2019-06-15');
  });

  it('omits the zoom param at the default, so URLs stay stable and cacheable', () => {
    const base = { latitude: 12.97, longitude: 77.59 };
    expect(cardUrl('https://x.app', { ...base, zoom: DEFAULT_MAP_ZOOM })).not.toContain('zoom=');
    expect(cardUrl('https://x.app', { ...base, zoom: 17 })).toContain('zoom=17');
  });

  it('never puts the API key in the map proxy URL', () => {
    const url = staticMapUrl('https://x.app', 12.97, 77.59, 14);
    expect(url).not.toMatch(/apiKey/i);
    expect(url).toBe('https://x.app/api/map?lat=12.97&lon=77.59&zoom=14');
  });
});
