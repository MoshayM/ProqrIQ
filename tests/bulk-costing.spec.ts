import { test, expect } from '@playwright/test';

test.describe('Bulk Costing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bulk');
    await expect(page.locator('h1').filter({ hasText: 'Bulk Costing' })).toBeVisible({ timeout: 15000 });
  });

  test('page renders without crashing', async ({ page }) => {
    await expect(page.locator('text=Failed').first()).not.toBeVisible();
  });

  test('bulk costing heading is visible', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Bulk Costing' })).toBeVisible();
  });

  test('new batch and history tabs are present', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: 'New Batch' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'History' })).toBeVisible();
  });

  test('new batch tab is active by default', async ({ page }) => {
    const newBatchBtn = page.locator('button').filter({ hasText: 'New Batch' });
    await expect(newBatchBtn).toBeVisible();
    await expect(newBatchBtn).toHaveClass(/border-b-2/);
  });

  test('upload area is visible in New Batch tab', async ({ page }) => {
    await expect(page.locator('text=Upload')).toBeVisible();
  });

  test('History tab shows batches or empty state', async ({ page }) => {
    await page.locator('button').filter({ hasText: 'History' }).click();
    const table = page.locator('table').first();
    const empty = page.locator('text=No batch jobs yet');
    await expect(table.or(empty)).toBeVisible({ timeout: 15000 });
  });
});
