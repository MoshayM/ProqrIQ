import { test, expect } from '@playwright/test';

test.describe('Assemblies Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/assemblies');
    // Wait for the h1 heading which is always rendered (outside loading state)
    await expect(page.locator('h1').filter({ hasText: 'Assemblies' })).toBeVisible({ timeout: 15000 });
  });

  test('page renders without crashing', async ({ page }) => {
    await expect(page.locator('text=Failed').first()).not.toBeVisible();
  });

  test('assemblies heading is visible', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Assemblies' })).toBeVisible();
  });

  test('new assembly button is present', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: 'New Assembly' })).toBeVisible();
  });

  test('assembly list or empty state renders', async ({ page }) => {
    const table = page.locator('table').first();
    const empty = page.locator('text=No assemblies yet');
    await expect(table.or(empty)).toBeVisible({ timeout: 10000 });
  });

  test('clicking New Assembly opens the modal', async ({ page }) => {
    await page.locator('button').filter({ hasText: 'New Assembly' }).click();
    await expect(page.locator('h2').filter({ hasText: 'New Assembly' })).toBeVisible({ timeout: 5000 });
  });
});
