import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/admin.json');

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('#email')).toBeVisible();

  await page.fill('#email', 'admin@autoquote.com');
  await page.fill('#password', 'AutoQuote2024!');
  await page.click('button[type="submit"]');

  // After login the app may show a passkey setup prompt before navigating to /dashboard.
  // Race: either the skip button appears (click it) or we land on /dashboard directly.
  const skipBtn = page.locator('button', { hasText: 'Not now, skip' });
  await Promise.race([
    skipBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => skipBtn.click()),
    page.waitForURL('**/dashboard', { timeout: 10000 }),
  ]).catch(() => {});

  await page.waitForURL('**/dashboard', { timeout: 20000 });
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: authFile });
});
