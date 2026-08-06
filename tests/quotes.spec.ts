import { test, expect } from '@playwright/test';

test.describe('All Quotes Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quotes');
    await expect(page.locator('h1').filter({ hasText: 'All Quotes' })).toBeVisible({ timeout: 15000 });
  });

  test('page renders without crashing', async ({ page }) => {
    await expect(page.locator('text=Failed to load')).not.toBeVisible();
  });

  test('page heading is visible', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'All Quotes' })).toBeVisible();
  });

  test('New Quote button is present', async ({ page }) => {
    await expect(page.locator('a[href="/quotes/new"]').first()).toBeVisible();
  });

  test('search input is present', async ({ page }) => {
    await expect(page.locator('input[type="text"]').first()).toBeVisible();
  });

  test('quote table or empty state renders', async ({ page }) => {
    const table = page.locator('table').first();
    const empty = page.locator('text=No quotes found');
    await expect(table.or(empty)).toBeVisible({ timeout: 10000 });
  });

  test('clicking New Quote navigates to quote creation', async ({ page }) => {
    await page.locator('a[href="/quotes/new"]').first().click();
    await expect(page).toHaveURL(/\/quotes\/new/);
  });
});

test.describe('Quote Detail Page', () => {
  test('accessing unknown quote shows a not-found or error state', async ({ page }) => {
    await page.goto('/quotes/nonexistent-id-00000');
    await page.waitForLoadState('networkidle');
    const hasError = await page.locator('text=/not found|error|failed/i').first().isVisible().catch(() => false);
    const onDashboard = page.url().includes('/dashboard');
    expect(hasError || onDashboard).toBe(true);
  });
});
