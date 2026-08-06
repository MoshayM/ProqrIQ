import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1').filter({ hasText: 'Settings' })).toBeVisible({ timeout: 15000 });
  });

  test('page renders without crashing', async ({ page }) => {
    await expect(page.locator('text=Error')).not.toBeVisible();
  });

  test('settings heading is visible', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Settings' })).toBeVisible();
  });

  test('page has meaningful content', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(100);
  });
});

test.describe('Regional Rates Page (Admin)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/regional-rates');
    await expect(page.locator('h1').filter({ hasText: 'Regional Rates' })).toBeVisible({ timeout: 15000 });
  });

  test('page renders without crashing', async ({ page }) => {
    await expect(page.locator('text=Error')).not.toBeVisible();
  });

  test('regional rates heading is visible', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Regional Rates' })).toBeVisible();
  });

  test('page has rate data or empty state', async ({ page }) => {
    const table = page.locator('table').first();
    const empty = page.locator('text=/no .*(rate|entry|data)/i');
    await expect(table.or(empty)).toBeVisible({ timeout: 10000 });
  });
});
