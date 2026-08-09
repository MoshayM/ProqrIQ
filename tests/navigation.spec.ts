import { test, expect } from '@playwright/test';

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  });

  test('sidebar is visible', async ({ page }) => {
    await expect(page.locator('aside').first()).toBeVisible();
  });

  test('brand ProqrIQ logo is visible', async ({ page }) => {
    // The aside (sidebar) renders the ProqrIQ logo text
    await expect(page.locator('aside').filter({ hasText: 'ProqrIQ' })).toBeVisible();
  });

  test('navigates to Quotations', async ({ page }) => {
    // Scope to aside to avoid strict mode (mobile nav also has the same links hidden off-screen)
    await page.locator('aside nav a[href="/quotes"]').click();
    await expect(page).toHaveURL(/\/quotes/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15000 });
  });

  test('navigates to Bulk Costing', async ({ page }) => {
    await page.locator('aside nav a[href="/bulk"]').click();
    await expect(page).toHaveURL(/\/bulk/);
    await expect(page.locator('h1').filter({ hasText: 'Bulk Costing' })).toBeVisible({ timeout: 15000 });
  });

  test('navigates to Assemblies', async ({ page }) => {
    await page.locator('aside nav a[href="/assemblies"]').click();
    await expect(page).toHaveURL(/\/assemblies/);
    await expect(page.locator('h1, h2').filter({ hasText: /assembl/i }).first()).toBeVisible({ timeout: 15000 });
  });

  test('navigates to Knowledge Base (admin)', async ({ page }) => {
    // /kb redirects to /account?tab=kb
    await page.goto('/kb');
    await expect(page).toHaveURL(/\/account/);
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  });

  test('navigates to Settings', async ({ page }) => {
    // /settings redirects to /account
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/account/);
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  });

  test('navigates back to Dashboard', async ({ page }) => {
    await page.locator('aside nav a[href="/bulk"]').click();
    await expect(page).toHaveURL(/\/bulk/);
    await page.locator('aside nav a[href="/dashboard"]').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  });
});
