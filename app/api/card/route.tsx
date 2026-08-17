import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

import { APP_URL } from '@/lib/env';
import { ATTRIBUTION_LINE } from '@/lib/constants';
import { parseZoom, staticMapUrl } from '@/lib/geo';
import { getVerdict } from '@/lib/verdict';
import { CARD_SAMPLES, SAMPLES_ENABLED } from '@/lib/cardSamples';
import type { Verdict } from '@/lib/types';

/**
 * GET /api/card?lat=..&lon=..&city=..&date=YYYY-MM-DD&zoom=..
 *
 * The 1200x630 share card — the product's core viral artifact (PRD §5).
 *
 * Notes on the constraints Satori imposes:
 *  - flexbox only, no grid, and every element needs an explicit `display`
 *  - the map raster comes from our own cached /api/map proxy as a URL, not a
 *    data URI, to keep the Edge payload small
 *  - fonts are fetched once at module scope, as woff latin subsets (~31KB each)
 *    rather than full TTFs, to stay inside the 500KB Edge bundle limit
 *
 * `date` is accepted from day one so the Phase 3 memory card can reuse these
 * URLs unchanged. v1 renders tonight regardless.
 */

export const runtime = 'edge';

const WIDTH = 1200;
const HEIGHT = 630;

/** Score themes, mirroring app/globals.css so card and app agree (PRD §5). */
const THEMES = {
  good: { accent: '#00d5be', glow: 'rgba(0, 213, 190, 0.20)' },
  mixed: { accent: '#f0b429', glow: 'rgba(240, 180, 41, 0.18)' },
  poor: { accent: '#9aa3b5', glow: 'rgba(154, 163, 181, 0.14)' },
  aurora: { accent: '#6ee787', glow: 'rgba(110, 231, 135, 0.22)' },
} as const;

/**
 * Fonts are fetched once per instance and memoised, not fetched per request.
 *
 * The origin comes from the incoming request rather than NEXT_PUBLIC_APP_URL,
 * so the card renders correctly on localhost and on preview deployments, where
 * the canonical URL points somewhere else entirely. APP_URL is used only for
 * the branding line printed on the card.
 */
let fontPromise: Promise<CardFont[]> | null = null;

type CardFont = { name: string; data: ArrayBuffer; weight: 400 | 600; style: 'normal' };

function loadFonts(origin: string): Promise<CardFont[]> {
  fontPromise ??= Promise.all([
    loadFont(origin, '/fonts/inter-400.woff', 400),
    loadFont(origin, '/fonts/inter-600.woff', 600),
  ]).then((fonts) => fonts.filter((f): f is CardFont => f !== null));
  return fontPromise;
}

async function loadFont(origin: string, path: string, weight: 400 | 600): Promise<CardFont | null> {
  try {
    const res = await fetch(`${origin}${path}`, { cache: 'force-cache' });
    if (!res.ok) return null;
    return { name: 'Inter', data: await res.arrayBuffer(), weight, style: 'normal' };
  } catch {
    // Satori falls back to its built-in font rather than failing the render.
    return null;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response('lat and lon are required', { status: 400 });
  }

  const timezone = validTimezone(params.get('tz'));
  const city = params.get('city');
  const zoom = parseZoom(params.get('zoom'));
  const requestedDate = params.get('date');

  try {
    const origin = request.nextUrl.origin;

    // Visual-QA fixtures (T3.3). Unreachable unless ALLOW_CARD_SAMPLES=1, which
    // is never set in production, so this cannot serve fabricated data to users.
    const sample = params.get('sample');
    const verdict =
      SAMPLES_ENABLED && sample && CARD_SAMPLES[sample]
        ? CARD_SAMPLES[sample]
        : await getVerdict({ latitude: lat, longitude: lon, timezone, city });
    const fonts = await loadFonts(origin);

    return new ImageResponse(<Card verdict={verdict} zoom={zoom} origin={origin} />, {
      width: WIDTH,
      height: HEIGHT,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        // Past dates can never change, so they are immutable. Tonight's card
        // still revalidates, because the forecast moves through the day.
        'Cache-Control': isPastDate(requestedDate, verdict.date)
          ? 'public, max-age=86400, s-maxage=86400, immutable'
          : 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error('[api/card] render failed', error);
    return new Response('Could not render the card', { status: 500 });
  }
}

/** A card for a date already past is safe to mark immutable. */
function isPastDate(requested: string | null, tonight: string): boolean {
  return Boolean(requested) && requested! < tonight;
}

function validTimezone(tz: string | null): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

// --- the card ------------------------------------------------------------

function Card({ verdict, zoom, origin }: { verdict: Verdict; zoom: number; origin: string }) {
  const theme = THEMES[verdict.theme];
  const mapUrl = staticMapUrl(origin, verdict.location.latitude, verdict.location.longitude, zoom);

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: '#06070d',
        fontFamily: 'Inter',
        color: '#e8ecf5',
      }}
    >
      {/*
        Background map. If /api/map 404s (no key, or Geoapify down) Satori drops
        the img and the gradient beneath shows through, which is the branded
        fallback ARCHITECTURE.md requires.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori renders to a PNG: next/image does not exist in this runtime, and alt text has no meaning inside a raster image. */}
      <img
        src={mapUrl}
        width={WIDTH}
        height={HEIGHT}
        style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }}
      />

      {/* Dim the map so text stays readable over any terrain. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          backgroundColor: 'rgba(6, 7, 13, 0.58)',
        }}
      />
      {/*
        Accent glow, tying the card to the score. This must be a gradient, not
        a rounded div: Satori draws a circle as a hard-edged disc with a visible
        boundary, which reads as a rendering artifact rather than light.
      */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          backgroundImage: `radial-gradient(760px 520px at 14% 0%, ${theme.glow} 0%, rgba(6, 7, 13, 0) 62%)`,
        }}
      />
      {/*
        Bottom scrim. Geoapify stamps its own credit into the bottom-right of
        the raster, so the footer needs a dark base to sit on or the two sets of
        small type fight each other.
      */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          backgroundImage:
            'linear-gradient(to bottom, rgba(6, 7, 13, 0) 55%, rgba(6, 7, 13, 0.72) 82%, rgba(6, 7, 13, 0.95) 100%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: WIDTH,
          height: HEIGHT,
          padding: '52px 56px 0 56px',
        }}
      >
        <Header verdict={verdict} accent={theme.accent} />
        <Body verdict={verdict} accent={theme.accent} />
        <Chips verdict={verdict} accent={theme.accent} />
        <Footer />
      </div>
    </div>
  );
}

function Header({ verdict, accent }: { verdict: Verdict; accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: 3.4,
          textTransform: 'uppercase',
          color: accent,
        }}
      >
        SkyTonight
      </div>
      <div style={{ display: 'flex', marginTop: 12, alignItems: 'baseline' }}>
        <div
          style={{
            display: 'flex',
            fontSize: cityFontSize(verdict.location.city),
            fontWeight: 600,
            letterSpacing: -1,
            // Guards a very long name like Thiruvananthapuram from colliding
            // with the date beside it.
            maxWidth: 700,
            overflow: 'hidden',
          }}
        >
          {verdict.location.city ?? 'Your sky'}
        </div>
        <div style={{ display: 'flex', marginLeft: 22, fontSize: 24, color: '#98a1b6', flexShrink: 0 }}>
          {formatDate(verdict.date)}
        </div>
      </div>
    </div>
  );
}

/**
 * Long city names step down a size rather than wrapping or clipping.
 *
 * Thresholds are set from the real worst case, "Thiruvananthapuram" (18
 * characters), which at 52px runs right up against the date beside it.
 */
function cityFontSize(city: string | null): number {
  const length = city?.length ?? 0;
  if (length >= 16) return 42;
  if (length >= 12) return 50;
  return 60;
}

function Body({ verdict, accent }: { verdict: Verdict; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Dial score={verdict.score} accent={accent} />
      <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 34, maxWidth: 780 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: 2.6,
            textTransform: 'uppercase',
            color: accent,
          }}
        >
          {verdict.headline}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 10,
            fontSize: verdict.verdict.length > 52 ? 34 : 40,
            fontWeight: 600,
            lineHeight: 1.22,
            letterSpacing: -0.5,
          }}
        >
          {verdict.verdict}
        </div>
      </div>
    </div>
  );
}

/**
 * The dial as a ring built from borders. Satori has no SVG arc support worth
 * relying on, and a full ring plus an accent-weighted inner ring reads clearly
 * at thumbnail size, which is where most people will see this.
 */
function Dial({ score, accent }: { score: number | null; accent: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 168,
        height: 168,
        borderRadius: 84,
        border: `7px solid ${accent}`,
        backgroundColor: 'rgba(6, 7, 13, 0.55)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', fontSize: score === null ? 52 : 74, fontWeight: 600, lineHeight: 1 }}>
        {score === null ? '--' : formatScore(score)}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 6,
          fontSize: 13,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: '#98a1b6',
        }}
      >
        {score === null ? 'no score' : 'out of 10'}
      </div>
    </div>
  );
}

function Chips({ verdict, accent }: { verdict: Verdict; accent: string }) {
  const showAurora =
    verdict.aurora !== null &&
    ((verdict.aurora.probability ?? 0) >= 10 || (verdict.aurora.kp ?? 0) >= 5);

  const chips: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'Golden hour', value: verdict.goldenHour?.label ?? 'None tonight' },
    { label: 'Blue hour', value: verdict.blueHour?.label ?? 'None tonight' },
    {
      label: 'Cloud',
      value: verdict.cloudCoverEvening ? `${verdict.cloudCoverEvening.meanPercent}%` : 'No data',
    },
    { label: 'Moon', value: formatMoon(verdict.moon) },
  ];

  if (showAurora) {
    chips.push({ label: 'Aurora', value: formatAurora(verdict.aurora!), highlight: true });
  }

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {chips.map((chip) => (
        <div
          key={chip.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '14px 20px',
            borderRadius: 15,
            border: `1px solid ${chip.highlight ? accent : 'rgba(232, 236, 245, 0.16)'}`,
            backgroundColor: chip.highlight ? 'rgba(6, 7, 13, 0.72)' : 'rgba(13, 16, 24, 0.66)',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 13,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              color: '#98a1b6',
            }}
          >
            {chip.label}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 5,
              fontSize: 21,
              fontWeight: 600,
              color: chip.highlight ? accent : '#e8ecf5',
            }}
          >
            {chip.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Attribution on the image itself is a licence condition, not decoration. */
function Footer() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 26,
        paddingTop: 16,
        // Clears the Geoapify credit baked into the bottom edge of the raster.
        paddingBottom: 34,
        borderTop: '1px solid rgba(232, 236, 245, 0.12)',
      }}
    >
      <div style={{ display: 'flex', fontSize: 19, fontWeight: 600, color: '#e8ecf5' }}>
        {APP_URL.replace(/^https?:\/\//, '')}
      </div>
      <div style={{ display: 'flex', fontSize: 13, color: '#7d8699' }}>{ATTRIBUTION_LINE}</div>
    </div>
  );
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function formatMoon(moon: Verdict['moon']): string {
  if (!moon || moon.illuminationPercent === null) return 'No data';
  return `${Math.round(moon.illuminationPercent)}% lit`;
}

function formatAurora(aurora: NonNullable<Verdict['aurora']>): string {
  if (aurora.kp !== null && aurora.kp >= 5) {
    return `Kp ${Number.isInteger(aurora.kp) ? aurora.kp : aurora.kp.toFixed(1)}`;
  }
  return aurora.probability !== null ? `${aurora.probability}% chance` : 'Possible';
}

/** "Mon 17 Aug 2026" — unambiguous for an image that outlives its context. */
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
