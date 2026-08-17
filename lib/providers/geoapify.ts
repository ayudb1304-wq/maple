import 'server-only';

import { cachedFetch } from '../http';
import { geoapifyKey } from '../env';

/**
 * Geoapify Static Maps — the card's background raster. KEYED, SERVER ONLY.
 *
 * Hard rule 5 in CLAUDE.md: the key must never appear in a client bundle, in a
 * URL handed to the client, or in logs. Nothing in this module returns a URL —
 * only bytes — so there is no way for a keyed URL to escape.
 *
 * Verified at T0.2: the response is image/jpeg (not PNG) and cold latency runs
 * 3–7.5s, which is why every call goes through the 30-day cache.
 */

const TTL = 60 * 60 * 24 * 30;

export const STATIC_MAP_STYLE = 'dark-matter-brown';
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
/** Teal accent, matching the "good night" theme colour. */
const MARKER_COLOR = '%2300d5be';

export type StaticMap = {
  bytes: ArrayBuffer;
  /** image/jpeg in practice; read from the response so Satori gets it right. */
  contentType: string;
};

/**
 * Rounding to 2 decimals (~1km) is the cache key strategy from
 * ARCHITECTURE.md: nearby users share one cached map, so a city costs ~5
 * Geoapify credits per month rather than per view.
 */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Returns null when the key is unset or the fetch fails — the card then uses its gradient fallback. */
export async function fetchStaticMap(
  lat: number,
  lon: number,
  zoom = 9,
): Promise<StaticMap | null> {
  const key = geoapifyKey();
  if (!key) {
    console.warn('[provider:geoapify] GEOAPIFY_KEY unset, using gradient fallback');
    return null;
  }

  const rLat = roundCoord(lat);
  const rLon = roundCoord(lon);
  const url =
    'https://maps.geoapify.com/v1/staticmap' +
    `?style=${STATIC_MAP_STYLE}&width=${CARD_WIDTH}&height=${CARD_HEIGHT}` +
    `&center=lonlat:${rLon},${rLat}&zoom=${zoom}` +
    `&marker=lonlat:${rLon},${rLat};color:${MARKER_COLOR};size:large` +
    `&apiKey=${key}`;

  const res = await cachedFetch(url, {
    revalidate: TTL,
    label: 'geoapify',
    accept: 'image/jpeg,image/png',
    // Cold renders measured at 3–7.5s at T0.2, so a 5s timeout would fail the
    // first request for every new city.
    timeoutMs: 9_000,
  });
  if (!res) return null;

  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  // Satori accepts JPEG and PNG only. Anything else means Geoapify returned an
  // error document, so fall back rather than feed Satori something it will
  // throw on mid-render.
  if (!/image\/(jpeg|png)/.test(contentType)) {
    console.warn(`[provider:geoapify] unexpected content-type ${contentType}`);
    return null;
  }

  try {
    return { bytes: await res.arrayBuffer(), contentType };
  } catch {
    console.warn('[provider:geoapify] failed to read image body');
    return null;
  }
}
