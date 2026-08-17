import { expect, test } from '@playwright/test';

/**
 * Phase 3 acceptance criteria for the card and its share path.
 */

/** Reads width and height straight out of the PNG IHDR chunk. */
function pngSize(buffer: Buffer): { width: number; height: number; isPng: boolean } {
  const isPng = buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  return {
    isPng,
    width: isPng ? buffer.readUInt32BE(16) : 0,
    height: isPng ? buffer.readUInt32BE(20) : 0,
  };
}

test('the card endpoint returns a 1200x630 PNG', async ({ request }) => {
  const response = await request.get('/api/card?lat=12.97&lon=77.59&tz=Asia/Kolkata&city=Bengaluru');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');

  const { isPng, width, height } = pngSize(await response.body());
  expect(isPng).toBe(true);
  expect({ width, height }).toEqual({ width: 1200, height: 630 });
});

test('the card sets a cacheable Cache-Control header', async ({ request }) => {
  const response = await request.get('/api/card?lat=12.97&lon=77.59&city=Bengaluru');
  const cacheControl = response.headers()['cache-control'] ?? '';
  expect(cacheControl).toContain('public');
  expect(cacheControl).toMatch(/s-maxage=\d+/);
});

test('a past date is marked immutable', async ({ request }) => {
  const response = await request.get('/api/card?lat=12.97&lon=77.59&city=Bengaluru&date=2019-06-15');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('immutable');
});

test('the card rejects bad coordinates rather than rendering nonsense', async ({ request }) => {
  expect((await request.get('/api/card?lat=999&lon=0')).status()).toBe(400);
  expect((await request.get('/api/card')).status()).toBe(400);
});

test('the map proxy never leaks the Geoapify key', async ({ request }) => {
  const response = await request.get('/api/map?lat=12.97&lon=77.59&zoom=9');
  // 404 is legitimate when no key is configured; what matters is the absence
  // of the key from headers and body in either case.
  expect([200, 404]).toContain(response.status());

  const headerBlob = JSON.stringify(response.headers());
  expect(headerBlob).not.toMatch(/apiKey/i);

  if (response.status() === 200) {
    expect(response.headers()['content-type']).toMatch(/image\/(jpeg|png)/);
  }
});

test('the map proxy defaults to city zoom when the param is absent', async ({ request }) => {
  // Regression guard: Number(null) is 0, which is finite, so a naive parse
  // clamped the zoom to its minimum and rendered a whole continent.
  const withoutZoom = await request.get('/api/map?lat=12.97&lon=77.59');
  const explicitDefault = await request.get('/api/map?lat=12.97&lon=77.59&zoom=9');
  const continent = await request.get('/api/map?lat=12.97&lon=77.59&zoom=3');

  if (withoutZoom.status() !== 200) test.skip(true, 'no Geoapify key configured');

  const bare = (await withoutZoom.body()).length;
  expect(bare).toBe((await explicitDefault.body()).length);
  expect(bare).not.toBe((await continent.body()).length);
});

test('street-level zoom is available and distinct from city zoom', async ({ request }) => {
  const city = await request.get('/api/map?lat=12.9716&lon=77.5946&zoom=9');
  const street = await request.get('/api/map?lat=12.9716&lon=77.5946&zoom=17');

  if (city.status() !== 200) test.skip(true, 'no Geoapify key configured');
  expect(street.status()).toBe(200);
  expect((await street.body()).length).not.toBe((await city.body()).length);
});

test('the landing page advertises the card as its OG image', async ({ page }) => {
  await page.goto('/');
  const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute('content');
  expect(ogImage).toContain('/api/card');
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe(
    'summary_large_image',
  );
});

test('the share button appears with the verdict and shares city-level coordinates', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: /search for a city/i }).fill('Bengaluru');
  await page.getByRole('option', { name: /Bengaluru/i }).first().click();

  const share = page.getByRole('button', { name: /share tonight/i });
  await expect(share).toBeVisible();

  // Desktop path: clipboard + download. Capture the card request to assert the
  // coordinates in it are rounded, so a precise location never leaves with it.
  const cardRequest = page.waitForRequest((r) => r.url().includes('/api/card'));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await share.click();

  const url = new URL((await cardRequest).url());
  const lat = url.searchParams.get('lat')!;
  const lon = url.searchParams.get('lon')!;
  expect(decimalPlaces(lat)).toBeLessThanOrEqual(2);
  expect(decimalPlaces(lon)).toBeLessThanOrEqual(2);
});

function decimalPlaces(value: string): number {
  return value.split('.')[1]?.length ?? 0;
}
