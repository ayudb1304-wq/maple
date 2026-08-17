import type { NextRequest } from 'next/server';

import { fetchStaticMap } from '@/lib/providers/geoapify';
import { parseZoom } from '@/lib/geo';

/**
 * GET /api/map?lat=..&lon=..&zoom=..
 *
 * Re-serves the Geoapify static map from our own origin. Two reasons this
 * exists rather than the card fetching Geoapify directly:
 *
 *  1. The API key stays server-side. Nothing here echoes it, and the response
 *     is bytes, so a keyed URL can never reach a client, a log or a card.
 *  2. Satori needs a plain fetchable URL. Passing the image as a base64 data
 *     URI instead would inflate the Edge payload by ~150KB per render.
 */

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response('Bad coordinates', { status: 400 });
  }

  const zoom = parseZoom(params.get('zoom'));

  const map = await fetchStaticMap(lat, lon, zoom);
  if (!map) {
    // The card falls back to its gradient background on a 404 here, so this is
    // a normal outcome rather than an error worth alarming about.
    return new Response('Map unavailable', { status: 404 });
  }

  return new Response(map.bytes, {
    headers: {
      'Content-Type': map.contentType,
      'Content-Length': String(map.bytes.byteLength),
      // The background of a place barely changes; 30 days matches the upstream
      // cache and keeps us far inside the free tier.
      'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, immutable',
    },
  });
}
