import { test, expect } from '@playwright/test';

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  });

  test('sidebar is visible', async ({ page }) => {
    await expect(page.locator('nav, aside').first()).toBeVisible();
  });

  test('brand ProqrIQ logo is visible', async ({ page }) => {
    await expect(page.locator('text=ProqrIQ').first()).toBeVisible();
  });

  test('navigates to Quotations', async ({ page }) => {
    await page.locator('a[href="/quotes"]').click();
    await expect(page).toHaveURL(/\/quotes/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15000 });
  });

  test('navigates to Bulk Costing', async ({ page }) => {
    await page.locator('a[href="/bulk"]').click();
    await expect(page).toHaveURL(/\/bulk/);
    await expect(page.locator('h1').filter({ hasText: 'Bulk Costing' })).toBeVisible({ timeout: 15000 });
  });

  test('navigates to Assemblies', async ({ page }) => {
    await page.locator('a[href="/assemblies"]').click();
    await expect(page).toHaveURL(/\/assemblies/);
    await expect(page.locator('h1').filter({ hasText: 'Assemblies' })).toBeVisible({ timeout: 15000 });
  });

  test('navigates to Knowledge Base (admin)', async ({ page }) => {
    await page.locator('a[href="/kb"]').click();
    await expect(page).toHaveURL(/\/kb/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15000 });
  });

  test('navigates to Settings', async ({ page }) => {
    await page.locator('a[href="/settings"]').click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15000 });
  });

  test('navigates back to Dashboard', async ({ page }) => {
    await page.locator('a[href="/bulk"]').click();
    await expect(page).toHaveURL(/\/bulk/);
    await page.locator('a[href="/dashboard"]').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  });
});
