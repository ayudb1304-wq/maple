import { expect, test } from '@playwright/test';

/**
 * Not assertions — this file exists to produce images for visual review.
 * Run with: npx playwright test screenshots --project=desktop
 */

const OUT = 'docs/screenshots';

async function verdictFor(page: import('@playwright/test').Page, city: string) {
  await page.goto('/');
  await page.getByRole('combobox', { name: /search for a city/i }).fill(city);
  await page.getByRole('option', { name: new RegExp(city, 'i') }).first().click();
  await expect(page.locator('section[data-theme]')).toBeVisible();
  // Let the dial animation settle and the map paint.
  await page.waitForTimeout(9000);
}

test('landing, empty state', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/01-landing-empty.png`, fullPage: true });
});

test('verdict, Bengaluru', async ({ page }) => {
  await verdictFor(page, 'Bengaluru');
  await page.screenshot({ path: `${OUT}/02-verdict-bengaluru.png`, fullPage: true });
});

test('verdict, high latitude with aurora section', async ({ page }) => {
  await verdictFor(page, 'Tromsø');
  await page.screenshot({ path: `${OUT}/03-verdict-tromso.png`, fullPage: true });
});

test('verdict, mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await verdictFor(page, 'Bengaluru');
  await page.screenshot({ path: `${OUT}/04-verdict-mobile.png`, fullPage: true });
});

test('search dropdown open', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: /search for a city/i }).fill('beng');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/05-search-open.png` });
});
