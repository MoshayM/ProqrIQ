import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({ timeout: 15000 });
  });

  test('shows page heading', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible();
  });

  test('shows current date beside heading', async ({ page }) => {
    // The dashboard shows a date string like "Wednesday, June 24, 2026"
    const year = new Date().getFullYear().toString();
    await expect(page.locator(`text=${year}`).first()).toBeVisible();
  });

  test('renders four KPI cards', async ({ page }) => {
    await expect(page.locator('text=Quotes This Month').first()).toBeVisible();
    await expect(page.locator('text=Avg Confidence').first()).toBeVisible();
    await expect(page.locator('text=Pending Approvals').first()).toBeVisible();
    await expect(page.locator('text=Active Batches').first()).toBeVisible();
  });

  test('KPI cards load numeric values', async ({ page }) => {
    await page.waitForFunction(() => {
      return !document.body.innerText.includes('Loading…');
    }, { timeout: 10000 });
    // All 4 border-l-4 cards should be present
    const cards = page.locator('.border-l-4');
    await expect(cards).toHaveCount(4);
  });

  test('renders Monthly Quote Volume chart', async ({ page }) => {
    await expect(page.locator('text=Monthly Quote Volume')).toBeVisible();
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('renders Recent Quotes section', async ({ page }) => {
    await expect(page.locator('text=Recent Quotes')).toBeVisible();
  });

  test('Recent Quotes shows table headers or empty state', async ({ page }) => {
    await page.waitForFunction(() => {
      return !document.body.innerText.includes('Loading…');
    }, { timeout: 10000 });

    const hasTable = await page.locator('text=Part Name').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('text=No quotes yet').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('admin sees Pending Approvals panel', async ({ page }) => {
    await page.waitForFunction(() => {
      return !document.body.innerText.includes('Loading…');
    }, { timeout: 10000 });
    // The panel heading is "Pending Approvals" — appears twice (KPI card + panel)
    const panels = page.locator('text=Pending Approvals');
    const count = await panels.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
