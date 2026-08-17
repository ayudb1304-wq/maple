import { expect, test } from '@playwright/test';

/**
 * Phase 2 acceptance criteria, exercised in a real browser.
 *
 * These hit live providers on purpose: the point is that a cold visitor gets a
 * verdict, not that a mock does.
 */

test('landing page paints the hero from server HTML', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('worth going outside for');
  // Attribution is a licence condition, not decoration.
  await expect(page.getByRole('contentinfo')).toContainText('SunriseSunset.io');
  await expect(page.getByRole('contentinfo')).toContainText('OpenStreetMap');
});

test('searching a city produces a verdict', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('combobox', { name: /search for a city/i }).fill('Bengaluru');
  await page.getByRole('option', { name: /Bengaluru/i }).first().click();

  const panel = page.getByRole('region').or(page.locator('section[data-theme]'));
  await expect(panel.first()).toBeVisible();

  // The dial exposes the score through its accessible name.
  await expect(page.getByRole('img', { name: /sky score|no score available/i })).toBeVisible();

  // The chips the PRD calls for.
  await expect(page.getByText('Golden hour', { exact: true })).toBeVisible();
  await expect(page.getByText('Cloud cover', { exact: true })).toBeVisible();
});

test('the verdict panel appears without shifting the layout', async ({ page }) => {
  await page.goto('/');

  // Cumulative Layout Shift, excluding shifts that follow user input (which are
  // not counted against CLS anyway).
  await page.evaluate(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await page.getByRole('combobox', { name: /search for a city/i }).fill('Bengaluru');
  await page.getByRole('option', { name: /Bengaluru/i }).first().click();
  await expect(page.locator('section[data-theme]')).toBeVisible();
  await page.waitForTimeout(1500);

  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  // 0.1 is the "good" threshold in Core Web Vitals.
  expect(cls).toBeLessThan(0.1);
});

test('the streak counts once per day, not once per visit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: /search for a city/i }).fill('Bengaluru');
  await page.getByRole('option', { name: /Bengaluru/i }).first().click();
  await expect(page.locator('section[data-theme]')).toBeVisible();

  const readDates = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('skytonight:v1') ?? '{}').lastCheckedDates ?? []);

  expect(await readDates()).toHaveLength(1);

  // Same-day revisit must not advance it.
  await page.reload();
  await expect(page.locator('section[data-theme]')).toBeVisible();
  expect(await readDates()).toHaveLength(1);

  // Simulate yesterday's history, then reload: the run should become 2.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('skytonight:v1') ?? '{}');
    const today = new Date(state.lastCheckedDates[0] + 'T00:00:00Z');
    const yesterday = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
    state.lastCheckedDates = [yesterday];
    localStorage.setItem('skytonight:v1', JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByText(/2-day sky check streak/)).toBeVisible();
});

test('the saved location is restored on a return visit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: /search for a city/i }).fill('Bengaluru');
  await page.getByRole('option', { name: /Bengaluru/i }).first().click();
  await expect(page.locator('section[data-theme]')).toBeVisible();

  await page.reload();
  // No typing this time: the verdict should come back on its own.
  await expect(page.locator('section[data-theme]')).toBeVisible();
  await expect(page.getByText('Bengaluru')).toBeVisible();
});

test('the map is hidden, not broken, when tiles are unreachable', async ({ page }) => {
  // OpenFreeMap has no SLA, so this fallback is mandatory.
  await page.route('**tiles.openfreemap.org/**', (route) => route.abort());

  await page.goto('/');
  await page.getByRole('combobox', { name: /search for a city/i }).fill('Bengaluru');
  await page.getByRole('option', { name: /Bengaluru/i }).first().click();

  // The verdict is unaffected...
  await expect(page.locator('section[data-theme]')).toBeVisible();
  // ...and the map removes itself rather than leaving a broken frame.
  await expect(page.locator('.maplibregl-map')).toHaveCount(0, { timeout: 20_000 });
});

test('MapLibre stays out of the initial page load', async ({ page }) => {
  const scriptsBeforeVerdict: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptsBeforeVerdict.push(request.url());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  expect(scriptsBeforeVerdict.some((url) => /maplibre/i.test(url))).toBe(false);
});
