/**
 * T0.2 — throwaway endpoint prober.
 *
 * Hits every endpoint in docs/API_REFERENCE.md for a low-latitude city
 * (Bengaluru) and a high-latitude one (Tromso), then prints the REAL response
 * shapes so lib/schemas.ts can be written from observed data rather than
 * guesses.
 *
 *   npm run probe            # human-readable to stdout
 *   npm run probe > docs/probe-output.md
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

// --- minimal .env.local loader (this script runs outside Next) ---
try {
  const envFile = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // no .env.local — Geoapify probe will be skipped
}

const UA = 'SkyTonight/1.0 (+http://localhost:3000)';

const CITIES = [
  { name: 'Bengaluru', lat: 12.97, lon: 77.59, tz: 'Asia/Kolkata' },
  { name: 'Tromso', lat: 69.65, lon: 18.96, tz: 'Europe/Oslo' },
];

/** Recursively describe a value's shape, collapsing arrays to their first element. */
function shape(value: unknown, depth = 0, maxDepth = 4): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array(empty)';
    if (depth >= maxDepth) return `array[${value.length}]`;
    return `array[${value.length}] of ${shape(value[0], depth + 1, maxDepth)}`;
  }
  const t = typeof value;
  if (t !== 'object') {
    const preview = t === 'string' ? JSON.stringify(value) : String(value);
    return `${t}(${preview.length > 40 ? preview.slice(0, 40) + '…' : preview})`;
  }
  if (depth >= maxDepth) return 'object';
  const entries = Object.entries(value as Record<string, unknown>);
  const inner = entries
    .map(([k, v]) => `${'  '.repeat(depth + 1)}${k}: ${shape(v, depth + 1, maxDepth)}`)
    .join('\n');
  return `{\n${inner}\n${'  '.repeat(depth)}}`;
}

function section(title: string) {
  console.log(`\n## ${title}\n`);
}

function block(label: string, body: string) {
  console.log(`**${label}**\n`);
  console.log('```');
  console.log(body);
  console.log('```\n');
}

/** Redact any apiKey query param so keys never reach stdout or the committed doc. */
function safeUrl(url: string): string {
  return url.replace(/([?&]apiKey=)[^&]+/i, '$1***REDACTED***');
}

async function getJson(url: string): Promise<{ ms: number; status: number; body: unknown }> {
  const started = Date.now();
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const body = res.ok ? await res.json() : await res.text();
  return { ms: Date.now() - started, status: res.status, body };
}

async function probeGeocoding() {
  section('1. Open-Meteo Geocoding');
  for (const q of ['Bengaluru', 'Tromso', 'beng']) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      q,
    )}&count=5&language=en&format=json`;
    try {
      const { ms, status, body } = await getJson(url);
      const b = body as { results?: unknown[] };
      block(
        `q="${q}" → ${status} in ${ms}ms`,
        `${safeUrl(url)}\n\nresult count: ${b.results?.length ?? 0}\n\nfirst result:\n${shape(
          b.results?.[0],
        )}`,
      );
    } catch (err) {
      block(`q="${q}" → FAILED`, String(err));
    }
  }
}

async function probeForecast() {
  section('2. Open-Meteo Forecast (cloud cover)');
  for (const c of CITIES) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&hourly=cloud_cover&forecast_days=2&timezone=${encodeURIComponent(
      c.tz,
    )}`;
    try {
      const { ms, status, body } = await getJson(url);
      const b = body as {
        timezone?: string;
        utc_offset_seconds?: number;
        hourly?: { time?: string[]; cloud_cover?: number[] };
      };
      block(
        `${c.name} → ${status} in ${ms}ms`,
        [
          safeUrl(url),
          '',
          shape({ ...b, hourly: undefined }),
          '',
          `hourly.time[0..2]: ${JSON.stringify(b.hourly?.time?.slice(0, 3))}`,
          `hourly.time length: ${b.hourly?.time?.length}`,
          `hourly.cloud_cover[0..5]: ${JSON.stringify(b.hourly?.cloud_cover?.slice(0, 6))}`,
        ].join('\n'),
      );
    } catch (err) {
      block(`${c.name} → FAILED`, String(err));
    }
  }
}

async function probeOvation() {
  section('3. NOAA SWPC — OVATION aurora grid');
  const url = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
  try {
    const { ms, status, body } = await getJson(url);
    const b = body as {
      'Observation Time'?: string;
      'Forecast Time'?: string;
      coordinates?: [number, number, number][];
    };
    const coords = b.coordinates ?? [];
    // nearest-cell lookup, mirroring what lib/providers/swpc.ts will do
    const lookups = CITIES.map((c) => {
      const lon = ((c.lon % 360) + 360) % 360;
      let best: [number, number, number] | null = null;
      let bestDist = Infinity;
      for (const cell of coords) {
        const d = Math.abs(cell[0] - lon) + Math.abs(cell[1] - c.lat);
        if (d < bestDist) {
          bestDist = d;
          best = cell;
        }
      }
      return `${c.name} (lon ${lon.toFixed(2)}, lat ${c.lat}) → nearest cell ${JSON.stringify(best)}`;
    });
    block(
      `→ ${status} in ${ms}ms`,
      [
        safeUrl(url),
        '',
        `top-level keys: ${JSON.stringify(Object.keys(b as object))}`,
        `Observation Time: ${b['Observation Time']}`,
        `Forecast Time: ${b['Forecast Time']}`,
        `coordinates length: ${coords.length}`,
        `coordinates[0]: ${JSON.stringify(coords[0])}  // [lon, lat, probability]`,
        `max probability in grid: ${Math.max(...coords.map((c) => c[2]))}`,
        '',
        ...lookups,
      ].join('\n'),
    );
  } catch (err) {
    block('FAILED', String(err));
  }
}

async function probeKp() {
  section('4. NOAA SWPC — planetary K-index forecast');
  const url = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';
  try {
    const { ms, status, body } = await getJson(url);
    const rows = body as unknown[];
    const isArrayRows = Array.isArray(rows[0]);
    const objRows = rows as { time_tag: string; kp: number; observed: string | null }[];
    block(
      `→ ${status} in ${ms}ms`,
      [
        safeUrl(url),
        '',
        `rows: ${rows.length}`,
        `row container type: ${isArrayRows ? 'ARRAY (as API_REFERENCE claims)' : 'OBJECT (differs from API_REFERENCE)'}`,
        `rows[0]: ${JSON.stringify(rows[0])}`,
        `rows[1]: ${JSON.stringify(rows[1])}`,
        '',
        `last 4 rows:\n${rows
          .slice(-4)
          .map((r) => '  ' + JSON.stringify(r))
          .join('\n')}`,
        '',
        isArrayRows
          ? ''
          : [
              `distinct "observed" values: ${JSON.stringify([
                ...new Set(objRows.map((r) => r.observed)),
              ])}`,
              `kp range: ${Math.min(...objRows.map((r) => r.kp))} .. ${Math.max(
                ...objRows.map((r) => r.kp),
              )}`,
              `time_tag span: ${objRows[0]?.time_tag} .. ${objRows[objRows.length - 1]?.time_tag}`,
              `rows with time_tag in the future: ${
                objRows.filter((r) => new Date(r.time_tag + 'Z').getTime() > Date.now()).length
              }`,
            ].join('\n'),
      ].join('\n'),
    );
  } catch (err) {
    block('FAILED', String(err));
  }
}

async function probeSunriseSunset() {
  section('5. SunriseSunset.io (v2) — sun + moon');
  const today = new Date().toISOString().slice(0, 10);
  for (const c of CITIES) {
    const url = `https://api.sunrisesunset.io/json?lat=${c.lat}&lng=${c.lon}&date=${today}&timezone=${encodeURIComponent(
      c.tz,
    )}&time_format=24`;
    try {
      const { ms, status, body } = await getJson(url);
      block(
        `${c.name} (${today}) → ${status} in ${ms}ms`,
        [safeUrl(url), '', shape(body), '', 'raw:', JSON.stringify(body, null, 2)].join('\n'),
      );
    } catch (err) {
      block(`${c.name} → FAILED`, String(err));
    }
  }
}

async function probeGeoapify() {
  section('6. Geoapify Static Maps');
  const key = process.env.GEOAPIFY_KEY?.trim();
  if (!key) {
    block('SKIPPED', 'GEOAPIFY_KEY not set in .env.local');
    return;
  }
  for (const style of ['dark-matter-brown', 'dark-matter', 'osm-carto']) {
    const c = CITIES[0];
    const url =
      `https://maps.geoapify.com/v1/staticmap?style=${style}&width=1200&height=630` +
      `&center=lonlat:${c.lon},${c.lat}&zoom=9` +
      `&marker=lonlat:${c.lon},${c.lat};color:%2300d5be;size:large&apiKey=${key}`;
    try {
      const started = Date.now();
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(20_000),
      });
      const ms = Date.now() - started;
      const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
      const isPng = buf ? buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' : false;
      block(
        `style="${style}" → ${res.status} in ${ms}ms`,
        [
          safeUrl(url),
          '',
          `content-type: ${res.headers.get('content-type')}`,
          `bytes: ${buf?.length ?? 0}`,
          `PNG magic bytes present: ${isPng}`,
          res.ok ? '' : `body: ${buf?.toString('utf8').slice(0, 300)}`,
        ].join('\n'),
      );
    } catch (err) {
      block(`style="${style}" → FAILED`, String(err));
    }
  }
}

async function probeOpenFreeMap() {
  section('7. OpenFreeMap style JSON (interactive map)');
  for (const style of ['dark', 'liberty', 'positron', 'bright']) {
    const url = `https://tiles.openfreemap.org/styles/${style}`;
    try {
      const started = Date.now();
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15_000),
      });
      const ms = Date.now() - started;
      const text = await res.text();
      let note = '';
      if (res.ok) {
        try {
          const j = JSON.parse(text) as { name?: string; layers?: unknown[] };
          note = `name="${j.name}", layers=${j.layers?.length}`;
        } catch {
          note = 'not JSON';
        }
      } else {
        note = text.slice(0, 120);
      }
      block(`style="${style}" → ${res.status} in ${ms}ms`, `${url}\n\n${note}`);
    } catch (err) {
      block(`style="${style}" → FAILED`, String(err));
    }
  }
}

async function main() {
  console.log('# probe-output — live endpoint shapes (T0.2)\n');
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);
  console.log(
    '\nRun with `npm run probe`. API keys are redacted from URLs before printing.\n',
  );
  console.log('---');

  await probeGeocoding();
  await probeForecast();
  await probeOvation();
  await probeKp();
  await probeSunriseSunset();
  await probeGeoapify();
  await probeOpenFreeMap();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
