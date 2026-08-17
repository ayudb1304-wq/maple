import type { NextRequest } from 'next/server';

import { geocode } from '@/lib/providers/openmeteo';

/**
 * GET /api/geocode?q=..
 *
 * Thin proxy over Open-Meteo geocoding, cached 30 days per query. Proxied
 * rather than called from the browser so results are shared across all users
 * and our volume against a keyless free endpoint stays trivial.
 */

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (query.length < 2) {
    return Response.json({ results: [] });
  }

  const results = await geocode(query);

  if (results === null) {
    return Response.json({ error: 'Search is unavailable right now', results: [] }, { status: 503 });
  }

  return Response.json(
    {
      results: results.map((r) => ({
        id: r.id,
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone,
        country: r.country ?? null,
        countryCode: r.country_code ?? null,
        admin1: r.admin1 ?? null,
        population: r.population ?? null,
      })),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=2592000',
      },
    },
  );
}
