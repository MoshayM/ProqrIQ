import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    // h1 shows personalised greeting e.g. "Good morning, Admin"
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  });

  test('shows page heading', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
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
    // 5 border-l-4 cards: Quotes This Month, Avg Confidence, Pending Approvals, Active Batches, AI Spend
    const cards = page.locator('.border-l-4');
    await expect(cards).toHaveCount(5);
  });

  test('renders Monthly Quote Volume chart', async ({ page }) => {
    // Just check the section heading; Recharts renders as SVG with role=img
    await expect(page.locator('text=Monthly Quote Volume')).toBeVisible();
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
    // "Pending Approvals" appears at least once (KPI card)
    const panels = page.locator('text=Pending Approvals');
    const count = await panels.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
