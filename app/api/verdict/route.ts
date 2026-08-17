import type { NextRequest } from 'next/server';

import { getVerdict } from '@/lib/verdict';
import { parseLatitude, parseLongitude } from '@/lib/geo';

/**
 * GET /api/verdict?lat=..&lon=..&tz=..&city=..
 *
 * Aggregated verdict for tonight. Providers are cached individually with their
 * own TTLs, so this handler stays dynamic (it reads query params) while the
 * expensive work behind it is shared across users.
 */

/** Rough IANA zone check — enough to reject junk before handing it to Intl. */
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = parseLatitude(params.get('lat'));
  const lon = parseLongitude(params.get('lon'));

  if (lat === null || lon === null) {
    return Response.json(
      { error: 'lat and lon are required and must be valid coordinates' },
      { status: 400 },
    );
  }

  const requestedTz = params.get('tz');
  const timezone = requestedTz && isValidTimezone(requestedTz) ? requestedTz : 'UTC';
  const city = params.get('city');

  try {
    const verdict = await getVerdict({ latitude: lat, longitude: lon, timezone, city });
    return Response.json(verdict, {
      headers: {
        // Short shared cache: the verdict changes as the hourly forecast moves,
        // but repeated views within a few minutes should not re-aggregate.
        'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800',
      },
    });
  } catch (error) {
    // Provider failures are already handled by degrading, so reaching here means
    // a genuine bug. Still avoid a bare 500 page for the client.
    console.error('[api/verdict] unexpected failure', error);
    return Response.json({ error: 'Could not build a verdict right now' }, { status: 500 });
  }
}
