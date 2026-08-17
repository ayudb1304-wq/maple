import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getVerdict } from './verdict';

/**
 * T1.3's acceptance criterion: killing one provider must still return a usable
 * verdict with that section null and `degraded` set, never a hard failure.
 *
 * `fetch` is stubbed per-provider so each outage can be exercised in isolation
 * without touching the network.
 */

const SUN_MOON_OK = {
  status: 'OK',
  results: {
    date: '2026-08-17',
    sunrise: '06:03:15',
    sunset: '18:44:08',
    dawn: '05:41:17',
    dusk: '19:06:04',
    solar_noon: '12:23:47',
    day_length: '12:40:53',
    timezone: 'Asia/Kolkata',
    utc_offset: 330,
    sun_status: 'normal',
    golden_hour_evening: { begin: '18:15:20', end: '18:57:34' },
    blue_hour_evening: { begin: '18:57:34', end: '19:06:04' },
    golden_hour_morning: { begin: '05:49:48', end: '06:32:05' },
    blue_hour_morning: { begin: '05:41:17', end: '05:49:48' },
    moonrise: '09:59:45',
    moonset: '21:55:29',
    moon_illumination: 23.33,
    moon_phase: 'Waxing Crescent',
    moon_phase_value: 0.16,
    moon_always_up: false,
    moon_always_down: false,
  },
};

const FORECAST_OK = {
  latitude: 12.97,
  longitude: 77.59,
  utc_offset_seconds: 19800,
  timezone: 'Asia/Kolkata',
  hourly: {
    time: Array.from({ length: 24 }, (_, h) => `2026-08-17T${String(h).padStart(2, '0')}:00`),
    cloud_cover: Array.from({ length: 24 }, () => 10),
  },
};

type Outage = 'none' | 'forecast' | 'sunmoon' | 'all';

function stubFetch(outage: Outage) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const fail = () => {
        throw new Error('simulated provider outage');
      };
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });

      if (url.includes('sunrisesunset.io')) {
        if (outage === 'sunmoon' || outage === 'all') fail();
        return json(SUN_MOON_OK);
      }
      if (url.includes('api.open-meteo.com')) {
        if (outage === 'forecast' || outage === 'all') fail();
        return json(FORECAST_OK);
      }
      // SWPC is never reached: Bengaluru is below the 45-degree cutoff.
      return json({});
    }),
  );
}

const BENGALURU = {
  latitude: 12.97,
  longitude: 77.59,
  timezone: 'Asia/Kolkata',
  city: 'Bengaluru',
  now: new Date('2026-08-17T06:30:00Z'),
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getVerdict', () => {
  it('builds a complete verdict when every provider answers', async () => {
    stubFetch('none');
    const verdict = await getVerdict(BENGALURU);

    expect(verdict.degraded).toBe(false);
    expect(verdict.missing).toEqual([]);
    expect(verdict.score).not.toBeNull();
    expect(verdict.cloudCoverEvening?.meanPercent).toBe(10);
    expect(verdict.goldenHour?.label).toBe('6:15-6:57 PM');
    expect(verdict.moon?.phase).toBe('Waxing Crescent');
    expect(verdict.sunMoonSource).toBe('sunrisesunset.io');
  });

  it('hides the aurora section entirely at low latitude', async () => {
    stubFetch('none');
    const verdict = await getVerdict(BENGALURU);
    expect(verdict.aurora).toBeNull();
  });

  it('rounds coordinates to 2dp so nearby users share a cache entry', async () => {
    stubFetch('none');
    const verdict = await getVerdict({ ...BENGALURU, latitude: 12.971944, longitude: 77.593691 });
    expect(verdict.location.latitude).toBe(12.97);
    expect(verdict.location.longitude).toBe(77.59);
  });

  it('resolves the date in the location timezone, not the server one', async () => {
    stubFetch('none');
    // 20:00 UTC is already the 18th in Kolkata, but only 01:30 local, so
    // "tonight" is still the evening of the 17th.
    const verdict = await getVerdict({ ...BENGALURU, now: new Date('2026-08-17T20:00:00Z') });
    expect(verdict.date).toBe('2026-08-17');
  });

  it('survives a cloud provider outage with that section null', async () => {
    stubFetch('forecast');
    const verdict = await getVerdict(BENGALURU);

    expect(verdict.cloudCoverEvening).toBeNull();
    expect(verdict.score).toBeNull();
    expect(verdict.degraded).toBe(true);
    expect(verdict.missing).toContain('cloud');
    // The times the user actually came for are still there.
    expect(verdict.goldenHour?.label).toBe('6:15-6:57 PM');
    expect(verdict.verdict).toContain('cloud data unavailable');
  });

  it('falls back to suncalc when the sun/moon API is down', async () => {
    stubFetch('sunmoon');
    const verdict = await getVerdict(BENGALURU);

    expect(verdict.sunMoonSource).toBe('suncalc');
    expect(verdict.degraded).toBe(true);
    expect(verdict.missing).toContain('sunmoon-api');
    // suncalc still produces a sunset and a moon phase, so the panel is usable.
    expect(verdict.sunset).not.toBeNull();
    expect(verdict.moon?.illuminationPercent).not.toBeNull();
  });

  it('still returns a usable object when everything is down', async () => {
    stubFetch('all');
    const verdict = await getVerdict(BENGALURU);

    expect(verdict.degraded).toBe(true);
    expect(verdict.attribution).toContain('OpenStreetMap');
    expect(verdict.headline).toBeTruthy();
    expect(verdict.verdict).toBeTruthy();
  });
});
