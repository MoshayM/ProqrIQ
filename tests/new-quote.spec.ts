import { test, expect } from '@playwright/test';

test.describe('New Quote Wizard — Step 1', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quotes/new');
    await expect(page.locator('h2').filter({ hasText: 'New Quote' })).toBeVisible({ timeout: 10000 });
  });

  test('wizard page loads with heading', async ({ page }) => {
    await expect(page.locator('h2').filter({ hasText: 'New Quote' })).toBeVisible();
    await expect(page.locator('text=Upload an engineering drawing')).toBeVisible();
  });

  test('Upload Drawing tab is active by default', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: 'Upload Drawing' })).toBeVisible();
    // Upload zone text (Step1.tsx)
    await expect(page.locator('text=Drop your drawing or 3D model here')).toBeVisible();
  });

  test('Enter Manually tab is present and clickable', async ({ page }) => {
    const manualTab = page.locator('button').filter({ hasText: 'Enter Manually' });
    await expect(manualTab).toBeVisible();
    await manualTab.click();
    await expect(page.locator('text=Select Commodity Type')).toBeVisible();
  });

  test('upload zone shows supported formats', async ({ page }) => {
    // Formats shown as individual spans: PDF, PNG, JPG, WEBP (Step1.tsx)
    await expect(page.locator('text=PDF').first()).toBeVisible();
    await expect(page.locator('text=PNG').first()).toBeVisible();
    // Max file size shown as "Max 50 MB"
    await expect(page.locator('text=Max 50 MB')).toBeVisible();
  });

  test('manual mode shows commodity type grid', async ({ page }) => {
    await page.click('button:has-text("Enter Manually")');
    await expect(page.locator('text=Sheet Metal')).toBeVisible();
    await expect(page.locator('text=CNC Machining')).toBeVisible();
    await expect(page.locator('text=Injection Moulding')).toBeVisible();
    await expect(page.locator('text=PCB (Rigid)')).toBeVisible();
  });

  test('selecting a commodity type in manual mode shows part details form', async ({ page }) => {
    await page.click('button:has-text("Enter Manually")');
    // Click Sheet Metal commodity card
    await page.locator('button').filter({ hasText: 'Sheet Metal' }).click();
    await expect(page.locator('text=Sheet Metal — Part Details')).toBeVisible();
    await expect(page.locator('input[placeholder*="Bracket"]')).toBeVisible();
    await expect(page.locator('text=Part Name')).toBeVisible();
  });

  test('manual form Create button is disabled without part name', async ({ page }) => {
    await page.click('button:has-text("Enter Manually")');
    await page.locator('button').filter({ hasText: 'Sheet Metal' }).click();
    const createBtn = page.locator('button').filter({ hasText: 'Create Draft Quote' });
    await expect(createBtn).toBeDisabled();
  });

  test('manual form Create button enables after entering part name', async ({ page }) => {
    await page.click('button:has-text("Enter Manually")');
    await page.locator('button').filter({ hasText: 'CNC Machining' }).click();
    await page.fill('input[placeholder*="Bracket"]', 'Test Part ABC');
    const createBtn = page.locator('button').filter({ hasText: 'Create Draft Quote' });
    await expect(createBtn).toBeEnabled();
  });

  test('manual form has all expected fields', async ({ page }) => {
    await page.click('button:has-text("Enter Manually")');
    await page.locator('button').filter({ hasText: 'Stamping' }).click();
    await expect(page.locator('text=Part Name')).toBeVisible();
    await expect(page.locator('text=Part Number')).toBeVisible();
    await expect(page.locator('text=Material')).toBeVisible();
    await expect(page.locator('text=Primary Process')).toBeVisible();
  });
});
